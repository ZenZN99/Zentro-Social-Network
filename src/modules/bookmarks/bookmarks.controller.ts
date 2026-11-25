import type { BookmarksService } from './bookmarks.service'
import { getPagination } from '../../utilities/pagination'
import type { ContextHandler } from 'lykosjs'
import { verifyUser } from '../../config/token/verify-user'

export class BookmarksController {
  constructor(private readonly bookmarksService: BookmarksService) {}

  readonly toggle: ContextHandler = async (ctx, reply) => {
    const userId = ctx.user!.id
    const { postId } = ctx.params

    if (!postId) {
      return reply.BadRequest({
        success: false,
        message: 'Post ID is required',
      })
    }

    const result = await this.bookmarksService.toggle(userId, postId)

    return reply.OK({
      success: result.success,
      message: result.message,
      data: {
        isBookmarked: result.isBookmarked,
      },
    })
  }

  readonly findMe: ContextHandler = async (ctx, reply) => {
    const userId = ctx.user!.id
    const { page, limit, offset } = getPagination(ctx)

    const result = await this.bookmarksService.findMe(userId, page, limit, offset)

    return reply.OK({
      success: result.success,
      data: {
        bookmarks: result.bookmarks,
        pagination: result.pagination,
      },
    })
  }

  readonly isBookmarked: ContextHandler = async (ctx, reply) => {
    const userId = ctx.user!.id
    const { postId } = ctx.params

    if (!postId) {
      return reply.BadRequest({
        success: false,
        message: 'Post ID is required',
      })
    }

    const result = await this.bookmarksService.isBookmarked(userId, postId)

    return reply.OK({
      success: result.success,
      data: {
        isBookmarked: result.isBookmarked,
      },
    })
  }

  readonly countByPostId: ContextHandler = async (ctx, reply) => {
    const { postId } = ctx.params

    if (!postId) {
      return reply.BadRequest({
        success: false,
        message: 'Post ID is required',
      })
    }

    const result = await this.bookmarksService.countByPostId(postId)

    return reply.OK({
      success: result.success,
      data: {
        bookmarksCount: result.bookmarksCount,
      },
    })
  }

  readonly countMe: ContextHandler = async (ctx, reply) => {
    const userId = ctx.user!.id

    const result = await this.bookmarksService.countMe(userId)

    return reply.OK({
      success: result.success,
      data: {
        bookmarksCount: result.bookmarksCount,
      },
    })
  }

  verifyToken(token: string) {
    return verifyUser(token)
  }
}
