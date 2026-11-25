import type { ContextHandler } from 'lykosjs'
import type { MessagesService } from './messages.service'
import { verifyUser } from '../../config/token/verify-user'

export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}
  readonly create: ContextHandler = async (ctx, reply) => {
    const senderId = ctx.user!.id

    const { receiverId } = ctx.params

    if (!receiverId) {
      return reply.BadRequest({
        success: false,
        message: 'Receiver ID is required',
      })
    }

    const formData = await ctx.formData()

    const result = await this.messagesService.create(senderId, receiverId, formData)

    return reply.Created({
      success: result.success,
      message: result.message,
      data: result.data,
    })
  }

  readonly findAll: ContextHandler = async (ctx, reply) => {
    const userId = ctx.user!.id

    const { conversationId } = ctx.params

    if (!conversationId) {
      return reply.BadRequest({
        success: false,
        message: 'Conversation ID is required',
      })
    }

    const result = await this.messagesService.findAll(userId, conversationId)

    return reply.OK({
      success: result.success,
      data: result.data,
    })
  }

  readonly markAllAsRead: ContextHandler = async (ctx, reply) => {
    const userId = ctx.user!.id

    const { conversationId } = ctx.params

    if (!conversationId) {
      return reply.BadRequest({
        success: false,
        message: 'Conversation ID is required',
      })
    }

    const result = await this.messagesService.markAllAsRead(userId, conversationId)

    return reply.OK({
      success: result.success,
      message: result.message,
      data: result.data,
    })
  }

  readonly findUnreadCount: ContextHandler = async (ctx, reply) => {
    const userId = ctx.user!.id

    const { conversationId } = ctx.params

    if (!conversationId) {
      return reply.BadRequest({
        success: false,
        message: 'Conversation ID is required',
      })
    }

    const result = await this.messagesService.findUnreadCount(userId, conversationId)

    return reply.OK({
      success: result.success,
      data: result.data,
    })
  }

  readonly delete: ContextHandler = async (ctx, reply) => {
    const userId = ctx.user!.id

    const { messageId } = ctx.params

    if (!messageId) {
      return reply.BadRequest({
        success: false,
        message: 'Message ID is required',
      })
    }

    const result = await this.messagesService.delete(userId, messageId)

    return reply.OK({
      success: result.success,
      message: result.message,
    })
  }

  verifyToken(token: string) {
    return verifyUser(token)
  }
}
