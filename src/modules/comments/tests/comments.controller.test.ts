import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { SpongHandler } from 'riser-bob'
import type { CommentsService } from '../comments.service'

const validatorMock = mock((_value: unknown, _rule: unknown): unknown => ({
  valid: true,
  errors: [],
}))

const getPaginationMock = mock(() => ({
  page: 1,
  limit: 10,
  offset: 0,
}))

mock.module('riser-bob', () => ({
  Validator: {
    validate: validatorMock,
  },
}))

mock.module('../../../utilities/pagination', () => ({
  getPagination: getPaginationMock,
}))

const { CommentsController } = await import('../comments.controller')

const makeDependencies = () => {
  const commentsService = {
    create: mock(async () => ({
      success: true,
      message: 'Comment created successfully',
      data: { id: 'comment-id', content: 'Test comment' },
    })),

    findAll: mock(async () => ({
      success: true,
      data: [{ id: 'comment-id' }],
      pagination: { page: 1, limit: 10, total: 1 },
    })),

    findMe: mock(async () => ({
      success: true,
      data: [{ id: 'my-comment-id' }],
      pagination: { page: 1, limit: 10, total: 1 },
    })),

    findOne: mock(async () => ({
      success: true,
      data: { id: 'comment-id' },
    })),

    update: mock(async () => ({
      success: true,
      message: 'Comment updated successfully',
      data: { id: 'comment-id', content: 'Updated comment' },
    })),

    delete: mock(async () => ({
      success: true,
      message: 'Comment and all its replies deleted successfully',
    })),
  } as unknown as CommentsService

  const controller = new CommentsController(commentsService)

  return {
    controller,
    commentsService,
  }
}

const makeRequest = (options?: {
  userId?: string
  params?: Record<string, string | undefined>
  body?: unknown
}) => ({
  user: {
    id: options?.userId ?? 'user-id',
  },
  params: options?.params ?? {},
  json: mock(async <T>() => (options?.body ?? { content: 'Test comment' }) as T),
})

const makeResponse = () => ({
  SpongBadRequest: mock((payload: unknown) => payload),
  SpongUnprocessableContent: mock((payload: unknown) => payload),
  SpongCreated: mock((payload: unknown) => payload),
  SpongOK: mock((payload: unknown) => payload),
})

const invoke = (
  handler: SpongHandler,
  request: ReturnType<typeof makeRequest>,
  response: ReturnType<typeof makeResponse>,
) => handler(request as never, response as never)

describe('CommentsController', () => {
  beforeEach(() => {
    validatorMock.mockReset()
    validatorMock.mockReturnValue({
      valid: true,
      errors: [],
    })

    getPaginationMock.mockReset()
    getPaginationMock.mockReturnValue({
      page: 1,
      limit: 10,
      offset: 0,
    })
  })

  describe('create', () => {
    test('should create a comment successfully', async () => {
      const { controller, commentsService } = makeDependencies()
      const request = makeRequest({
        userId: 'user-id',
        params: { postId: 'post-id' },
        body: { content: 'Test comment' },
      })
      const response = makeResponse()

      await invoke(controller.create, request, response)

      expect(validatorMock).toHaveBeenCalledTimes(1)
      expect(commentsService.create).toHaveBeenCalledWith('user-id', 'post-id', 'Test comment')

      expect(response.SpongCreated).toHaveBeenCalledWith({
        success: true,
        message: 'Comment created successfully',
        data: { id: 'comment-id', content: 'Test comment' },
      })
    })

    test('should return BadRequest when postId is missing', async () => {
      const { controller, commentsService } = makeDependencies()
      const request = makeRequest()
      const response = makeResponse()

      await invoke(controller.create, request, response)

      expect(response.SpongBadRequest).toHaveBeenCalledWith({
        success: false,
        message: 'Post ID is required',
      })

      expect(request.json).not.toHaveBeenCalled()
      expect(commentsService.create).not.toHaveBeenCalled()
    })

    test('should return UnprocessableContent when validation fails', async () => {
      const { controller, commentsService } = makeDependencies()

      validatorMock.mockReturnValue({
        valid: false,
        errors: [{ field: 'content', message: 'Content is required' }],
      })

      const request = makeRequest({
        params: { postId: 'post-id' },
        body: { content: '' },
      })
      const response = makeResponse()

      await invoke(controller.create, request, response)

      expect(response.SpongUnprocessableContent).toHaveBeenCalledWith({
        success: false,
        message: 'validation failed',
        errors: [{ field: 'content', message: 'Content is required' }],
      })

      expect(commentsService.create).not.toHaveBeenCalled()
    })

    test('should propagate service errors', async () => {
      const { controller, commentsService } = makeDependencies()

      commentsService.create = mock(async () => {
        throw new Error('Create comment failed')
      })

      const request = makeRequest({
        params: { postId: 'post-id' },
      })
      const response = makeResponse()

      await expect(invoke(controller.create, request, response)).rejects.toThrow(
        'Create comment failed',
      )
    })
  })

  describe('findAll', () => {
    test('should return comments with pagination', async () => {
      const { controller, commentsService } = makeDependencies()
      const request = makeRequest({
        params: { postId: 'post-id' },
      })
      const response = makeResponse()

      await invoke(controller.findAll, request, response)

      expect(getPaginationMock).toHaveBeenCalledTimes(1)

      expect(commentsService.findAll).toHaveBeenCalledWith('post-id', 1, 10, 0)

      expect(response.SpongOK).toHaveBeenCalledWith({
        success: true,
        data: {
          comments: [{ id: 'comment-id' }],
          pagination: { page: 1, limit: 10, total: 1 },
        },
      })
    })

    test('should return BadRequest when postId is missing', async () => {
      const { controller, commentsService } = makeDependencies()
      const request = makeRequest()
      const response = makeResponse()

      await invoke(controller.findAll, request, response)

      expect(response.SpongBadRequest).toHaveBeenCalledWith({
        success: false,
        message: 'Post ID is required',
      })

      expect(getPaginationMock).not.toHaveBeenCalled()
      expect(commentsService.findAll).not.toHaveBeenCalled()
    })

    test('should pass pagination values to the service', async () => {
      const { controller, commentsService } = makeDependencies()

      getPaginationMock.mockReturnValue({
        page: 3,
        limit: 5,
        offset: 10,
      })

      const request = makeRequest({
        params: { postId: 'post-id' },
      })
      const response = makeResponse()

      await invoke(controller.findAll, request, response)

      expect(commentsService.findAll).toHaveBeenCalledWith('post-id', 3, 5, 10)
    })

    test('should propagate service errors', async () => {
      const { controller, commentsService } = makeDependencies()

      commentsService.findAll = mock(async () => {
        throw new Error('Find comments failed')
      })

      const request = makeRequest({
        params: { postId: 'post-id' },
      })
      const response = makeResponse()

      await expect(invoke(controller.findAll, request, response)).rejects.toThrow(
        'Find comments failed',
      )
    })
  })

  describe('findMe', () => {
    test('should return current user comments with pagination', async () => {
      const { controller, commentsService } = makeDependencies()
      const request = makeRequest({
        userId: 'user-id',
      })
      const response = makeResponse()

      await invoke(controller.findMe, request, response)

      expect(getPaginationMock).toHaveBeenCalledTimes(1)

      expect(commentsService.findMe).toHaveBeenCalledWith('user-id', 1, 10, 0)

      expect(response.SpongOK).toHaveBeenCalledWith({
        success: true,
        data: {
          comments: [{ id: 'my-comment-id' }],
          pagination: { page: 1, limit: 10, total: 1 },
        },
      })
    })

    test('should pass custom pagination values to the service', async () => {
      const { controller, commentsService } = makeDependencies()

      getPaginationMock.mockReturnValue({
        page: 2,
        limit: 20,
        offset: 20,
      })

      const request = makeRequest({
        userId: 'user-id',
      })
      const response = makeResponse()

      await invoke(controller.findMe, request, response)

      expect(commentsService.findMe).toHaveBeenCalledWith('user-id', 2, 20, 20)
    })

    test('should propagate service errors', async () => {
      const { controller, commentsService } = makeDependencies()

      commentsService.findMe = mock(async () => {
        throw new Error('Find my comments failed')
      })

      const request = makeRequest()
      const response = makeResponse()

      await expect(invoke(controller.findMe, request, response)).rejects.toThrow(
        'Find my comments failed',
      )
    })
  })

  describe('findOne', () => {
    test('should return a comment successfully', async () => {
      const { controller, commentsService } = makeDependencies()
      const request = makeRequest({
        params: { commentId: 'comment-id' },
      })
      const response = makeResponse()

      await invoke(controller.findOne, request, response)

      expect(commentsService.findOne).toHaveBeenCalledWith('comment-id')

      expect(response.SpongOK).toHaveBeenCalledWith({
        success: true,
        data: { id: 'comment-id' },
      })
    })

    test('should return BadRequest when commentId is missing', async () => {
      const { controller, commentsService } = makeDependencies()
      const request = makeRequest()
      const response = makeResponse()

      await invoke(controller.findOne, request, response)

      expect(response.SpongBadRequest).toHaveBeenCalledWith({
        success: false,
        message: 'Comment ID is required',
      })

      expect(commentsService.findOne).not.toHaveBeenCalled()
    })

    test('should propagate service errors', async () => {
      const { controller, commentsService } = makeDependencies()

      commentsService.findOne = mock(async () => {
        throw new Error('Comment not found')
      })

      const request = makeRequest({
        params: { commentId: 'comment-id' },
      })
      const response = makeResponse()

      await expect(invoke(controller.findOne, request, response)).rejects.toThrow(
        'Comment not found',
      )
    })
  })

  describe('update', () => {
    test('should update a comment successfully', async () => {
      const { controller, commentsService } = makeDependencies()
      const request = makeRequest({
        userId: 'user-id',
        params: { commentId: 'comment-id' },
        body: { content: 'Updated comment' },
      })
      const response = makeResponse()

      await invoke(controller.update, request, response)

      expect(validatorMock).toHaveBeenCalledTimes(1)

      expect(commentsService.update).toHaveBeenCalledWith(
        'user-id',
        'comment-id',
        'Updated comment',
      )

      expect(response.SpongOK).toHaveBeenCalledWith({
        success: true,
        message: 'Comment updated successfully',
        data: { id: 'comment-id', content: 'Updated comment' },
      })
    })

    test('should return BadRequest when commentId is missing', async () => {
      const { controller, commentsService } = makeDependencies()
      const request = makeRequest()
      const response = makeResponse()

      await invoke(controller.update, request, response)

      expect(response.SpongBadRequest).toHaveBeenCalledWith({
        success: false,
        message: 'Comment ID is required',
      })

      expect(request.json).not.toHaveBeenCalled()
      expect(commentsService.update).not.toHaveBeenCalled()
    })

    test('should return UnprocessableContent when validation fails', async () => {
      const { controller, commentsService } = makeDependencies()

      validatorMock.mockReturnValue({
        valid: false,
        errors: [{ field: 'content', message: 'Invalid content' }],
      })

      const request = makeRequest({
        params: { commentId: 'comment-id' },
        body: { content: '' },
      })
      const response = makeResponse()

      await invoke(controller.update, request, response)

      expect(response.SpongUnprocessableContent).toHaveBeenCalledWith({
        success: false,
        message: 'validation failed',
        errors: [{ field: 'content', message: 'Invalid content' }],
      })

      expect(commentsService.update).not.toHaveBeenCalled()
    })

    test('should propagate service errors', async () => {
      const { controller, commentsService } = makeDependencies()

      commentsService.update = mock(async () => {
        throw new Error('Update comment failed')
      })

      const request = makeRequest({
        params: { commentId: 'comment-id' },
      })
      const response = makeResponse()

      await expect(invoke(controller.update, request, response)).rejects.toThrow(
        'Update comment failed',
      )
    })
  })

  describe('delete', () => {
    test('should delete a comment successfully', async () => {
      const { controller, commentsService } = makeDependencies()
      const request = makeRequest({
        userId: 'user-id',
        params: { commentId: 'comment-id' },
      })
      const response = makeResponse()

      await invoke(controller.delete, request, response)

      expect(commentsService.delete).toHaveBeenCalledWith('user-id', 'comment-id')

      expect(response.SpongOK).toHaveBeenCalledWith({
        success: true,
        message: 'Comment and all its replies deleted successfully',
      })
    })

    test('should return BadRequest when commentId is missing', async () => {
      const { controller, commentsService } = makeDependencies()
      const request = makeRequest()
      const response = makeResponse()

      await invoke(controller.delete, request, response)

      expect(response.SpongBadRequest).toHaveBeenCalledWith({
        success: false,
        message: 'Comment ID is required',
      })

      expect(commentsService.delete).not.toHaveBeenCalled()
    })

    test('should propagate service errors', async () => {
      const { controller, commentsService } = makeDependencies()

      commentsService.delete = mock(async () => {
        throw new Error('Delete comment failed')
      })

      const request = makeRequest({
        params: { commentId: 'comment-id' },
      })
      const response = makeResponse()

      await expect(invoke(controller.delete, request, response)).rejects.toThrow(
        'Delete comment failed',
      )
    })
  })
})
