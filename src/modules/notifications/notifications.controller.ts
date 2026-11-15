import type { SpongHandler } from 'riser-bob'
import type { NotificationsService } from './notifications.service'
import type { NotificationType } from './schemas/enums/notification-type'

export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  readonly create: SpongHandler = async (spongReq, spongRes) => {
    const data = await spongReq.json<{
      senderId: string
      receiverId: string
      targetId?: string | null
      type: NotificationType
      message: string
      link?: string | null
    }>()

    const result = await this.notificationsService.create(data)

    return spongRes.SpongCreated({
      success: result?.success,
      data: result?.data,
    })
  }

  readonly findMe: SpongHandler = async (spongReq, spongRes) => {
    const receiverId = spongReq.user!.id

    const result = await this.notificationsService.findMe(receiverId)

    return spongRes.SpongCreated({
      success: result.success,
      data: result.data,
    })
  }

  readonly markAsRead: SpongHandler = async (spongReq, spongRes) => {
    const receiverId = spongReq.user!.id

    const { notificationId } = spongReq.params

    if (!notificationId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Notification ID is required',
      })
    }
    const result = await this.notificationsService.markAsRead(receiverId, notificationId)

    return spongRes.SpongCreated({
      success: result.success,
      message: result.message,
      data: result.data,
    })
  }

  readonly markAllAsRead: SpongHandler = async (spongReq, spongRes) => {
    const receiverId = spongReq.user!.id

    const result = await this.notificationsService.markAllAsRead(receiverId)

    return spongRes.SpongCreated({
      success: result.success,
      message: result.message,
    })
  }

  readonly delete: SpongHandler = async (spongReq, spongRes) => {
    const receiverId = spongReq.user!.id

    const { notificationId } = spongReq.params

    if (!notificationId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Notification ID is required',
      })
    }
    const result = await this.notificationsService.delete(receiverId, notificationId)

    return spongRes.SpongCreated({
      success: result.success,
      message: result.message,
    })
  }
}
