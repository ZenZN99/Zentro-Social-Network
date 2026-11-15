import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { database } from '../../../config/db/drizzle'
import type { NotificationsGateway } from '../../../config/gateways/notifications.gateway'
import type { Notification } from '../schemas/notification.schema'
import { NotificationsService } from '../notifications.service'
import { SpongInternalServerErrorException, SpongNotFoundException } from 'riser-bob'

type Outcome = { value: unknown } | { error: Error }

type QueryCall = {
  method: string
  args: unknown[]
}

class QueryChain implements PromiseLike<unknown> {
  readonly calls: QueryCall[] = []

  constructor(private readonly outcome: Outcome = { value: [] }) {}

  private record(method: string, args: unknown[]) {
    this.calls.push({ method, args })
    return this
  }

  from(...args: unknown[]) {
    return this.record('from', args)
  }

  where(...args: unknown[]) {
    return this.record('where', args)
  }

  orderBy(...args: unknown[]) {
    return this.record('orderBy', args)
  }

  limit(...args: unknown[]) {
    return this.record('limit', args)
  }

  leftJoin(...args: unknown[]) {
    return this.record('leftJoin', args)
  }

  values(...args: unknown[]) {
    return this.record('values', args)
  }

  returning(...args: unknown[]) {
    return this.record('returning', args)
  }

  set(...args: unknown[]) {
    return this.record('set', args)
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const promise =
      'error' in this.outcome
        ? Promise.reject(this.outcome.error)
        : Promise.resolve(this.outcome.value)

    return promise.then(onfulfilled, onrejected)
  }
}

class FakeDb {
  readonly selectChains: QueryChain[] = []
  readonly insertChains: QueryChain[] = []
  readonly updateChains: QueryChain[] = []
  readonly deleteChains: QueryChain[] = []

  readonly rootCalls: QueryCall[] = []

  select(...args: unknown[]) {
    this.rootCalls.push({ method: 'select', args })
    return this.selectChains.shift() ?? new QueryChain()
  }

  insert(...args: unknown[]) {
    this.rootCalls.push({ method: 'insert', args })
    return this.insertChains.shift() ?? new QueryChain()
  }

  update(...args: unknown[]) {
    this.rootCalls.push({ method: 'update', args })
    return this.updateChains.shift() ?? new QueryChain()
  }

  delete(...args: unknown[]) {
    this.rootCalls.push({ method: 'delete', args })
    return this.deleteChains.shift() ?? new QueryChain()
  }

  queueSelect(value: unknown) {
    const chain = new QueryChain({ value })
    this.selectChains.push(chain)
    return chain
  }

  queueInsert(value: unknown) {
    const chain = new QueryChain({ value })
    this.insertChains.push(chain)
    return chain
  }

  queueUpdate(value: unknown) {
    const chain = new QueryChain({ value })
    this.updateChains.push(chain)
    return chain
  }

  queueDelete(value: unknown) {
    const chain = new QueryChain({ value })
    this.deleteChains.push(chain)
    return chain
  }

  failSelect(error: Error) {
    this.selectChains.push(new QueryChain({ error }))
  }

  failInsert(error: Error) {
    this.insertChains.push(new QueryChain({ error }))
  }

  failUpdate(error: Error) {
    this.updateChains.push(new QueryChain({ error }))
  }

  failDelete(error: Error) {
    this.deleteChains.push(new QueryChain({ error }))
  }
}

function notification(overrides: Record<string, unknown> = {}) {
  return {
    id: 'notification-1',
    senderId: 'sender-1',
    receiverId: 'receiver-1',
    targetId: 'post-1',
    type: 'NEW_POST',
    message: 'Someone created a post',
    isRead: false,
    link: '/posts/post-1',
    createdAt: new Date('2026-01-01T10:00:00.000Z'),
    updatedAt: new Date('2026-01-01T10:00:00.000Z'),
    ...overrides,
  } as unknown as Notification
}

function joinedNotification(overrides: Record<string, unknown> = {}) {
  return {
    ...notification(),
    sender: {
      id: 'sender-1',
      firstName: 'Zen',
      lastName: 'Allaham',
    },
    senderAvatar: 'https://example.com/avatar.png',
    ...overrides,
  }
}

function createGateway() {
  return {
    sendNotification: mock((_data: unknown) => undefined),
    sendMarkAsRead: mock((_receiverId: string, _notificationId: string) => undefined),
    sendMarkAllAsRead: mock((_receiverId: string) => undefined),
  }
}

function setup() {
  const db = new FakeDb()
  const gateway = createGateway()

  const service = new NotificationsService(
    db as unknown as typeof database,
    gateway as unknown as NotificationsGateway,
  )

  return { db, gateway, service }
}

beforeEach(() => {
  // كل اختبار ينشئ DB وGateway جديدين.
})

describe('NotificationsService.create', () => {
  test('creates and retrieves a notification successfully', async () => {
    const { db, gateway, service } = setup()

    const created = notification()

    db.queueInsert([created])
    db.queueSelect([joinedNotification()])

    const result = await service.create(created)

    expect(result).toMatchObject({
      success: true,
      data: {
        id: 'notification-1',
        sender: {
          id: 'sender-1',
          firstName: 'Zen',
          lastName: 'Allaham',
          profile: {
            avatar: 'https://example.com/avatar.png',
          },
        },
      },
    })

    expect(db.rootCalls.map((call) => call.method)).toEqual(['insert', 'select'])

    expect(gateway.sendNotification).toHaveBeenCalledTimes(1)
    expect(gateway.sendNotification).toHaveBeenCalledWith(result?.data)
  })

  test('does not create a notification when sender and receiver are identical', async () => {
    const { db, gateway, service } = setup()

    const result = await service.create(
      notification({
        senderId: 'same-user',
        receiverId: 'same-user',
      }),
    )

    expect(result).toBeUndefined()
    expect(db.rootCalls).toHaveLength(0)
    expect(gateway.sendNotification).not.toHaveBeenCalled()
  })

  test('throws when INSERT returns no notification', async () => {
    const { db, gateway, service } = setup()

    db.queueInsert([])

    await expect(service.create(notification())).rejects.toBeInstanceOf(
      SpongInternalServerErrorException,
    )

    expect(db.rootCalls.map((call) => call.method)).toEqual(['insert'])

    expect(gateway.sendNotification).not.toHaveBeenCalled()
  })

  test('throws when INSERT fails', async () => {
    const { db, gateway, service } = setup()

    db.failInsert(new Error('Database insert failed'))

    await expect(service.create(notification())).rejects.toThrow('Database insert failed')

    expect(gateway.sendNotification).not.toHaveBeenCalled()
  })

  test('throws when retrieving the inserted notification returns no result', async () => {
    const { db, gateway, service } = setup()

    db.queueInsert([notification()])
    db.queueSelect([])

    await expect(service.create(notification())).rejects.toBeInstanceOf(
      SpongInternalServerErrorException,
    )

    expect(db.rootCalls.map((call) => call.method)).toEqual(['insert', 'select'])

    expect(gateway.sendNotification).not.toHaveBeenCalled()
  })

  test('throws when the retrieval query fails', async () => {
    const { db, gateway, service } = setup()

    db.queueInsert([notification()])
    db.failSelect(new Error('Retrieval failed'))

    await expect(service.create(notification())).rejects.toThrow('Retrieval failed')

    expect(gateway.sendNotification).not.toHaveBeenCalled()
  })

  test('handles a sender without a profile avatar', async () => {
    const { db, gateway, service } = setup()

    db.queueInsert([notification()])
    db.queueSelect([
      joinedNotification({
        senderAvatar: null,
      }),
    ])

    const result = await service.create(notification())

    expect(result?.data).toMatchObject({
      sender: {
        profile: null,
      },
    })

    expect(gateway.sendNotification).toHaveBeenCalledTimes(1)
  })

  test('handles a notification whose sender relation is missing', async () => {
    const { db, gateway, service } = setup()

    db.queueInsert([notification()])
    db.queueSelect([
      joinedNotification({
        sender: null,
        senderAvatar: null,
      }),
    ])

    const result = await service.create(notification())

    expect(result?.data).toMatchObject({
      sender: null,
    })

    expect(gateway.sendNotification).toHaveBeenCalledTimes(1)
  })

  test('does not send a WebSocket event if notification retrieval fails', async () => {
    const { db, gateway, service } = setup()

    db.queueInsert([notification()])
    db.queueSelect([])

    await expect(service.create(notification())).rejects.toBeInstanceOf(
      SpongInternalServerErrorException,
    )

    expect(gateway.sendNotification).not.toHaveBeenCalled()
  })

  test('currently rejects after the database insert if the gateway throws', async () => {
    const { db, gateway, service } = setup()

    db.queueInsert([notification()])
    db.queueSelect([joinedNotification()])

    gateway.sendNotification.mockImplementationOnce(() => {
      throw new Error('WebSocket unavailable')
    })

    await expect(service.create(notification())).rejects.toThrow('WebSocket unavailable')

    // The INSERT has already completed. There is no transaction or rollback.
    expect(db.rootCalls.map((call) => call.method)).toEqual(['insert', 'select'])
  })

  test('passes nullable targetId and link to the INSERT data', async () => {
    const { db, service } = setup()

    db.queueInsert([notification()])
    db.queueSelect([joinedNotification()])

    await service.create(
      notification({
        targetId: null,
        link: null,
      }),
    )

    const insertChain = db.rootCalls[0]

    expect(insertChain?.method).toBe('insert')
  })
})

describe('NotificationsService.findMe', () => {
  test('returns notifications belonging to the requested receiver', async () => {
    const { db, service } = setup()

    db.queueSelect([joinedNotification()])

    const result = await service.findMe('receiver-1')

    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)

    expect(result.data[0]).toMatchObject({
      id: 'notification-1',
      sender: {
        id: 'sender-1',
        firstName: 'Zen',
        lastName: 'Allaham',
        profile: {
          avatar: 'https://example.com/avatar.png',
        },
      },
    })

    expect(result.data[0]).not.toHaveProperty('senderAvatar')
  })

  test('returns an empty array when the user has no notifications', async () => {
    const { db, service } = setup()

    db.queueSelect([])

    const result = await service.findMe('receiver-1')

    expect(result).toEqual({
      success: true,
      data: [],
    })
  })

  test('uses the supplied receiver ID', async () => {
    const { db, service } = setup()

    const query = db.queueSelect([])

    await service.findMe('receiver-2')

    expect(query.calls.some((call) => call.method === 'where')).toBe(true)
  })

  test('maps a null sender relation to null', async () => {
    const { db, service } = setup()

    db.queueSelect([
      joinedNotification({
        sender: null,
        senderAvatar: null,
      }),
    ])

    const result = await service.findMe('receiver-1')

    expect(result.data[0]?.sender).toBeNull()
  })

  test('maps a null avatar to a null profile', async () => {
    const { db, service } = setup()

    db.queueSelect([
      joinedNotification({
        senderAvatar: null,
      }),
    ])

    const result = await service.findMe('receiver-1')

    expect(result.data[0]?.sender).toMatchObject({
      profile: null,
    })
  })

  test('orders notifications by createdAt descending', async () => {
    const { db, service } = setup()

    const query = db.queueSelect([])

    await service.findMe('receiver-1')

    expect(query.calls.some((call) => call.method === 'orderBy')).toBe(true)
  })

  test('propagates database errors', async () => {
    const { db, service } = setup()

    db.failSelect(new Error('Select failed'))

    await expect(service.findMe('receiver-1')).rejects.toThrow('Select failed')
  })
})

describe('NotificationsService.markAsRead', () => {
  test('marks an unread notification as read', async () => {
    const { db, gateway, service } = setup()

    const original = notification({ isRead: false })
    const updated = notification({ isRead: true })

    db.queueSelect([original])
    db.queueUpdate([updated])

    const result = await service.markAsRead('receiver-1', 'notification-1')

    expect(result).toMatchObject({
      success: true,
      message: 'Notification marked as read successfully',
      data: {
        id: 'notification-1',
        isRead: true,
      },
    })

    expect(db.rootCalls.map((call) => call.method)).toEqual(['select', 'update'])

    expect(gateway.sendMarkAsRead).toHaveBeenCalledWith('receiver-1', 'notification-1')
  })

  test('does not update a notification that is already read', async () => {
    const { db, gateway, service } = setup()

    const alreadyRead = notification({ isRead: true })

    db.queueSelect([alreadyRead])

    const result = await service.markAsRead('receiver-1', 'notification-1')

    expect(result.data.isRead).toBe(true)

    expect(db.rootCalls.map((call) => call.method)).toEqual(['select'])

    expect(gateway.sendMarkAsRead).toHaveBeenCalledTimes(1)
  })

  test('throws NotFound when the notification does not exist', async () => {
    const { db, gateway, service } = setup()

    db.queueSelect([])

    await expect(service.markAsRead('receiver-1', 'missing-id')).rejects.toBeInstanceOf(
      SpongNotFoundException,
    )

    expect(db.rootCalls.map((call) => call.method)).toEqual(['select'])

    expect(gateway.sendMarkAsRead).not.toHaveBeenCalled()
  })

  test('does not update a notification belonging to another receiver', async () => {
    const { db, gateway, service } = setup()

    db.queueSelect([])

    await expect(service.markAsRead('attacker-id', 'victim-notification')).rejects.toBeInstanceOf(
      SpongNotFoundException,
    )

    expect(db.rootCalls.map((call) => call.method)).toEqual(['select'])

    expect(gateway.sendMarkAsRead).not.toHaveBeenCalled()
  })

  test('does not update when the initial SELECT fails', async () => {
    const { db, gateway, service } = setup()

    db.failSelect(new Error('Select failed'))

    await expect(service.markAsRead('receiver-1', 'notification-1')).rejects.toThrow(
      'Select failed',
    )

    expect(db.rootCalls.map((call) => call.method)).toEqual(['select'])

    expect(gateway.sendMarkAsRead).not.toHaveBeenCalled()
  })

  test('propagates UPDATE errors and does not send the event', async () => {
    const { db, gateway, service } = setup()

    db.queueSelect([notification({ isRead: false })])
    db.failUpdate(new Error('Update failed'))

    await expect(service.markAsRead('receiver-1', 'notification-1')).rejects.toThrow(
      'Update failed',
    )

    expect(gateway.sendMarkAsRead).not.toHaveBeenCalled()
  })

  test('currently returns the old unread row if UPDATE RETURNING is empty', async () => {
    const { db, gateway, service } = setup()

    const original = notification({ isRead: false })

    db.queueSelect([original])
    db.queueUpdate([])

    const result = await service.markAsRead('receiver-1', 'notification-1')

    // This exposes a bug: the result still says isRead=false.
    expect(result.data.isRead).toBe(false)

    // Yet the gateway event is still sent.
    expect(gateway.sendMarkAsRead).toHaveBeenCalledTimes(1)
  })

  test('currently sends the event even when the UPDATE returns no row', async () => {
    const { db, gateway, service } = setup()

    db.queueSelect([notification({ isRead: false })])
    db.queueUpdate([])

    await service.markAsRead('receiver-1', 'notification-1')

    expect(gateway.sendMarkAsRead).toHaveBeenCalledWith('receiver-1', 'notification-1')
  })

  test('does not call UPDATE when notification is already read', async () => {
    const { db, service } = setup()

    db.queueSelect([notification({ isRead: true })])

    await service.markAsRead('receiver-1', 'notification-1')

    expect(db.rootCalls.some((call) => call.method === 'update')).toBe(false)
  })
})

describe('NotificationsService.markAllAsRead', () => {
  test('updates all unread notifications for the receiver', async () => {
    const { db, gateway, service } = setup()

    const updateQuery = db.queueUpdate([])

    const result = await service.markAllAsRead('receiver-1')

    expect(result).toEqual({
      success: true,
      message: 'All notifications marked as read successfully',
    })

    expect(db.rootCalls.map((call) => call.method)).toEqual(['update'])

    expect(updateQuery.calls.some((call) => call.method === 'set')).toBe(true)

    expect(updateQuery.calls.some((call) => call.method === 'where')).toBe(true)

    expect(gateway.sendMarkAllAsRead).toHaveBeenCalledWith('receiver-1')
  })

  test('sends the gateway event after a successful update', async () => {
    const { db, gateway, service } = setup()

    db.queueUpdate([])

    await service.markAllAsRead('receiver-1')

    expect(gateway.sendMarkAllAsRead).toHaveBeenCalledTimes(1)
  })

  test('currently sends the event even if no rows were updated', async () => {
    const { db, gateway, service } = setup()

    db.queueUpdate([])

    await service.markAllAsRead('receiver-1')

    // The implementation does not inspect the affected row count.
    expect(gateway.sendMarkAllAsRead).toHaveBeenCalledTimes(1)
  })

  test('propagates database errors and does not send the event', async () => {
    const { db, gateway, service } = setup()

    db.failUpdate(new Error('Bulk update failed'))

    await expect(service.markAllAsRead('receiver-1')).rejects.toThrow('Bulk update failed')

    expect(gateway.sendMarkAllAsRead).not.toHaveBeenCalled()
  })
})

describe('NotificationsService.delete', () => {
  test('deletes a notification belonging to the receiver', async () => {
    const { db, service } = setup()

    db.queueSelect([{ id: 'notification-1' }])
    db.queueDelete([])

    const result = await service.delete('receiver-1', 'notification-1')

    expect(result).toEqual({
      success: true,
      message: 'Notification deleted successfully',
    })

    expect(db.rootCalls.map((call) => call.method)).toEqual(['select', 'delete'])
  })

  test('throws NotFound when the notification does not exist', async () => {
    const { db, service } = setup()

    db.queueSelect([])

    await expect(service.delete('receiver-1', 'missing-id')).rejects.toBeInstanceOf(
      SpongNotFoundException,
    )

    expect(db.rootCalls.map((call) => call.method)).toEqual(['select'])
  })

  test('does not delete another user notification', async () => {
    const { db, service } = setup()

    db.queueSelect([])

    await expect(service.delete('attacker-id', 'victim-notification')).rejects.toBeInstanceOf(
      SpongNotFoundException,
    )

    expect(db.rootCalls.some((call) => call.method === 'delete')).toBe(false)
  })

  test('does not execute DELETE when ownership lookup fails', async () => {
    const { db, service } = setup()

    db.failSelect(new Error('Select failed'))

    await expect(service.delete('receiver-1', 'notification-1')).rejects.toThrow('Select failed')

    expect(db.rootCalls.some((call) => call.method === 'delete')).toBe(false)
  })

  test('propagates DELETE errors', async () => {
    const { db, service } = setup()

    db.queueSelect([{ id: 'notification-1' }])
    db.failDelete(new Error('Delete failed'))

    await expect(service.delete('receiver-1', 'notification-1')).rejects.toThrow('Delete failed')
  })
})
