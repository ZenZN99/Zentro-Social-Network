import { Validator, type SpongHandler } from 'riser-bob'
import { CreateCommentRule } from './rules/create'
import type { CommentsService } from './comments.service'
import { getPagination } from '../../utilities/pagination'
import { UpdateCommentRule } from './rules/update'

export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}
  readonly create: SpongHandler = async (spongReq, spongRes) => {
    const userId = spongReq.user!.id

    const { postId } = spongReq.params

    if (!postId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Post ID is required',
      })
    }

    const { content } = await spongReq.json<{ content: string }>()
    const validation = Validator.validate({ content }, CreateCommentRule)

    if (!validation.valid) {
      return spongRes.SpongUnprocessableContent({
        success: false,
        message: 'validation failed',
        errors: validation.errors,
      })
    }

    const result = await this.commentsService.create(userId, postId, content)

    return spongRes.SpongCreated({
      success: result.success,
      message: result.message,
      data: result.data,
    })
  }

  readonly findAll: SpongHandler = async (spongReq, spongRes) => {
    const { postId } = spongReq.params

    if (!postId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Post ID is required',
      })
    }

    const { page, limit, offset } = getPagination(spongReq)

    const result = await this.commentsService.findAll(postId, page, limit, offset)

    return spongRes.SpongOK({
      success: result.success,
      data: {
        comments: result.data,
        pagination: result.pagination,
      },
    })
  }

  readonly findMe: SpongHandler = async (spongReq, spongRes) => {
    const userId = spongReq.user!.id

    const { page, limit, offset } = getPagination(spongReq)

    const result = await this.commentsService.findMe(userId, page, limit, offset)

    return spongRes.SpongOK({
      success: result.success,
      data: {
        comments: result.data,
        pagination: result.pagination,
      },
    })
  }

  readonly findOne: SpongHandler = async (spongReq, spongRes) => {
    const { commentId } = spongReq.params

    if (!commentId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Comment ID is required',
      })
    }

    const result = await this.commentsService.findOne(commentId)

    return spongRes.SpongOK({
      success: result.success,
      data: result.data,
    })
  }

  readonly update: SpongHandler = async (spongReq, spongRes) => {
    const userId = spongReq.user!.id

    const { commentId } = spongReq.params

    if (!commentId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Comment ID is required',
      })
    }

    const { content } = await spongReq.json<{ content: string }>()
    const validation = Validator.validate({ content }, UpdateCommentRule)

    if (!validation.valid) {
      return spongRes.SpongUnprocessableContent({
        success: false,
        message: 'validation failed',
        errors: validation.errors,
      })
    }

    const result = await this.commentsService.update(userId, commentId, content)

    return spongRes.SpongOK({
      success: result.success,
      message: result.message,
      data: result.data,
    })
  }

  readonly delete: SpongHandler = async (spongReq, spongRes) => {
    const userId = spongReq.user!.id

    const { commentId } = spongReq.params

    if (!commentId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Comment ID is required',
      })
    }

    const result = await this.commentsService.delete(userId, commentId)

    return spongRes.SpongOK({
      success: result.success,
      message: result.message,
    })
  }
}
