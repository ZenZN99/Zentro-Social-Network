import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { MessagesService } from '../messages.service'
import { MessagesController } from '../messages.controller'

const createResult = {
  success: true,
  message: 'Message sent successfully',
  data: { id: 'message-1' },
}

const findAllResult = {
  success: true,
  data: [
    { id: 'message-1', content: 'Hello' },
    { id: 'message-2', content: 'Hi' },
  ],
}

const markAllAsReadResult = {
  success: true,
  message: 'Messages marked as read',
  data: { updatedCount: 2 },
}

const unreadCountResult = {
  success: true,
  data: { count: 3 },
}

const deleteResult = {
  success: true,
  message: 'Message deleted successfully',
}

function createService() {
  return {
    create: mock(
      async (_senderId: string, _receiverId: string, _formData: FormData) => createResult,
    ),

    findAll: mock(async (_userId: string, _conversationId: string) => findAllResult),

    markAllAsRead: mock(async (_userId: string, _conversationId: string) => markAllAsReadResult),

    findUnreadCount: mock(async (_userId: string, _conversationId: string) => unreadCountResult),

    delete: mock(async (_userId: string, _messageId: string) => deleteResult),
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
  }
}

function createRequest(options?: {
  userId?: string
  params?: Record<string, string | undefined>
  formData?: FormData
}) {
  const formData = options?.formData ?? new FormData()

  return {
    user: {
      id: options?.userId ?? 'user-1',
    },
    params: options?.params ?? {},
    formData: mock(async () => formData),
  }
}

function setup() {
  const service = createService()

  const controller = new MessagesController(service as unknown as MessagesService)

  const response = createResponse()

  return {
    service,
    controller,
    response,
  }
}

beforeEach(() => {
  // كل اختبار ينشئ Service وResponse جديدين.
})

describe('MessagesController.create', () => {
  test('creates a message successfully', async () => {
    const { controller, service, response } = setup()

    const formData = new FormData()
    formData.append('content', 'Hello')

    const request = createRequest({
      userId: 'sender-1',
      params: {
        receiverId: 'receiver-1',
      },
      formData,
    })

    await controller.create(request as never, response as never)

    expect(request.formData).toHaveBeenCalledTimes(1)

    expect(service.create).toHaveBeenCalledTimes(1)
    expect(service.create).toHaveBeenCalledWith('sender-1', 'receiver-1', formData)

    expect(response.Created).toHaveBeenCalledWith({
      success: true,
      message: createResult.message,
      data: createResult.data,
    })
  })

  test('returns bad request when receiverId is missing', async () => {
    const { controller, service, response } = setup()

    const request = createRequest({
      params: {},
    })

    await controller.create(request as never, response as never)

    expect(response.BadRequest).toHaveBeenCalledWith({
      success: false,
      message: 'Receiver ID is required',
    })

    expect(request.formData).not.toHaveBeenCalled()
    expect(service.create).not.toHaveBeenCalled()
    expect(response.Created).not.toHaveBeenCalled()
  })

  test('returns bad request when receiverId is empty', async () => {
    const { controller, service, response } = setup()

    const request = createRequest({
      params: {
        receiverId: '',
      },
    })

    await controller.create(request as never, response as never)

    expect(response.BadRequest).toHaveBeenCalledTimes(1)
    expect(service.create).not.toHaveBeenCalled()
    expect(request.formData).not.toHaveBeenCalled()
  })

  test('uses authenticated user ID as senderId', async () => {
    const { controller, service, response } = setup()

    const request = createRequest({
      userId: 'authenticated-user',
      params: {
        receiverId: 'receiver-1',
      },
    })

    await controller.create(request as never, response as never)

    expect(service.create).toHaveBeenCalledWith(
      'authenticated-user',
      'receiver-1',
      expect.any(FormData),
    )
  })

  test('does not use senderId supplied through request parameters', async () => {
    const { controller, service, response } = setup()

    const request = {
      ...createRequest({
        userId: 'authenticated-user',
        params: {
          receiverId: 'receiver-1',
          senderId: 'attacker-controlled-id',
        },
      }),
    }

    await controller.create(request as never, response as never)

    expect(service.create).toHaveBeenCalledWith(
      'authenticated-user',
      'receiver-1',
      expect.any(FormData),
    )

    expect(service.create).not.toHaveBeenCalledWith(
      'attacker-controlled-id',
      'receiver-1',
      expect.any(FormData),
    )
  })

  test('passes the exact FormData object to the service', async () => {
    const { controller, service, response } = setup()

    const formData = new FormData()
    formData.append('content', 'Test message')
    formData.append('attachment', new Blob(['file content']), 'file.txt')

    const request = createRequest({
      params: {
        receiverId: 'receiver-1',
      },
      formData,
    })

    await controller.create(request as never, response as never)

    const receivedFormData = service.create.mock.calls[0]?.[2]

    expect(receivedFormData).toBe(formData)
    expect(receivedFormData?.get('content')).toBe('Test message')
    expect(receivedFormData?.get('attachment')).toBeInstanceOf(File)
  })

  test('propagates FormData parsing errors', async () => {
    const { controller, service, response } = setup()

    const request = createRequest({
      params: {
        receiverId: 'receiver-1',
      },
    })

    request.formData.mockRejectedValueOnce(new Error('Invalid multipart body'))

    await expect(controller.create(request as never, response as never)).rejects.toThrow(
      'Invalid multipart body',
    )

    expect(service.create).not.toHaveBeenCalled()
    expect(response.Created).not.toHaveBeenCalled()
  })

  test('propagates service errors', async () => {
    const { controller, service, response } = setup()

    const request = createRequest({
      params: {
        receiverId: 'receiver-1',
      },
    })

    service.create.mockRejectedValueOnce(new Error('Message creation failed'))

    await expect(controller.create(request as never, response as never)).rejects.toThrow(
      'Message creation failed',
    )

    expect(response.Created).not.toHaveBeenCalled()
  })

  test('does not call service if receiverId is missing even when FormData is available', async () => {
    const { controller, service, response } = setup()

    const formData = new FormData()
    formData.append('content', 'Hello')

    const request = createRequest({
      params: {},
      formData,
    })

    await controller.create(request as never, response as never)

    expect(service.create).not.toHaveBeenCalled()
    expect(request.formData).not.toHaveBeenCalled()
  })
})

describe('MessagesController.findAll', () => {
  test('returns conversation messages successfully', async () => {
    const { controller, service, response } = setup()

    const request = createRequest({
      userId: 'user-1',
      params: {
        conversationId: 'conversation-1',
      },
    })

    await controller.findAll(request as never, response as never)

    expect(service.findAll).toHaveBeenCalledTimes(1)
    expect(service.findAll).toHaveBeenCalledWith('user-1', 'conversation-1')

    expect(response.OK).toHaveBeenCalledWith({
      success: true,
      data: findAllResult.data,
    })
  })

  test('returns bad request when conversationId is missing', async () => {
    const { controller, service, response } = setup()

    const request = createRequest({
      params: {},
    })

    await controller.findAll(request as never, response as never)

    expect(response.BadRequest).toHaveBeenCalledWith({
      success: false,
      message: 'Conversation ID is required',
    })

    expect(service.findAll).not.toHaveBeenCalled()
    expect(response.OK).not.toHaveBeenCalled()
  })

  test('returns bad request when conversationId is empty', async () => {
    const { controller, service, response } = setup()

    const request = createRequest({
      params: {
        conversationId: '',
      },
    })

    await controller.findAll(request as never, response as never)

    expect(response.BadRequest).toHaveBeenCalledTimes(1)
    expect(service.findAll).not.toHaveBeenCalled()
  })

  test('uses authenticated user ID instead of client-supplied user ID', async () => {
    const { controller, service, response } = setup()

    const request = createRequest({
      userId: 'authenticated-user',
      params: {
        conversationId: 'conversation-1',
        userId: 'attacker-user',
      },
    })

    await controller.findAll(request as never, response as never)

    expect(service.findAll).toHaveBeenCalledWith('authenticated-user', 'conversation-1')
  })

  test('propagates service errors', async () => {
    const { controller, service, response } = setup()

    const request = createRequest({
      params: {
        conversationId: 'conversation-1',
      },
    })

    service.findAll.mockRejectedValueOnce(new Error('Failed to retrieve messages'))

    await expect(controller.findAll(request as never, response as never)).rejects.toThrow(
      'Failed to retrieve messages',
    )

    expect(response.OK).not.toHaveBeenCalled()
  })

  test('returns an empty array when the conversation has no messages', async () => {
    const { controller, service, response } = setup()

    service.findAll.mockResolvedValueOnce({
      success: true,
      data: [],
    })

    const request = createRequest({
      params: {
        conversationId: 'conversation-1',
      },
    })

    await controller.findAll(request as never, response as never)

    expect(response.OK).toHaveBeenCalledWith({
      success: true,
      data: [],
    })
  })
})

describe('MessagesController.markAllAsRead', () => {
  test('marks all conversation messages as read', async () => {
    const { controller, service, response } = setup()

    const request = createRequest({
      userId: 'user-1',
      params: {
        conversationId: 'conversation-1',
      },
    })

    await controller.markAllAsRead(request as never, response as never)

    expect(service.markAllAsRead).toHaveBeenCalledTimes(1)
    expect(service.markAllAsRead).toHaveBeenCalledWith('user-1', 'conversation-1')

    expect(response.OK).toHaveBeenCalledWith({
      success: true,
      message: markAllAsReadResult.message,
      data: markAllAsReadResult.data,
    })
  })

  test('returns bad request when conversationId is missing', async () => {
    const { controller, service, response } = setup()

    const request = createRequest({
      params: {},
    })

    await controller.markAllAsRead(request as never, response as never)

    expect(response.BadRequest).toHaveBeenCalledWith({
      success: false,
      message: 'Conversation ID is required',
    })

    expect(service.markAllAsRead).not.toHaveBeenCalled()
  })

  test('returns bad request when conversationId is empty', async () => {
    const { controller, service, response } = setup()

    const request = createRequest({
      params: {
        conversationId: '',
      },
    })

    await controller.markAllAsRead(request as never, response as never)

    expect(response.BadRequest).toHaveBeenCalledTimes(1)
    expect(service.markAllAsRead).not.toHaveBeenCalled()
  })

  test('uses authenticated user ID', async () => {
    const { controller, service, response } = setup()

    const request = createRequest({
      userId: 'authenticated-user',
      params: {
        conversationId: 'conversation-1',
      },
    })

    await controller.markAllAsRead(request as never, response as never)

    expect(service.markAllAsRead).toHaveBeenCalledWith('authenticated-user', 'conversation-1')
  })

  test('propagates service errors', async () => {
    const { controller, service, response } = setup()

    const request = createRequest({
      params: {
        conversationId: 'conversation-1',
      },
    })

    service.markAllAsRead.mockRejectedValueOnce(new Error('Bulk update failed'))

    await expect(controller.markAllAsRead(request as never, response as never)).rejects.toThrow(
      'Bulk update failed',
    )

    expect(response.OK).not.toHaveBeenCalled()
  })
})

describe('MessagesController.findUnreadCount', () => {
  test('returns unread message count', async () => {
    const { controller, service, response } = setup()

    const request = createRequest({
      userId: 'user-1',
      params: {
        conversationId: 'conversation-1',
      },
    })

    await controller.findUnreadCount(request as never, response as never)

    expect(service.findUnreadCount).toHaveBeenCalledTimes(1)
    expect(service.findUnreadCount).toHaveBeenCalledWith('user-1', 'conversation-1')

    expect(response.OK).toHaveBeenCalledWith({
      success: true,
      data: unreadCountResult.data,
    })
  })

  test('returns bad request when conversationId is missing', async () => {
    const { controller, service, response } = setup()

    const request = createRequest({
      params: {},
    })

    await controller.findUnreadCount(request as never, response as never)

    expect(response.BadRequest).toHaveBeenCalledWith({
      success: false,
      message: 'Conversation ID is required',
    })

    expect(service.findUnreadCount).not.toHaveBeenCalled()
  })

  test('returns bad request when conversationId is empty', async () => {
    const { controller, service, response } = setup()

    const request = createRequest({
      params: {
        conversationId: '',
      },
    })

    await controller.findUnreadCount(request as never, response as never)

    expect(response.BadRequest).toHaveBeenCalledTimes(1)
    expect(service.findUnreadCount).not.toHaveBeenCalled()
  })

  test('uses authenticated user ID', async () => {
    const { controller, service, response } = setup()

    const request = createRequest({
      userId: 'authenticated-user',
      params: {
        conversationId: 'conversation-1',
      },
    })

    await controller.findUnreadCount(request as never, response as never)

    expect(service.findUnreadCount).toHaveBeenCalledWith('authenticated-user', 'conversation-1')
  })

  test('propagates service errors', async () => {
    const { controller, service, response } = setup()

    const request = createRequest({
      params: {
        conversationId: 'conversation-1',
      },
    })

    service.findUnreadCount.mockRejectedValueOnce(new Error('Count query failed'))

    await expect(controller.findUnreadCount(request as never, response as never)).rejects.toThrow(
      'Count query failed',
    )

    expect(response.OK).not.toHaveBeenCalled()
  })

  test('returns zero when there are no unread messages', async () => {
    const { controller, service, response } = setup()

    service.findUnreadCount.mockResolvedValueOnce({
      success: true,
      data: { count: 0 },
    })

    const request = createRequest({
      params: {
        conversationId: 'conversation-1',
      },
    })

    await controller.findUnreadCount(request as never, response as never)

    expect(response.OK).toHaveBeenCalledWith({
      success: true,
      data: { count: 0 },
    })
  })
})

describe('MessagesController.delete', () => {
  test('deletes a message successfully', async () => {
    const { controller, service, response } = setup()

    const request = createRequest({
      userId: 'user-1',
      params: {
        messageId: 'message-1',
      },
    })

    await controller.delete(request as never, response as never)

    expect(service.delete).toHaveBeenCalledTimes(1)
    expect(service.delete).toHaveBeenCalledWith('user-1', 'message-1')

    expect(response.OK).toHaveBeenCalledWith({
      success: true,
      message: deleteResult.message,
    })
  })

  test('returns bad request when messageId is missing', async () => {
    const { controller, service, response } = setup()

    const request = createRequest({
      params: {},
    })

    await controller.delete(request as never, response as never)

    expect(response.BadRequest).toHaveBeenCalledWith({
      success: false,
      message: 'Message ID is required',
    })

    expect(service.delete).not.toHaveBeenCalled()
    expect(response.OK).not.toHaveBeenCalled()
  })

  test('returns bad request when messageId is empty', async () => {
    const { controller, service, response } = setup()

    const request = createRequest({
      params: {
        messageId: '',
      },
    })

    await controller.delete(request as never, response as never)

    expect(response.BadRequest).toHaveBeenCalledTimes(1)
    expect(service.delete).not.toHaveBeenCalled()
  })

  test('uses authenticated user ID instead of client-supplied user ID', async () => {
    const { controller, service, response } = setup()

    const request = createRequest({
      userId: 'authenticated-user',
      params: {
        messageId: 'message-1',
        userId: 'attacker-user',
      },
    })

    await controller.delete(request as never, response as never)

    expect(service.delete).toHaveBeenCalledWith('authenticated-user', 'message-1')
  })

  test('propagates service errors', async () => {
    const { controller, service, response } = setup()

    const request = createRequest({
      params: {
        messageId: 'message-1',
      },
    })

    service.delete.mockRejectedValueOnce(new Error('Delete failed'))

    await expect(controller.delete(request as never, response as never)).rejects.toThrow(
      'Delete failed',
    )

    expect(response.OK).not.toHaveBeenCalled()
  })
})
