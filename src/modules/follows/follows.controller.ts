import type { SpongHandler } from 'riser-bob'
import type { FollowsService } from './follows.service'
import { getPagination } from '../../utilities/pagination'

export class FollowsController {
  constructor(private readonly followsService: FollowsService) {}

  readonly toggle: SpongHandler = async (spongReq, spongRes) => {
    const followerId = spongReq.user!.id
    const { followingId } = spongReq.params

    if (!followingId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'User ID is required',
      })
    }

    const result = await this.followsService.toggle(followerId, followingId)

    return spongRes.SpongOK({
      success: result.success,
      message: result.message,
      data: {
        isFollowing: result.isFollowing,
      },
    })
  }

  readonly findFollowers: SpongHandler = async (spongReq, spongRes) => {
    const { userId } = spongReq.params

    if (!userId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'User ID is required',
      })
    }

    const { page, limit, offset } = getPagination(spongReq)

    const result = await this.followsService.findFollowers(userId, page, limit, offset)

    return spongRes.SpongOK({
      success: result.success,
      data: result.data,
      pagination: result.pagination,
    })
  }

  readonly findFollowing: SpongHandler = async (spongReq, spongRes) => {
    const { userId } = spongReq.params

    if (!userId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'User ID is required',
      })
    }

    const { page, limit, offset } = getPagination(spongReq)

    const result = await this.followsService.findFollowing(userId, page, limit, offset)

    return spongRes.SpongOK({
      success: result.success,
      data: result.data,
      pagination: result.pagination,
    })
  }

  readonly isFollowing: SpongHandler = async (spongReq, spongRes) => {
    const followerId = spongReq.user!.id
    const { followingId } = spongReq.params

    if (!followingId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'User ID is required',
      })
    }

    const result = await this.followsService.isFollowing(followerId, followingId)

    return spongRes.SpongOK({
      success: true,
      data: result,
    })
  }

  readonly countFollowers: SpongHandler = async (spongReq, spongRes) => {
    const { userId } = spongReq.params

    if (!userId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'User ID is required',
      })
    }

    const result = await this.followsService.countFollowers(userId)

    return spongRes.SpongOK({
      success: result.success,
      data: result.data,
    })
  }

  readonly countFollowing: SpongHandler = async (spongReq, spongRes) => {
    const { userId } = spongReq.params

    if (!userId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'User ID is required',
      })
    }

    const result = await this.followsService.countFollowing(userId)

    return spongRes.SpongOK({
      success: result.success,
      data: result.data,
    })
  }
}
