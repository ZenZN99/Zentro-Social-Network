import type { SpongHandler } from 'riser-bob'
import type { PostRepostsService } from './post-reposts.service'
import { getPagination } from '../../../utilities/pagination'

export class PostRepostsController {
  constructor(private readonly postRepostsService: PostRepostsService) {}

  readonly repost: SpongHandler = async (spongReq, spongRes) => {
    const userId = spongReq.user!.id
    const { postId } = spongReq.params

    if (!postId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Post ID is required',
      })
    }

    const result = await this.postRepostsService.repost(userId, postId)

    return spongRes.SpongOK({
      success: result.success,
      message: result.message,
    })
  }

  readonly findByUserId: SpongHandler = async (spongReq, spongRes) => {
    const { userId } = spongReq.params

    if (!userId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'User ID is required',
      })
    }

    const { page, limit, offset } = getPagination(spongReq)

    const result = await this.postRepostsService.findByUserId(userId, page, limit, offset)

    return spongRes.SpongOK({
      success: result.success,
      data: {
        reposts: result.data,
        pagination: result.pagination,
      },
    })
  }

  readonly findMe: SpongHandler = async (spongReq, spongRes) => {
    const userId = spongReq.user!.id

    const { page, limit, offset } = getPagination(spongReq)

    const result = await this.postRepostsService.findMe(userId, page, limit, offset)

    return spongRes.SpongOK({
      success: result.success,
      data: {
        reposts: result.data,
        pagination: result.pagination,
      },
    })
  }
}
