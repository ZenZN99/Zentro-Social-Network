import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { NotificationsService } from '../notifications.service'
import type { NotificationType } from '../schemas/enums/notification-type'

const createResult = {
  success: true,
  data: { id: 'notification-1' },
}

const findMeResult = {
  success: true,
  data: [{ id: 'notification-1', message: 'Hello', isRead: false }],
}

const markAsReadResult = {
  success: true,
  message: 'Notification marked as read',
  data: { id: 'notification-1', isRead: true },
}

const markAllAsReadResult = {
  success: true,
  message: 'All notifications marked as read',
}

const deleteResult = {
  success: true,
  message: 'Notification deleted',
}

function createService() {
  return {
    create: mock(async (_data: unknown) => createResult),
    findMe: mock(async (_receiverId: string) => findMeResult),
    markAsRead: mock(async (_receiverId: string, _notificationId: string) => markAsReadResult),
    markAllAsRead: mock(async (_receiverId: string) => markAllAsReadResult),
    delete: mock(async (_receiverId: string, _notificationId: string) => deleteResult),
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
  body?: unknown
}) {
  return {
    user: { id: options?.userId ?? 'user-1' },
    params: options?.params ?? {},
    json: mock(async () => options?.body ?? {}),
  }
}

function setup() {
  const service = createService()

  const { NotificationsController } = requireController()

  const controller = new NotificationsController(service as unknown as NotificationsService)

  const response = createResponse()

  return { service, controller, response }
}

// Dynamic import is unnecessary here; this helper keeps setup centralized.
function requireController() {
  return { NotificationsController }
}

import { NotificationsController } from '../notifications.controller'

beforeEach(() => {
  // Each test creates fresh service and response mocks.
})

describe('NotificationsController.create', () => {
  const body = {
    senderId: 'sender-1',
    receiverId: 'receiver-1',
    targetId: 'post-1',
    type: 'NEW_POST' as NotificationType,
    message: 'Someone created a post',
    link: '/posts/post-1',
  }

  test('creates a notification successfully', async () => {
    const { controller, service, response } = setup()
    const request = createRequest({ body })

    await controller.create(request as never, response as never)

    expect(request.json).toHaveBeenCalledTimes(1)

    expect(service.create).toHaveBeenCalledTimes(1)
    expect(service.create).toHaveBeenCalledWith(body)

    expect(response.Created).toHaveBeenCalledWith({
      success: true,
      data: createResult.data,
    })
  })

  test('passes optional targetId as null', async () => {
    const { controller, service, response } = setup()

    const bodyWithoutTarget = {
      ...body,
      targetId: null,
    }

    const request = createRequest({
      body: bodyWithoutTarget,
    })

    await controller.create(request as never, response as never)

    expect(service.create).toHaveBeenCalledWith(bodyWithoutTarget)
  })

  test('passes optional link as null', async () => {
    const { controller, service, response } = setup()

    const bodyWithoutLink = {
      ...body,
      link: null,
    }

    const request = createRequest({
      body: bodyWithoutLink,
    })

    await controller.create(request as never, response as never)

    expect(service.create).toHaveBeenCalledWith(bodyWithoutLink)
  })

  test('passes data without optional fields', async () => {
    const { controller, service, response } = setup()

    const minimalBody = {
      senderId: 'sender-1',
      receiverId: 'receiver-1',
      type: 'NEW_POST' as NotificationType,
      message: 'New notification',
    }

    const request = createRequest({
      body: minimalBody,
    })

    await controller.create(request as never, response as never)

    expect(service.create).toHaveBeenCalledWith(minimalBody)
  })

  test('returns undefined success and data if service returns undefined', async () => {
    const { controller, service, response } = setup()
    const request = createRequest({ body })

    service.create.mockResolvedValueOnce(undefined as never)

    await controller.create(request as never, response as never)

    expect(response.Created).toHaveBeenCalledWith({
      success: undefined,
      data: undefined,
    })
  })

  test('propagates JSON parsing errors', async () => {
    const { controller, service, response } = setup()
    const request = createRequest({ body })

    request.json.mockRejectedValueOnce(new Error('Invalid JSON'))

    await expect(controller.create(request as never, response as never)).rejects.toThrow(
      'Invalid JSON',
    )

    expect(service.create).not.toHaveBeenCalled()
    expect(response.Created).not.toHaveBeenCalled()
  })

  test('propagates service errors', async () => {
    const { controller, service, response } = setup()
    const request = createRequest({ body })

    service.create.mockRejectedValueOnce(new Error('Database error'))

    await expect(controller.create(request as never, response as never)).rejects.toThrow(
      'Database error',
    )

    expect(response.Created).not.toHaveBeenCalled()
  })

  test('currently accepts senderId and receiverId directly from the request body', async () => {
    const { controller, service, response } = setup()

    const spoofedBody = {
      ...body,
      senderId: 'admin-user-id',
      receiverId: 'victim-user-id',
    }

    const request = createRequest({
      userId: 'attacker-user-id',
      body: spoofedBody,
    })

    await controller.create(request as never, response as never)

    // This confirms the current behavior, not the desired secure behavior.
    expect(service.create).toHaveBeenCalledWith(spoofedBody)
  })
})

describe('NotificationsController.findMe', () => {
  test('returns notifications for the authenticated user', async () => {
    const { controller, service, response } = setup()
    const request = createRequest({
      userId: 'receiver-1',
    })

    await controller.findMe(request as never, response as never)

    expect(service.findMe).toHaveBeenCalledTimes(1)
    expect(service.findMe).toHaveBeenCalledWith('receiver-1')

    expect(response.Created).toHaveBeenCalledWith({
      success: true,
      data: findMeResult.data,
    })
  })

  test('does not accept receiverId from request parameters', async () => {
    const { controller, service, response } = setup()

    const request = {
      ...createRequest({ userId: 'authenticated-user' }),
      params: { receiverId: 'another-user' },
    }

    await controller.findMe(request as never, response as never)

    expect(service.findMe).toHaveBeenCalledWith('authenticated-user')
    expect(service.findMe).not.toHaveBeenCalledWith('another-user')
  })

  test('returns an empty notification list', async () => {
    const { controller, service, response } = setup()
    const request = createRequest()

    service.findMe.mockResolvedValueOnce({
      success: true,
      data: [],
    })

    await controller.findMe(request as never, response as never)

    expect(response.Created).toHaveBeenCalledWith({
      success: true,
      data: [],
    })
  })

  test('propagates service errors', async () => {
    const { controller, service, response } = setup()
    const request = createRequest()

    service.findMe.mockRejectedValueOnce(new Error('Failed to fetch notifications'))

    await expect(controller.findMe(request as never, response as never)).rejects.toThrow(
      'Failed to fetch notifications',
    )

    expect(response.Created).not.toHaveBeenCalled()
  })
})

describe('NotificationsController.markAsRead', () => {
  test('marks a notification as read', async () => {
    const { controller, service, response } = setup()

    const request = createRequest({
      userId: 'receiver-1',
      params: { notificationId: 'notification-1' },
    })

    await controller.markAsRead(request as never, response as never)

    expect(service.markAsRead).toHaveBeenCalledTimes(1)
    expect(service.markAsRead).toHaveBeenCalledWith('receiver-1', 'notification-1')

    expect(response.Created).toHaveBeenCalledWith({
      success: true,
      message: markAsReadResult.message,
      data: markAsReadResult.data,
    })
  })

  test('returns bad request when notificationId is missing', async () => {
    const { controller, service, response } = setup()
    const request = createRequest({ params: {} })

    await controller.markAsRead(request as never, response as never)

    expect(response.BadRequest).toHaveBeenCalledWith({
      success: false,
      message: 'Notification ID is required',
    })

    expect(service.markAsRead).not.toHaveBeenCalled()
    expect(response.Created).not.toHaveBeenCalled()
  })

  test('returns bad request when notificationId is empty', async () => {
    const { controller, service, response } = setup()

    const request = createRequest({
      params: { notificationId: '' },
    })

    await controller.markAsRead(request as never, response as never)

    expect(response.BadRequest).toHaveBeenCalledTimes(1)
    expect(service.markAsRead).not.toHaveBeenCalled()
  })

  test('uses authenticated receiverId, not a body-supplied ID', async () => {
    const { controller, service, response } = setup()

    const request = {
      ...createRequest({
        userId: 'authenticated-user',
        params: { notificationId: 'notification-1' },
      }),
      body: { receiverId: 'another-user' },
    }

    await controller.markAsRead(request as never, response as never)

    expect(service.markAsRead).toHaveBeenCalledWith('authenticated-user', 'notification-1')
  })

  test('propagates service errors', async () => {
    const { controller, service, response } = setup()

    const request = createRequest({
      params: { notificationId: 'notification-1' },
    })

    service.markAsRead.mockRejectedValueOnce(new Error('Update failed'))

    await expect(controller.markAsRead(request as never, response as never)).rejects.toThrow(
      'Update failed',
    )

    expect(response.Created).not.toHaveBeenCalled()
  })
})

describe('NotificationsController.markAllAsRead', () => {
  test('marks all notifications as read for the authenticated user', async () => {
    const { controller, service, response } = setup()

    const request = createRequest({
      userId: 'receiver-1',
    })

    await controller.markAllAsRead(request as never, response as never)

    expect(service.markAllAsRead).toHaveBeenCalledTimes(1)
    expect(service.markAllAsRead).toHaveBeenCalledWith('receiver-1')

    expect(response.Created).toHaveBeenCalledWith({
      success: true,
      message: markAllAsReadResult.message,
    })
  })

  test('does not use a receiverId supplied through query or params', async () => {
    const { controller, service, response } = setup()

    const request = {
      ...createRequest({ userId: 'authenticated-user' }),
      params: { receiverId: 'another-user' },
      query: { receiverId: 'third-user' },
    }

    await controller.markAllAsRead(request as never, response as never)

    expect(service.markAllAsRead).toHaveBeenCalledWith('authenticated-user')
  })

  test('propagates service errors', async () => {
    const { controller, service, response } = setup()
    const request = createRequest()

    service.markAllAsRead.mockRejectedValueOnce(new Error('Bulk update failed'))

    await expect(controller.markAllAsRead(request as never, response as never)).rejects.toThrow(
      'Bulk update failed',
    )

    expect(response.Created).not.toHaveBeenCalled()
  })
})

describe('NotificationsController.delete', () => {
  test('deletes a notification', async () => {
    const { controller, service, response } = setup()

    const request = createRequest({
      userId: 'receiver-1',
      params: { notificationId: 'notification-1' },
    })

    await controller.delete(request as never, response as never)

    expect(service.delete).toHaveBeenCalledTimes(1)
    expect(service.delete).toHaveBeenCalledWith('receiver-1', 'notification-1')

    expect(response.Created).toHaveBeenCalledWith({
      success: true,
      message: deleteResult.message,
    })
  })

  test('returns bad request when notificationId is missing', async () => {
    const { controller, service, response } = setup()
    const request = createRequest({ params: {} })

    await controller.delete(request as never, response as never)

    expect(response.BadRequest).toHaveBeenCalledWith({
      success: false,
      message: 'Notification ID is required',
    })

    expect(service.delete).not.toHaveBeenCalled()
    expect(response.Created).not.toHaveBeenCalled()
  })

  test('returns bad request when notificationId is empty', async () => {
    const { controller, service, response } = setup()

    const request = createRequest({
      params: { notificationId: '' },
    })

    await controller.delete(request as never, response as never)

    expect(response.BadRequest).toHaveBeenCalledTimes(1)
    expect(service.delete).not.toHaveBeenCalled()
  })

  test('does not use receiverId supplied by the client', async () => {
    const { controller, service, response } = setup()

    const request = {
      ...createRequest({
        userId: 'authenticated-user',
        params: { notificationId: 'notification-1' },
      }),
      body: { receiverId: 'another-user' },
    }

    await controller.delete(request as never, response as never)

    expect(service.delete).toHaveBeenCalledWith('authenticated-user', 'notification-1')
  })

  test('propagates service errors', async () => {
    const { controller, service, response } = setup()

    const request = createRequest({
      params: { notificationId: 'notification-1' },
    })

    service.delete.mockRejectedValueOnce(new Error('Delete failed'))

    await expect(controller.delete(request as never, response as never)).rejects.toThrow(
      'Delete failed',
    )

    expect(response.Created).not.toHaveBeenCalled()
  })
})
