import type { SpongHandler } from 'riser-bob'
import type { BookmarksService } from './bookmarks.service'
import { getPagination } from '../../utilities/pagination'

export class BookmarksController {
  constructor(private readonly bookmarksService: BookmarksService) {}

  readonly toggle: SpongHandler = async (spongReq, spongRes) => {
    const userId = spongReq.user!.id
    const { postId } = spongReq.params

    if (!postId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Post ID is required',
      })
    }

    const result = await this.bookmarksService.toggle(userId, postId)

    return spongRes.SpongOK({
      success: result.success,
      message: result.message,
      data: {
        isBookmarked: result.isBookmarked,
      },
    })
  }

  readonly findMe: SpongHandler = async (spongReq, spongRes) => {
    const userId = spongReq.user!.id
    const { page, limit, offset } = getPagination(spongReq)

    const result = await this.bookmarksService.findMe(userId, page, limit, offset)

    return spongRes.SpongOK({
      success: result.success,
      data: {
        bookmarks: result.bookmarks,
        pagination: result.pagination,
      },
    })
  }

  readonly isBookmarked: SpongHandler = async (spongReq, spongRes) => {
    const userId = spongReq.user!.id
    const { postId } = spongReq.params

    if (!postId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Post ID is required',
      })
    }

    const result = await this.bookmarksService.isBookmarked(userId, postId)

    return spongRes.SpongOK({
      success: result.success,
      data: {
        isBookmarked: result.isBookmarked,
      },
    })
  }

  readonly countByPostId: SpongHandler = async (spongReq, spongRes) => {
    const { postId } = spongReq.params

    if (!postId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Post ID is required',
      })
    }

    const result = await this.bookmarksService.countByPostId(postId)

    return spongRes.SpongOK({
      success: result.success,
      data: {
        bookmarksCount: result.bookmarksCount,
      },
    })
  }

  readonly countMe: SpongHandler = async (spongReq, spongRes) => {
    const userId = spongReq.user!.id

    const result = await this.bookmarksService.countMe(userId)

    return spongRes.SpongOK({
      success: result.success,
      data: {
        bookmarksCount: result.bookmarksCount,
      },
    })
  }
}
