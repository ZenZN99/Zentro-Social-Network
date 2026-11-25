import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { NotificationsService } from '../../notifications/notifications.service'
import { NotificationType } from '../../notifications/schemas/enums/notification-type'
import { FollowsService } from '../follows.service'
import type { Database, database } from '../../../config/db/drizzle'

type Outcome = { value: unknown } | { error: Error }

class QueryChain implements PromiseLike<unknown> {
  constructor(private readonly resolveValue: () => unknown) {}

  from = mock(() => this)
  where = mock(() => this)
  limit = mock(() => this)
  offset = mock(() => this)
  orderBy = mock(() => this)
  leftJoin = mock(() => this)
  values = mock(() => this)
  set = mock(() => this)

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve()
      .then(() => this.resolveValue())
      .then(onfulfilled ?? undefined, onrejected ?? undefined)
  }
}

class FakeDb {
  private outcomes: Outcome[] = []

  select = mock(() => this.createChain())
  insert = mock(() => this.createChain())
  delete = mock(() => this.createChain())
  update = mock(() => this.createChain())

  transaction = mock(async (callback: (transaction: FakeDb) => Promise<unknown>) => callback(this))

  setOutcomes(outcomes: Outcome[]) {
    this.outcomes = [...outcomes]
  }

  private createChain() {
    return new QueryChain(() => {
      const outcome = this.outcomes.shift()

      if (!outcome) {
        throw new Error('No mock outcome available')
      }

      if ('error' in outcome) {
        throw outcome.error
      }

      return outcome.value
    })
  }
}

const rows = (value: unknown): Outcome => ({ value })
const failing = (error: Error): Outcome => ({ error })

const createFakeDb = () => new FakeDb()

const makeDependencies = () => {
  const db = createFakeDb()

  const notificationsService = {
    create: mock(async () => undefined),
  } as unknown as NotificationsService

  const service = new FollowsService({ connection: db } as unknown as Database, notificationsService)

  return {
    db,
    service,
    notificationsService,
  }
}

const follower = {
  id: 'follower-id',
  firstName: 'John',
  lastName: 'Doe',
}

const followingUser = {
  id: 'following-id',
}

const existingFollow = {
  id: 'follow-id',
  followerId: 'user-id',
  followingId: 'target-id',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const existingProfile = {
  id: 'profile-id',
  userId: 'follower-id',
  avatar: null,
  cover: null,
  bio: '',
  socials: {
    facebookUrl: null,
    instagramUrl: null,
    youtubeUrl: null,
    threadsUrl: null,
    twitterUrl: null,
    tiktokUrl: null,
    snapchatUrl: null,
    pinterestUrl: null,
    redditUrl: null,
    telegramUrl: null,
    whatsappUrl: null,
  },
  website: null,
  isPrivate: false,
  postsCount: 0,
  commentsCount: 0,
  repliesCount: 0,
  followingCount: 0,
  followersCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const captureRejection = async (promise: Promise<unknown>) => {
  try {
    await promise
    return null
  } catch (error) {
    return error
  }
}

describe('FollowsService', () => {
  beforeEach(() => {
    // Each test creates its own database and service instance.
  })

  describe('toggle', () => {
    test('should throw when user tries to follow themselves', async () => {
      const { service, db } = makeDependencies()

      const error = await captureRejection(service.toggle('user-id', 'user-id'))

      expect(error).toBeDefined()
      expect(db.transaction).not.toHaveBeenCalled()
    })

    test('should throw when following user does not exist', async () => {
      const { service, db } = makeDependencies()

      db.setOutcomes([rows([])])

      const error = await captureRejection(service.toggle('follower-id', 'following-id'))

      expect(error).toBeDefined()
      expect(db.transaction).toHaveBeenCalledTimes(1)
    })

    test('should create a follow and increment both profile counters', async () => {
      const { service, db, notificationsService } = makeDependencies()

      db.setOutcomes([
        rows([followingUser]),
        rows([]),
        rows([]),
        rows([]),
        rows([]),
        rows([follower]),
      ])

      const result = await service.toggle('follower-id', 'following-id')

      expect(result).toEqual({
        success: true,
        message: 'User followed successfully',
      })

      expect(db.insert).toHaveBeenCalledTimes(1)
      expect(db.update).toHaveBeenCalledTimes(2)
      expect(notificationsService.create).toHaveBeenCalledTimes(1)

      expect(notificationsService.create).toHaveBeenCalledWith({
        senderId: follower.id,
        receiverId: 'following-id',
        targetId: 'following-id',
        type: NotificationType.FOLLOW,
        message: 'John Doe started following you.',
        link: '/profile/u/follower-id',
        isRead: false,
      })
    })

    test('should unfollow an existing follow and decrement both profile counters', async () => {
      const { service, db, notificationsService } = makeDependencies()

      db.setOutcomes([rows([followingUser]), rows([existingFollow]), rows([]), rows([]), rows([])])

      const result = await service.toggle('follower-id', 'following-id')

      expect(result).toEqual({
        isFollowing: false,
        message: 'User unfollowed successfully',
      })

      expect(db.delete).toHaveBeenCalledTimes(1)
      expect(db.insert).not.toHaveBeenCalled()
      expect(db.update).toHaveBeenCalledTimes(2)
      expect(notificationsService.create).not.toHaveBeenCalled()
    })

    test('should not create notification when follower does not exist', async () => {
      const { service, db, notificationsService } = makeDependencies()

      db.setOutcomes([rows([followingUser]), rows([]), rows([]), rows([]), rows([]), rows([])])

      const result = await service.toggle('follower-id', 'following-id')

      expect(result).toEqual({
        success: true,
        message: 'User followed successfully',
      })

      expect(notificationsService.create).not.toHaveBeenCalled()
    })

    test('should not fail when notification creation fails', async () => {
      const { service, db, notificationsService } = makeDependencies()

      notificationsService.create = mock(async () => {
        throw new Error('Notification failed')
      })

      db.setOutcomes([
        rows([followingUser]),
        rows([]),
        rows([]),
        rows([]),
        rows([]),
        rows([follower]),
      ])

      const result = await service.toggle('follower-id', 'following-id')

      expect(result).toEqual({
        success: true,
        message: 'User followed successfully',
      })

      expect(notificationsService.create).toHaveBeenCalledTimes(1)
    })

    test('should propagate transaction errors', async () => {
      const { service, db } = makeDependencies()

      const transactionError = new Error('Database transaction failed')

      db.setOutcomes([failing(transactionError)])

      const error = await captureRejection(service.toggle('follower-id', 'following-id'))

      expect(error).toBe(transactionError)
    })
  })

  describe('findFollowers', () => {
    test('should return followers with pagination', async () => {
      const { service, db } = makeDependencies()

      const followers = [
        {
          follow: existingFollow,
          follower: {
            id: 'follower-id',
            username: 'john',
          },
          profile: existingProfile,
        },
      ]

      db.setOutcomes([rows([{ id: 'following-id' }]), rows(followers), rows([{ total: 25 }])])

      const result = await service.findFollowers('following-id', 2, 10, 10)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(followers)
      expect(result.pagination).toBeDefined()
    })

    test('should use default pagination arguments', async () => {
      const { service, db } = makeDependencies()

      db.setOutcomes([rows([{ id: 'following-id' }]), rows([]), rows([{ total: 0 }])])

      const result = await service.findFollowers('following-id')

      expect(result.success).toBe(true)
      expect(result.data).toEqual([])
      expect(result.pagination).toBeDefined()
    })

    test('should throw when user does not exist', async () => {
      const { service, db } = makeDependencies()

      db.setOutcomes([rows([])])

      const error = await captureRejection(service.findFollowers('missing-user'))

      expect(error).toBeDefined()
    })

    test('should return zero total when count query returns no rows', async () => {
      const { service, db } = makeDependencies()

      db.setOutcomes([rows([{ id: 'following-id' }]), rows([]), rows([])])

      const result = await service.findFollowers('following-id')

      expect(result.success).toBe(true)
      expect(result.data).toEqual([])
      expect(result.pagination).toBeDefined()
    })
  })

  describe('findFollowing', () => {
    test('should return following users with pagination', async () => {
      const { service, db } = makeDependencies()

      const following = [
        {
          follow: existingFollow,
          following: {
            id: 'following-id',
            username: 'jane',
          },
          profile: existingProfile,
        },
      ]

      db.setOutcomes([rows([{ id: 'follower-id' }]), rows(following), rows([{ total: 15 }])])

      const result = await service.findFollowing('follower-id', 2, 5, 5)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(following)
      expect(result.pagination).toBeDefined()
    })

    test('should use default pagination arguments', async () => {
      const { service, db } = makeDependencies()

      db.setOutcomes([rows([{ id: 'follower-id' }]), rows([]), rows([{ total: 0 }])])

      const result = await service.findFollowing('follower-id')

      expect(result.success).toBe(true)
      expect(result.data).toEqual([])
      expect(result.pagination).toBeDefined()
    })

    test('should throw when user does not exist', async () => {
      const { service, db } = makeDependencies()

      db.setOutcomes([rows([])])

      const error = await captureRejection(service.findFollowing('missing-user'))

      expect(error).toBeDefined()
    })

    test('should return zero total when count query returns no rows', async () => {
      const { service, db } = makeDependencies()

      db.setOutcomes([rows([{ id: 'follower-id' }]), rows([]), rows([])])

      const result = await service.findFollowing('follower-id')

      expect(result.success).toBe(true)
      expect(result.data).toEqual([])
      expect(result.pagination).toBeDefined()
    })
  })

  describe('isFollowing', () => {
    test('should return true when follow exists', async () => {
      const { service, db } = makeDependencies()

      db.setOutcomes([rows([{ id: 'following-id' }]), rows([{ id: 'follow-id' }])])

      const result = await service.isFollowing('follower-id', 'following-id')

      expect(result).toEqual({
        isFollowing: true,
      })
    })

    test('should return false when follow does not exist', async () => {
      const { service, db } = makeDependencies()

      db.setOutcomes([rows([{ id: 'following-id' }]), rows([])])

      const result = await service.isFollowing('follower-id', 'following-id')

      expect(result).toEqual({
        isFollowing: false,
      })
    })

    test('should throw when following user does not exist', async () => {
      const { service, db } = makeDependencies()

      db.setOutcomes([rows([])])

      const error = await captureRejection(service.isFollowing('follower-id', 'missing-user'))

      expect(error).toBeDefined()
    })
  })

  describe('countFollowers', () => {
    test('should return followers count', async () => {
      const { service, db } = makeDependencies()

      db.setOutcomes([rows([{ id: 'user-id' }]), rows([{ total: 25 }])])

      const result = await service.countFollowers('user-id')

      expect(result).toEqual({
        success: true,
        data: 25,
      })
    })

    test('should return zero when count query returns no rows', async () => {
      const { service, db } = makeDependencies()

      db.setOutcomes([rows([{ id: 'user-id' }]), rows([])])

      const result = await service.countFollowers('user-id')

      expect(result).toEqual({
        success: true,
        data: 0,
      })
    })

    test('should throw when user does not exist', async () => {
      const { service, db } = makeDependencies()

      db.setOutcomes([rows([])])

      const error = await captureRejection(service.countFollowers('missing-user'))

      expect(error).toBeDefined()
    })
  })

  describe('countFollowing', () => {
    test('should return following count', async () => {
      const { service, db } = makeDependencies()

      db.setOutcomes([rows([{ id: 'user-id' }]), rows([{ total: 12 }])])

      const result = await service.countFollowing('user-id')

      expect(result).toEqual({
        success: true,
        data: 12,
      })
    })

    test('should return zero when count query returns no rows', async () => {
      const { service, db } = makeDependencies()

      db.setOutcomes([rows([{ id: 'user-id' }]), rows([])])

      const result = await service.countFollowing('user-id')

      expect(result).toEqual({
        success: true,
        data: 0,
      })
    })

    test('should throw when user does not exist', async () => {
      const { service, db } = makeDependencies()

      db.setOutcomes([rows([])])

      const error = await captureRejection(service.countFollowing('missing-user'))

      expect(error).toBeDefined()
    })
  })
})
