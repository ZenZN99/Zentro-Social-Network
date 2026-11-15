import type { SpongHandler } from 'riser-bob'
import type { SupportMessagesService } from './support-messages.service'
import type { User } from '../users/schemas/user.schema'

export class SupportMessagesController {
  constructor(private readonly supportMessagesService: SupportMessagesService) {}

  readonly create: SpongHandler = async (spongReq, spongRes) => {
    const currentUser = spongReq.user as User

    const { conversationId } = spongReq.params

    if (!conversationId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Support conversation ID is required',
      })
    }

    const formData = await spongReq.formData()

    const result = await this.supportMessagesService.create(currentUser, conversationId, formData)

    return spongRes.SpongCreated({
      success: result.success,
      message: result.message,
      data: result.data,
    })
  }

  readonly findAll: SpongHandler = async (spongReq, spongRes) => {
    const currentUser = spongReq.user as User

    const { conversationId } = spongReq.params

    if (!conversationId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Support conversation ID is required',
      })
    }

    const result = await this.supportMessagesService.findAll(currentUser, conversationId)

    return spongRes.SpongOK({
      success: result.success,
      data: result.data,
    })
  }

  readonly markAllAsRead: SpongHandler = async (spongReq, spongRes) => {
    const currentUser = spongReq.user as User

    const { conversationId } = spongReq.params

    if (!conversationId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Support conversation ID is required',
      })
    }

    const result = await this.supportMessagesService.markAllAsRead(currentUser, conversationId)

    return spongRes.SpongOK({
      success: result.success,
      message: result.message,
      data: result.data,
    })
  }

  readonly delete: SpongHandler = async (spongReq, spongRes) => {
    const { conversationId, messageId } = spongReq.params

    if (!conversationId || !messageId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Support conversation ID and message ID is required',
      })
    }

    const result = await this.supportMessagesService.delete(conversationId, messageId)

    return spongRes.SpongOK({
      success: result.success,
      message: result.message,
    })
  }
}
