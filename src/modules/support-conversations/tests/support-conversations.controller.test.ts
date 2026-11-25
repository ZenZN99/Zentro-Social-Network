import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test'
import { NotFoundException, UnauthorizedException } from 'lykosjs'
import type { ContextHandler } from 'lykosjs'
import type { SupportConversationsService } from '../support-conversations.service'

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

const { SupportConversationsController } = await import('../support-conversations.controller')

/* -------------------------------------------------------------------------- */
/*  Typed test doubles (no `any`)                                             */
/* -------------------------------------------------------------------------- */

type Req = Parameters<ContextHandler>[0]
type Res = Parameters<ContextHandler>[1]

interface ReqOptions {
  params?: Record<string, string | undefined>
  /** `null` simulates a request where the auth middleware did not attach a user. */
  user?: { id: string; role?: string } | null
  body?: unknown
}

function createReq(options: ReqOptions = {}) {
  const user = options.user === null ? undefined : (options.user ?? { id: 'user-1' })
  const req = { params: options.params ?? {}, user, body: options.body }
  return { req: req as unknown as Req }
}

function createRes() {
  const OK = mock((_body: unknown): void => {})
  const Created = mock((_body: unknown): void => {})
  const BadRequest = mock((_body: unknown): void => {})

  return {
    res: { OK, Created, BadRequest } as unknown as Res,
    OK,
    Created,
    BadRequest,
  }
}

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error: unknown) {
    return error
  }
  return undefined
}

type CreateResult = Awaited<ReturnType<SupportConversationsService['create']>>
type FindAllResult = Awaited<ReturnType<SupportConversationsService['findAll']>>
type FindMeResult = Awaited<ReturnType<SupportConversationsService['findMe']>>
type FindOneResult = Awaited<ReturnType<SupportConversationsService['findOne']>>
type ToggleResult = Awaited<ReturnType<SupportConversationsService['toggle']>>

// `internal` is an extra field that must never be forwarded to the client.
const createResult = {
  success: true,
  message: 'Support conversation created successfully',
  data: { id: 'conv-1', status: 'OPEN' },
  internal: 'do-not-forward',
} as unknown as CreateResult

const findAllResult = {
  success: true,
  data: [{ id: 'conv-1' }],
  pagination: { total: 1, page: 2, limit: 5 },
  internal: 'do-not-forward',
} as unknown as FindAllResult

const findMeResult = {
  success: true,
  data: [{ id: 'conv-1' }],
  internal: 'do-not-forward',
} as unknown as FindMeResult

const findOneResult = {
  success: true,
  data: { id: 'conv-1' },
  internal: 'do-not-forward',
} as unknown as FindOneResult

const toggleResult = {
  success: true,
  message: 'Support conversation closed successfully',
  data: { id: 'conv-1', status: 'CLOSED' },
  internal: 'do-not-forward',
} as unknown as ToggleResult

function createFakeService() {
  return {
    create: mock(async (_userId: string): Promise<CreateResult> => createResult),
    findAll: mock(
      async (_page?: number, _limit?: number, _offset?: number): Promise<FindAllResult> =>
        findAllResult,
    ),
    findMe: mock(async (_userId: string): Promise<FindMeResult> => findMeResult),
    findOne: mock(
      async (_userId: string, _conversationId: string): Promise<FindOneResult> => findOneResult,
    ),
    toggle: mock(
      async (_adminId: string, _conversationId: string): Promise<ToggleResult> => toggleResult,
    ),
  }
}

type FakeService = ReturnType<typeof createFakeService>

const MISSING_ID_CASES: readonly (string | undefined)[] = [undefined, '']

/* -------------------------------------------------------------------------- */
/*  Tests                                                                     */
/* -------------------------------------------------------------------------- */

let service: FakeService
let controller: InstanceType<typeof SupportConversationsController>

beforeEach(() => {
  getPaginationMock.mockClear()
  service = createFakeService()
  controller = new SupportConversationsController(service as unknown as SupportConversationsService)
})

describe('SupportConversationsController.create', () => {
  test('passes the authenticated user id to the service and responds 201 with { success, message, data }', async () => {
    const { req } = createReq({ user: { id: 'user-42' } })
    const { res, Created, OK } = createRes()

    await controller.create(req, res)

    expect(service.create).toHaveBeenCalledTimes(1)
    expect(service.create).toHaveBeenCalledWith('user-42')
    expect(Created).toHaveBeenCalledTimes(1)
    expect(Created.mock.calls[0]?.[0]).toEqual({
      success: true,
      message: 'Support conversation created successfully',
      data: createResult.data,
    })
    expect(OK).not.toHaveBeenCalled()
  })

  test('takes the user id from the authenticated user only, never from params or body', async () => {
    const { req } = createReq({
      user: { id: 'real-user' },
      params: { userId: 'attacker' },
      body: { userId: 'attacker' },
    })
    const { res } = createRes()

    await controller.create(req, res)

    expect(service.create).toHaveBeenCalledWith('real-user')
  })

  test('lets service errors propagate without a success response', async () => {
    service.create.mockRejectedValueOnce(new Error('db down'))
    const { req } = createReq()
    const { res, Created } = createRes()

    await expect(controller.create(req, res)).rejects.toThrow('db down')

    expect(Created).not.toHaveBeenCalled()
  })

  test('never calls the service when there is no authenticated user', async () => {
    const { req } = createReq({ user: null })
    const { res, Created } = createRes()

    await expect(controller.create(req, res)).rejects.toBeDefined()

    expect(service.create).not.toHaveBeenCalled()
    expect(Created).not.toHaveBeenCalled()
  })
})

describe('SupportConversationsController.findAll', () => {
  test('reads pagination from the request and forwards it to the service', async () => {
    const { req } = createReq()
    const { res } = createRes()

    await controller.findAll(req, res)

    expect(getPaginationMock).toHaveBeenCalledWith(req)
    expect(service.findAll).toHaveBeenCalledTimes(1)
    expect(service.findAll).toHaveBeenCalledWith(2, 5, 5)
  })

  test('responds 200 with exactly { success, data: { conversations, pagination } }', async () => {
    const { req } = createReq()
    const { res, OK } = createRes()

    await controller.findAll(req, res)

    expect(OK).toHaveBeenCalledTimes(1)
    expect(OK.mock.calls[0]?.[0]).toEqual({
      success: true,
      data: {
        conversations: findAllResult.data,
        pagination: findAllResult.pagination,
      },
    })
  })

  test('propagates service errors without sending a success response', async () => {
    service.findAll.mockRejectedValueOnce(new Error('db down'))
    const { req } = createReq()
    const { res, OK } = createRes()

    await expect(controller.findAll(req, res)).rejects.toThrow('db down')

    expect(OK).not.toHaveBeenCalled()
  })
})

describe('SupportConversationsController.findMe', () => {
  test('passes the authenticated user id to the service and responds 200 with { success, data }', async () => {
    const { req } = createReq({ user: { id: 'user-42' } })
    const { res, OK } = createRes()

    await controller.findMe(req, res)

    expect(service.findMe).toHaveBeenCalledWith('user-42')
    expect(OK).toHaveBeenCalledTimes(1)
    expect(OK.mock.calls[0]?.[0]).toEqual({ success: true, data: findMeResult.data })
  })

  test('takes the user id from the authenticated user only, never from params', async () => {
    const { req } = createReq({ user: { id: 'real-user' }, params: { userId: 'attacker' } })
    const { res } = createRes()

    await controller.findMe(req, res)

    expect(service.findMe).toHaveBeenCalledWith('real-user')
  })

  test('propagates service errors without sending a success response', async () => {
    service.findMe.mockRejectedValueOnce(new Error('db down'))
    const { req } = createReq()
    const { res, OK } = createRes()

    await expect(controller.findMe(req, res)).rejects.toThrow('db down')

    expect(OK).not.toHaveBeenCalled()
  })

  test('never calls the service when there is no authenticated user', async () => {
    const { req } = createReq({ user: null })
    const { res, OK } = createRes()

    await expect(controller.findMe(req, res)).rejects.toBeDefined()

    expect(service.findMe).not.toHaveBeenCalled()
    expect(OK).not.toHaveBeenCalled()
  })
})

describe('SupportConversationsController.findOne', () => {
  test('forwards the authenticated user id and the conversation id and responds 200', async () => {
    const { req } = createReq({
      user: { id: 'user-42' },
      params: { conversationId: 'conv-1' },
    })
    const { res, OK } = createRes()

    await controller.findOne(req, res)

    expect(service.findOne).toHaveBeenCalledWith('user-42', 'conv-1')
    expect(OK).toHaveBeenCalledTimes(1)
    expect(OK.mock.calls[0]?.[0]).toEqual({ success: true, data: findOneResult.data })
  })

  test('takes the user id from the authenticated user only', async () => {
    const { req } = createReq({
      user: { id: 'real-user' },
      params: { conversationId: 'conv-1', userId: 'attacker' },
    })
    const { res } = createRes()

    await controller.findOne(req, res)

    expect(service.findOne).toHaveBeenCalledWith('real-user', 'conv-1')
  })

  for (const conversationId of MISSING_ID_CASES) {
    test(`responds 400 and skips the service when conversationId is ${JSON.stringify(conversationId) ?? 'undefined'}`, async () => {
      const { req } = createReq({ params: { conversationId } })
      const { res, BadRequest, OK } = createRes()

      await controller.findOne(req, res)

      expect(BadRequest).toHaveBeenCalledTimes(1)
      expect(BadRequest.mock.calls[0]?.[0]).toEqual({
        success: false,
        message: 'Support Conversation ID is required',
      })
      expect(service.findOne).not.toHaveBeenCalled()
      expect(OK).not.toHaveBeenCalled()
    })
  }

  test('lets not-found errors from the service propagate', async () => {
    service.findOne.mockRejectedValueOnce(
      new NotFoundException({ success: false, message: 'Support conversation not found' }),
    )
    const { req } = createReq({ params: { conversationId: 'ghost' } })
    const { res, OK, BadRequest } = createRes()

    await expect(controller.findOne(req, res)).rejects.toBeInstanceOf(NotFoundException)

    expect(OK).not.toHaveBeenCalled()
    expect(BadRequest).not.toHaveBeenCalled()
  })

  test('lets authentication errors from the service propagate', async () => {
    service.findOne.mockRejectedValueOnce(
      new UnauthorizedException({ success: false, message: 'You are not authenticated' }),
    )
    const { req } = createReq({ params: { conversationId: 'conv-1' } })
    const { res, OK } = createRes()

    await expect(controller.findOne(req, res)).rejects.toBeInstanceOf(UnauthorizedException)

    expect(OK).not.toHaveBeenCalled()
  })

  test('never calls the service when there is no authenticated user', async () => {
    const { req } = createReq({ user: null, params: { conversationId: 'conv-1' } })
    const { res, OK } = createRes()

    await expect(controller.findOne(req, res)).rejects.toBeDefined()

    expect(service.findOne).not.toHaveBeenCalled()
    expect(OK).not.toHaveBeenCalled()
  })
})

describe('SupportConversationsController.toggle', () => {
  test('passes adminId and conversationId to the service and responds 200 with { success, message, data }', async () => {
    const { req } = createReq({
      user: { id: 'admin-1' },
      params: { conversationId: 'conv-1' },
    })
    const { res, OK } = createRes()

    await controller.toggle(req, res)

    expect(service.toggle).toHaveBeenCalledWith('admin-1', 'conv-1')
    expect(OK).toHaveBeenCalledTimes(1)
    expect(OK.mock.calls[0]?.[0]).toEqual({
      success: true,
      message: 'Support conversation closed successfully',
      data: toggleResult.data,
    })
  })

  test('takes the admin id from the authenticated user only, never from params or body', async () => {
    const { req } = createReq({
      user: { id: 'real-admin' },
      params: { conversationId: 'conv-1', adminId: 'attacker' },
      body: { adminId: 'attacker', closedBy: 'attacker' },
    })
    const { res } = createRes()

    await controller.toggle(req, res)

    expect(service.toggle).toHaveBeenCalledWith('real-admin', 'conv-1')
  })

  for (const conversationId of MISSING_ID_CASES) {
    test(`responds 400 and skips the service when conversationId is ${JSON.stringify(conversationId) ?? 'undefined'}`, async () => {
      const { req } = createReq({ params: { conversationId } })
      const { res, BadRequest, OK } = createRes()

      await controller.toggle(req, res)

      expect(BadRequest).toHaveBeenCalledTimes(1)
      expect(BadRequest.mock.calls[0]?.[0]).toEqual({
        success: false,
        message: 'Support Conversation ID is required',
      })
      expect(service.toggle).not.toHaveBeenCalled()
      expect(OK).not.toHaveBeenCalled()
    })
  }

  test('lets not-found errors from the service propagate', async () => {
    service.toggle.mockRejectedValueOnce(
      new NotFoundException({ success: false, message: 'Support conversation not found' }),
    )
    const { req } = createReq({ params: { conversationId: 'ghost' } })
    const { res, OK, BadRequest } = createRes()

    await expect(controller.toggle(req, res)).rejects.toBeInstanceOf(NotFoundException)

    expect(OK).not.toHaveBeenCalled()
    expect(BadRequest).not.toHaveBeenCalled()
  })

  test('never calls the service when there is no authenticated user', async () => {
    const { req } = createReq({ user: null, params: { conversationId: 'conv-1' } })
    const { res, OK } = createRes()

    await expect(controller.toggle(req, res)).rejects.toBeDefined()

    expect(service.toggle).not.toHaveBeenCalled()
    expect(OK).not.toHaveBeenCalled()
  })

  test('responds with an authentication error (not a TypeError) when there is no authenticated user', async () => {
    const { req } = createReq({ user: null, params: { conversationId: 'conv-1' } })
    const { res } = createRes()

    const error = await captureRejection((async () => controller.toggle(req, res))())

    expect(error).toBeInstanceOf(UnauthorizedException)
  })
})
