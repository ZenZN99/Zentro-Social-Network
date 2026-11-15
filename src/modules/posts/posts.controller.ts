import { Validator, type SpongHandler } from 'riser-bob'
import { getPagination } from '../../utilities/pagination'
import { CreatePostRule } from './rules/create'
import { UpdatePostRule } from './rules/update'
import type { VisibilityStatus } from './schemas/enums/visibility-status'
import type { PostsService } from './posts.service'

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

  readonly create: SpongHandler = async (spongReq, spongRes) => {
    const userId = spongReq.user!.id
    const body = await spongReq.json<CreatePostBody>()

    const validation = Validator.validate({ ...body }, CreatePostRule)

    if (!validation.valid) {
      return spongRes.SpongUnprocessableContent({
        success: false,
        message: 'validation failed',
        errors: validation.errors,
      })
    }

    const formData = await spongReq.formData()

    const result = await this.postsService.create(userId, body, formData)

    return spongRes.SpongCreated({
      success: result.success,
      message: result.message,
      data: result.data,
    })
  }

  readonly findAll: SpongHandler = async (spongReq, spongRes) => {
    const userId = spongReq.user!.id
    const { page, limit, offset } = getPagination(spongReq)

    const result = await this.postsService.findAll(userId, page, limit, offset)

    return spongRes.SpongOK({
      success: result.success,
      data: {
        posts: result.posts,
        pagination: result.pagination,
      },
    })
  }

  readonly findMe: SpongHandler = async (spongReq, spongRes) => {
    const userId = spongReq.user!.id
    const { page, limit, offset } = getPagination(spongReq)

    const result = await this.postsService.findMe(userId, page, limit, offset)

    return spongRes.SpongOK({
      success: result.success,
      data: {
        posts: result.posts,
        pagination: result.pagination,
      },
    })
  }

  readonly findByUserId: SpongHandler = async (spongReq, spongRes) => {
    const currentUserId = spongReq.user!.id
    const { userId } = spongReq.params

    if (!userId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'User ID is required',
      })
    }

    const { page, limit, offset } = getPagination(spongReq)

    const result = await this.postsService.findByUserId(userId, currentUserId, page, limit, offset)

    return spongRes.SpongOK({
      success: result.success,
      data: {
        posts: result.posts,
        pagination: result.pagination,
      },
    })
  }

  readonly findOne: SpongHandler = async (spongReq, spongRes) => {
    const userId = spongReq.user!.id
    const { postId } = spongReq.params

    if (!postId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Post ID is required',
      })
    }

    const result = await this.postsService.findOne(userId, postId)

    return spongRes.SpongOK({
      success: result.success,
      data: result.data,
    })
  }

  readonly update: SpongHandler = async (spongReq, spongRes) => {
    const userId = spongReq.user!.id
    const { postId } = spongReq.params

    if (!postId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Post ID is required',
      })
    }
    const body = await spongReq.json<UpdatePostBody>()

    const validation = Validator.validate({ ...body }, UpdatePostRule)

    if (!validation.valid) {
      return spongRes.SpongUnprocessableContent({
        success: false,
        message: 'validation failed',
        errors: validation.errors,
      })
    }

    const formData = await spongReq.formData()

    const result = await this.postsService.update(userId, postId, body, formData)

    return spongRes.SpongOK({
      success: result.success,
      message: result.message,
      data: result.data,
    })
  }

  readonly delete: SpongHandler = async (spongReq, spongRes) => {
    const userId = spongReq.user!.id
    const { postId } = spongReq.params

    if (!postId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Post ID is required',
      })
    }

    const result = await this.postsService.delete(userId, postId)

    return spongRes.SpongOK({
      success: result.success,
      message: result.message,
    })
  }
}
