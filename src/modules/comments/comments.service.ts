import { PostSchema } from '../posts/schemas/post.schema'
import { UserProfileSchema } from '../user-profiles/schemas/user-profile.schema'
import { CommentSchema } from './schemas/comment.schema'
import { SpongForbiddenException, SpongNotFoundException } from 'riser-bob'
import { buildPagination } from '../../utilities/pagination'
import { UserSchema } from '../users/schemas/user.schema'
import type { database } from '../../config/db/drizzle'
import { count, desc, eq, sql } from 'drizzle-orm'
import { ReplySchema } from '../replies/schemas/reply.schema'
import type { NotificationsService } from '../notifications/notifications.service'
import { NotificationType } from '../notifications/schemas/enums/notification-type'

export class CommentsService {
  constructor(
    private readonly db: typeof database,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(userId: string, postId: string, content: string) {
    const result = await this.db.transaction(async (transaction) => {
      // 1. Check if post exists
      const [post] = await transaction
        .select()
        .from(PostSchema)
        .where(eq(PostSchema.id, postId))
        .limit(1)

      if (!post) {
        throw new SpongNotFoundException({
          success: false,
          message: 'Post not found',
        })
      }

      // 2. Create comment
      const [comment] = await transaction
        .insert(CommentSchema)
        .values({
          userId,
          postId,
          content,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning()

      // 3. Increment post comments count
      await transaction
        .update(PostSchema)
        .set({
          commentsCount: sql`${PostSchema.commentsCount} + 1`,
        })
        .where(eq(PostSchema.id, postId))

      // 4. Increment user's comments count
      await transaction
        .update(UserProfileSchema)
        .set({
          commentsCount: sql`${UserProfileSchema.commentsCount} + 1`,
        })
        .where(eq(UserProfileSchema.userId, userId))

      return {
        success: true,
        message: 'Comment created successfully',
        data: comment,
        authorId: post.authorId,
        postId: post.id,
      } as const
    })

    // 5. Create a notification for the post owner
    if (result.authorId !== userId) {
      const [user] = await this.db
        .select({
          id: UserSchema.id,
          firstName: UserSchema.firstName,
          lastName: UserSchema.lastName,
        })
        .from(UserSchema)
        .where(eq(UserSchema.id, userId))
        .limit(1)

      if (user) {
        try {
          await this.notificationsService.create({
            senderId: user.id,
            receiverId: result.authorId,
            targetId: result.postId,
            type: NotificationType.COMMENT,
            message: `${user.firstName} ${user.lastName} commented on your post.`,
            link: `/posts/${result.postId}`,
            isRead: false,
          })
        } catch {
          // Notification failure must not affect the successful comment.
        }
      }
    }

    return {
      success: result.success,
      message: result.message,
      data: result.data,
    } as const
  }

  async findAll(postId: string, page = 1, limit = 10, offset = (page - 1) * limit) {
    // 1. Check if post exists
    const [post] = await this.db.select().from(PostSchema).where(eq(PostSchema.id, postId)).limit(1)

    if (!post) {
      throw new SpongNotFoundException({
        success: false,
        message: 'Post not found',
      })
    }

    // 2. Fetch comments
    const comments = await this.db
      .select({
        comment: CommentSchema,
        user: {
          id: UserSchema.id,
          username: UserSchema.username,
        },
        profile: UserProfileSchema,
      })
      .from(CommentSchema)
      .leftJoin(UserSchema, eq(CommentSchema.userId, UserSchema.id))
      .leftJoin(UserProfileSchema, eq(UserSchema.id, UserProfileSchema.userId))
      .where(eq(CommentSchema.postId, postId))
      .orderBy(desc(CommentSchema.createdAt))
      .limit(limit)
      .offset(offset)

    const [{ total } = { total: 0 }] = await this.db
      .select({
        total: count(),
      })
      .from(CommentSchema)
      .where(eq(CommentSchema.postId, postId))

    return {
      success: true,
      data: comments,
      pagination: buildPagination(total, page, limit),
    } as const
  }

  async findMe(userId: string, page = 1, limit = 10, offset = (page - 1) * limit) {
    const comments = await this.db
      .select({
        comment: CommentSchema,
        user: {
          id: UserSchema.id,
          username: UserSchema.username,
        },
        profile: UserProfileSchema,
      })
      .from(CommentSchema)
      .leftJoin(UserSchema, eq(CommentSchema.userId, UserSchema.id))
      .leftJoin(UserProfileSchema, eq(UserSchema.id, UserProfileSchema.userId))
      .where(eq(CommentSchema.userId, userId))
      .orderBy(desc(CommentSchema.createdAt))
      .limit(limit)
      .offset(offset)

    const [{ total } = { total: 0 }] = await this.db
      .select({
        total: count(),
      })
      .from(CommentSchema)
      .where(eq(CommentSchema.userId, userId))

    return {
      success: true,
      data: comments,
      pagination: buildPagination(total, page, limit),
    } as const
  }

  async findOne(commentId: string) {
    const [comment] = await this.db
      .select({
        comment: CommentSchema,
        user: {
          id: UserSchema.id,
          username: UserSchema.username,
        },
        profile: UserProfileSchema,
      })
      .from(CommentSchema)
      .leftJoin(UserSchema, eq(CommentSchema.userId, UserSchema.id))
      .leftJoin(UserProfileSchema, eq(UserSchema.id, UserProfileSchema.userId))
      .where(eq(CommentSchema.id, commentId))
      .limit(1)

    if (!comment) {
      throw new SpongNotFoundException({
        success: false,
        message: 'Comment not found',
      })
    }

    return {
      success: true,
      data: comment,
    } as const
  }

  async update(userId: string, commentId: string, content: string) {
    const [comment] = await this.db
      .select()
      .from(CommentSchema)
      .where(eq(CommentSchema.id, commentId))
      .limit(1)

    if (!comment) {
      throw new SpongNotFoundException({
        success: false,
        message: 'Comment not found',
      })
    }

    if (comment.userId !== userId) {
      throw new SpongForbiddenException({
        success: false,
        message: 'You are not allowed to edit this comment',
      })
    }

    const [updatedComment] = await this.db
      .update(CommentSchema)
      .set({
        content,
        isEdited: true,
        updatedAt: new Date(),
      })
      .where(eq(CommentSchema.id, commentId))
      .returning()

    return {
      success: true,
      message: 'Comment updated successfully',
      data: updatedComment,
    } as const
  }

  async delete(userId: string, commentId: string) {
    return await this.db.transaction(async (transaction) => {
      // 1. Find comment
      const [comment] = await transaction
        .select()
        .from(CommentSchema)
        .where(eq(CommentSchema.id, commentId))
        .limit(1)

      if (!comment) {
        throw new SpongNotFoundException({
          success: false,
          message: 'Comment not found',
        })
      }

      // 2. Check ownership
      if (comment.userId !== userId) {
        throw new SpongForbiddenException({
          success: false,
          message: 'You are not allowed to delete this comment',
        })
      }

      // 3. Find all replies belonging to this comment
      const replies = await transaction
        .select({
          id: ReplySchema.id,
          userId: ReplySchema.userId,
        })
        .from(ReplySchema)
        .where(eq(ReplySchema.commentId, commentId))

      // 4. Count replies per user
      const repliesCountByUser = new Map<string, number>()

      for (const reply of replies) {
        repliesCountByUser.set(reply.userId, (repliesCountByUser.get(reply.userId) ?? 0) + 1)
      }

      // 5. Delete all replies
      await transaction.delete(ReplySchema).where(eq(ReplySchema.commentId, commentId))

      // 6. Decrement replies count for each user
      for (const [replyUserId, count] of repliesCountByUser) {
        await transaction
          .update(UserProfileSchema)
          .set({
            repliesCount: sql`${UserProfileSchema.repliesCount} - ${count}`,
          })
          .where(eq(UserProfileSchema.userId, replyUserId))
      }

      // 7. Delete comment
      await transaction.delete(CommentSchema).where(eq(CommentSchema.id, commentId))

      // 8. Decrement post comments count
      await transaction
        .update(PostSchema)
        .set({
          commentsCount: sql`${PostSchema.commentsCount} - 1`,
        })
        .where(eq(PostSchema.id, comment.postId))

      // 9. Decrement user's comments count
      await transaction
        .update(UserProfileSchema)
        .set({
          commentsCount: sql`${UserProfileSchema.commentsCount} - 1`,
        })
        .where(eq(UserProfileSchema.userId, comment.userId))

      return {
        success: true,
        message: 'Comment and all its replies deleted successfully',
      } as const
    })
  }
}
