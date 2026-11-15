import type { database } from '../../config/db/drizzle'
import { NotificationSchema, type Notification } from './schemas/notification.schema'
import { and, desc, eq, getTableColumns } from 'drizzle-orm'
import { UserSchema } from '../users/schemas/user.schema'
import { UserProfileSchema } from '../user-profiles/schemas/user-profile.schema'
import type { NotificationsGateway } from '../../config/gateways/notifications.gateway'
import { SpongInternalServerErrorException, SpongNotFoundException } from 'riser-bob'

export class NotificationsService {
  constructor(
    private readonly db: typeof database,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  async create(data: Partial<Notification>) {
    if (data.receiverId === data.senderId) return

    const [created] = await this.db
      .insert(NotificationSchema)
      .values({
        senderId: data.senderId!,
        receiverId: data.receiverId!,
        targetId: data.targetId,
        type: data.type!,
        message: data.message!,
        isRead: false,
        link: data.link,
      })
      .returning()

    if (!created) {
      throw new SpongInternalServerErrorException({
        success: false,
        message: 'Failed to create notification',
      })
    }

    const [notification] = await this.db
      .select({
        ...getTableColumns(NotificationSchema),
        sender: {
          id: UserSchema.id,
          firstName: UserSchema.firstName,
          lastName: UserSchema.lastName,
        },
        senderAvatar: UserProfileSchema.avatar,
      })
      .from(NotificationSchema)
      .leftJoin(UserSchema, eq(NotificationSchema.senderId, UserSchema.id))
      .leftJoin(UserProfileSchema, eq(UserProfileSchema.userId, UserSchema.id))
      .where(eq(NotificationSchema.id, created.id))
      .limit(1)

    if (!notification) {
      throw new SpongInternalServerErrorException({
        success: false,
        message: 'Failed to retrieve notification',
      })
    }

    const fullNotification = {
      ...notification,
      sender: notification.sender
        ? {
            ...notification.sender,
            profile:
              notification.senderAvatar !== null ? { avatar: notification.senderAvatar } : null,
          }
        : null,
    }

    this.notificationsGateway.sendNotification(fullNotification)

    return {
      success: true,
      data: fullNotification,
    }
  }

  async findMe(receiverId: string) {
    const result = await this.db
      .select({
        ...getTableColumns(NotificationSchema),

        sender: {
          id: UserSchema.id,
          firstName: UserSchema.firstName,
          lastName: UserSchema.lastName,
        },

        senderAvatar: UserProfileSchema.avatar,
      })
      .from(NotificationSchema)
      .leftJoin(UserSchema, eq(NotificationSchema.senderId, UserSchema.id))
      .leftJoin(UserProfileSchema, eq(UserProfileSchema.userId, UserSchema.id))
      .where(eq(NotificationSchema.receiverId, receiverId))
      .orderBy(desc(NotificationSchema.createdAt))

    const notifications = result.map(({ senderAvatar, ...notification }) => ({
      ...notification,
      sender: notification.sender
        ? {
            ...notification.sender,
            profile: senderAvatar !== null ? { avatar: senderAvatar } : null,
          }
        : null,
    }))

    return {
      success: true,
      data: notifications,
    }
  }

  async markAsRead(receiverId: string, notificationId: string) {
    const [notification] = await this.db
      .select()
      .from(NotificationSchema)
      .where(
        and(
          eq(NotificationSchema.id, notificationId),
          eq(NotificationSchema.receiverId, receiverId),
        ),
      )
      .limit(1)

    if (!notification) {
      throw new SpongNotFoundException({
        success: false,
        message: 'Notification not found',
      })
    }

    let updatedNotification = notification

    if (!notification.isRead) {
      const [updated] = await this.db
        .update(NotificationSchema)
        .set({
          isRead: true,
          updatedAt: new Date(),
        })
        .where(eq(NotificationSchema.id, notificationId))
        .returning()

      if (updated) {
        updatedNotification = updated
      }
    }

    this.notificationsGateway.sendMarkAsRead(receiverId, notificationId)

    return {
      success: true,
      message: 'Notification marked as read successfully',
      data: updatedNotification,
    }
  }

  async markAllAsRead(receiverId: string) {
    await this.db
      .update(NotificationSchema)
      .set({
        isRead: true,
        updatedAt: new Date(),
      })
      .where(
        and(eq(NotificationSchema.receiverId, receiverId), eq(NotificationSchema.isRead, false)),
      )

    this.notificationsGateway.sendMarkAllAsRead(receiverId)

    return {
      success: true,
      message: 'All notifications marked as read successfully',
    }
  }

  async delete(receiverId: string, notificationId: string) {
    const [notification] = await this.db
      .select({ id: NotificationSchema.id })
      .from(NotificationSchema)
      .where(
        and(
          eq(NotificationSchema.id, notificationId),
          eq(NotificationSchema.receiverId, receiverId),
        ),
      )
      .limit(1)

    if (!notification) {
      throw new SpongNotFoundException({
        success: false,
        messag: 'Notification not found',
      })
    }

    await this.db.delete(NotificationSchema).where(eq(NotificationSchema.id, notificationId))

    return {
      success: true,
      message: 'Notification deleted successfully',
    }
  }
}
