import type { FollowsService } from './follows.service'
import { getPagination } from '../../utilities/pagination'
import type { ContextHandler } from 'lykosjs'
import { verifyUser } from '../../config/token/verify-user'

export class FollowsController {
  constructor(private readonly followsService: FollowsService) {}

  readonly toggle: ContextHandler = async (ctx, reply) => {
    const followerId = ctx.user!.id
    const { followingId } = ctx.params

    if (!followingId) {
      return reply.BadRequest({
        success: false,
        message: 'User ID is required',
      })
    }

    const result = await this.followsService.toggle(followerId, followingId)

    return reply.OK({
      success: result.success,
      message: result.message,
      data: {
        isFollowing: result.isFollowing,
      },
    })
  }

  readonly findFollowers: ContextHandler = async (ctx, reply) => {
    const { userId } = ctx.params

    if (!userId) {
      return reply.BadRequest({
        success: false,
        message: 'User ID is required',
      })
    }

    const { page, limit, offset } = getPagination(ctx)

    const result = await this.followsService.findFollowers(userId, page, limit, offset)

    return reply.OK({
      success: result.success,
      data: result.data,
      pagination: result.pagination,
    })
  }

  readonly findFollowing: ContextHandler = async (ctx, reply) => {
    const { userId } = ctx.params

    if (!userId) {
      return reply.BadRequest({
        success: false,
        message: 'User ID is required',
      })
    }

    const { page, limit, offset } = getPagination(ctx)

    const result = await this.followsService.findFollowing(userId, page, limit, offset)

    return reply.OK({
      success: result.success,
      data: result.data,
      pagination: result.pagination,
    })
  }

  readonly isFollowing: ContextHandler = async (ctx, reply) => {
    const followerId = ctx.user!.id
    const { followingId } = ctx.params

    if (!followingId) {
      return reply.BadRequest({
        success: false,
        message: 'User ID is required',
      })
    }

    const result = await this.followsService.isFollowing(followerId, followingId)

    return reply.OK({
      success: true,
      data: result,
    })
  }

  readonly countFollowers: ContextHandler = async (ctx, reply) => {
    const { userId } = ctx.params

    if (!userId) {
      return reply.BadRequest({
        success: false,
        message: 'User ID is required',
      })
    }

    const result = await this.followsService.countFollowers(userId)

    return reply.OK({
      success: result.success,
      data: result.data,
    })
  }

  readonly countFollowing: ContextHandler = async (ctx, reply) => {
    const { userId } = ctx.params

    if (!userId) {
      return reply.BadRequest({
        success: false,
        message: 'User ID is required',
      })
    }

    const result = await this.followsService.countFollowing(userId)

    return reply.OK({
      success: result.success,
      data: result.data,
    })
  }

  verifyToken(token: string) {
    return verifyUser(token)
  }
}
