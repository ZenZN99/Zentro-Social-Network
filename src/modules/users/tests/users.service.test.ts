import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { BadRequestException, NotFoundException } from 'lykosjs'
import type { Database, database } from '../../../config/db/drizzle'
import { buildPagination } from '../../../utilities/pagination'
import { sanitizeUser } from '../../../utilities/sanitize-user'
import type { NotificationsService } from '../../notifications/notifications.service'
import { NotificationType } from '../../notifications/schemas/enums/notification-type'
import { UserVerificationStatus } from '../../user-verifications/schemas/enums/user-verification-status'
import { UserRole } from '../schemas/enums/user-role'
import { UsersService } from '../users.service'

type Outcome = { readonly value: unknown } | { readonly error: Error }

class QueryChain implements PromiseLike<unknown> {
  readonly from = mock((..._args: unknown[]): QueryChain => this)
  readonly where = mock((..._args: unknown[]): QueryChain => this)
  readonly orderBy = mock((..._args: unknown[]): QueryChain => this)
  readonly limit = mock((..._args: unknown[]): QueryChain => this)
  readonly offset = mock((..._args: unknown[]): QueryChain => this)
  readonly set = mock((..._args: unknown[]): QueryChain => this)

  constructor(private readonly outcome: Outcome) {}

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const settled =
      'error' in this.outcome
        ? Promise.reject(this.outcome.error)
        : Promise.resolve(this.outcome.value)

    return settled.then(onfulfilled, onrejected)
  }
}

const rows = (value: readonly unknown[]): QueryChain => new QueryChain({ value })

const failing = (error: Error): QueryChain => new QueryChain({ error })

function createFakeDb() {
  const outcomes: QueryChain[] = []

  const db = {
    select: mock((..._args: unknown[]) => {
      const chain = outcomes.shift()

      if (!chain) {
        throw new Error('Unexpected database select call')
      }

      return chain
    }),

    update: mock((..._args: unknown[]) => {
      const chain = outcomes.shift()

      if (!chain) {
        throw new Error('Unexpected database update call')
      }

      return chain
    }),
  }

  return {
    db: { connection: db } as unknown as Database,
    outcomes,
    enqueue: (...chains: QueryChain[]) => outcomes.push(...chains),
    select: db.select,
    update: db.update,
  }
}

function createFakeNotifications() {
  return {
    create: mock(async (_data: Parameters<NotificationsService['create']>[0]) => undefined),
  }
}

type FakeNotifications = ReturnType<typeof createFakeNotifications>

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    firstName: 'Zen',
    lastName: 'Allaham',
    username: 'zen',
    email: 'zen@example.com',
    password: 'hashed-password',
    role: UserRole.USER,
    isActive: true,
    lastLoginAt: null,
    refreshToken: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }
}

function makeProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'profile-1',
    userId: 'user-1',
    avatar: {
      url: 'https://example.com/avatar.png',
      publicId: 'avatar-public-id',
    },
    cover: {
      url: 'https://example.com/cover.png',
      publicId: 'cover-public-id',
    },
    bio: 'Developer',
    ...overrides,
  }
}

function makeVerification(overrides: Record<string, unknown> = {}) {
  return {
    id: 'verification-1',
    userId: 'user-1',
    profileImage: {
      url: 'https://example.com/profile.png',
      publicId: 'profile-public-id',
    },
    identityDocument: {
      url: 'https://example.com/identity.png',
      publicId: 'identity-public-id',
    },
    status: UserVerificationStatus.PENDING,
    rejectionReason: null,
    submittedAt: new Date('2026-01-01T00:00:00.000Z'),
    reviewedAt: null,
    ...overrides,
  }
}

describe('UsersService', () => {
  let fakeDb: ReturnType<typeof createFakeDb>
  let notifications: FakeNotifications
  let service: UsersService

  beforeEach(() => {
    fakeDb = createFakeDb()
    notifications = createFakeNotifications()

    service = new UsersService(fakeDb.db, notifications as unknown as NotificationsService)
  })

  afterEach(() => {
    mock.restore()
  })

  describe('findAll', () => {
    test('returns users with their profiles and verifications', async () => {
      const user = makeUser()
      const profile = makeProfile()
      const verification = makeVerification()

      fakeDb.enqueue(rows([user]), rows([{ total: 1 }]), rows([profile]), rows([verification]))

      const result = await service.findAll(1, 10, 0)

      expect(result).toEqual({
        success: true,
        safeUsers: [
          {
            ...sanitizeUser(user),
            profile,
            verification,
          },
        ],
        pagination: buildPagination(1, 1, 10),
      })
    })

    test('returns null profile and verification when no related records exist', async () => {
      const user = makeUser()

      fakeDb.enqueue(rows([user]), rows([{ total: 1 }]), rows([]), rows([]))

      const result = await service.findAll(1, 10, 0)

      expect(result.safeUsers).toEqual([
        {
          ...sanitizeUser(user),
          profile: null,
          verification: null,
        },
      ])
    })

    test('does not query profiles or verifications when there are no users', async () => {
      fakeDb.enqueue(rows([]), rows([{ total: 0 }]))

      const result = await service.findAll(1, 10, 0)

      expect(result).toEqual({
        success: true,
        safeUsers: [],
        pagination: buildPagination(0, 1, 10),
      })

      expect(fakeDb.select).toHaveBeenCalledTimes(2)
    })

    test('maps profiles and verifications to their corresponding users', async () => {
      const alice = makeUser({
        id: 'alice-id',
        username: 'alice',
      })

      const bob = makeUser({
        id: 'bob-id',
        username: 'bob',
      })

      const aliceProfile = makeProfile({
        id: 'alice-profile',
        userId: 'alice-id',
      })

      const bobProfile = makeProfile({
        id: 'bob-profile',
        userId: 'bob-id',
      })

      const aliceVerification = makeVerification({
        id: 'alice-verification',
        userId: 'alice-id',
      })

      const bobVerification = makeVerification({
        id: 'bob-verification',
        userId: 'bob-id',
      })

      fakeDb.enqueue(
        rows([alice, bob]),
        rows([{ total: 2 }]),
        rows([bobProfile, aliceProfile]),
        rows([bobVerification, aliceVerification]),
      )

      const result = await service.findAll(1, 10, 0)

      expect(result.safeUsers).toEqual([
        {
          ...sanitizeUser(alice),
          profile: aliceProfile,
          verification: aliceVerification,
        },
        {
          ...sanitizeUser(bob),
          profile: bobProfile,
          verification: bobVerification,
        },
      ])
    })

    test('uses the provided pagination values', async () => {
      const user = makeUser()

      const usersChain = rows([user])
      fakeDb.enqueue(usersChain, rows([{ total: 25 }]), rows([]), rows([]))

      const result = await service.findAll(2, 5, 5)

      expect(usersChain.limit).toHaveBeenCalledWith(5)
      expect(usersChain.offset).toHaveBeenCalledWith(5)
      expect(result.pagination).toEqual(buildPagination(25, 2, 5))
    })

    test('propagates database errors', async () => {
      fakeDb.enqueue(
        failing(new Error('Database unavailable')),
        failing(new Error('Database unavailable')),
      )

      await expect(service.findAll()).rejects.toThrow('Database unavailable')
    })
  })

  describe('findOneByUsername', () => {
    test('returns the sanitized user with profile and verification status', async () => {
      const user = makeUser()
      const profile = {
        id: 'profile-1',
        avatar: {
          url: 'https://example.com/avatar.png',
          publicId: 'avatar-public-id',
        },
        cover: {
          url: 'https://example.com/cover.png',
          publicId: 'cover-public-id',
        },
        bio: 'Developer',
      }

      const verification = {
        status: UserVerificationStatus.PENDING,
      }

      fakeDb.enqueue(rows([user]), rows([profile]), rows([verification]))

      const result = await service.findOneByUsername('zen')

      expect(result).toEqual({
        success: true,
        data: {
          ...sanitizeUser(user),
          profile,
          verification,
        },
      })
    })

    test('returns null profile and verification when no related records exist', async () => {
      const user = makeUser()

      fakeDb.enqueue(rows([user]), rows([]), rows([]))

      const result = await service.findOneByUsername('zen')

      expect(result.data.profile).toBeNull()
      expect(result.data.verification).toBeNull()
    })

    test('throws not found when the username does not exist', async () => {
      fakeDb.enqueue(rows([]))

      await expect(service.findOneByUsername('unknown')).rejects.toBeInstanceOf(NotFoundException)

      expect(fakeDb.select).toHaveBeenCalledTimes(1)
    })

    test('throws not found when the user is inactive', async () => {
      fakeDb.enqueue(rows([makeUser({ isActive: false })]))

      await expect(service.findOneByUsername('zen')).rejects.toBeInstanceOf(NotFoundException)

      expect(fakeDb.select).toHaveBeenCalledTimes(1)
    })

    test('propagates database errors', async () => {
      fakeDb.enqueue(failing(new Error('Database unavailable')))

      await expect(service.findOneByUsername('zen')).rejects.toThrow('Database unavailable')
    })
  })

  describe('updateRole', () => {
    test('rejects roles other than USER and SUPPORT', async () => {
      await expect(service.updateRole('admin-1', 'user-1', UserRole.ADMIN)).rejects.toBeInstanceOf(
        BadRequestException,
      )

      expect(fakeDb.select).not.toHaveBeenCalled()
      expect(fakeDb.update).not.toHaveBeenCalled()
      expect(notifications.create).not.toHaveBeenCalled()
    })

    test('throws not found when the user does not exist', async () => {
      fakeDb.enqueue(rows([]))

      await expect(service.updateRole('admin-1', 'user-1', UserRole.USER)).rejects.toBeInstanceOf(
        NotFoundException,
      )

      expect(fakeDb.update).not.toHaveBeenCalled()
      expect(notifications.create).not.toHaveBeenCalled()
    })

    test('throws not found when the user is inactive', async () => {
      fakeDb.enqueue(rows([makeUser({ isActive: false })]))

      await expect(service.updateRole('admin-1', 'user-1', UserRole.USER)).rejects.toBeInstanceOf(
        NotFoundException,
      )

      expect(fakeDb.update).not.toHaveBeenCalled()
      expect(notifications.create).not.toHaveBeenCalled()
    })

    test('updates the role and creates a notification', async () => {
      const user = makeUser()
      const updateChain = rows([])

      fakeDb.enqueue(rows([user]), updateChain)

      const result = await service.updateRole('admin-1', 'user-1', UserRole.SUPPORT)

      expect(updateChain.set).toHaveBeenCalledWith({
        role: UserRole.SUPPORT,
      })

      expect(notifications.create).toHaveBeenCalledWith({
        senderId: 'admin-1',
        receiverId: user.id,
        targetId: user.id,
        type: NotificationType.ROLE_UPDATED,
        message: `Your role has been changed to ${UserRole.SUPPORT}.`,
        link: null,
      })

      expect(result).toEqual({
        success: true,
        message: 'User role updated successfully',
      })
    })

    test('propagates notification errors after updating the role', async () => {
      const updateChain = rows([])

      fakeDb.enqueue(rows([makeUser()]), updateChain)

      notifications.create.mockRejectedValueOnce(new Error('Notification failed'))

      await expect(service.updateRole('admin-1', 'user-1', UserRole.USER)).rejects.toThrow(
        'Notification failed',
      )

      expect(updateChain.set).toHaveBeenCalledWith({
        role: UserRole.USER,
      })
    })
  })

  describe('block', () => {
    test('throws not found when the user does not exist', async () => {
      fakeDb.enqueue(rows([]))

      await expect(service.block('admin-1', 'user-1')).rejects.toBeInstanceOf(NotFoundException)

      expect(fakeDb.update).not.toHaveBeenCalled()
      expect(notifications.create).not.toHaveBeenCalled()
    })

    test('throws not found when the user is inactive', async () => {
      fakeDb.enqueue(rows([makeUser({ isActive: false })]))

      await expect(service.block('admin-1', 'user-1')).rejects.toBeInstanceOf(NotFoundException)

      expect(fakeDb.update).not.toHaveBeenCalled()
      expect(notifications.create).not.toHaveBeenCalled()
    })

    test('blocks the user and creates a notification', async () => {
      const user = makeUser()
      const updateChain = rows([])

      fakeDb.enqueue(rows([user]), updateChain)

      const result = await service.block('admin-1', 'user-1')

      expect(updateChain.set).toHaveBeenCalledWith({
        isActive: false,
      })

      expect(notifications.create).toHaveBeenCalledWith({
        senderId: 'admin-1',
        receiverId: user.id,
        targetId: user.id,
        type: NotificationType.ACCOUNT_BLOCKED,
        message: 'Your account has been suspended for violating the platform policies.',
        link: null,
      })

      expect(result).toEqual({
        success: true,
        message: 'User blocked successfully',
      })
    })

    test('propagates notification errors after blocking the user', async () => {
      const updateChain = rows([])

      fakeDb.enqueue(rows([makeUser()]), updateChain)

      notifications.create.mockRejectedValueOnce(new Error('Notification failed'))

      await expect(service.block('admin-1', 'user-1')).rejects.toThrow('Notification failed')

      expect(updateChain.set).toHaveBeenCalledWith({
        isActive: false,
      })
    })

    test('propagates database errors', async () => {
      fakeDb.enqueue(failing(new Error('Database unavailable')))

      await expect(service.block('admin-1', 'user-1')).rejects.toThrow('Database unavailable')

      expect(fakeDb.update).not.toHaveBeenCalled()
      expect(notifications.create).not.toHaveBeenCalled()
    })
  })
})
