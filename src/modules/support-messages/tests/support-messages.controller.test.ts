import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { SpongBadRequestException, SpongNotFoundException } from 'riser-bob'
import type { SpongHandler } from 'riser-bob'
import type { User } from '../../users/schemas/user.schema'
import { SupportMessagesController } from '../support-messages.controller'
import type { SupportMessagesService } from '../support-messages.service'

/* -------------------------------------------------------------------------- */
/*  Typed test doubles (no `any`)                                             */
/* -------------------------------------------------------------------------- */

type SpongReq = Parameters<SpongHandler>[0]
type SpongRes = Parameters<SpongHandler>[1]
type FormLike = Parameters<SupportMessagesService['create']>[2]

const FORM_DATA = { marker: 'form-data' } as unknown as FormLike
const DEFAULT_USER = { id: 'user-1', role: 'USER' }

interface ReqOptions {
  params?: Record<string, string | undefined>
  /** `null` simulates a request where the auth middleware did not attach a user. */
  user?: { id: string; role?: string } | null
  formDataError?: Error
}

function createReq(options: ReqOptions = {}) {
  const formData = mock(async (): Promise<unknown> => {
    if (options.formDataError) throw options.formDataError
    return FORM_DATA
  })
  const user = options.user === null ? undefined : (options.user ?? DEFAULT_USER)
  const req = { params: options.params ?? {}, user, formData }
  return { req: req as unknown as SpongReq, formData, user }
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

type CreateResult = Awaited<ReturnType<SupportMessagesService['create']>>
type FindAllResult = Awaited<ReturnType<SupportMessagesService['findAll']>>
type MarkResult = Awaited<ReturnType<SupportMessagesService['markAllAsRead']>>
type DeleteResult = Awaited<ReturnType<SupportMessagesService['delete']>>

// `internal` is an extra field that must never be forwarded to the client.
const createResult = {
  success: true,
  message: 'Support message created successfully',
  data: { id: 'msg-1', message: 'hello', sender: null },
  internal: 'do-not-forward',
} as unknown as CreateResult

const findAllResult = {
  success: true,
  data: [{ id: 'msg-1', message: 'hello', sender: null }],
  internal: 'do-not-forward',
} as unknown as FindAllResult

const markResult = {
  success: true,
  message: 'Support messages marked as read successfully',
  data: [{ id: 'msg-1', isRead: true }],
  internal: 'do-not-forward',
} as unknown as MarkResult

const deleteResult = {
  success: true,
  message: 'Support message deleted successfully',
  internal: 'do-not-forward',
} as unknown as DeleteResult

function createFakeService() {
  return {
    create: mock(
      async (_user: User, _conversationId: string, _formData: FormLike): Promise<CreateResult> =>
        createResult,
    ),
    findAll: mock(
      async (_user: User, _conversationId: string): Promise<FindAllResult> => findAllResult,
    ),
    markAllAsRead: mock(
      async (_user: User, _conversationId: string): Promise<MarkResult> => markResult,
    ),
    delete: mock(
      async (_conversationId: string, _messageId: string): Promise<DeleteResult> => deleteResult,
    ),
  }
}

type FakeService = ReturnType<typeof createFakeService>

const notFound = () =>
  new SpongNotFoundException({ success: false, message: 'Support conversation not found' })

const MISSING_ID_CASES: readonly (string | undefined)[] = [undefined, '']

/* -------------------------------------------------------------------------- */
/*  Tests                                                                     */
/* -------------------------------------------------------------------------- */

let service: FakeService
let controller: SupportMessagesController

beforeEach(() => {
  service = createFakeService()
  controller = new SupportMessagesController(service as unknown as SupportMessagesService)
})

describe('SupportMessagesController.create', () => {
  test('forwards the authenticated user, the conversation id and the form data untouched', async () => {
    const { req, user } = createReq({ params: { conversationId: 'conv-1' } })
    const { res } = createRes()

    await controller.create(req, res)

    expect(service.create).toHaveBeenCalledTimes(1)
    const [calledUser, calledConversationId, calledForm] = service.create.mock.calls[0] ?? []
    expect(calledUser).toBe(user as unknown as User)
    expect(calledConversationId).toBe('conv-1')
    expect(calledForm).toBe(FORM_DATA)
  })

  test('responds 201 with exactly { success, message, data }', async () => {
    const { req } = createReq({ params: { conversationId: 'conv-1' } })
    const { res, SpongCreated, SpongOK } = createRes()

    await controller.create(req, res)

    expect(SpongCreated).toHaveBeenCalledTimes(1)
    expect(SpongCreated.mock.calls[0]?.[0]).toEqual({
      success: true,
      message: 'Support message created successfully',
      data: createResult.data,
    })
    expect(SpongOK).not.toHaveBeenCalled()
  })

  for (const conversationId of MISSING_ID_CASES) {
    test(`responds 400 and never parses the body when conversationId is ${JSON.stringify(conversationId) ?? 'undefined'}`, async () => {
      const { req, formData } = createReq({ params: { conversationId } })
      const { res, SpongBadRequest, SpongCreated } = createRes()

      await controller.create(req, res)

      expect(SpongBadRequest).toHaveBeenCalledTimes(1)
      expect(SpongBadRequest.mock.calls[0]?.[0]).toEqual({
        success: false,
        message: 'Support conversation ID is required',
      })
      expect(formData).not.toHaveBeenCalled()
      expect(service.create).not.toHaveBeenCalled()
      expect(SpongCreated).not.toHaveBeenCalled()
    })
  }

  test('does not call the service when the multipart body cannot be parsed', async () => {
    const { req } = createReq({
      params: { conversationId: 'conv-1' },
      formDataError: new Error('bad multipart'),
    })
    const { res, SpongCreated, SpongBadRequest } = createRes()

    await expect(controller.create(req, res)).rejects.toThrow('bad multipart')

    expect(service.create).not.toHaveBeenCalled()
    expect(SpongCreated).not.toHaveBeenCalled()
    expect(SpongBadRequest).not.toHaveBeenCalled()
  })

  test('lets service errors propagate without a success response', async () => {
    service.create.mockRejectedValueOnce(notFound())
    const { req } = createReq({ params: { conversationId: 'ghost' } })
    const { res, SpongCreated, SpongBadRequest } = createRes()

    await expect(controller.create(req, res)).rejects.toBeInstanceOf(SpongNotFoundException)

    expect(SpongCreated).not.toHaveBeenCalled()
    expect(SpongBadRequest).not.toHaveBeenCalled()
  })

  test('lets validation errors from the service propagate untouched', async () => {
    service.create.mockRejectedValueOnce(
      new SpongBadRequestException({ success: false, message: 'Message cannot be empty' }),
    )
    const { req } = createReq({ params: { conversationId: 'conv-1' } })
    const { res, SpongCreated } = createRes()

    await expect(controller.create(req, res)).rejects.toBeInstanceOf(SpongBadRequestException)

    expect(SpongCreated).not.toHaveBeenCalled()
  })
})

describe('SupportMessagesController.findAll', () => {
  test('forwards the authenticated user and conversation id and responds 200 with { success, data }', async () => {
    const { req, user } = createReq({ params: { conversationId: 'conv-1' } })
    const { res, SpongOK } = createRes()

    await controller.findAll(req, res)

    const [calledUser, calledConversationId] = service.findAll.mock.calls[0] ?? []
    expect(calledUser).toBe(user as unknown as User)
    expect(calledConversationId).toBe('conv-1')
    expect(SpongOK).toHaveBeenCalledTimes(1)
    expect(SpongOK.mock.calls[0]?.[0]).toEqual({ success: true, data: findAllResult.data })
  })

  for (const conversationId of MISSING_ID_CASES) {
    test(`responds 400 and skips the service when conversationId is ${JSON.stringify(conversationId) ?? 'undefined'}`, async () => {
      const { req } = createReq({ params: { conversationId } })
      const { res, SpongBadRequest, SpongOK } = createRes()

      await controller.findAll(req, res)

      expect(SpongBadRequest).toHaveBeenCalledTimes(1)
      expect(SpongBadRequest.mock.calls[0]?.[0]).toEqual({
        success: false,
        message: 'Support conversation ID is required',
      })
      expect(service.findAll).not.toHaveBeenCalled()
      expect(SpongOK).not.toHaveBeenCalled()
    })
  }

  test('lets not-found errors from the service propagate', async () => {
    service.findAll.mockRejectedValueOnce(notFound())
    const { req } = createReq({ params: { conversationId: 'ghost' } })
    const { res, SpongOK, SpongBadRequest } = createRes()

    await expect(controller.findAll(req, res)).rejects.toBeInstanceOf(SpongNotFoundException)

    expect(SpongOK).not.toHaveBeenCalled()
    expect(SpongBadRequest).not.toHaveBeenCalled()
  })

  test('propagates unexpected service errors without a success response', async () => {
    service.findAll.mockRejectedValueOnce(new Error('db down'))
    const { req } = createReq({ params: { conversationId: 'conv-1' } })
    const { res, SpongOK } = createRes()

    await expect(controller.findAll(req, res)).rejects.toThrow('db down')

    expect(SpongOK).not.toHaveBeenCalled()
  })

  test('takes the user only from the authenticated request, never from the URL', async () => {
    const { req, user } = createReq({
      user: { id: 'real-user' },
      params: { conversationId: 'conv-1', userId: 'attacker' },
    })
    const { res } = createRes()

    await controller.findAll(req, res)

    expect((service.findAll.mock.calls[0]?.[0] as unknown as { id: string }).id).toBe('real-user')
    expect(service.findAll.mock.calls[0]?.[0]).toBe(user as unknown as User)
  })
})

describe('SupportMessagesController.markAllAsRead', () => {
  test('forwards the authenticated user and conversation id and responds 200 with { success, message, data }', async () => {
    const { req, user } = createReq({ params: { conversationId: 'conv-1' } })
    const { res, SpongOK } = createRes()

    await controller.markAllAsRead(req, res)

    const [calledUser, calledConversationId] = service.markAllAsRead.mock.calls[0] ?? []
    expect(calledUser).toBe(user as unknown as User)
    expect(calledConversationId).toBe('conv-1')
    expect(SpongOK).toHaveBeenCalledTimes(1)
    expect(SpongOK.mock.calls[0]?.[0]).toEqual({
      success: true,
      message: 'Support messages marked as read successfully',
      data: markResult.data,
    })
  })

  for (const conversationId of MISSING_ID_CASES) {
    test(`responds 400 and skips the service when conversationId is ${JSON.stringify(conversationId) ?? 'undefined'}`, async () => {
      const { req } = createReq({ params: { conversationId } })
      const { res, SpongBadRequest, SpongOK } = createRes()

      await controller.markAllAsRead(req, res)

      expect(SpongBadRequest).toHaveBeenCalledTimes(1)
      expect(SpongBadRequest.mock.calls[0]?.[0]).toEqual({
        success: false,
        message: 'Support conversation ID is required',
      })
      expect(service.markAllAsRead).not.toHaveBeenCalled()
      expect(SpongOK).not.toHaveBeenCalled()
    })
  }

  test('lets not-found errors from the service propagate', async () => {
    service.markAllAsRead.mockRejectedValueOnce(notFound())
    const { req } = createReq({ params: { conversationId: 'ghost' } })
    const { res, SpongOK, SpongBadRequest } = createRes()

    await expect(controller.markAllAsRead(req, res)).rejects.toBeInstanceOf(SpongNotFoundException)

    expect(SpongOK).not.toHaveBeenCalled()
    expect(SpongBadRequest).not.toHaveBeenCalled()
  })
})

describe('SupportMessagesController.delete', () => {
  test('forwards both ids to the service and responds 200 with { success, message } only', async () => {
    const { req } = createReq({ params: { conversationId: 'conv-1', messageId: 'msg-1' } })
    const { res, SpongOK } = createRes()

    await controller.delete(req, res)

    expect(service.delete).toHaveBeenCalledWith('conv-1', 'msg-1')
    expect(SpongOK).toHaveBeenCalledTimes(1)
    expect(SpongOK.mock.calls[0]?.[0]).toEqual({
      success: true,
      message: 'Support message deleted successfully',
    })
  })

  const INVALID_PARAMS: readonly [string | undefined, string | undefined][] = [
    [undefined, 'msg-1'],
    ['conv-1', undefined],
    [undefined, undefined],
    ['', 'msg-1'],
    ['conv-1', ''],
    ['', ''],
  ]

  for (const [conversationId, messageId] of INVALID_PARAMS) {
    test(`responds 400 and skips the service when conversationId=${JSON.stringify(conversationId) ?? 'undefined'} and messageId=${JSON.stringify(messageId) ?? 'undefined'}`, async () => {
      const { req } = createReq({ params: { conversationId, messageId } })
      const { res, SpongBadRequest, SpongOK } = createRes()

      await controller.delete(req, res)

      expect(SpongBadRequest).toHaveBeenCalledTimes(1)
      expect(SpongBadRequest.mock.calls[0]?.[0]).toEqual({
        success: false,
        message: 'Support conversation ID and message ID is required',
      })
      expect(service.delete).not.toHaveBeenCalled()
      expect(SpongOK).not.toHaveBeenCalled()
    })
  }

  test('lets not-found errors from the service propagate', async () => {
    service.delete.mockRejectedValueOnce(
      new SpongNotFoundException({ success: false, message: 'Support message not found' }),
    )
    const { req } = createReq({ params: { conversationId: 'conv-1', messageId: 'ghost' } })
    const { res, SpongOK, SpongBadRequest } = createRes()

    await expect(controller.delete(req, res)).rejects.toBeInstanceOf(SpongNotFoundException)

    expect(SpongOK).not.toHaveBeenCalled()
    expect(SpongBadRequest).not.toHaveBeenCalled()
  })

  test('propagates unexpected service errors without a success response', async () => {
    service.delete.mockRejectedValueOnce(new Error('cloudinary down'))
    const { req } = createReq({ params: { conversationId: 'conv-1', messageId: 'msg-1' } })
    const { res, SpongOK } = createRes()

    await expect(controller.delete(req, res)).rejects.toThrow('cloudinary down')

    expect(SpongOK).not.toHaveBeenCalled()
  })
})
