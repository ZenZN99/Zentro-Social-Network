import { UnauthorizedException, type ContextHandler } from 'lykosjs'
import type { SupportConversationsService } from './support-conversations.service'
import { getPagination } from '../../utilities/pagination'
import { verifyUser } from '../../config/token/verify-user'

export class SupportConversationsController {
  constructor(private readonly supportConversationsService: SupportConversationsService) {}

  readonly create: ContextHandler = async (ctx, reply) => {
    const userId = ctx.user!.id

    const result = await this.supportConversationsService.create(userId)

    return reply.Created({
      success: result.success,
      message: result.message,
      data: result.data,
    })
  }

  readonly findAll: ContextHandler = async (ctx, reply) => {
    const { page, limit, offset } = getPagination(ctx)

    const result = await this.supportConversationsService.findAll(page, limit, offset)

    return reply.OK({
      success: result.success,
      data: {
        conversations: result.data,
        pagination: result.pagination,
      },
    })
  }

  readonly findMe: ContextHandler = async (ctx, reply) => {
    const userId = ctx.user!.id

    const result = await this.supportConversationsService.findMe(userId)

    return reply.OK({
      success: result.success,
      data: result.data,
    })
  }

  readonly findOne: ContextHandler = async (ctx, reply) => {
    const userId = ctx.user!.id
    const { conversationId } = ctx.params

    if (!conversationId) {
      return reply.BadRequest({
        success: false,
        message: 'Support Conversation ID is required',
      })
    }

    const result = await this.supportConversationsService.findOne(userId, conversationId)

    return reply.OK({
      success: result.success,
      data: result.data,
    })
  }

  readonly toggle: ContextHandler = async (ctx, reply) => {
    if (!ctx.user) {
     throw new UnauthorizedException({
        success: false,
        message: 'You are not authenticated',
      })
    }

    const adminId = ctx.user.id
    const { conversationId } = ctx.params

    if (!conversationId) {
      return reply.BadRequest({
        success: false,
        message: 'Support Conversation ID is required',
      })
    }

    const result = await this.supportConversationsService.toggle(adminId, conversationId)

    return reply.OK({
      success: result.success,
      message: result.message,
      data: result.data,
    })
  }

  verifyToken(token: string) {
    return verifyUser(token)
  }
}
