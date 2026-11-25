import { afterAll, afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
import { ForbiddenException, NotFoundException, Validator } from 'lykosjs'
import type { ContextHandler } from 'lykosjs'
import type { RepliesService } from '../replies.service'
import { CreateReplyRule } from '../rules/create'
import { UpdateReplyRule } from '../rules/update'

/* -------------------------------------------------------------------------- */
/*  Isolate the controller from the real pagination helper                    */
/* -------------------------------------------------------------------------- */

// NOTE: mock.module resolves the path relative to THIS test file, so it must point at the real module.
const PAGINATION_MODULE = '../../../utilities/pagination'
// Copy the real module BEFORE mocking so it can be restored afterwards (mock.module leaks across files).
const realPagination = { ...(await import('../../../utilities/pagination')) }

const getPaginationMock = mock(
  (..._args: Parameters<typeof realPagination.getPagination>) =>
    ({ page: 2, limit: 5, offset: 5 }) as ReturnType<typeof realPagination.getPagination>,
)

mock.module(PAGINATION_MODULE, () => ({ ...realPagination, getPagination: getPaginationMock }))

afterAll(() => {
  mock.module(PAGINATION_MODULE, () => realPagination)
})

const { RepliesController } = await import('../replies.controller')

/* -------------------------------------------------------------------------- */
/*  Typed test doubles (no `any`)                                             */
/* -------------------------------------------------------------------------- */

type Req = Parameters<ContextHandler>[0]
type Res = Parameters<ContextHandler>[1]
type ValidationResult = ReturnType<typeof Validator.validate>

interface ReqOptions {
  params?: Record<string, string | undefined>
  /** `null` simulates a request where the auth middleware did not attach a user. */
  user?: { id: string } | null
  body?: unknown
  jsonError?: Error
}

function createReq(options: ReqOptions = {}) {
  const json = mock(async (): Promise<unknown> => {
    if (options.jsonError) throw options.jsonError
    return options.body
  })
  const user = options.user === null ? undefined : (options.user ?? { id: 'user-1' })
  const req = { params: options.params ?? {}, user, json }
  return { req: req as unknown as Req, json }
}

function createRes() {
  const OK = mock((_body: unknown): void => {})
  const Created = mock((_body: unknown): void => {})
  const BadRequest = mock((_body: unknown): void => {})
  const UnprocessableContent = mock((_body: unknown): void => {})

  return {
    res: {
      OK,
      Created,
      BadRequest,
      UnprocessableContent,
    } as unknown as Res,
    OK,
    Created,
    BadRequest,
    UnprocessableContent,
  }
}

function spyOnValidator() {
  return spyOn(Validator, 'validate').mockReturnValue({
    valid: true,
    errors: {},
  } as unknown as ValidationResult)
}

const invalid = (errors: Record<string, string[]>) =>
  ({ valid: false, errors }) as unknown as ValidationResult

type CreateResult = Awaited<ReturnType<RepliesService['create']>>
type FindAllResult = Awaited<ReturnType<RepliesService['findAll']>>
type FindMeResult = Awaited<ReturnType<RepliesService['findMe']>>
type FindOneResult = Awaited<ReturnType<RepliesService['findOne']>>
type UpdateResult = Awaited<ReturnType<RepliesService['update']>>
type DeleteResult = Awaited<ReturnType<RepliesService['delete']>>

// `internal` is an extra field that must never be forwarded to the client.
const createResult = {
  success: true,
  message: 'Reply created successfully',
  data: { id: 'reply-1' },
  internal: 'do-not-forward',
} as unknown as CreateResult

const findAllResult = {
  success: true,
  data: [{ reply: { id: 'reply-1' } }],
  pagination: { total: 1, page: 2, limit: 5 },
  internal: 'do-not-forward',
} as unknown as FindAllResult

const findMeResult = {
  success: true,
  data: [{ reply: { id: 'reply-1' } }],
  pagination: { total: 1, page: 2, limit: 5 },
  internal: 'do-not-forward',
} as unknown as FindMeResult

const findOneResult = {
  success: true,
  data: { reply: { id: 'reply-1' } },
  internal: 'do-not-forward',
} as unknown as FindOneResult

const updateResult = {
  success: true,
  message: 'Reply updated successfully',
  data: { id: 'reply-1', content: 'edited' },
  internal: 'do-not-forward',
} as unknown as UpdateResult

const deleteResult = {
  success: true,
  message: 'Reply deleted successfully',
  internal: 'do-not-forward',
} as unknown as DeleteResult

function createFakeService() {
  return {
    create: mock(
      async (
        _userId: string,
        _commentId: string,
        _content: string,
        _parentReplyId?: string,
      ): Promise<CreateResult> => createResult,
    ),
    findAll: mock(
      async (
        _commentId: string,
        _page?: number,
        _limit?: number,
        _offset?: number,
      ): Promise<FindAllResult> => findAllResult,
    ),
    findMe: mock(
      async (
        _userId: string,
        _page?: number,
        _limit?: number,
        _offset?: number,
      ): Promise<FindMeResult> => findMeResult,
    ),
    findOne: mock(async (_replyId: string): Promise<FindOneResult> => findOneResult),
    update: mock(
      async (_userId: string, _replyId: string, _content: string): Promise<UpdateResult> =>
        updateResult,
    ),
    delete: mock(async (_userId: string, _replyId: string): Promise<DeleteResult> => deleteResult),
  }
}

type FakeService = ReturnType<typeof createFakeService>

const MISSING_ID_CASES: readonly (string | undefined)[] = [undefined, '']

/* -------------------------------------------------------------------------- */
/*  Tests                                                                     */
/* -------------------------------------------------------------------------- */

let service: FakeService
let controller: InstanceType<typeof RepliesController>
let validateSpy: ReturnType<typeof spyOnValidator>

beforeEach(() => {
  getPaginationMock.mockClear()
  validateSpy = spyOnValidator()
  service = createFakeService()
  controller = new RepliesController(service as unknown as RepliesService)
})

afterEach(() => {
  validateSpy.mockRestore()
})

describe('RepliesController.create', () => {
  test('passes userId, commentId, content and parentReplyId to the service and responds 201', async () => {
    const { req } = createReq({
      user: { id: 'user-42' },
      params: { commentId: 'comment-1' },
      body: { content: 'hello', parentReplyId: 'reply-9' },
    })
    const { res, Created, OK } = createRes()

    await controller.create(req, res)

    expect(service.create).toHaveBeenCalledTimes(1)
    expect(service.create).toHaveBeenCalledWith('user-42', 'comment-1', 'hello', 'reply-9')
    expect(Created).toHaveBeenCalledTimes(1)
    expect(Created.mock.calls[0]?.[0]).toEqual({
      success: true,
      message: 'Reply created successfully',
      data: createResult.data,
    })
    expect(OK).not.toHaveBeenCalled()
  })

  test('forwards parentReplyId as undefined for a top-level reply', async () => {
    const { req } = createReq({ params: { commentId: 'comment-1' }, body: { content: 'hello' } })
    const { res } = createRes()

    await controller.create(req, res)

    expect(service.create).toHaveBeenCalledWith('user-1', 'comment-1', 'hello', undefined)
  })

  test('validates the content against CreateReplyRule', async () => {
    const { req } = createReq({ params: { commentId: 'comment-1' }, body: { content: 'hello' } })
    const { res } = createRes()

    await controller.create(req, res)

    expect(validateSpy).toHaveBeenCalledTimes(1)
    expect(validateSpy).toHaveBeenCalledWith({ content: 'hello' }, CreateReplyRule)
  })

  test('responds 422 with the validation errors and never calls the service when validation fails', async () => {
    validateSpy.mockReturnValueOnce(invalid({ content: ['content is required'] }))
    const { req } = createReq({ params: { commentId: 'comment-1' }, body: { content: '' } })
    const { res, UnprocessableContent, Created } = createRes()

    await controller.create(req, res)

    expect(UnprocessableContent).toHaveBeenCalledTimes(1)
    expect(UnprocessableContent.mock.calls[0]?.[0]).toEqual({
      success: false,
      message: 'validation failed',
      errors: { content: ['content is required'] },
    })
    expect(service.create).not.toHaveBeenCalled()
    expect(Created).not.toHaveBeenCalled()
  })

  for (const commentId of MISSING_ID_CASES) {
    test(`responds 400 and never reads the body when commentId is ${JSON.stringify(commentId) ?? 'undefined'}`, async () => {
      const { req, json } = createReq({ params: { commentId }, body: { content: 'hello' } })
      const { res, BadRequest, Created } = createRes()

      await controller.create(req, res)

      expect(BadRequest).toHaveBeenCalledTimes(1)
      expect(BadRequest.mock.calls[0]?.[0]).toEqual({
        success: false,
        message: 'Comment ID is required',
      })
      expect(json).not.toHaveBeenCalled()
      expect(validateSpy).not.toHaveBeenCalled()
      expect(service.create).not.toHaveBeenCalled()
      expect(Created).not.toHaveBeenCalled()
    })
  }

  test('takes the user id from the authenticated user only, never from the body', async () => {
    const { req } = createReq({
      user: { id: 'real-user' },
      params: { commentId: 'comment-1' },
      body: { content: 'hello', userId: 'attacker', senderId: 'attacker' },
    })
    const { res } = createRes()

    await controller.create(req, res)

    expect(service.create).toHaveBeenCalledWith('real-user', 'comment-1', 'hello', undefined)
  })

  test('does not call the service when the body cannot be parsed', async () => {
    const { req } = createReq({
      params: { commentId: 'comment-1' },
      jsonError: new Error('bad json'),
    })
    const { res, Created } = createRes()

    await expect(controller.create(req, res)).rejects.toThrow('bad json')

    expect(service.create).not.toHaveBeenCalled()
    expect(Created).not.toHaveBeenCalled()
  })

  test('lets service errors propagate without a success response', async () => {
    service.create.mockRejectedValueOnce(
      new NotFoundException({ success: false, message: 'Comment not found' }),
    )
    const { req } = createReq({ params: { commentId: 'ghost' }, body: { content: 'hello' } })
    const { res, Created, BadRequest } = createRes()

    await expect(controller.create(req, res)).rejects.toBeInstanceOf(NotFoundException)

    expect(Created).not.toHaveBeenCalled()
    expect(BadRequest).not.toHaveBeenCalled()
  })

  test('never calls the service when there is no authenticated user', async () => {
    const { req } = createReq({
      user: null,
      params: { commentId: 'comment-1' },
      body: { content: 'hello' },
    })
    const { res, Created } = createRes()

    await expect(controller.create(req, res)).rejects.toBeDefined()

    expect(service.create).not.toHaveBeenCalled()
    expect(Created).not.toHaveBeenCalled()
  })
})

describe('RepliesController.findAll', () => {
  test('reads pagination from the request and forwards it with the comment id', async () => {
    const { req } = createReq({ params: { commentId: 'comment-1' } })
    const { res } = createRes()

    await controller.findAll(req, res)

    expect(getPaginationMock).toHaveBeenCalledWith(req)
    expect(service.findAll).toHaveBeenCalledTimes(1)
    expect(service.findAll).toHaveBeenCalledWith('comment-1', 2, 5, 5)
  })

  test('responds 200 with exactly { success, data, pagination }', async () => {
    const { req } = createReq({ params: { commentId: 'comment-1' } })
    const { res, OK } = createRes()

    await controller.findAll(req, res)

    expect(OK).toHaveBeenCalledTimes(1)
    expect(OK.mock.calls[0]?.[0]).toEqual({
      success: true,
      data: findAllResult.data,
      pagination: findAllResult.pagination,
    })
  })

  for (const commentId of MISSING_ID_CASES) {
    test(`responds 400 and skips pagination and the service when commentId is ${JSON.stringify(commentId) ?? 'undefined'}`, async () => {
      const { req } = createReq({ params: { commentId } })
      const { res, BadRequest, OK } = createRes()

      await controller.findAll(req, res)

      expect(BadRequest).toHaveBeenCalledTimes(1)
      expect(BadRequest.mock.calls[0]?.[0]).toEqual({
        success: false,
        message: 'Comment ID is required',
      })
      expect(getPaginationMock).not.toHaveBeenCalled()
      expect(service.findAll).not.toHaveBeenCalled()
      expect(OK).not.toHaveBeenCalled()
    })
  }

  test('lets not-found errors from the service propagate', async () => {
    service.findAll.mockRejectedValueOnce(
      new NotFoundException({ success: false, message: 'Comment not found' }),
    )
    const { req } = createReq({ params: { commentId: 'ghost' } })
    const { res, OK, BadRequest } = createRes()

    await expect(controller.findAll(req, res)).rejects.toBeInstanceOf(NotFoundException)

    expect(OK).not.toHaveBeenCalled()
    expect(BadRequest).not.toHaveBeenCalled()
  })
})

describe('RepliesController.findMe', () => {
  test('forwards the pagination values after the first argument and responds 200 with { success, data, pagination }', async () => {
    const { req } = createReq({ params: { commentId: 'comment-1' } })
    const { res, OK } = createRes()

    await controller.findMe(req, res)

    expect(getPaginationMock).toHaveBeenCalledWith(req)
    expect(service.findMe.mock.calls[0]?.slice(1)).toEqual([2, 5, 5])
    expect(OK).toHaveBeenCalledTimes(1)
    expect(OK.mock.calls[0]?.[0]).toEqual({
      success: true,
      data: findMeResult.data,
      pagination: findMeResult.pagination,
    })
  })

  test('propagates service errors without a success response', async () => {
    service.findMe.mockRejectedValueOnce(new Error('db down'))
    const { req } = createReq({ params: { commentId: 'comment-1' } })
    const { res, OK } = createRes()

    await expect(controller.findMe(req, res)).rejects.toThrow('db down')

    expect(OK).not.toHaveBeenCalled()
  })
})

describe('RepliesController.findOne', () => {
  test('forwards the reply id and responds 200 with { success, data }', async () => {
    const { req } = createReq({ params: { replyId: 'reply-1' } })
    const { res, OK } = createRes()

    await controller.findOne(req, res)

    expect(service.findOne).toHaveBeenCalledWith('reply-1')
    expect(OK).toHaveBeenCalledTimes(1)
    expect(OK.mock.calls[0]?.[0]).toEqual({ success: true, data: findOneResult.data })
  })

  for (const replyId of MISSING_ID_CASES) {
    test(`responds 400 and skips the service when replyId is ${JSON.stringify(replyId) ?? 'undefined'}`, async () => {
      const { req } = createReq({ params: { replyId } })
      const { res, BadRequest, OK } = createRes()

      await controller.findOne(req, res)

      expect(BadRequest).toHaveBeenCalledTimes(1)
      expect(BadRequest.mock.calls[0]?.[0]).toEqual({
        success: false,
        message: 'Reply ID is required',
      })
      expect(service.findOne).not.toHaveBeenCalled()
      expect(OK).not.toHaveBeenCalled()
    })
  }

  test('lets not-found errors from the service propagate', async () => {
    service.findOne.mockRejectedValueOnce(
      new NotFoundException({ success: false, message: 'Reply not found' }),
    )
    const { req } = createReq({ params: { replyId: 'ghost' } })
    const { res, OK, BadRequest } = createRes()

    await expect(controller.findOne(req, res)).rejects.toBeInstanceOf(NotFoundException)

    expect(OK).not.toHaveBeenCalled()
    expect(BadRequest).not.toHaveBeenCalled()
  })
})

describe('RepliesController.update', () => {
  test('passes userId, replyId and content to the service and responds 200', async () => {
    const { req } = createReq({
      user: { id: 'user-42' },
      params: { replyId: 'reply-1' },
      body: { content: 'edited' },
    })
    const { res, OK } = createRes()

    await controller.update(req, res)

    expect(service.update).toHaveBeenCalledWith('user-42', 'reply-1', 'edited')
    expect(OK).toHaveBeenCalledTimes(1)
    expect(OK.mock.calls[0]?.[0]).toEqual({
      success: true,
      message: 'Reply updated successfully',
      data: updateResult.data,
    })
  })

  test('validates the content against UpdateReplyRule', async () => {
    const { req } = createReq({ params: { replyId: 'reply-1' }, body: { content: 'edited' } })
    const { res } = createRes()

    await controller.update(req, res)

    expect(validateSpy).toHaveBeenCalledWith({ content: 'edited' }, UpdateReplyRule)
  })

  test('responds 422 with the validation errors and never calls the service when validation fails', async () => {
    validateSpy.mockReturnValueOnce(invalid({ content: ['content is required'] }))
    const { req } = createReq({ params: { replyId: 'reply-1' }, body: { content: '' } })
    const { res, UnprocessableContent, OK } = createRes()

    await controller.update(req, res)

    expect(UnprocessableContent).toHaveBeenCalledTimes(1)
    expect(UnprocessableContent.mock.calls[0]?.[0]).toEqual({
      success: false,
      message: 'validation failed',
      errors: { content: ['content is required'] },
    })
    expect(service.update).not.toHaveBeenCalled()
    expect(OK).not.toHaveBeenCalled()
  })

  for (const replyId of MISSING_ID_CASES) {
    test(`responds 400 and never reads the body when replyId is ${JSON.stringify(replyId) ?? 'undefined'}`, async () => {
      const { req, json } = createReq({ params: { replyId }, body: { content: 'edited' } })
      const { res, BadRequest, OK } = createRes()

      await controller.update(req, res)

      expect(BadRequest).toHaveBeenCalledTimes(1)
      expect(BadRequest.mock.calls[0]?.[0]).toEqual({
        success: false,
        message: 'Reply ID is required',
      })
      expect(json).not.toHaveBeenCalled()
      expect(service.update).not.toHaveBeenCalled()
      expect(OK).not.toHaveBeenCalled()
    })
  }

  test('only forwards the content from the body (no smuggled fields, user id from the session)', async () => {
    const { req } = createReq({
      user: { id: 'real-user' },
      params: { replyId: 'reply-1' },
      body: { content: 'edited', userId: 'attacker', isEdited: false, likesCount: 999 },
    })
    const { res } = createRes()

    await controller.update(req, res)

    expect(service.update).toHaveBeenCalledWith('real-user', 'reply-1', 'edited')
  })

  test('does not call the service when the body cannot be parsed', async () => {
    const { req } = createReq({ params: { replyId: 'reply-1' }, jsonError: new Error('bad json') })
    const { res, OK } = createRes()

    await expect(controller.update(req, res)).rejects.toThrow('bad json')

    expect(service.update).not.toHaveBeenCalled()
    expect(OK).not.toHaveBeenCalled()
  })

  test('lets forbidden errors from the service propagate without a success response', async () => {
    service.update.mockRejectedValueOnce(
      new ForbiddenException({
        success: false,
        message: 'You are not allowed to edit this reply',
      }),
    )
    const { req } = createReq({ params: { replyId: 'reply-1' }, body: { content: 'edited' } })
    const { res, OK, BadRequest } = createRes()

    await expect(controller.update(req, res)).rejects.toBeInstanceOf(ForbiddenException)

    expect(OK).not.toHaveBeenCalled()
    expect(BadRequest).not.toHaveBeenCalled()
  })

  test('never calls the service when there is no authenticated user', async () => {
    const { req } = createReq({
      user: null,
      params: { replyId: 'reply-1' },
      body: { content: 'edited' },
    })
    const { res, OK } = createRes()

    await expect(controller.update(req, res)).rejects.toBeDefined()

    expect(service.update).not.toHaveBeenCalled()
    expect(OK).not.toHaveBeenCalled()
  })
})

describe('RepliesController.delete', () => {
  test('passes userId and replyId to the service and responds 200 with { success, message } only', async () => {
    const { req } = createReq({ user: { id: 'user-42' }, params: { replyId: 'reply-1' } })
    const { res, OK } = createRes()

    await controller.delete(req, res)

    expect(service.delete).toHaveBeenCalledWith('user-42', 'reply-1')
    expect(OK).toHaveBeenCalledTimes(1)
    expect(OK.mock.calls[0]?.[0]).toEqual({
      success: true,
      message: 'Reply deleted successfully',
    })
  })

  test('takes the user id from the authenticated user only', async () => {
    const { req } = createReq({
      user: { id: 'real-user' },
      params: { replyId: 'reply-1', userId: 'attacker' },
      body: { userId: 'attacker' },
    })
    const { res } = createRes()

    await controller.delete(req, res)

    expect(service.delete).toHaveBeenCalledWith('real-user', 'reply-1')
  })

  for (const replyId of MISSING_ID_CASES) {
    test(`responds 400 and skips the service when replyId is ${JSON.stringify(replyId) ?? 'undefined'}`, async () => {
      const { req } = createReq({ params: { replyId } })
      const { res, BadRequest, OK } = createRes()

      await controller.delete(req, res)

      expect(BadRequest).toHaveBeenCalledTimes(1)
      expect(BadRequest.mock.calls[0]?.[0]).toEqual({
        success: false,
        message: 'Reply ID is required',
      })
      expect(service.delete).not.toHaveBeenCalled()
      expect(OK).not.toHaveBeenCalled()
    })
  }

  test('lets forbidden errors from the service propagate without a success response', async () => {
    service.delete.mockRejectedValueOnce(
      new ForbiddenException({
        success: false,
        message: 'You are not allowed to delete this reply',
      }),
    )
    const { req } = createReq({ params: { replyId: 'reply-1' } })
    const { res, OK, BadRequest } = createRes()

    await expect(controller.delete(req, res)).rejects.toBeInstanceOf(ForbiddenException)

    expect(OK).not.toHaveBeenCalled()
    expect(BadRequest).not.toHaveBeenCalled()
  })

  test('lets not-found errors from the service propagate', async () => {
    service.delete.mockRejectedValueOnce(
      new NotFoundException({ success: false, message: 'Reply not found' }),
    )
    const { req } = createReq({ params: { replyId: 'ghost' } })
    const { res, OK } = createRes()

    await expect(controller.delete(req, res)).rejects.toBeInstanceOf(NotFoundException)

    expect(OK).not.toHaveBeenCalled()
  })

  test('never calls the service when there is no authenticated user', async () => {
    const { req } = createReq({ user: null, params: { replyId: 'reply-1' } })
    const { res, OK } = createRes()

    await expect(controller.delete(req, res)).rejects.toBeDefined()

    expect(service.delete).not.toHaveBeenCalled()
    expect(OK).not.toHaveBeenCalled()
  })
})
