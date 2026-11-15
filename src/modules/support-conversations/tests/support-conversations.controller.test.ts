import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test'
import { SpongNotFoundException, SpongUnauthorizedException } from 'riser-bob'
import type { SpongHandler } from 'riser-bob'
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

type SpongReq = Parameters<SpongHandler>[0]
type SpongRes = Parameters<SpongHandler>[1]

interface ReqOptions {
  params?: Record<string, string | undefined>
  /** `null` simulates a request where the auth middleware did not attach a user. */
  user?: { id: string; role?: string } | null
  body?: unknown
}

function createReq(options: ReqOptions = {}) {
  const user = options.user === null ? undefined : (options.user ?? { id: 'user-1' })
  const req = { params: options.params ?? {}, user, body: options.body }
  return { req: req as unknown as SpongReq }
}

function createRes() {
  const SpongOK = mock((_body: unknown): void => {})
  const SpongCreated = mock((_body: unknown): void => {})
  const SpongBadRequest = mock((_body: unknown): void => {})

  return {
    res: { SpongOK, SpongCreated, SpongBadRequest } as unknown as SpongRes,
    SpongOK,
    SpongCreated,
    SpongBadRequest,
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
    const { res, SpongCreated, SpongOK } = createRes()

    await controller.create(req, res)

    expect(service.create).toHaveBeenCalledTimes(1)
    expect(service.create).toHaveBeenCalledWith('user-42')
    expect(SpongCreated).toHaveBeenCalledTimes(1)
    expect(SpongCreated.mock.calls[0]?.[0]).toEqual({
      success: true,
      message: 'Support conversation created successfully',
      data: createResult.data,
    })
    expect(SpongOK).not.toHaveBeenCalled()
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
    const { res, SpongCreated } = createRes()

    await expect(controller.create(req, res)).rejects.toThrow('db down')

    expect(SpongCreated).not.toHaveBeenCalled()
  })

  test('never calls the service when there is no authenticated user', async () => {
    const { req } = createReq({ user: null })
    const { res, SpongCreated } = createRes()

    await expect(controller.create(req, res)).rejects.toBeDefined()

    expect(service.create).not.toHaveBeenCalled()
    expect(SpongCreated).not.toHaveBeenCalled()
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
    const { res, SpongOK } = createRes()

    await controller.findAll(req, res)

    expect(SpongOK).toHaveBeenCalledTimes(1)
    expect(SpongOK.mock.calls[0]?.[0]).toEqual({
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
    const { res, SpongOK } = createRes()

    await expect(controller.findAll(req, res)).rejects.toThrow('db down')

    expect(SpongOK).not.toHaveBeenCalled()
  })
})

describe('SupportConversationsController.findMe', () => {
  test('passes the authenticated user id to the service and responds 200 with { success, data }', async () => {
    const { req } = createReq({ user: { id: 'user-42' } })
    const { res, SpongOK } = createRes()

    await controller.findMe(req, res)

    expect(service.findMe).toHaveBeenCalledWith('user-42')
    expect(SpongOK).toHaveBeenCalledTimes(1)
    expect(SpongOK.mock.calls[0]?.[0]).toEqual({ success: true, data: findMeResult.data })
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
    const { res, SpongOK } = createRes()

    await expect(controller.findMe(req, res)).rejects.toThrow('db down')

    expect(SpongOK).not.toHaveBeenCalled()
  })

  test('never calls the service when there is no authenticated user', async () => {
    const { req } = createReq({ user: null })
    const { res, SpongOK } = createRes()

    await expect(controller.findMe(req, res)).rejects.toBeDefined()

    expect(service.findMe).not.toHaveBeenCalled()
    expect(SpongOK).not.toHaveBeenCalled()
  })
})

describe('SupportConversationsController.findOne', () => {
  test('forwards the authenticated user id and the conversation id and responds 200', async () => {
    const { req } = createReq({
      user: { id: 'user-42' },
      params: { conversationId: 'conv-1' },
    })
    const { res, SpongOK } = createRes()

    await controller.findOne(req, res)

    expect(service.findOne).toHaveBeenCalledWith('user-42', 'conv-1')
    expect(SpongOK).toHaveBeenCalledTimes(1)
    expect(SpongOK.mock.calls[0]?.[0]).toEqual({ success: true, data: findOneResult.data })
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
      const { res, SpongBadRequest, SpongOK } = createRes()

      await controller.findOne(req, res)

      expect(SpongBadRequest).toHaveBeenCalledTimes(1)
      expect(SpongBadRequest.mock.calls[0]?.[0]).toEqual({
        success: false,
        message: 'Support Conversation ID is required',
      })
      expect(service.findOne).not.toHaveBeenCalled()
      expect(SpongOK).not.toHaveBeenCalled()
    })
  }

  test('lets not-found errors from the service propagate', async () => {
    service.findOne.mockRejectedValueOnce(
      new SpongNotFoundException({ success: false, message: 'Support conversation not found' }),
    )
    const { req } = createReq({ params: { conversationId: 'ghost' } })
    const { res, SpongOK, SpongBadRequest } = createRes()

    await expect(controller.findOne(req, res)).rejects.toBeInstanceOf(SpongNotFoundException)

    expect(SpongOK).not.toHaveBeenCalled()
    expect(SpongBadRequest).not.toHaveBeenCalled()
  })

  test('lets authentication errors from the service propagate', async () => {
    service.findOne.mockRejectedValueOnce(
      new SpongUnauthorizedException({ success: false, message: 'You are not authenticated' }),
    )
    const { req } = createReq({ params: { conversationId: 'conv-1' } })
    const { res, SpongOK } = createRes()

    await expect(controller.findOne(req, res)).rejects.toBeInstanceOf(SpongUnauthorizedException)

    expect(SpongOK).not.toHaveBeenCalled()
  })

  test('never calls the service when there is no authenticated user', async () => {
    const { req } = createReq({ user: null, params: { conversationId: 'conv-1' } })
    const { res, SpongOK } = createRes()

    await expect(controller.findOne(req, res)).rejects.toBeDefined()

    expect(service.findOne).not.toHaveBeenCalled()
    expect(SpongOK).not.toHaveBeenCalled()
  })
})

describe('SupportConversationsController.toggle', () => {
  test('passes adminId and conversationId to the service and responds 200 with { success, message, data }', async () => {
    const { req } = createReq({
      user: { id: 'admin-1' },
      params: { conversationId: 'conv-1' },
    })
    const { res, SpongOK } = createRes()

    await controller.toggle(req, res)

    expect(service.toggle).toHaveBeenCalledWith('admin-1', 'conv-1')
    expect(SpongOK).toHaveBeenCalledTimes(1)
    expect(SpongOK.mock.calls[0]?.[0]).toEqual({
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
      const { res, SpongBadRequest, SpongOK } = createRes()

      await controller.toggle(req, res)

      expect(SpongBadRequest).toHaveBeenCalledTimes(1)
      expect(SpongBadRequest.mock.calls[0]?.[0]).toEqual({
        success: false,
        message: 'Support Conversation ID is required',
      })
      expect(service.toggle).not.toHaveBeenCalled()
      expect(SpongOK).not.toHaveBeenCalled()
    })
  }

  test('lets not-found errors from the service propagate', async () => {
    service.toggle.mockRejectedValueOnce(
      new SpongNotFoundException({ success: false, message: 'Support conversation not found' }),
    )
    const { req } = createReq({ params: { conversationId: 'ghost' } })
    const { res, SpongOK, SpongBadRequest } = createRes()

    await expect(controller.toggle(req, res)).rejects.toBeInstanceOf(SpongNotFoundException)

    expect(SpongOK).not.toHaveBeenCalled()
    expect(SpongBadRequest).not.toHaveBeenCalled()
  })

  test('never calls the service when there is no authenticated user', async () => {
    const { req } = createReq({ user: null, params: { conversationId: 'conv-1' } })
    const { res, SpongOK } = createRes()

    await expect(controller.toggle(req, res)).rejects.toBeDefined()

    expect(service.toggle).not.toHaveBeenCalled()
    expect(SpongOK).not.toHaveBeenCalled()
  })

  test('responds with an authentication error (not a TypeError) when there is no authenticated user', async () => {
    const { req } = createReq({ user: null, params: { conversationId: 'conv-1' } })
    const { res } = createRes()

    const error = await captureRejection((async () => controller.toggle(req, res))())

    expect(error).toBeInstanceOf(SpongUnauthorizedException)
  })
})
