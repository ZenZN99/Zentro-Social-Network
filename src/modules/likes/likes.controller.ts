import type { SpongHandler } from 'riser-bob'
import { getPagination } from '../../utilities/pagination'
import type { LikesService } from './likes.service'

export class LikesController {
  constructor(private readonly likesService: LikesService) {}

  readonly toggle: SpongHandler = async (spongReq, spongRes) => {
    const userId = spongReq.user!.id

    const { targetType, targetId } = spongReq.params

    if (!targetType || !targetId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Target type and Target ID is required',
      })
    }

    const result = await this.likesService.toggle(userId, targetType, targetId)

    return spongRes.SpongOK({
      success: result.success,
      message: result.message,
      data: result.data,
    })
  }

  readonly findAll: SpongHandler = async (spongReq, spongRes) => {
    const { targetType, targetId } = spongReq.params

    if (!targetType || !targetId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Target type and Target ID is required',
      })
    }

    const { page, limit, offset } = getPagination(spongReq)

    const result = await this.likesService.findAll(page, limit, offset, targetType, targetId)

    return spongRes.SpongOK({
      success: result.success,
      data: result.data,
    })
  }

  readonly findMe: SpongHandler = async (spongReq, spongRes) => {
    const userId = spongReq.user!.id
    const { targetType, targetId } = spongReq.params

    if (!targetType || !targetId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Target type and Target ID is required',
      })
    }

    const { page, limit = 50, offset } = getPagination(spongReq)

    const result = await this.likesService.findMe(userId, targetType, targetId, page, limit, offset)

    return spongRes.SpongOK({
      success: result.success,
      data: result.data,
    })
  }

  readonly count: SpongHandler = async (spongReq, spongRes) => {
    const { targetType, targetId } = spongReq.params

    if (!targetType || !targetId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Target type and Target ID is required',
      })
    }

    const result = await this.likesService.count(targetType, targetId)

    return spongRes.SpongOK({
      success: result.success,
      data: result.data,
    })
  }

  readonly isLiked: SpongHandler = async (spongReq, spongRes) => {
    const userId = spongReq.user!.id
    const { targetType, targetId } = spongReq.params

    if (!targetType || !targetId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Target type and Target ID is required',
      })
    }

    const result = await this.likesService.isLiked(userId, targetType, targetId)

    return spongRes.SpongOK({
      success: result.success,
      data: result.data,
    })
  }
}
