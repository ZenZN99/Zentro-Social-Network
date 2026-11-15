import { SpongBadRequestException, SpongNotFoundException } from 'riser-bob'
import { FollowSchema } from './schemas/follow.schema'
import { UserSchema } from '../users/schemas/user.schema'
import { UserProfileSchema } from '../user-profiles/schemas/user-profile.schema'
import { buildPagination } from '../../utilities/pagination'
import type { database } from '../../config/db/drizzle'
import { and, count, desc, eq, sql } from 'drizzle-orm'
import type { NotificationsService } from '../notifications/notifications.service'
import { NotificationType } from '../notifications/schemas/enums/notification-type'

export class FollowsService {
  constructor(
    private readonly db: typeof database,
    private readonly notificationsService: NotificationsService,
  ) {}

  async toggle(followerId: string, followingId: string) {
    if (followerId === followingId) {
      throw new SpongBadRequestException({
        success: false,
        message: 'You cannot follow yourself',
      })
    }

    const result = await this.db.transaction(async (transaction) => {
      const [followingUser] = await transaction
        .select()
        .from(UserSchema)
        .where(eq(UserSchema.id, followingId))
        .limit(1)

      if (!followingUser) {
        throw new SpongNotFoundException({
          success: false,
          message: 'User not found',
        })
      }

      const [existingFollow] = await transaction
        .select()
        .from(FollowSchema)
        .where(
          and(eq(FollowSchema.followerId, followerId), eq(FollowSchema.followingId, followingId)),
        )
        .limit(1)

      if (existingFollow) {
        await transaction.delete(FollowSchema).where(eq(FollowSchema.id, existingFollow.id))

        await transaction
          .update(UserProfileSchema)
          .set({
            followingCount: sql`${UserProfileSchema.followingCount} - 1`,
          })
          .where(eq(UserProfileSchema.userId, followerId))

        await transaction
          .update(UserProfileSchema)
          .set({
            followersCount: sql`${UserProfileSchema.followersCount} - 1`,
          })
          .where(eq(UserProfileSchema.userId, followingId))

        return {
          isFollowing: false,
          message: 'User unfollowed successfully',
        } as const
      }

      await transaction.insert(FollowSchema).values({
        followerId,
        followingId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      await transaction
        .update(UserProfileSchema)
        .set({
          followingCount: sql`${UserProfileSchema.followingCount} + 1`,
        })
        .where(eq(UserProfileSchema.userId, followerId))

      await transaction
        .update(UserProfileSchema)
        .set({
          followersCount: sql`${UserProfileSchema.followersCount} + 1`,
        })
        .where(eq(UserProfileSchema.userId, followingId))

      return {
        success: true,
        message: 'User followed successfully',
      } as const
    })

    // Create a notification only when the user follows
    if ('success' in result) {
      const [follower] = await this.db
        .select({
          id: UserSchema.id,
          firstName: UserSchema.firstName,
          lastName: UserSchema.lastName,
        })
        .from(UserSchema)
        .where(eq(UserSchema.id, followerId))
        .limit(1)

      if (follower) {
        try {
          await this.notificationsService.create({
            senderId: follower.id,
            receiverId: followingId,
            targetId: followingId,
            type: NotificationType.FOLLOW,
            message: `${follower.firstName} ${follower.lastName} started following you.`,
            link: `/profile/u/${followerId}`,
            isRead: false,
          })
        } catch {
          // Notification failure must not affect the successful follow.
        }
      }
    }

    return result
  }

  async findFollowers(userId: string, page = 1, limit = 10, offset = (page - 1) * limit) {
    const [user] = await this.db.select().from(UserSchema).where(eq(UserSchema.id, userId)).limit(1)

    if (!user) {
      throw new SpongNotFoundException({
        success: false,
        message: 'User not found',
      })
    }

    const followers = await this.db
      .select({
        follow: FollowSchema,
        follower: {
          id: UserSchema.id,
          username: UserSchema.username,
        },
        profile: UserProfileSchema,
      })
      .from(FollowSchema)
      .leftJoin(UserSchema, eq(FollowSchema.followerId, UserSchema.id))
      .leftJoin(UserProfileSchema, eq(UserSchema.id, UserProfileSchema.userId))
      .where(eq(FollowSchema.followingId, userId))
      .orderBy(desc(FollowSchema.createdAt))
      .limit(limit)
      .offset(offset)

    const [{ total } = { total: 0 }] = await this.db
      .select({ total: count() })
      .from(FollowSchema)
      .where(eq(FollowSchema.followingId, userId))

    return {
      success: true,
      data: followers,
      pagination: buildPagination(total, page, limit),
    } as const
  }

  async findFollowing(userId: string, page = 1, limit = 10, offset = (page - 1) * limit) {
    const [user] = await this.db.select().from(UserSchema).where(eq(UserSchema.id, userId)).limit(1)

    if (!user) {
      throw new SpongNotFoundException({
        success: false,
        message: 'User not found',
      })
    }

    const following = await this.db
      .select({
        follow: FollowSchema,
        following: {
          id: UserSchema.id,
          username: UserSchema.username,
        },
        profile: UserProfileSchema,
      })
      .from(FollowSchema)
      .leftJoin(UserSchema, eq(FollowSchema.followingId, UserSchema.id))
      .leftJoin(UserProfileSchema, eq(UserSchema.id, UserProfileSchema.userId))
      .where(eq(FollowSchema.followerId, userId))
      .orderBy(desc(FollowSchema.createdAt))
      .limit(limit)
      .offset(offset)

    const [{ total } = { total: 0 }] = await this.db
      .select({ total: count() })
      .from(FollowSchema)
      .where(eq(FollowSchema.followerId, userId))

    return {
      success: true,
      data: following,
      pagination: buildPagination(total, page, limit),
    } as const
  }

  async isFollowing(followerId: string, followingId: string) {
    const [user] = await this.db
      .select({
        id: UserSchema.id,
      })
      .from(UserSchema)
      .where(eq(UserSchema.id, followingId))
      .limit(1)

    if (!user) {
      throw new SpongNotFoundException({
        success: false,
        message: 'User not found',
      })
    }

    const [follow] = await this.db
      .select({
        id: FollowSchema.id,
      })
      .from(FollowSchema)
      .where(
        and(eq(FollowSchema.followerId, followerId), eq(FollowSchema.followingId, followingId)),
      )
      .limit(1)

    return {
      isFollowing: !!follow,
    } as const
  }

  async countFollowers(userId: string) {
    const [user] = await this.db
      .select({
        id: UserSchema.id,
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

    const [{ total } = { total: 0 }] = await this.db
      .select({
        total: count(),
      })
      .from(FollowSchema)
      .where(eq(FollowSchema.followingId, userId))

    return {
      success: true,
      data: total,
    } as const
  }

  async countFollowing(userId: string) {
    const [user] = await this.db
      .select({
        id: UserSchema.id,
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

    const [{ total } = { total: 0 }] = await this.db
      .select({
        total: count(),
      })
      .from(FollowSchema)
      .where(eq(FollowSchema.followerId, userId))

    return {
      success: true,
      data: total,
    } as const
  }
}
