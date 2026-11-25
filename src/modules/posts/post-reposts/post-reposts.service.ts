import { eq, and, desc, sql, count } from 'drizzle-orm'
import type { NodePgTransaction } from 'drizzle-orm/node-postgres'
import type { ExtractTablesWithRelations } from 'drizzle-orm'
import { PostRepostSchema } from './schemas/post-repost.schema'
import type { Database } from '../../../config/db/drizzle'
import { PostSchema } from '../schemas/post.schema'
import { VisibilityStatus } from '../schemas/enums/visibility-status'
import { FollowSchema } from '../../follows/schemas/follow.schema'
import { buildPagination } from '../../../utilities/pagination'
import { UserProfileSchema } from '../../user-profiles/schemas/user-profile.schema'
import { UserSchema } from '../../users/schemas/user.schema'
import { NotificationType } from '../../notifications/schemas/enums/notification-type'
import type { NotificationsService } from '../../notifications/notifications.service'
import { ConflictException, ForbiddenException, NotFoundException } from 'lykosjs'

type Transaction = NodePgTransaction<
  Record<string, never>,
  ExtractTablesWithRelations<Record<string, never>>
>

export class PostRepostsService {
  constructor(
    private readonly db: Database,
    private readonly notificationsService: NotificationsService,
  ) {}

  async attach(postId: string, userId: string, transaction?: Transaction): Promise<boolean> {
    const db = transaction ?? this.db.connection

    const [existing] = await db
      .select({ id: PostRepostSchema.id })
      .from(PostRepostSchema)
      .where(
        and(eq(PostRepostSchema.postId, postId), eq(PostRepostSchema.repostedByUserId, userId)),
      )
      .limit(1)

    if (existing) {
      return false
    }

    await db.insert(PostRepostSchema).values({
      postId,
      repostedByUserId: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    return true
  }
  async detachAll(postId: string, transaction?: Transaction): Promise<number> {
    const db = transaction ?? this.db.connection

    const deleted = await db
      .delete(PostRepostSchema)
      .where(eq(PostRepostSchema.postId, postId))
      .returning({ id: PostRepostSchema.id })

    return deleted.length
  }

  async repost(userId: string, postId: string) {
    const result = await this.db.connection.transaction(async (transaction) => {
      // 1. Find original post
      const [post] = await transaction
        .select()
        .from(PostSchema)
        .where(eq(PostSchema.id, postId))
        .limit(1)

      if (!post) {
        throw new NotFoundException({
          success: false,
          message: 'Post not found',
        })
      }

      // 2. Check post visibility and access permissions
      if (post.visibility === VisibilityStatus.PRIVATE && post.authorId !== userId) {
        throw new ForbiddenException({
          success: false,
          message: 'You are not allowed to repost this post',
        })
      }

      if (post.visibility === VisibilityStatus.FOLLOWERS && post.authorId !== userId) {
        const [follow] = await transaction
          .select({ id: FollowSchema.id })
          .from(FollowSchema)
          .where(
            and(eq(FollowSchema.followerId, userId), eq(FollowSchema.followingId, post.authorId)),
          )
          .limit(1)

        if (!follow) {
          throw new ForbiddenException({
            success: false,
            message: 'You are not allowed to repost this post',
          })
        }
      }

      // 3. Create repost relation
      const created = await this.attach(postId, userId, transaction)

      if (!created) {
        throw new ConflictException({
          success: false,
          message: 'You have already reposted this post',
        })
      }

      // 4. Increment original post reposts count
      await transaction
        .update(PostSchema)
        .set({
          repostsCount: sql`${PostSchema.repostsCount} + 1`,
        })
        .where(eq(PostSchema.id, postId))

      return {
        success: true,
        message: 'Post reposted successfully',
        authorId: post.authorId,
      } as const
    })

    if ('error' in result) {
      return result
    }

    // 5. Fetch sender user
    const [user] = await this.db.connection
      .select({
        id: UserSchema.id,
        firstName: UserSchema.firstName,
        lastName: UserSchema.lastName,
      })
      .from(UserSchema)
      .where(eq(UserSchema.id, userId))
      .limit(1)

    // 6. Send repost notification
    if (user && result.authorId !== userId) {
      try {
        await this.notificationsService.create({
          senderId: user.id,
          receiverId: result.authorId,
          targetId: postId,
          type: NotificationType.REPOST,
          message: `${user.firstName} ${user.lastName} reposted your post.`,
          link: `/posts/${postId}`,
        })
      } catch {
        // Notification failure must not affect the successful repost.
      }
    }

    return {
      success: result.success,
      message: result.message,
    } as const
  }
  async findByUserId(userId: string, page = 1, limit = 10, offset = (page - 1) * limit) {
    const reposts = await this.db.connection
      .select({
        repost: PostRepostSchema,
        post: PostSchema,
        author: {
          id: UserSchema.id,
          username: UserSchema.username,
        },
        profile: UserProfileSchema,
      })
      .from(PostRepostSchema)
      .leftJoin(PostSchema, eq(PostRepostSchema.postId, PostSchema.id))
      .leftJoin(UserSchema, eq(PostSchema.authorId, UserSchema.id))
      .leftJoin(UserProfileSchema, eq(UserSchema.id, UserProfileSchema.userId))
      .where(eq(PostRepostSchema.repostedByUserId, userId))
      .orderBy(desc(PostRepostSchema.createdAt))
      .limit(limit)
      .offset(offset)

    const data = reposts.map(({ repost, post, author, profile }) => ({
      repost,
      post: post
        ? {
            post,
            author,
            profile,
          }
        : null,
    }))

    const [{ total } = { total: 0 }] = await this.db.connection
      .select({
        total: count(),
      })
      .from(PostRepostSchema)
      .where(eq(PostRepostSchema.repostedByUserId, userId))

    return {
      success: true,
      data,
      pagination: buildPagination(total, page, limit),
    }
  }

  async findMe(userId: string, page = 1, limit = 10, offset = (page - 1) * limit) {
    const reposts = await this.db.connection
      .select({
        repost: PostRepostSchema,
        post: PostSchema,
        author: {
          id: UserSchema.id,
          username: UserSchema.username,
        },
        profile: UserProfileSchema,
      })
      .from(PostRepostSchema)
      .leftJoin(PostSchema, eq(PostRepostSchema.postId, PostSchema.id))
      .leftJoin(UserSchema, eq(PostSchema.authorId, UserSchema.id))
      .leftJoin(UserProfileSchema, eq(UserSchema.id, UserProfileSchema.userId))
      .where(eq(PostRepostSchema.repostedByUserId, userId))
      .orderBy(desc(PostRepostSchema.createdAt))
      .limit(limit)
      .offset(offset)

    const data = reposts.map(({ repost, post, author, profile }) => ({
      repost,
      post: post
        ? {
            post,
            author,
            profile,
          }
        : null,
    }))

    const [{ total } = { total: 0 }] = await this.db.connection
      .select({
        total: count(),
      })
      .from(PostRepostSchema)
      .where(eq(PostRepostSchema.repostedByUserId, userId))

    return {
      success: true,
      data,
      pagination: buildPagination(total, page, limit),
    }
  }
}
