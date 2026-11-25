import type { ContextHandler } from 'lykosjs'
import type { PostRepostsService } from './post-reposts.service'
import { getPagination } from '../../../utilities/pagination'
import { verifyUser } from '../../../config/token/verify-user'

export class PostRepostsController {
  constructor(private readonly postRepostsService: PostRepostsService) {}

  readonly repost: ContextHandler = async (ctx, reply) => {
    const userId = ctx.user!.id
    const { postId } = ctx.params

    if (!postId) {
      return reply.BadRequest({
        success: false,
        message: 'Post ID is required',
      })
    }

    const result = await this.postRepostsService.repost(userId, postId)

    return reply.OK({
      success: result.success,
      message: result.message,
    })
  }

  readonly findByUserId: ContextHandler = async (ctx, reply) => {
    const { userId } = ctx.params

    if (!userId) {
      return reply.BadRequest({
        success: false,
        message: 'User ID is required',
      })
    }

    const { page, limit, offset } = getPagination(ctx)

    const result = await this.postRepostsService.findByUserId(userId, page, limit, offset)

    return reply.OK({
      success: result.success,
      data: {
        reposts: result.data,
        pagination: result.pagination,
      },
    })
  }

  readonly findMe: ContextHandler = async (ctx, reply) => {
    const userId = ctx.user!.id

    const { page, limit, offset } = getPagination(ctx)

    const result = await this.postRepostsService.findMe(userId, page, limit, offset)

    return reply.OK({
      success: result.success,
      data: {
        reposts: result.data,
        pagination: result.pagination,
      },
    })
  }

  verifyToken(token: string) {
    return verifyUser(token)
  }
}
