import type { database } from '../../config/db/drizzle'
import type { NotificationsService } from '../notifications/notifications.service'
import { NotificationType } from '../notifications/schemas/enums/notification-type'
import { and, count, desc, eq, sql } from 'drizzle-orm'
import { LikeSchema } from './schemas/like.schema'
import { UserSchema } from '../users/schemas/user.schema'
import { ReplySchema, type Reply } from '../replies/schemas/reply.schema'
import { CommentSchema, type Comment } from '../comments/schemas/comment.schema'
import { PostSchema, type Post } from '../posts/schemas/post.schema'
import { buildPagination } from '../../utilities/pagination'
import { UserProfileSchema } from '../user-profiles/schemas/user-profile.schema'
import {
  SpongBadRequestException,
  SpongInternalServerErrorException,
  SpongNotFoundException,
  SpongUnauthorizedException,
} from 'riser-bob'

export class LikesService {
  constructor(
    private readonly db: typeof database,
    private readonly notificationsService: NotificationsService,
  ) {}

  async toggle(userId: string, targetType: string, targetId: string) {
    const targetSchemas = {
      post: {
        schema: PostSchema,
        field: 'postId',
      },
      comment: {
        schema: CommentSchema,
        field: 'commentId',
      },
      reply: {
        schema: ReplySchema,
        field: 'replyId',
      },
    } as const

    if (!targetType || !Object.hasOwn(targetSchemas, targetType)) {
      throw new SpongBadRequestException({
        success: false,
        message: 'Invalid target type',
      })
    }

    const { schema, field } = targetSchemas[targetType as keyof typeof targetSchemas]

    let target: Post | Comment | Reply | null = null

    switch (targetType) {
      case 'post': {
        const [post] = await this.db
          .select()
          .from(PostSchema)
          .where(eq(PostSchema.id, targetId))
          .limit(1)
        target = post ?? null
        break
      }

      case 'comment': {
        const [comment] = await this.db
          .select()
          .from(CommentSchema)
          .where(eq(CommentSchema.id, targetId))
          .limit(1)
        target = comment ?? null
        break
      }

      case 'reply': {
        const [reply] = await this.db
          .select()
          .from(ReplySchema)
          .where(eq(ReplySchema.id, targetId))
          .limit(1)
        target = reply ?? null
        break
      }
    }

    if (!target) {
      throw new SpongNotFoundException({
        success: false,
        message: `${targetType} not found`,
      })
    }

    const [user] = await this.db
      .select({
        id: UserSchema.id,
        firstName: UserSchema.firstName,
        lastName: UserSchema.lastName,
      })
      .from(UserSchema)
      .where(eq(UserSchema.id, userId))
      .limit(1)

    if (!user) {
      throw new SpongUnauthorizedException({
        success: false,
        message: 'You are not authenticated',
      })
    }

    const [existingLike] = await this.db
      .select()
      .from(LikeSchema)
      .where(and(eq(LikeSchema.userId, userId), eq(LikeSchema[field], targetId)))
      .limit(1)

    if (existingLike) {
      await this.db.delete(LikeSchema).where(eq(LikeSchema.id, existingLike.id))

      await this.db
        .update(schema)
        .set({ likesCount: sql`${schema.likesCount} - 1` })
        .where(eq(schema.id, targetId))

      return {
        success: true,
        message: 'Like removed successfully',
        data: { isLiked: false },
      }
    }

    await this.db.insert(LikeSchema).values({
      userId,
      postId: targetType === 'post' ? targetId : null,
      commentId: targetType === 'comment' ? targetId : null,
      replyId: targetType === 'reply' ? targetId : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const [updatedTarget] = await this.db
      .update(schema)
      .set({
        likesCount: sql`${schema.likesCount} + 1`,
      })
      .where(eq(schema.id, targetId))
      .returning({
        likesCount: schema.likesCount,
      })

    if (!updatedTarget) {
      throw new SpongInternalServerErrorException({
        success: false,
        message: 'Failed to update likes count',
      })
    }

    const newLikesCount = updatedTarget.likesCount

    const LIKE_NOTIFICATION_STEP = 25

    const isFirstLike = newLikesCount === 1
    const isMilestone = newLikesCount % LIKE_NOTIFICATION_STEP === 0

    let targetOwnerId: string

    if ('authorId' in target) {
      // Post
      targetOwnerId = target.authorId
    } else {
      // Comment or Reply
      targetOwnerId = target.userId
    }

    if (targetOwnerId !== user.id && (isFirstLike || isMilestone)) {
      const fullName = `${user.firstName} ${user.lastName}`
      const type = targetType.toLowerCase()
      const othersCount = newLikesCount - 1

      try {
        await this.notificationsService.create({
          senderId: user.id,
          receiverId: targetOwnerId,
          targetId,
          type: NotificationType.LIKE,
          message: isFirstLike
            ? `${fullName} liked your ${type}.`
            : `${fullName} and ${othersCount} others liked your ${type}.`,
          link: '/notifications',
        })
      } catch {
        // Notification failure must not affect the successful like.
      }
    }

    return {
      success: true,
      message: 'Liked successfully',
      data: { isLiked: true },
    }
  }

  async findAll(
    page = 1,
    limit = 50,
    offset = (page - 1) * limit,
    targetType: string,
    targetId: string,
  ) {
    if (!targetType || !['post', 'comment', 'reply'].includes(targetType)) {
      throw new SpongBadRequestException({
        success: false,
        message: 'Invalid target type',
      })
    }

    const field =
      targetType === 'post' ? 'postId' : targetType === 'comment' ? 'commentId' : 'replyId'

    const likes = await this.db
      .select({
        like: LikeSchema,
        user: {
          id: UserSchema.id,
          username: UserSchema.username,
        },
        profile: UserProfileSchema,
      })
      .from(LikeSchema)
      .leftJoin(UserSchema, eq(LikeSchema.userId, UserSchema.id))
      .leftJoin(UserProfileSchema, eq(UserSchema.id, UserProfileSchema.userId))
      .where(eq(LikeSchema[field], targetId))
      .orderBy(desc(LikeSchema.createdAt))
      .limit(limit)
      .offset(offset)

    const [{ total } = { total: 0 }] = await this.db
      .select({ total: count() })
      .from(LikeSchema)
      .where(eq(LikeSchema[field], targetId))

    return {
      success: true,
      data: likes,
      pagination: buildPagination(total, page, limit),
    }
  }

  async findMe(
    userId: string,
    targetType: string,
    targetId: string,
    page = 1,
    limit = 50,
    offset = (page - 1) * limit,
  ) {
    if (!targetType || !['post', 'comment', 'reply'].includes(targetType)) {
      throw new SpongBadRequestException({
        success: false,
        message: 'Invalid target type',
      })
    }

    const field =
      targetType === 'post' ? 'postId' : targetType === 'comment' ? 'commentId' : 'replyId'

    const likes = await this.db
      .select({
        like: LikeSchema,
        user: {
          id: UserSchema.id,
          username: UserSchema.username,
        },
        profile: UserProfileSchema,
      })
      .from(LikeSchema)
      .leftJoin(UserSchema, eq(LikeSchema.userId, UserSchema.id))
      .leftJoin(UserProfileSchema, eq(UserSchema.id, UserProfileSchema.userId))
      .where(and(eq(LikeSchema[field], targetId), eq(LikeSchema.userId, userId)))
      .orderBy(desc(LikeSchema.createdAt))
      .limit(limit)
      .offset(offset)

    const [{ total } = { total: 0 }] = await this.db
      .select({ total: count() })
      .from(LikeSchema)
      .where(and(eq(LikeSchema[field], targetId), eq(LikeSchema.userId, userId)))

    return {
      success: true,
      data: likes,
      pagination: buildPagination(total, page, limit),
    }
  }

  async count(targetType: string, targetId: string) {
    if (!targetType || !['post', 'comment', 'reply'].includes(targetType)) {
      throw new SpongBadRequestException({
        success: false,
        message: 'Invalid target type',
      })
    }

    let target: { id: string; likesCount: number } | null = null

    switch (targetType) {
      case 'post': {
        const [post] = await this.db
          .select({
            id: PostSchema.id,
            likesCount: PostSchema.likesCount,
          })
          .from(PostSchema)
          .where(eq(PostSchema.id, targetId))
          .limit(1)

        target = post ?? null
        break
      }

      case 'comment': {
        const [comment] = await this.db
          .select({
            id: CommentSchema.id,
            likesCount: CommentSchema.likesCount,
          })
          .from(CommentSchema)
          .where(eq(CommentSchema.id, targetId))
          .limit(1)

        target = comment ?? null
        break
      }

      case 'reply': {
        const [reply] = await this.db
          .select({
            id: ReplySchema.id,
            likesCount: ReplySchema.likesCount,
          })
          .from(ReplySchema)
          .where(eq(ReplySchema.id, targetId))
          .limit(1)

        target = reply ?? null
        break
      }
    }

    if (!target) {
      throw new SpongNotFoundException({
        success: false,
        message: `${targetType} not found`,
      })
    }

    return {
      success: true,
      data: {
        targetType,
        targetId,
        likesCount: target.likesCount,
      },
    }
  }

  async isLiked(userId: string, targetType: string, targetId: string) {
    if (!targetType || !['post', 'comment', 'reply'].includes(targetType)) {
      throw new SpongBadRequestException({
        success: false,
        message: 'Invalid target type',
      })
    }

    const field =
      targetType === 'post' ? 'postId' : targetType === 'comment' ? 'commentId' : 'replyId'

    const [like] = await this.db
      .select({
        like: LikeSchema,
        user: {
          id: UserSchema.id,
          username: UserSchema.username,
        },
        profile: UserProfileSchema,
      })
      .from(LikeSchema)
      .leftJoin(UserSchema, eq(LikeSchema.userId, UserSchema.id))
      .leftJoin(UserProfileSchema, eq(UserSchema.id, UserProfileSchema.userId))
      .where(and(eq(LikeSchema.userId, userId), eq(LikeSchema[field], targetId)))
      .limit(1)

    return {
      success: true,
      data: {
        isLiked: !!like,
      },
    }
  }
}
