import type { Database } from '../../config/db/drizzle'
import { desc, inArray, count, eq } from 'drizzle-orm'
import { buildPagination } from '../../utilities/pagination'
import { sanitizeUser } from '../../utilities/sanitize-user'
import { UserProfileSchema } from '../user-profiles/schemas/user-profile.schema'
import { UserVerificationSchema } from '../user-verifications/schemas/user-verification.schema'
import { UserRole } from './schemas/enums/user-role'
import { UserSchema } from './schemas/user.schema'
import type { NotificationsService } from '../notifications/notifications.service'
import { NotificationType } from '../notifications/schemas/enums/notification-type'
import { BadRequestException, NotFoundException } from 'lykosjs'

export class UsersService {
  constructor(
    private readonly db: Database,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findAll(page = 1, limit = 10, offset?: number) {
    const safePage = Number.isInteger(page) && page > 0 ? page : 1
    const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 10
    const safeOffset =
      typeof offset === 'number' && Number.isInteger(offset) && offset >= 0
        ? offset
        : (safePage - 1) * safeLimit

    const [users, countResult] = await Promise.all([
      this.db.connection
        .select()
        .from(UserSchema)
        .orderBy(desc(UserSchema.createdAt))
        .limit(limit)
        .offset(safeOffset),

      this.db.connection.select({ total: count() }).from(UserSchema),
    ])

    const total = countResult[0]?.total ?? 0

    const userIds = users.map((user) => user.id)

    const [profiles, verifications] = userIds.length
      ? await Promise.all([
          this.db.connection
            .select({
              id: UserProfileSchema.id,
              userId: UserProfileSchema.userId,
              avatar: UserProfileSchema.avatar,
              cover: UserProfileSchema.cover,
              bio: UserProfileSchema.bio,
            })
            .from(UserProfileSchema)
            .where(inArray(UserProfileSchema.userId, userIds)),

          this.db.connection
            .select({
              id: UserVerificationSchema.id,
              userId: UserVerificationSchema.userId,
              profileImage: UserVerificationSchema.profileImage,
              identityDocument: UserVerificationSchema.identityDocument,
              status: UserVerificationSchema.status,
              rejectionReason: UserVerificationSchema.rejectionReason,
              submittedAt: UserVerificationSchema.submittedAt,
              reviewedAt: UserVerificationSchema.reviewedAt,
            })
            .from(UserVerificationSchema)
            .where(inArray(UserVerificationSchema.userId, userIds)),
        ])
      : [[], []]

    const profileMap = new Map(profiles.map((profile) => [profile.userId, profile]))

    const verificationMap = new Map(
      verifications.map((verification) => [verification.userId, verification]),
    )

    const safeUsers = users.map((user) => ({
      ...sanitizeUser(user),
      profile: profileMap.get(user.id) ?? null,
      verification: verificationMap.get(user.id) ?? null,
    }))

    return {
      success: true,
      safeUsers,
      pagination: buildPagination(total, page, limit),
    }
  }

  async findOneByUsername(username: string) {
    const [user] = await this.db.connection
      .select()
      .from(UserSchema)
      .where(eq(UserSchema.username, username))
      .limit(1)

    if (!user || !user.isActive) {
      throw new NotFoundException({
        success: false,
        message: 'User not found',
      })
    }

    const [profile, verification] = await Promise.all([
      this.db.connection
        .select({
          id: UserProfileSchema.id,
          avatar: UserProfileSchema.avatar,
          cover: UserProfileSchema.cover,
          bio: UserProfileSchema.bio,
        })
        .from(UserProfileSchema)
        .where(eq(UserProfileSchema.userId, user.id))
        .limit(1),

      this.db.connection
        .select({
          status: UserVerificationSchema.status,
        })
        .from(UserVerificationSchema)
        .where(eq(UserVerificationSchema.userId, user.id))
        .limit(1),
    ])

    const safeUser = sanitizeUser(user)

    return {
      success: true,
      data: {
        ...safeUser,
        profile: profile[0] ?? null,
        verification: verification[0] ?? null,
      },
    }
  }

  async updateRole(adminId: string, userId: string, role: UserRole) {
    const allowedRoles = [UserRole.USER, UserRole.SUPPORT]

    if (!allowedRoles.includes(role)) {
      throw new BadRequestException({
        success: false,
        message: 'Invalid user role',
      })
    }

    const [user] = await this.db.connection.select().from(UserSchema).where(eq(UserSchema.id, userId)).limit(1)

    if (!user || !user.isActive) {
      throw new NotFoundException({ success: false, message: 'User not found' })
    }

    await this.db.connection
      .update(UserSchema)
      .set({
        role,
      })
      .where(eq(UserSchema.id, userId))

    await this.notificationsService.create({
      senderId: adminId,
      receiverId: user.id,
      targetId: user.id,
      type: NotificationType.ROLE_UPDATED,
      message: `Your role has been changed to ${role}.`,
      link: null,
    })

    return {
      success: true,
      message: 'User role updated successfully',
    } as const
  }

  async block(adminId: string, userId: string) {
    const [user] = await this.db.connection.select().from(UserSchema).where(eq(UserSchema.id, userId)).limit(1)

    if (!user || !user.isActive) {
      throw new NotFoundException({ success: false, message: 'User not found' })
    }

    await this.db.connection
      .update(UserSchema)
      .set({
        isActive: false,
      })
      .where(eq(UserSchema.id, userId))

    await this.notificationsService.create({
      senderId: adminId,
      receiverId: user.id,
      targetId: user.id,
      type: NotificationType.ACCOUNT_BLOCKED,
      message: 'Your account has been suspended for violating the platform policies.',
      link: null,
    })

    return {
      success: true,
      message: 'User blocked successfully',
    } as const
  }
}
