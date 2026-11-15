import { UserProfileSchema } from '../user-profiles/schemas/user-profile.schema'
import { buildPagination } from '../../utilities/pagination'
import { UserSchema } from '../users/schemas/user.schema'
import type { database } from '../../config/db/drizzle'
import { CommentSchema } from '../comments/schemas/comment.schema'
import { ReplySchema } from './schemas/reply.schema'
import { count, desc, eq, sql } from 'drizzle-orm'
import { PostSchema } from '../posts/schemas/post.schema'
import type { NotificationsService } from '../notifications/notifications.service'
import { NotificationType } from '../notifications/schemas/enums/notification-type'
import {
  SpongForbiddenException,
  SpongInternalServerErrorException,
  SpongNotFoundException,
} from 'riser-bob'

export class RepliesService {
  constructor(
    private readonly db: typeof database,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(userId: string, commentId: string, content: string, parentReplyId?: string) {
    return await this.db.transaction(async (transaction) => {
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

      const [user] = await transaction
        .select({
          firstName: UserSchema.firstName,
          lastName: UserSchema.lastName,
        })
        .from(UserSchema)
        .where(eq(UserSchema.id, userId))
        .limit(1)

      if (!user) {
        throw new SpongNotFoundException({
          success: false,
          message: 'User not found',
        })
      }

      if (parentReplyId) {
        const [parentReply] = await transaction
          .select({
            id: ReplySchema.id,
            content: ReplySchema.content,
            commentId: ReplySchema.commentId,
            userId: ReplySchema.userId,
            parentReplyId: ReplySchema.parentReplyId,
            likesCount: ReplySchema.likesCount,
            isEdited: ReplySchema.isEdited,
            createdAt: ReplySchema.createdAt,
            updatedAt: ReplySchema.updatedAt,
            user: {
              id: UserSchema.id,
              username: UserSchema.username,
            },
            profile: UserProfileSchema,
          })
          .from(ReplySchema)
          .leftJoin(UserSchema, eq(ReplySchema.userId, UserSchema.id))
          .leftJoin(UserProfileSchema, eq(UserSchema.id, UserProfileSchema.userId))
          .where(
            sql`${ReplySchema.id} = ${parentReplyId} AND ${ReplySchema.commentId} = ${commentId}`,
          )
          .limit(1)

        if (!parentReply) {
          throw new SpongNotFoundException({
            success: false,
            message: 'Parent Reply not found',
          })
        }
      }

      const [reply] = await transaction
        .insert(ReplySchema)
        .values({
          userId,
          commentId,
          content,
          parentReplyId: parentReplyId ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning()

      if (!reply) {
        throw new SpongInternalServerErrorException({
          success: false,
          message: 'Failed to create reply',
        })
      }

      await transaction
        .update(CommentSchema)
        .set({
          repliesCount: sql`${CommentSchema.repliesCount} + 1`,
        })
        .where(eq(CommentSchema.id, commentId))

      await transaction
        .update(PostSchema)
        .set({
          commentsCount: sql`${PostSchema.commentsCount} + 1`,
        })
        .where(eq(PostSchema.id, comment.postId))

      await transaction
        .update(UserProfileSchema)
        .set({
          repliesCount: sql`${UserProfileSchema.repliesCount} + 1`,
        })
        .where(eq(UserProfileSchema.userId, userId))

      if (comment.userId !== userId) {
        await this.notificationsService.create({
          senderId: userId,
          receiverId: comment.userId,
          targetId: reply.id,
          type: NotificationType.REPLY,
          message: `${user.firstName} ${user.lastName} replied to your comment.`,
          link: `/posts/${comment.postId}`,
        })
      }

      return {
        success: true,
        message: 'Reply created successfully',
        data: reply,
      } as const
    })
  }

  async findAll(commentId: string, page = 1, limit = 10, offset = (page - 1) * limit) {
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

    const [replies, countResult] = await Promise.all([
      this.db
        .select({
          reply: ReplySchema,
          user: {
            id: UserSchema.id,
            username: UserSchema.username,
          },
          profile: UserProfileSchema,
        })
        .from(ReplySchema)
        .leftJoin(UserSchema, eq(ReplySchema.userId, UserSchema.id))
        .leftJoin(UserProfileSchema, eq(UserSchema.id, UserProfileSchema.userId))
        .where(eq(ReplySchema.commentId, commentId))
        .orderBy(desc(ReplySchema.createdAt))
        .limit(limit)
        .offset(offset),

      this.db
        .select({ total: count() })
        .from(ReplySchema)
        .where(eq(ReplySchema.commentId, commentId)),
    ])

    const total = countResult[0]?.total ?? 0

    return {
      success: true,
      data: replies,
      pagination: buildPagination(total, page, limit),
    } as const
  }

  async findMe(userId: string, page = 1, limit = 10, offset = (page - 1) * limit) {
    const [replies, countResult] = await Promise.all([
      this.db
        .select({
          reply: ReplySchema,
          user: {
            id: UserSchema.id,
            username: UserSchema.username,
          },
          profile: UserProfileSchema,
        })
        .from(ReplySchema)
        .leftJoin(UserSchema, eq(ReplySchema.userId, UserSchema.id))
        .leftJoin(UserProfileSchema, eq(UserSchema.id, UserProfileSchema.userId))
        .where(eq(ReplySchema.userId, userId))
        .orderBy(desc(ReplySchema.createdAt))
        .limit(limit)
        .offset(offset),

      this.db.select({ total: count() }).from(ReplySchema).where(eq(ReplySchema.userId, userId)),
    ])

    const total = countResult[0]?.total ?? 0

    return {
      success: true,
      data: replies,
      pagination: buildPagination(total, page, limit),
    } as const
  }

  async findOne(replyId: string) {
    const [reply] = await this.db
      .select({
        reply: ReplySchema,
        user: {
          id: UserSchema.id,
          username: UserSchema.username,
        },
        profile: UserProfileSchema,
      })
      .from(ReplySchema)
      .leftJoin(UserSchema, eq(ReplySchema.userId, UserSchema.id))
      .leftJoin(UserProfileSchema, eq(UserSchema.id, UserProfileSchema.userId))
      .where(eq(ReplySchema.id, replyId))
      .limit(1)

    if (!reply) {
      throw new SpongNotFoundException({
        success: false,
        message: 'Reply not found',
      })
    }

    return {
      success: true,
      data: reply,
    } as const
  }

  async update(userId: string, replyId: string, content: string) {
    const [reply] = await this.db
      .select()
      .from(ReplySchema)
      .where(eq(ReplySchema.id, replyId))
      .limit(1)

    if (!reply) {
      throw new SpongNotFoundException({
        success: false,
        message: 'Reply not found',
      })
    }

    if (reply.userId !== userId) {
      throw new SpongForbiddenException({
        success: false,
        message: 'You are not allowed to edit this reply',
      })
    }

    const [updatedReply] = await this.db
      .update(ReplySchema)
      .set({
        content,
        isEdited: true,
        updatedAt: new Date(),
      })
      .where(eq(ReplySchema.id, replyId))
      .returning()

    return {
      success: true,
      message: 'Reply updated successfully',
      data: updatedReply,
    } as const
  }

  async delete(userId: string, replyId: string) {
    return await this.db.transaction(async (transaction) => {
      // 1. Find reply
      const [reply] = await transaction
        .select()
        .from(ReplySchema)
        .where(eq(ReplySchema.id, replyId))
        .limit(1)

      if (!reply) {
        throw new SpongNotFoundException({
          success: false,
          message: 'Reply not found',
        })
      }

      // 2. Check ownership
      if (reply.userId !== userId) {
        throw new SpongForbiddenException({
          success: false,
          message: 'You are not allowed to delete this reply',
        })
      }

      // 3. Find original comment
      const [comment] = await transaction
        .select()
        .from(CommentSchema)
        .where(eq(CommentSchema.id, reply.commentId))
        .limit(1)

      if (!comment) {
        throw new SpongNotFoundException({
          success: false,
          message: 'Comment not found',
        })
      }

      // 4. Delete reply
      await transaction.delete(ReplySchema).where(eq(ReplySchema.id, replyId))

      // 5. Decrement comment replies count
      await transaction
        .update(CommentSchema)
        .set({
          repliesCount: sql`${CommentSchema.repliesCount} - 1`,
        })
        .where(eq(CommentSchema.id, reply.commentId))

      // 6. Decrement post comments count
      await transaction
        .update(PostSchema)
        .set({
          commentsCount: sql`${PostSchema.commentsCount} - 1`,
        })
        .where(eq(PostSchema.id, comment.postId))

      // 7. Decrement reply author's replies count
      await transaction
        .update(UserProfileSchema)
        .set({
          repliesCount: sql`${UserProfileSchema.repliesCount} - 1`,
        })
        .where(eq(UserProfileSchema.userId, reply.userId))

      return {
        success: true,
        message: 'Reply deleted successfully',
      } as const
    })
  }
}
