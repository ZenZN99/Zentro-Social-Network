import type { SpongHandler } from 'riser-bob'
import type { MessagesService } from './messages.service'

export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}
  readonly create: SpongHandler = async (spongReq, spongRes) => {
    const senderId = spongReq.user!.id

    const { receiverId } = spongReq.params

    if (!receiverId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Receiver ID is required',
      })
    }

    const formData = await spongReq.formData()

    const result = await this.messagesService.create(senderId, receiverId, formData)

    return spongRes.SpongCreated({
      success: result.success,
      message: result.message,
      data: result.data,
    })
  }

  readonly findAll: SpongHandler = async (spongReq, spongRes) => {
    const userId = spongReq.user!.id

    const { conversationId } = spongReq.params

    if (!conversationId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Conversation ID is required',
      })
    }

    const result = await this.messagesService.findAll(userId, conversationId)

    return spongRes.SpongOK({
      success: result.success,
      data: result.data,
    })
  }

  readonly markAllAsRead: SpongHandler = async (spongReq, spongRes) => {
    const userId = spongReq.user!.id

    const { conversationId } = spongReq.params

    if (!conversationId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Conversation ID is required',
      })
    }

    const result = await this.messagesService.markAllAsRead(userId, conversationId)

    return spongRes.SpongOK({
      success: result.success,
      message: result.message,
      data: result.data,
    })
  }

  readonly findUnreadCount: SpongHandler = async (spongReq, spongRes) => {
    const userId = spongReq.user!.id

    const { conversationId } = spongReq.params

    if (!conversationId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Conversation ID is required',
      })
    }

    const result = await this.messagesService.findUnreadCount(userId, conversationId)

    return spongRes.SpongOK({
      success: result.success,
      data: result.data,
    })
  }

  readonly delete: SpongHandler = async (spongReq, spongRes) => {
    const userId = spongReq.user!.id

    const { messageId } = spongReq.params

    if (!messageId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Message ID is required',
      })
    }

    const result = await this.messagesService.delete(userId, messageId)

    return spongRes.SpongOK({
      success: result.success,
      message: result.message,
    })
  }
}
