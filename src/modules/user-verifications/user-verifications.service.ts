import { UserVerificationSchema, type UserVerification } from './schemas/user-verification.schema'
import { UserSchema } from '../users/schemas/user.schema'
import { UserProfileSchema } from '../user-profiles/schemas/user-profile.schema'
import { UserVerificationStatus } from './schemas/enums/user-verification-status'
import cloudinary from '../../config/cloudinary/cloudinary'
import type { Database } from '../../config/db/drizzle'
import { asc, count, eq, inArray } from 'drizzle-orm'
import type { NotificationsService } from '../notifications/notifications.service'
import { UserRole } from '../users/schemas/enums/user-role'
import { NotificationType } from '../notifications/schemas/enums/notification-type'
import { BadRequestException, NotFoundException } from 'lykosjs'

export class UserVerificationsService {
  constructor(
    private readonly db: Database,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(
    userId: string,
    formData: {
      get(name: string): string | File | null
    },
  ) {
    const [existingVerification] = await this.db.connection
      .select()
      .from(UserVerificationSchema)
      .where(eq(UserVerificationSchema.userId, userId))
      .limit(1)

    if (existingVerification) {
      if (existingVerification.status === UserVerificationStatus.PENDING) {
        throw new BadRequestException({
          success: false,
          message: 'Your verification request is already pending review.',
        })
      }

      if (existingVerification.status === UserVerificationStatus.APPROVED) {
        throw new BadRequestException({
          success: false,
          message: 'Your account has already been verified.',
        })
      }

      await this.deleteImages(existingVerification)
    }

    const profileImage = formData.get('profileImage')
    const identityDocument = formData.get('identityDocument')

    const uploadedProfileImage = await cloudinary.images.uploadImage(
      profileImage as File,
      'zentro/verifications/profile',
    )

    const uploadedIdentityDocument = await cloudinary.images.uploadImage(
      identityDocument as File,
      'zentro/verifications/identity',
    )

    let verification: typeof UserVerificationSchema.$inferSelect | undefined
    let type: 'created' | 'resubmitted'

    if (existingVerification) {
      const [updatedVerification] = await this.db.connection
        .update(UserVerificationSchema)
        .set({
          profileImage: {
            url: uploadedProfileImage.url,
            publicId: uploadedProfileImage.publicId,
          },

          identityDocument: {
            url: uploadedIdentityDocument.url,
            publicId: uploadedIdentityDocument.publicId,
          },

          status: UserVerificationStatus.PENDING,

          rejectionReason: null,
          reviewedBy: null,
          reviewedAt: null,
          submittedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(UserVerificationSchema.id, existingVerification.id))
        .returning()

      verification = updatedVerification
      type = 'resubmitted'
    } else {
      const [createdVerification] = await this.db.connection
        .insert(UserVerificationSchema)
        .values({
          userId,
          profileImage: {
            url: uploadedProfileImage.url,
            publicId: uploadedProfileImage.publicId,
          },

          identityDocument: {
            url: uploadedIdentityDocument.url,
            publicId: uploadedIdentityDocument.publicId,
          },

          status: UserVerificationStatus.PENDING,

          submittedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning()

      verification = createdVerification
      type = 'created'
    }

    const admins = await this.db.connection
      .select()
      .from(UserSchema)
      .where(eq(UserSchema.role, UserRole.ADMIN))

    for (const admin of admins) {
      await this.notificationsService.create({
        senderId: userId,
        receiverId: admin.id,
        targetId: verification!.id,
        type: NotificationType.USER_VERIFICATION,
        message:
          type === 'resubmitted'
            ? 'A user has resubmitted an identity verification request.'
            : 'A user has submitted a new identity verification request.',
        link: '/admin',
      })
    }

    return {
      type,
      data: verification,
    } as const
  }

  async findPending(page = 1, limit = 10, offset = (page - 1) * limit) {
    const safeOffset = Math.max(0, offset)

    const [verifications, countResult] = await Promise.all([
      this.db.connection
        .select()
        .from(UserVerificationSchema)
        .where(eq(UserVerificationSchema.status, UserVerificationStatus.PENDING))
        .orderBy(asc(UserVerificationSchema.submittedAt))
        .limit(limit)
        .offset(safeOffset),

      this.db.connection
        .select({ total: count() })
        .from(UserVerificationSchema)
        .where(eq(UserVerificationSchema.status, UserVerificationStatus.PENDING)),
    ])

    const total = countResult[0]?.total ?? 0

    const userIds = [...new Set(verifications.map((verification) => verification.userId))]

    const users = userIds.length
      ? await this.db.connection
          .select({
            id: UserSchema.id,
            firstName: UserSchema.firstName,
            lastName: UserSchema.lastName,
            email: UserSchema.email,
            isActive: UserSchema.isActive,
          })
          .from(UserSchema)
          .where(inArray(UserSchema.id, userIds))
      : []

    const profiles = userIds.length
      ? await this.db.connection
          .select({
            id: UserProfileSchema.id,
            userId: UserProfileSchema.userId,
            avatar: UserProfileSchema.avatar,
            cover: UserProfileSchema.cover,
            bio: UserProfileSchema.bio,
          })
          .from(UserProfileSchema)
          .where(inArray(UserProfileSchema.userId, userIds))
      : []

    const profileMap = new Map(profiles.map((profile) => [profile.userId, profile]))

    const userMap = new Map(
      users.map((user) => [
        user.id,
        {
          ...user,
          profile: profileMap.get(user.id) ?? null,
        },
      ]),
    )

    const result = verifications.map((verification) => ({
      ...verification,
      user: userMap.get(verification.userId) ?? null,
    }))

    return {
      verifications: result,
      total,
      page,
      limit,
    }
  }

  async update(
    adminId: string,
    verificationId: string,
    body: {
      status: UserVerificationStatus | null
      rejectionReason: string | null
    },
  ) {
    const [verification] = await this.db.connection
      .select()
      .from(UserVerificationSchema)
      .where(eq(UserVerificationSchema.id, verificationId))
      .limit(1)

    if (!verification) {
      throw new NotFoundException({
        success: false,
        message: 'No verification request was found for this user.',
      })
    }

    if (verification.status !== UserVerificationStatus.PENDING) {
      throw new BadRequestException({
        success: false,
        message: 'This verification request is not pending review.',
      })
    }

    if (body.status === UserVerificationStatus.REJECTED && !body.rejectionReason?.trim()) {
      throw new BadRequestException({
        success: false,
        message: 'A rejection reason is required when rejecting a verification request.',
      })
    }

    let rejectionReason = verification.rejectionReason

    if (body.status === UserVerificationStatus.APPROVED) {
      rejectionReason = 'Congratulations! Your identity has been verified successfully.'
    }

    if (body.status === UserVerificationStatus.REJECTED) {
      rejectionReason = body.rejectionReason!.trim()
    }

    const [updatedVerification] = await this.db.connection
      .update(UserVerificationSchema)
      .set({
        status: body.status,
        rejectionReason,
        reviewedBy: adminId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(UserVerificationSchema.id, verificationId))
      .returning()

    await this.notificationsService.create({
      senderId: adminId,
      receiverId: verification.userId,
      targetId: verification.id,
      type:
        body.status === UserVerificationStatus.APPROVED
          ? NotificationType.USER_VERIFICATION_APPROVED
          : NotificationType.USER_VERIFICATION_REJECTED,
      message:
        body.status === UserVerificationStatus.APPROVED
          ? 'Your identity verification has been approved.'
          : 'Your identity verification has been rejected.',
      link: '/identity-verification',
    })

    return { data: updatedVerification } as const
  }

  private async deleteImages(verification: UserVerification) {
    if (verification.profileImage?.publicId && verification.identityDocument?.publicId) {
      await cloudinary.images.destroyImagesMany([
        verification.profileImage.publicId,
        verification.identityDocument.publicId,
      ])
    }
  }
}
