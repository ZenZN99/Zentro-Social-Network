import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { database } from '../../../config/db/drizzle'
import { BookmarksService } from '../bookmarks.service'

type Outcome = { value: unknown } | { error: Error }

class QueryChain implements PromiseLike<unknown> {
  constructor(private readonly resolveOutcome: () => unknown) {}

  from() {
    return this
  }

  where() {
    return this
  }

  limit() {
    return this
  }

  offset() {
    return this
  }

  orderBy() {
    return this
  }

  for() {
    return this
  }

  leftJoin() {
    return this
  }

  values() {
    return this
  }

  set() {
    return this
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve()
      .then(() => this.resolveOutcome())
      .then(onfulfilled, onrejected)
  }
}

class FakeDb {
  private outcomes: Outcome[] = []

  readonly select = mock(() => this.createChain())

  readonly insert = mock(() => this.createChain())

  readonly update = mock(() => this.createChain())

  readonly delete = mock(() => this.createChain())

  readonly transaction = mock(async (callback: (transaction: FakeDb) => Promise<unknown>) =>
    callback(this),
  )

  setOutcomes(outcomes: Outcome[]) {
    this.outcomes = [...outcomes]
  }

  private nextOutcome(): unknown {
    const outcome = this.outcomes.shift()

    if (!outcome) {
      throw new Error('No mock outcome available')
    }

    if ('error' in outcome) {
      throw outcome.error
    }

    return outcome.value
  }

  private createChain() {
    return new QueryChain(() => this.nextOutcome())
  }
}

const rows = (value: unknown): Outcome => ({ value })

const failing = (message: string): Outcome => ({
  error: new Error(message),
})

const createFakeDb = () => {
  const db = new FakeDb()

  return {
    db,
    service: new BookmarksService(db as unknown as typeof database),
  }
}

const captureRejection = async (promise: Promise<unknown>) => {
  try {
    await promise
    return null
  } catch (error) {
    return error
  }
}

const post = {
  id: 'post-id',
  bookmarksCount: 5,
}

const bookmark = {
  id: 'bookmark-id',
  userId: 'user-id',
  postId: 'post-id',
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('BookmarksService', () => {
  beforeEach(() => {
    mock.restore()
  })

  describe('toggle', () => {
    test('should create a bookmark when it does not exist', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([rows([post]), rows([]), rows([]), rows([])])

      const result = await service.toggle('user-id', 'post-id')

      expect(result).toEqual({
        success: true,
        isBookmarked: true,
        message: 'Post bookmarked successfully',
      })

      expect(db.transaction).toHaveBeenCalledTimes(1)
      expect(db.select).toHaveBeenCalledTimes(2)
      expect(db.insert).toHaveBeenCalledTimes(1)
      expect(db.update).toHaveBeenCalledTimes(1)
      expect(db.delete).not.toHaveBeenCalled()
    })

    test('should remove an existing bookmark', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([rows([post]), rows([bookmark]), rows([]), rows([])])

      const result = await service.toggle('user-id', 'post-id')

      expect(result).toEqual({
        success: true,
        isBookmarked: false,
        message: 'Bookmark removed successfully',
      })

      expect(db.transaction).toHaveBeenCalledTimes(1)
      expect(db.select).toHaveBeenCalledTimes(2)
      expect(db.delete).toHaveBeenCalledTimes(1)
      expect(db.update).toHaveBeenCalledTimes(1)
      expect(db.insert).not.toHaveBeenCalled()
    })

    test('should throw NotFoundException when post does not exist', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([rows([])])

      const error = await captureRejection(service.toggle('user-id', 'missing-post'))

      expect(error).not.toBeNull()
      expect((error as Error).message).toContain('Post not found')

      expect(db.select).toHaveBeenCalledTimes(1)
      expect(db.insert).not.toHaveBeenCalled()
      expect(db.delete).not.toHaveBeenCalled()
      expect(db.update).not.toHaveBeenCalled()
    })

    test('should propagate post query errors', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([failing('Post query failed')])

      const error = await captureRejection(service.toggle('user-id', 'post-id'))

      expect((error as Error).message).toBe('Post query failed')
      expect(db.select).toHaveBeenCalledTimes(1)
    })

    test('should propagate bookmark query errors', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([rows([post]), failing('Bookmark query failed')])

      const error = await captureRejection(service.toggle('user-id', 'post-id'))

      expect((error as Error).message).toBe('Bookmark query failed')
      expect(db.select).toHaveBeenCalledTimes(2)
    })

    test('should propagate insert errors', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([rows([post]), rows([]), failing('Bookmark insert failed')])

      const error = await captureRejection(service.toggle('user-id', 'post-id'))

      expect((error as Error).message).toBe('Bookmark insert failed')
      expect(db.insert).toHaveBeenCalledTimes(1)
      expect(db.update).not.toHaveBeenCalled()
    })

    test('should propagate delete errors', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([rows([post]), rows([bookmark]), failing('Bookmark delete failed')])

      const error = await captureRejection(service.toggle('user-id', 'post-id'))

      expect((error as Error).message).toBe('Bookmark delete failed')
      expect(db.delete).toHaveBeenCalledTimes(1)
      expect(db.update).not.toHaveBeenCalled()
    })

    test('should propagate post update errors after creating bookmark', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([rows([post]), rows([]), rows([]), failing('Post update failed')])

      const error = await captureRejection(service.toggle('user-id', 'post-id'))

      expect((error as Error).message).toBe('Post update failed')
      expect(db.insert).toHaveBeenCalledTimes(1)
      expect(db.update).toHaveBeenCalledTimes(1)
    })

    test('should propagate post update errors after removing bookmark', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([rows([post]), rows([bookmark]), rows([]), failing('Post update failed')])

      const error = await captureRejection(service.toggle('user-id', 'post-id'))

      expect((error as Error).message).toBe('Post update failed')
      expect(db.delete).toHaveBeenCalledTimes(1)
      expect(db.update).toHaveBeenCalledTimes(1)
    })
  })

  describe('findMe', () => {
    test('should return bookmarks with their related post data', async () => {
      const { db, service } = createFakeDb()

      const bookmarkData = {
        ...bookmark,
      }

      const postData = {
        id: 'post-id',
        content: 'Test post',
      }

      const author = {
        id: 'author-id',
        username: 'author',
      }

      const profile = {
        id: 'profile-id',
        userId: 'author-id',
      }

      db.setOutcomes([
        rows([
          {
            bookmark: bookmarkData,
            post: postData,
            author,
            profile,
          },
        ]),
        rows([{ total: 1 }]),
      ])

      const result = await service.findMe('user-id')

      expect(result.success).toBe(true)
      expect(result.bookmarks).toHaveLength(1)

      expect(result.bookmarks[0]).toMatchObject({
        bookmark: bookmarkData,
        post: {
          post: postData,
          author,
          profile,
        },
      })

      expect(result.pagination).toBeDefined()
      expect(db.select).toHaveBeenCalledTimes(2)
    })

    test('should return null post when the related post does not exist', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([
        rows([
          {
            bookmark,
            post: null,
            author: null,
            profile: null,
          },
        ]),
        rows([{ total: 1 }]),
      ])

      const result = await service.findMe('user-id')

      expect(result.bookmarks).toEqual([
        {
          bookmark,
          post: null,
        },
      ])
    })

    test('should return empty bookmarks when user has no bookmarks', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([rows([]), rows([{ total: 0 }])])

      const result = await service.findMe('user-id')

      expect(result).toEqual({
        success: true,
        bookmarks: [],
        pagination: expect.any(Object),
      })
    })

    test('should use default pagination values', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([rows([]), rows([{ total: 0 }])])

      const result = await service.findMe('user-id')

      expect(result.pagination).toBeDefined()
      expect(db.select).toHaveBeenCalledTimes(2)
    })

    test('should accept custom pagination values', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([rows([]), rows([{ total: 25 }])])

      const result = await service.findMe('user-id', 3, 5, 10)

      expect(result.success).toBe(true)
      expect(result.pagination).toBeDefined()
    })

    test('should use zero when count result is missing', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([rows([]), rows([])])

      const result = await service.findMe('user-id')

      expect(result.success).toBe(true)
      expect(result.bookmarks).toEqual([])
      expect(result.pagination).toBeDefined()
    })

    test('should propagate bookmarks query errors', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([failing('Bookmarks query failed')])

      const error = await captureRejection(service.findMe('user-id'))

      expect((error as Error).message).toBe('Bookmarks query failed')
    })

    test('should propagate count query errors', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([rows([]), failing('Count query failed')])

      const error = await captureRejection(service.findMe('user-id'))

      expect((error as Error).message).toBe('Count query failed')
    })
  })

  describe('isBookmarked', () => {
    test('should return true when bookmark exists', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([rows([{ id: 'bookmark-id' }])])

      const result = await service.isBookmarked('user-id', 'post-id')

      expect(result).toEqual({
        success: true,
        isBookmarked: true,
      })

      expect(db.select).toHaveBeenCalledTimes(1)
    })

    test('should return false when bookmark does not exist', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([rows([])])

      const result = await service.isBookmarked('user-id', 'post-id')

      expect(result).toEqual({
        success: true,
        isBookmarked: false,
      })
    })

    test('should propagate query errors', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([failing('Bookmark query failed')])

      const error = await captureRejection(service.isBookmarked('user-id', 'post-id'))

      expect((error as Error).message).toBe('Bookmark query failed')
    })
  })

  describe('countByPostId', () => {
    test('should return bookmarks count for an existing post', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([
        rows([
          {
            id: 'post-id',
            bookmarksCount: 15,
          },
        ]),
      ])

      const result = await service.countByPostId('post-id')

      expect(result).toEqual({
        success: true,
        bookmarksCount: 15,
      })

      expect(db.select).toHaveBeenCalledTimes(1)
    })

    test('should return zero when post has no bookmarks', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([
        rows([
          {
            id: 'post-id',
            bookmarksCount: 0,
          },
        ]),
      ])

      const result = await service.countByPostId('post-id')

      expect(result).toEqual({
        success: true,
        bookmarksCount: 0,
      })
    })

    test('should throw NotFoundException when post does not exist', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([rows([])])

      const error = await captureRejection(service.countByPostId('missing-post'))

      expect(error).not.toBeNull()
      expect((error as Error).message).toContain('Post not found')
    })

    test('should propagate query errors', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([failing('Post query failed')])

      const error = await captureRejection(service.countByPostId('post-id'))

      expect((error as Error).message).toBe('Post query failed')
    })
  })

  describe('countMe', () => {
    test('should return bookmarks count for user', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([rows([{ bookmarksCount: 12 }])])

      const result = await service.countMe('user-id')

      expect(result).toEqual({
        success: true,
        bookmarksCount: 12,
      })

      expect(db.select).toHaveBeenCalledTimes(1)
    })

    test('should return zero when user has no bookmarks', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([rows([{ bookmarksCount: 0 }])])

      const result = await service.countMe('user-id')

      expect(result).toEqual({
        success: true,
        bookmarksCount: 0,
      })
    })

    test('should default bookmarksCount to zero when result is empty', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([rows([])])

      const result = await service.countMe('user-id')

      expect(result).toEqual({
        success: true,
        bookmarksCount: 0,
      })
    })

    test('should propagate query errors', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([failing('Count query failed')])

      const error = await captureRejection(service.countMe('user-id'))

      expect((error as Error).message).toBe('Count query failed')
    })
  })
})
