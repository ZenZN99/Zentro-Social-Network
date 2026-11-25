import type { ContextHandler } from 'lykosjs'
import type { NotificationsService } from './notifications.service'
import type { NotificationType } from './schemas/enums/notification-type'
import { verifyUser } from '../../config/token/verify-user'

export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  readonly create: ContextHandler = async (ctx, reply) => {
    const data = await ctx.json<{
      senderId: string
      receiverId: string
      targetId?: string | null
      type: NotificationType
      message: string
      link?: string | null
    }>()

    const result = await this.notificationsService.create(data)

    return reply.Created({
      success: result?.success,
      data: result?.data,
    })
  }

  readonly findMe: ContextHandler = async (ctx, reply) => {
    const receiverId = ctx.user!.id

    const result = await this.notificationsService.findMe(receiverId)

    return reply.Created({
      success: result.success,
      data: result.data,
    })
  }

  readonly markAsRead: ContextHandler = async (ctx, reply) => {
    const receiverId = ctx.user!.id

    const { notificationId } = ctx.params

    if (!notificationId) {
      return reply.BadRequest({
        success: false,
        message: 'Notification ID is required',
      })
    }
    const result = await this.notificationsService.markAsRead(receiverId, notificationId)

    return reply.Created({
      success: result.success,
      message: result.message,
      data: result.data,
    })
  }

  readonly markAllAsRead: ContextHandler = async (ctx, reply) => {
    const receiverId = ctx.user!.id

    const result = await this.notificationsService.markAllAsRead(receiverId)

    return reply.Created({
      success: result.success,
      message: result.message,
    })
  }

  readonly delete: ContextHandler = async (ctx, reply) => {
    const receiverId = ctx.user!.id

    const { notificationId } = ctx.params

    if (!notificationId) {
      return reply.BadRequest({
        success: false,
        message: 'Notification ID is required',
      })
    }
    const result = await this.notificationsService.delete(receiverId, notificationId)

    return reply.Created({
      success: result.success,
      message: result.message,
    })
  }

  verifyToken(token: string) {
    return verifyUser(token)
  }
}
