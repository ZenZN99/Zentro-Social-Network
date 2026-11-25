import type { ContextHandler } from 'lykosjs'
import { getPagination } from '../../utilities/pagination'
import type { LikesService } from './likes.service'
import { verifyUser } from '../../config/token/verify-user'

export class LikesController {
  constructor(private readonly likesService: LikesService) {}

  readonly toggle: ContextHandler = async (ctx, reply) => {
    const userId = ctx.user!.id

    const { targetType, targetId } = ctx.params

    if (!targetType || !targetId) {
      return reply.BadRequest({
        success: false,
        message: 'Target type and Target ID is required',
      })
    }

    const result = await this.likesService.toggle(userId, targetType, targetId)

    return reply.OK({
      success: result.success,
      message: result.message,
      data: result.data,
    })
  }

  readonly findAll: ContextHandler = async (ctx, reply) => {
    const { targetType, targetId } = ctx.params

    if (!targetType || !targetId) {
      return reply.BadRequest({
        success: false,
        message: 'Target type and Target ID is required',
      })
    }

    const { page, limit, offset } = getPagination(ctx)

    const result = await this.likesService.findAll(page, limit, offset, targetType, targetId)

    return reply.OK({
      success: result.success,
      data: result.data,
    })
  }

  readonly findMe: ContextHandler = async (ctx, reply) => {
    const userId = ctx.user!.id
    const { targetType, targetId } = ctx.params

    if (!targetType || !targetId) {
      return reply.BadRequest({
        success: false,
        message: 'Target type and Target ID is required',
      })
    }

    const { page, limit = 50, offset } = getPagination(ctx)

    const result = await this.likesService.findMe(userId, targetType, targetId, page, limit, offset)

    return reply.OK({
      success: result.success,
      data: result.data,
    })
  }

  readonly count: ContextHandler = async (ctx, reply) => {
    const { targetType, targetId } = ctx.params

    if (!targetType || !targetId) {
      return reply.BadRequest({
        success: false,
        message: 'Target type and Target ID is required',
      })
    }

    const result = await this.likesService.count(targetType, targetId)

    return reply.OK({
      success: result.success,
      data: result.data,
    })
  }

  readonly isLiked: ContextHandler = async (ctx, reply) => {
    const userId = ctx.user!.id
    const { targetType, targetId } = ctx.params

    if (!targetType || !targetId) {
      return reply.BadRequest({
        success: false,
        message: 'Target type and Target ID is required',
      })
    }

    const result = await this.likesService.isLiked(userId, targetType, targetId)

    return reply.OK({
      success: result.success,
      data: result.data,
    })
  }

  verifyToken(token: string) {
    return verifyUser(token)
  }
}
