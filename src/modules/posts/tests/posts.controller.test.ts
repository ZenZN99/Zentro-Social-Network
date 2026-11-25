import { afterAll, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
import { Validator } from 'lykosjs'
import type { PostsService } from '../posts.service'
import type { CreatePostBody, UpdatePostBody } from '../posts.controller'

type ValidationResult = ReturnType<typeof Validator.validate>

const validResult = { valid: true, errors: {} } as unknown as ValidationResult
const invalidResult = (errors: unknown): ValidationResult =>
  ({ valid: false, errors }) as unknown as ValidationResult

const validate = spyOn(Validator, 'validate')

const PAGINATION_MODULE = '../../../utilities/pagination'
// Copy the real module BEFORE mocking so it can be restored (mock.module leaks across files).
const realPagination = { ...(await import('../../../utilities/pagination')) }

const getPagination = mock(
  (..._args: Parameters<typeof realPagination.getPagination>) =>
    ({ page: 1, limit: 10, offset: 0 }) as ReturnType<typeof realPagination.getPagination>,
)

mock.module(PAGINATION_MODULE, () => ({ ...realPagination, getPagination }))

afterAll(() => {
  validate.mockRestore()
  mock.module(PAGINATION_MODULE, () => realPagination)
})

const { PostsController } = await import('../posts.controller')

const createResult = {
  success: true,
  message: 'Post created successfully',
  data: { id: 'post-1' },
}

const updateResult = {
  success: true,
  message: 'Post updated successfully',
  data: { id: 'post-1' },
}

const deleteResult = {
  success: true,
  message: 'Post deleted successfully',
}

const findResult = {
  success: true,
  posts: [{ id: 'post-1' }],
  pagination: {
    page: 1,
    limit: 10,
    total: 1,
    totalPages: 1,
  },
}

const findOneResult = {
  success: true,
  data: { id: 'post-1' },
}

function createService() {
  return {
    create: mock(async () => createResult),
    findAll: mock(async () => findResult),
    findMe: mock(async () => findResult),
    findByUserId: mock(async () => findResult),
    findOne: mock(async () => findOneResult),
    update: mock(async () => updateResult),
    delete: mock(async () => deleteResult),
  }
}

function createResponse() {
  return {
    Created: mock((payload: unknown) => ({
      status: 201,
      payload,
    })),
    OK: mock((payload: unknown) => ({
      status: 200,
      payload,
    })),
    BadRequest: mock((payload: unknown) => ({
      status: 400,
      payload,
    })),
    UnprocessableContent: mock((payload: unknown) => ({
      status: 422,
      payload,
    })),
  }
}

function createRequest(options?: {
  userId?: string
  params?: Record<string, string | undefined>
  body?: unknown
  formData?: FormData
}) {
  const body = options?.body ?? {}
  const formData = options?.formData ?? new FormData()

  return {
    user: { id: options?.userId ?? 'user-1' },
    params: options?.params ?? {},
    json: mock(async () => body),
    formData: mock(async () => formData),
  }
}

function setup() {
  const service = createService()
  const controller = new PostsController(service as unknown as PostsService)
  const response = createResponse()

  return { service, controller, response }
}

beforeEach(() => {
  validate.mockClear()
  validate.mockImplementation(
    (data) =>
      ({
        valid: true,
        data,
        errors: {},
      }) as never,
  )

  getPagination.mockClear()
  getPagination.mockImplementation(() => ({
    page: 1,
    limit: 10,
    offset: 0,
  }))
})

describe('PostsController.create', () => {
  const body: CreatePostBody = {
    content: 'Hello world',
    visibility: 'PUBLIC' as CreatePostBody['visibility'],
    isPin: false,
    mentions: [],
    hashtags: [],
  }

  test('creates a post successfully', async () => {
    const { controller, service, response } = setup()
    const request = createRequest({ body })

    await controller.create(request as never, response as never)

    expect(validate).toHaveBeenCalledTimes(1)
    expect(validate).toHaveBeenCalledWith({ ...body }, expect.anything())

    expect(request.json).toHaveBeenCalledTimes(1)
    expect(request.formData).toHaveBeenCalledTimes(1)

    expect(service.create).toHaveBeenCalledTimes(1)
    expect(service.create).toHaveBeenCalledWith('user-1', body, expect.any(FormData))

    expect(response.Created).toHaveBeenCalledWith({
      success: true,
      message: createResult.message,
      data: createResult.data,
    })
  })

  test('returns validation errors without calling the service', async () => {
    const { controller, service, response } = setup()
    const request = createRequest({ body })

    const errors = {
      content: ['Content is required'],
    }

    validate.mockImplementation(() => ({
      valid: false,
      errors,
    }))

    await controller.create(request as never, response as never)

    expect(response.UnprocessableContent).toHaveBeenCalledWith({
      success: false,
      message: 'validation failed',
      errors,
    })

    expect(request.formData).not.toHaveBeenCalled()
    expect(service.create).not.toHaveBeenCalled()
    expect(response.Created).not.toHaveBeenCalled()
  })

  test('does not call formData when JSON parsing fails', async () => {
    const { controller, service, response } = setup()
    const request = createRequest({ body })

    request.json.mockRejectedValueOnce(new Error('Invalid JSON'))

    await expect(controller.create(request as never, response as never)).rejects.toThrow(
      'Invalid JSON',
    )

    expect(request.formData).not.toHaveBeenCalled()
    expect(service.create).not.toHaveBeenCalled()
  })

  test('does not call the service when formData parsing fails', async () => {
    const { controller, service, response } = setup()
    const request = createRequest({ body })

    request.formData.mockRejectedValueOnce(new Error('Invalid multipart body'))

    await expect(controller.create(request as never, response as never)).rejects.toThrow(
      'Invalid multipart body',
    )

    expect(service.create).not.toHaveBeenCalled()
  })

  test('propagates service errors', async () => {
    const { controller, service, response } = setup()
    const request = createRequest({ body })

    service.create.mockRejectedValueOnce(new Error('Database failure'))

    await expect(controller.create(request as never, response as never)).rejects.toThrow(
      'Database failure',
    )

    expect(response.Created).not.toHaveBeenCalled()
  })

  test('passes the authenticated user ID to the service', async () => {
    const { controller, service, response } = setup()
    const request = createRequest({
      userId: 'another-user',
      body,
    })

    await controller.create(request as never, response as never)

    expect(service.create).toHaveBeenCalledWith('another-user', body, expect.any(FormData))
  })
})

describe('PostsController.findAll', () => {
  test('returns posts and pagination', async () => {
    const { controller, service, response } = setup()
    const request = createRequest()

    await controller.findAll(request as never, response as never)

    expect(service.findAll).toHaveBeenCalledWith('user-1', 1, 10, 0)

    expect(response.OK).toHaveBeenCalledWith({
      success: true,
      data: {
        posts: findResult.posts,
        pagination: findResult.pagination,
      },
    })
  })

  test('uses pagination values returned by getPagination', async () => {
    const { controller, service, response } = setup()
    const request = createRequest()

    getPagination.mockImplementation(() => ({
      page: 3,
      limit: 20,
      offset: 40,
    }))

    await controller.findAll(request as never, response as never)

    expect(getPagination).toHaveBeenCalledTimes(1)
    expect(service.findAll).toHaveBeenCalledWith('user-1', 3, 20, 40)
  })

  test('passes the request to getPagination', async () => {
    const { controller, response } = setup()
    const request = createRequest()

    await controller.findAll(request as never, response as never)

    expect(getPagination).toHaveBeenCalledWith(request)
  })

  test('propagates service errors', async () => {
    const { controller, service, response } = setup()
    const request = createRequest()

    service.findAll.mockRejectedValueOnce(new Error('Query failed'))

    await expect(controller.findAll(request as never, response as never)).rejects.toThrow(
      'Query failed',
    )

    expect(response.OK).not.toHaveBeenCalled()
  })
})

describe('PostsController.findMe', () => {
  test('returns the authenticated user posts', async () => {
    const { controller, service, response } = setup()
    const request = createRequest()

    await controller.findMe(request as never, response as never)

    expect(service.findMe).toHaveBeenCalledWith('user-1', 1, 10, 0)

    expect(response.OK).toHaveBeenCalledWith({
      success: true,
      data: {
        posts: findResult.posts,
        pagination: findResult.pagination,
      },
    })
  })

  test('uses custom pagination values', async () => {
    const { controller, service, response } = setup()
    const request = createRequest()

    getPagination.mockImplementation(() => ({
      page: 5,
      limit: 15,
      offset: 60,
    }))

    await controller.findMe(request as never, response as never)

    expect(service.findMe).toHaveBeenCalledWith('user-1', 5, 15, 60)
  })

  test('propagates service errors', async () => {
    const { controller, service, response } = setup()
    const request = createRequest()

    service.findMe.mockRejectedValueOnce(new Error('Database unavailable'))

    await expect(controller.findMe(request as never, response as never)).rejects.toThrow(
      'Database unavailable',
    )

    expect(response.OK).not.toHaveBeenCalled()
  })
})

describe('PostsController.findByUserId', () => {
  test('returns bad request when userId is missing', async () => {
    const { controller, service, response } = setup()
    const request = createRequest({ params: {} })

    await controller.findByUserId(request as never, response as never)

    expect(response.BadRequest).toHaveBeenCalledWith({
      success: false,
      message: 'User ID is required',
    })

    expect(service.findByUserId).not.toHaveBeenCalled()
    expect(getPagination).not.toHaveBeenCalled()
  })

  test('returns bad request when userId is an empty string', async () => {
    const { controller, service, response } = setup()
    const request = createRequest({
      params: { userId: '' },
    })

    await controller.findByUserId(request as never, response as never)

    expect(response.BadRequest).toHaveBeenCalledTimes(1)
    expect(service.findByUserId).not.toHaveBeenCalled()
  })

  test('calls service with target user and current user IDs', async () => {
    const { controller, service, response } = setup()
    const request = createRequest({
      userId: 'viewer-1',
      params: { userId: 'target-1' },
    })

    await controller.findByUserId(request as never, response as never)

    expect(service.findByUserId).toHaveBeenCalledWith('target-1', 'viewer-1', 1, 10, 0)
  })

  test('returns posts and pagination', async () => {
    const { controller, response } = setup()
    const request = createRequest({
      params: { userId: 'target-1' },
    })

    await controller.findByUserId(request as never, response as never)

    expect(response.OK).toHaveBeenCalledWith({
      success: true,
      data: {
        posts: findResult.posts,
        pagination: findResult.pagination,
      },
    })
  })

  test('does not call service when userId is missing', async () => {
    const { controller, service, response } = setup()
    const request = createRequest({
      params: { userId: undefined },
    })

    await controller.findByUserId(request as never, response as never)

    expect(service.findByUserId).not.toHaveBeenCalled()
  })

  test('propagates service errors', async () => {
    const { controller, service, response } = setup()
    const request = createRequest({
      params: { userId: 'target-1' },
    })

    service.findByUserId.mockRejectedValueOnce(new Error('Target user not found'))

    await expect(controller.findByUserId(request as never, response as never)).rejects.toThrow(
      'Target user not found',
    )

    expect(response.OK).not.toHaveBeenCalled()
  })
})

describe('PostsController.findOne', () => {
  test('returns bad request when postId is missing', async () => {
    const { controller, service, response } = setup()
    const request = createRequest({ params: {} })

    await controller.findOne(request as never, response as never)

    expect(response.BadRequest).toHaveBeenCalledWith({
      success: false,
      message: 'Post ID is required',
    })

    expect(service.findOne).not.toHaveBeenCalled()
  })

  test('returns bad request when postId is empty', async () => {
    const { controller, service, response } = setup()
    const request = createRequest({
      params: { postId: '' },
    })

    await controller.findOne(request as never, response as never)

    expect(response.BadRequest).toHaveBeenCalledTimes(1)
    expect(service.findOne).not.toHaveBeenCalled()
  })

  test('returns the requested post', async () => {
    const { controller, service, response } = setup()
    const request = createRequest({
      userId: 'viewer-1',
      params: { postId: 'post-1' },
    })

    await controller.findOne(request as never, response as never)

    expect(service.findOne).toHaveBeenCalledWith('viewer-1', 'post-1')

    expect(response.OK).toHaveBeenCalledWith({
      success: true,
      data: findOneResult.data,
    })
  })

  test('propagates service errors', async () => {
    const { controller, service, response } = setup()
    const request = createRequest({
      params: { postId: 'missing-post' },
    })

    service.findOne.mockRejectedValueOnce(new Error('Post not found'))

    await expect(controller.findOne(request as never, response as never)).rejects.toThrow(
      'Post not found',
    )

    expect(response.OK).not.toHaveBeenCalled()
  })
})

describe('PostsController.update', () => {
  const body: UpdatePostBody = {
    content: 'Updated content',
    visibility: 'PUBLIC' as UpdatePostBody['visibility'],
    isPin: false,
    mentions: [],
    hashtags: [],
  }

  test('updates a post successfully', async () => {
    const { controller, service, response } = setup()
    const request = createRequest({
      params: { postId: 'post-1' },
      body,
    })

    await controller.update(request as never, response as never)

    expect(validate).toHaveBeenCalledTimes(1)
    expect(validate).toHaveBeenCalledWith({ ...body }, expect.anything())

    expect(request.formData).toHaveBeenCalledTimes(1)

    expect(service.update).toHaveBeenCalledWith('user-1', 'post-1', body, expect.any(FormData))

    expect(response.OK).toHaveBeenCalledWith({
      success: true,
      message: updateResult.message,
      data: updateResult.data,
    })
  })

  test('returns bad request before parsing JSON if postId is missing', async () => {
    const { controller, service, response } = setup()
    const request = createRequest({ body })

    await controller.update(request as never, response as never)

    expect(response.BadRequest).toHaveBeenCalledWith({
      success: false,
      message: 'Post ID is required',
    })

    expect(request.json).not.toHaveBeenCalled()
    expect(request.formData).not.toHaveBeenCalled()
    expect(validate).not.toHaveBeenCalled()
    expect(service.update).not.toHaveBeenCalled()
  })

  test('returns validation errors without calling formData or service', async () => {
    const { controller, service, response } = setup()
    const request = createRequest({
      params: { postId: 'post-1' },
      body,
    })

    const errors = {
      content: ['Content is required'],
    }

    validate.mockImplementation(() => ({
      valid: false,
      errors,
    }))

    await controller.update(request as never, response as never)

    expect(response.UnprocessableContent).toHaveBeenCalledWith({
      success: false,
      message: 'validation failed',
      errors,
    })

    expect(request.formData).not.toHaveBeenCalled()
    expect(service.update).not.toHaveBeenCalled()
    expect(response.OK).not.toHaveBeenCalled()
  })

  test('does not call service when JSON parsing fails', async () => {
    const { controller, service, response } = setup()
    const request = createRequest({
      params: { postId: 'post-1' },
      body,
    })

    request.json.mockRejectedValueOnce(new Error('Invalid JSON'))

    await expect(controller.update(request as never, response as never)).rejects.toThrow(
      'Invalid JSON',
    )

    expect(request.formData).not.toHaveBeenCalled()
    expect(service.update).not.toHaveBeenCalled()
  })

  test('does not call service when formData parsing fails', async () => {
    const { controller, service, response } = setup()
    const request = createRequest({
      params: { postId: 'post-1' },
      body,
    })

    request.formData.mockRejectedValueOnce(new Error('Invalid multipart body'))

    await expect(controller.update(request as never, response as never)).rejects.toThrow(
      'Invalid multipart body',
    )

    expect(service.update).not.toHaveBeenCalled()
  })

  test('propagates service errors', async () => {
    const { controller, service, response } = setup()
    const request = createRequest({
      params: { postId: 'post-1' },
      body,
    })

    service.update.mockRejectedValueOnce(new Error('Update failed'))

    await expect(controller.update(request as never, response as never)).rejects.toThrow(
      'Update failed',
    )

    expect(response.OK).not.toHaveBeenCalled()
  })

  test('passes the correct user ID to the service', async () => {
    const { controller, service, response } = setup()
    const request = createRequest({
      userId: 'owner-2',
      params: { postId: 'post-1' },
      body,
    })

    await controller.update(request as never, response as never)

    expect(service.update).toHaveBeenCalledWith('owner-2', 'post-1', body, expect.any(FormData))
  })
})

describe('PostsController.delete', () => {
  test('deletes a post successfully', async () => {
    const { controller, service, response } = setup()
    const request = createRequest({
      params: { postId: 'post-1' },
    })

    await controller.delete(request as never, response as never)

    expect(service.delete).toHaveBeenCalledWith('user-1', 'post-1')

    expect(response.OK).toHaveBeenCalledWith({
      success: true,
      message: deleteResult.message,
    })
  })

  test('returns bad request when postId is missing', async () => {
    const { controller, service, response } = setup()
    const request = createRequest()

    await controller.delete(request as never, response as never)

    expect(response.BadRequest).toHaveBeenCalledWith({
      success: false,
      message: 'Post ID is required',
    })

    expect(service.delete).not.toHaveBeenCalled()
  })

  test('returns bad request when postId is empty', async () => {
    const { controller, service, response } = setup()
    const request = createRequest({
      params: { postId: '' },
    })

    await controller.delete(request as never, response as never)

    expect(response.BadRequest).toHaveBeenCalledTimes(1)
    expect(service.delete).not.toHaveBeenCalled()
  })

  test('propagates service errors', async () => {
    const { controller, service, response } = setup()
    const request = createRequest({
      params: { postId: 'post-1' },
    })

    service.delete.mockRejectedValueOnce(new Error('Delete failed'))

    await expect(controller.delete(request as never, response as never)).rejects.toThrow(
      'Delete failed',
    )

    expect(response.OK).not.toHaveBeenCalled()
  })
})
