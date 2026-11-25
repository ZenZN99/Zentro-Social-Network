import { CreateCommentRule } from './rules/create'
import type { CommentsService } from './comments.service'
import { getPagination } from '../../utilities/pagination'
import { UpdateCommentRule } from './rules/update'
import { Validator, type ContextHandler } from 'lykosjs'
import { verifyUser } from '../../config/token/verify-user'

export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}
  readonly create: ContextHandler = async (ctx, reply) => {
    const userId = ctx.user!.id

    const { postId } = ctx.params

    if (!postId) {
      return reply.BadRequest({
        success: false,
        message: 'Post ID is required',
      })
    }

    const { content } = await ctx.json<{ content: string }>()
    const validation = Validator.validate({ content }, CreateCommentRule)

    if (!validation.valid) {
      return reply.UnprocessableContent({
        success: false,
        message: 'validation failed',
        errors: validation.errors,
      })
    }

    const result = await this.commentsService.create(userId, postId, content)

    return reply.Created({
      success: result.success,
      message: result.message,
      data: result.data,
    })
  }

  readonly findAll: ContextHandler = async (ctx, reply) => {
    const { postId } = ctx.params

    if (!postId) {
      return reply.BadRequest({
        success: false,
        message: 'Post ID is required',
      })
    }

    const { page, limit, offset } = getPagination(ctx)

    const result = await this.commentsService.findAll(postId, page, limit, offset)

    return reply.OK({
      success: result.success,
      data: {
        comments: result.data,
        pagination: result.pagination,
      },
    })
  }

  readonly findMe: ContextHandler = async (ctx, reply) => {
    const userId = ctx.user!.id

    const { page, limit, offset } = getPagination(ctx)

    const result = await this.commentsService.findMe(userId, page, limit, offset)

    return reply.OK({
      success: result.success,
      data: {
        comments: result.data,
        pagination: result.pagination,
      },
    })
  }

  readonly findOne: ContextHandler = async (ctx, reply) => {
    const { commentId } = ctx.params

    if (!commentId) {
      return reply.BadRequest({
        success: false,
        message: 'Comment ID is required',
      })
    }

    const result = await this.commentsService.findOne(commentId)

    return reply.OK({
      success: result.success,
      data: result.data,
    })
  }

  readonly update: ContextHandler = async (ctx, reply) => {
    const userId = ctx.user!.id

    const { commentId } = ctx.params

    if (!commentId) {
      return reply.BadRequest({
        success: false,
        message: 'Comment ID is required',
      })
    }

    const { content } = await ctx.json<{ content: string }>()
    const validation = Validator.validate({ content }, UpdateCommentRule)

    if (!validation.valid) {
      return reply.UnprocessableContent({
        success: false,
        message: 'validation failed',
        errors: validation.errors,
      })
    }

    const result = await this.commentsService.update(userId, commentId, content)

    return reply.OK({
      success: result.success,
      message: result.message,
      data: result.data,
    })
  }

  readonly delete: ContextHandler = async (ctx, reply) => {
    const userId = ctx.user!.id

    const { commentId } = ctx.params

    if (!commentId) {
      return reply.BadRequest({
        success: false,
        message: 'Comment ID is required',
      })
    }

    const result = await this.commentsService.delete(userId, commentId)

    return reply.OK({
      success: result.success,
      message: result.message,
    })
  }

  verifyToken(token: string) {
    return verifyUser(token)
  }
}
