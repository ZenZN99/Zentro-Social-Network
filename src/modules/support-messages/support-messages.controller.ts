import type { SupportMessagesService } from './support-messages.service'
import type { User } from '../users/schemas/user.schema'
import type { ContextHandler } from 'lykosjs'
import { verifyUser } from '../../config/token/verify-user'

export class SupportMessagesController {
  constructor(private readonly supportMessagesService: SupportMessagesService) {}

  readonly create: ContextHandler = async (ctx, reply) => {
    const currentUser = ctx.user as User

    const { conversationId } = ctx.params

    if (!conversationId) {
      return reply.BadRequest({
        success: false,
        message: 'Support conversation ID is required',
      })
    }

    const formData = await ctx.formData()

    const result = await this.supportMessagesService.create(currentUser, conversationId, formData)

    return reply.Created({
      success: result.success,
      message: result.message,
      data: result.data,
    })
  }

  readonly findAll: ContextHandler = async (ctx, reply) => {
    const currentUser = ctx.user as User

    const { conversationId } = ctx.params

    if (!conversationId) {
      return reply.BadRequest({
        success: false,
        message: 'Support conversation ID is required',
      })
    }

    const result = await this.supportMessagesService.findAll(currentUser, conversationId)

    return reply.OK({
      success: result.success,
      data: result.data,
    })
  }

  readonly markAllAsRead: ContextHandler = async (ctx, reply) => {
    const currentUser = ctx.user as User

    const { conversationId } = ctx.params

    if (!conversationId) {
      return reply.BadRequest({
        success: false,
        message: 'Support conversation ID is required',
      })
    }

    const result = await this.supportMessagesService.markAllAsRead(currentUser, conversationId)

    return reply.OK({
      success: result.success,
      message: result.message,
      data: result.data,
    })
  }

  readonly delete: ContextHandler = async (ctx, reply) => {
    const { conversationId, messageId } = ctx.params

    if (!conversationId || !messageId) {
      return reply.BadRequest({
        success: false,
        message: 'Support conversation ID and message ID is required',
      })
    }

    const result = await this.supportMessagesService.delete(conversationId, messageId)

    return reply.OK({
      success: result.success,
      message: result.message,
    })
  }

  verifyToken(token: string) {
    return verifyUser(token)
  }
}
