import { Validator, type SpongHandler } from 'riser-bob'
import type { RepliesService } from './replies.service'
import { CreateReplyRule } from './rules/create'
import { getPagination } from '../../utilities/pagination'
import { UpdateReplyRule } from './rules/update'

export class RepliesController {
  constructor(private readonly repliesService: RepliesService) {}

  readonly create: SpongHandler = async (spongReq, spongRes) => {
    const userId = spongReq.user!.id
    const { commentId } = spongReq.params

    if (!commentId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Comment ID is required',
      })
    }

    const { content, parentReplyId } = await spongReq.json<{
      content: string
      parentReplyId: string
    }>()

    const validation = Validator.validate({ content }, CreateReplyRule)

    if (!validation.valid) {
      return spongRes.SpongUnprocessableContent({
        success: false,
        message: 'validation failed',
        errors: validation.errors,
      })
    }

    const result = await this.repliesService.create(
      userId,
      commentId,
      content,
      parentReplyId,
    )

    return spongRes.SpongCreated({
      success: result.success,
      message: result.message,
      data: result.data,
    })
  }

  readonly findAll: SpongHandler = async (spongReq, spongRes) => {
    const { commentId } = spongReq.params

    if (!commentId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Comment ID is required',
      })
    }

    const { page, limit, offset } = getPagination(spongReq)

    const result = await this.repliesService.findAll(
      commentId,
      page,
      limit,
      offset,
    )

    return spongRes.SpongOK({
      success: result.success,
      data: result.data,
      pagination: result.pagination,
    })
  }

  readonly findMe: SpongHandler = async (spongReq, spongRes) => {
    const { commentId } = spongReq.params

    if (!commentId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Comment ID is required',
      })
    }

    const { page, limit, offset } = getPagination(spongReq)

    const result = await this.repliesService.findMe(
      commentId,
      page,
      limit,
      offset,
    )

    return spongRes.SpongOK({
      success: result.success,
      data: result.data,
      pagination: result.pagination,
    })
  }

  readonly findOne: SpongHandler = async (spongReq, spongRes) => {
    const { replyId } = spongReq.params

    if (!replyId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Reply ID is required',
      })
    }

    const result = await this.repliesService.findOne(replyId)

    return spongRes.SpongOK({
      success: result.success,
      data: result.data,
    })
  }

  readonly update: SpongHandler = async (spongReq, spongRes) => {
    const userId = spongReq.user!.id
    const { replyId } = spongReq.params

    if (!replyId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Reply ID is required',
      })
    }

    const { content } = await spongReq.json<{ content: string }>()

    const validation = Validator.validate({ content }, UpdateReplyRule)

    if (!validation.valid) {
      return spongRes.SpongUnprocessableContent({
        success: false,
        message: 'validation failed',
        errors: validation.errors,
      })
    }

    const result = await this.repliesService.update(userId, replyId, content)

    return spongRes.SpongOK({
      success: result.success,
      message: result.message,
      data: result.data,
    })
  }

  readonly delete: SpongHandler = async (spongReq, spongRes) => {
    const userId = spongReq.user!.id
    const { replyId } = spongReq.params

    if (!replyId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Reply ID is required',
      })
    }

    const result = await this.repliesService.delete(userId, replyId)

    return spongRes.SpongOK({
      success: result.success,
      message: result.message,
    })
  }
}
