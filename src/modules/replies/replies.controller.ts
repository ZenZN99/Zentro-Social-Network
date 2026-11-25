import type { RepliesService } from './replies.service'
import { CreateReplyRule } from './rules/create'
import { getPagination } from '../../utilities/pagination'
import { UpdateReplyRule } from './rules/update'
import { Validator, type ContextHandler } from 'lykosjs'
import { verifyUser } from '../../config/token/verify-user'

export class RepliesController {
  constructor(private readonly repliesService: RepliesService) {}

  readonly create: ContextHandler = async (ctx, reply) => {
    const userId = ctx.user!.id
    const { commentId } = ctx.params

    if (!commentId) {
      return reply.BadRequest({
        success: false,
        message: 'Comment ID is required',
      })
    }

    const { content, parentReplyId } = await ctx.json<{
      content: string
      parentReplyId: string
    }>()

    const validation = Validator.validate({ content }, CreateReplyRule)

    if (!validation.valid) {
      return reply.UnprocessableContent({
        success: false,
        message: 'validation failed',
        errors: validation.errors,
      })
    }

    const result = await this.repliesService.create(userId, commentId, content, parentReplyId)

    return reply.Created({
      success: result.success,
      message: result.message,
      data: result.data,
    })
  }

  readonly findAll: ContextHandler = async (ctx, reply) => {
    const { commentId } = ctx.params

    if (!commentId) {
      return reply.BadRequest({
        success: false,
        message: 'Comment ID is required',
      })
    }

    const { page, limit, offset } = getPagination(ctx)

    const result = await this.repliesService.findAll(commentId, page, limit, offset)

    return reply.OK({
      success: result.success,
      data: result.data,
      pagination: result.pagination,
    })
  }

  readonly findMe: ContextHandler = async (ctx, reply) => {
    const { commentId } = ctx.params

    if (!commentId) {
      return reply.BadRequest({
        success: false,
        message: 'Comment ID is required',
      })
    }

    const { page, limit, offset } = getPagination(ctx)

    const result = await this.repliesService.findMe(commentId, page, limit, offset)

    return reply.OK({
      success: result.success,
      data: result.data,
      pagination: result.pagination,
    })
  }

  readonly findOne: ContextHandler = async (ctx, reply) => {
    const { replyId } = ctx.params

    if (!replyId) {
      return reply.BadRequest({
        success: false,
        message: 'Reply ID is required',
      })
    }

    const result = await this.repliesService.findOne(replyId)

    return reply.OK({
      success: result.success,
      data: result.data,
    })
  }

  readonly update: ContextHandler = async (ctx, reply) => {
    const userId = ctx.user!.id
    const { replyId } = ctx.params

    if (!replyId) {
      return reply.BadRequest({
        success: false,
        message: 'Reply ID is required',
      })
    }

    const { content } = await ctx.json<{ content: string }>()

    const validation = Validator.validate({ content }, UpdateReplyRule)

    if (!validation.valid) {
      return reply.UnprocessableContent({
        success: false,
        message: 'validation failed',
        errors: validation.errors,
      })
    }

    const result = await this.repliesService.update(userId, replyId, content)

    return reply.OK({
      success: result.success,
      message: result.message,
      data: result.data,
    })
  }

  readonly delete: ContextHandler = async (ctx, reply) => {
    const userId = ctx.user!.id
    const { replyId } = ctx.params

    if (!replyId) {
      return reply.BadRequest({
        success: false,
        message: 'Reply ID is required',
      })
    }

    const result = await this.repliesService.delete(userId, replyId)

    return reply.OK({
      success: result.success,
      message: result.message,
    })
  }

  verifyToken(token: string) {
    return verifyUser(token)
  }
}
