import { getPagination } from '../../utilities/pagination'
import { CreatePostRule } from './rules/create'
import { UpdatePostRule } from './rules/update'
import type { VisibilityStatus } from './schemas/enums/visibility-status'
import type { PostsService } from './posts.service'
import { Validator, type ContextHandler } from 'lykosjs'
import { verifyUser } from '../../config/token/verify-user'

export interface CreatePostBody {
  content: string
  visibility: VisibilityStatus
  isPin: boolean
  mentions?: string[]
  hashtags?: string[]
  quotedPostId?: string
}

export interface UpdatePostBody {
  content?: string
  visibility?: VisibilityStatus
  isPin?: boolean
  mentions?: string[]
  hashtags?: string[]
}

export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  readonly create: ContextHandler = async (ctx, reply) => {
    const userId = ctx.user!.id
    const body = await ctx.json<CreatePostBody>()

    const validation = Validator.validate({ ...body }, CreatePostRule)

    if (!validation.valid) {
      return reply.UnprocessableContent({
        success: false,
        message: 'validation failed',
        errors: validation.errors,
      })
    }

    const formData = await ctx.formData()

    const result = await this.postsService.create(userId, body, formData)

    return reply.Created({
      success: result.success,
      message: result.message,
      data: result.data,
    })
  }

  readonly findAll: ContextHandler = async (ctx, reply) => {
    const userId = ctx.user!.id
    const { page, limit, offset } = getPagination(ctx)

    const result = await this.postsService.findAll(userId, page, limit, offset)

    return reply.OK({
      success: result.success,
      data: {
        posts: result.posts,
        pagination: result.pagination,
      },
    })
  }

  readonly findMe: ContextHandler = async (ctx, reply) => {
    const userId = ctx.user!.id
    const { page, limit, offset } = getPagination(ctx)

    const result = await this.postsService.findMe(userId, page, limit, offset)

    return reply.OK({
      success: result.success,
      data: {
        posts: result.posts,
        pagination: result.pagination,
      },
    })
  }

  readonly findByUserId: ContextHandler = async (ctx, reply) => {
    const currentUserId = ctx.user!.id
    const { userId } = ctx.params

    if (!userId) {
      return reply.BadRequest({
        success: false,
        message: 'User ID is required',
      })
    }

    const { page, limit, offset } = getPagination(ctx)

    const result = await this.postsService.findByUserId(userId, currentUserId, page, limit, offset)

    return reply.OK({
      success: result.success,
      data: {
        posts: result.posts,
        pagination: result.pagination,
      },
    })
  }

  readonly findOne: ContextHandler = async (ctx, reply) => {
    const userId = ctx.user!.id
    const { postId } = ctx.params

    if (!postId) {
      return reply.BadRequest({
        success: false,
        message: 'Post ID is required',
      })
    }

    const result = await this.postsService.findOne(userId, postId)

    return reply.OK({
      success: result.success,
      data: result.data,
    })
  }

  readonly update: ContextHandler = async (ctx, reply) => {
    const userId = ctx.user!.id
    const { postId } = ctx.params

    if (!postId) {
      return reply.BadRequest({
        success: false,
        message: 'Post ID is required',
      })
    }
    const body = await ctx.json<UpdatePostBody>()

    const validation = Validator.validate({ ...body }, UpdatePostRule)

    if (!validation.valid) {
      return reply.UnprocessableContent({
        success: false,
        message: 'validation failed',
        errors: validation.errors,
      })
    }

    const formData = await ctx.formData()

    const result = await this.postsService.update(userId, postId, body, formData)

    return reply.OK({
      success: result.success,
      message: result.message,
      data: result.data,
    })
  }

  readonly delete: ContextHandler = async (ctx, reply) => {
    const userId = ctx.user!.id
    const { postId } = ctx.params

    if (!postId) {
      return reply.BadRequest({
        success: false,
        message: 'Post ID is required',
      })
    }

    const result = await this.postsService.delete(userId, postId)

    return reply.OK({
      success: result.success,
      message: result.message,
    })
  }

  verifyToken(token: string) {
    return verifyUser(token)
  }
}
