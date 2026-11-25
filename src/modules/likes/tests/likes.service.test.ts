import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from 'lykosjs'
import type { Database, database } from '../../../config/db/drizzle'
import type { NotificationsService } from '../../notifications/notifications.service'
import { NotificationType } from '../../notifications/schemas/enums/notification-type'
import { LikeSchema } from '../schemas/like.schema'
import { PostSchema } from '../../posts/schemas/post.schema'
import { CommentSchema } from '../../comments/schemas/comment.schema'
import { ReplySchema } from '../../replies/schemas/reply.schema'
import type { LikesService as LikesServiceType } from '../likes.service'

const { LikesService } = await import('../likes.service')

const USER_ID = 'user-1'
const OTHER_USER_ID = 'user-2'
const TARGET_ID = 'target-1'
const LIKE_ID = 'like-1'

const dialect = new PgDialect()

type Outcome = { value: unknown } | { error: Error }

class QueryChain implements PromiseLike<unknown> {
  outcome: Outcome = { value: [] }

  from = mock(() => this)
  leftJoin = mock(() => this)
  innerJoin = mock(() => this)
  where = mock((_condition?: SQL) => this)
  orderBy = mock((..._columns: unknown[]) => this)
  limit = mock((_value: number) => this)
  offset = mock((_value: number) => this)
  values = mock((_value: unknown) => this)
  set = mock((_value: unknown) => this)
  returning = mock((_value?: unknown) => this)

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: Error) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    if ('error' in this.outcome) {
      return Promise.reject(this.outcome.error).then(onfulfilled, onrejected)
    }

    return Promise.resolve(this.outcome.value).then(onfulfilled, onrejected)
  }
}

class FakeDb {
  selectQueue: QueryChain[] = []
  insertQueue: QueryChain[] = []
  updateQueue: QueryChain[] = []
  deleteQueue: QueryChain[] = []

  select = mock(() => this.selectQueue.shift() ?? new QueryChain())
  insert = mock((_schema: unknown) => this.insertQueue.shift() ?? new QueryChain())
  update = mock((_schema: unknown) => this.updateQueue.shift() ?? new QueryChain())
  delete = mock((_schema: unknown) => this.deleteQueue.shift() ?? new QueryChain())
}

function createFakeDb(): FakeDb {
  return new FakeDb()
}

function rows(value: unknown[]): QueryChain {
  const chain = new QueryChain()
  chain.outcome = { value }
  return chain
}

function failing(error: Error): QueryChain {
  const chain = new QueryChain()
  chain.outcome = { error }
  return chain
}

function whereParams(chain: QueryChain): unknown[] {
  const condition = chain.where.mock.calls[0]?.[0]

  if (!condition) return []

  return dialect.sqlToQuery(condition).params
}

async function captureRejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
    throw new Error('Expected promise to reject')
  } catch (error) {
    return error as Error
  }
}

function makePost(overrides: Record<string, unknown> = {}) {
  return {
    id: TARGET_ID,
    authorId: OTHER_USER_ID,
    likesCount: 0,
    ...overrides,
  }
}

function makeComment(overrides: Record<string, unknown> = {}) {
  return {
    id: TARGET_ID,
    userId: OTHER_USER_ID,
    postId: 'post-1',
    likesCount: 0,
    ...overrides,
  }
}

function makeReply(overrides: Record<string, unknown> = {}) {
  return {
    id: TARGET_ID,
    userId: OTHER_USER_ID,
    commentId: 'comment-1',
    likesCount: 0,
    ...overrides,
  }
}

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    firstName: 'Zen',
    lastName: 'Allaham',
    ...overrides,
  }
}

function makeLike(overrides: Record<string, unknown> = {}) {
  return {
    id: LIKE_ID,
    userId: USER_ID,
    postId: TARGET_ID,
    commentId: null,
    replyId: null,
    createdAt: new Date('2026-01-01T10:00:00.000Z'),
    updatedAt: new Date('2026-01-01T10:00:00.000Z'),
    ...overrides,
  }
}

function makeDependencies() {
  return {
    notificationsService: {
      create: mock(
        async (_payload: {
          senderId: string
          receiverId: string
          targetId: string
          type: NotificationType
          message: string
          link: string
        }) => undefined,
      ),
    },
  }
}

describe('LikesService', () => {
  let db: FakeDb
  let dependencies: ReturnType<typeof makeDependencies>
  let service: LikesServiceType

  beforeEach(() => {
    db = createFakeDb()
    dependencies = makeDependencies()

    dependencies.notificationsService.create.mockReset()
    dependencies.notificationsService.create.mockImplementation(async () => undefined)

    service = new LikesService(
      { connection: db } as unknown as Database,
      dependencies.notificationsService as unknown as NotificationsService,
    )
  })

  describe('toggle', () => {
    describe('validation', () => {
      test('throws BadRequest when target type is empty', async () => {
        const error = await captureRejection(service.toggle(USER_ID, '', TARGET_ID))

        expect(error).toBeInstanceOf(BadRequestException)
        expect(db.select).not.toHaveBeenCalled()
      })

      test('throws BadRequest when target type is invalid', async () => {
        const error = await captureRejection(service.toggle(USER_ID, 'user', TARGET_ID))

        expect(error).toBeInstanceOf(BadRequestException)
        expect(db.select).not.toHaveBeenCalled()
      })

      test('throws NotFound when post does not exist', async () => {
        db.selectQueue.push(rows([]))

        const error = await captureRejection(service.toggle(USER_ID, 'post', TARGET_ID))

        expect(error).toBeInstanceOf(NotFoundException)
        expect(db.select).toHaveBeenCalledTimes(1)
      })

      test('throws NotFound when comment does not exist', async () => {
        db.selectQueue.push(rows([]))

        const error = await captureRejection(service.toggle(USER_ID, 'comment', TARGET_ID))

        expect(error).toBeInstanceOf(NotFoundException)
      })

      test('throws NotFound when reply does not exist', async () => {
        db.selectQueue.push(rows([]))

        const error = await captureRejection(service.toggle(USER_ID, 'reply', TARGET_ID))

        expect(error).toBeInstanceOf(NotFoundException)
      })

      test('propagates target lookup errors', async () => {
        const expectedError = new Error('Target query failed')
        db.selectQueue.push(failing(expectedError))

        const error = await captureRejection(service.toggle(USER_ID, 'post', TARGET_ID))

        expect(error).toBe(expectedError)
      })

      test('throws Unauthorized when user does not exist', async () => {
        db.selectQueue.push(rows([makePost()]), rows([]))

        const error = await captureRejection(service.toggle(USER_ID, 'post', TARGET_ID))

        expect(error).toBeInstanceOf(UnauthorizedException)
        expect(db.select).toHaveBeenCalledTimes(2)
      })

      test('propagates user lookup errors', async () => {
        const expectedError = new Error('User query failed')
        db.selectQueue.push(rows([makePost()]), failing(expectedError))

        const error = await captureRejection(service.toggle(USER_ID, 'post', TARGET_ID))

        expect(error).toBe(expectedError)
      })
    })

    describe('removing a like', () => {
      test('removes an existing post like and decrements the count', async () => {
        const deleteChain = rows([])
        const updateChain = rows([])

        db.selectQueue.push(rows([makePost()]), rows([makeUser()]), rows([makeLike()]))
        db.deleteQueue.push(deleteChain)
        db.updateQueue.push(updateChain)

        const result = await service.toggle(USER_ID, 'post', TARGET_ID)

        expect(result).toEqual({
          success: true,
          message: 'Like removed successfully',
          data: { isLiked: false },
        })

        expect(db.delete).toHaveBeenCalledWith(LikeSchema)
        expect(whereParams(deleteChain)).toContain(LIKE_ID)

        expect(db.update).toHaveBeenCalledWith(PostSchema)
        expect(updateChain.set).toHaveBeenCalledTimes(1)
        expect(whereParams(updateChain)).toContain(TARGET_ID)

        expect(dependencies.notificationsService.create).not.toHaveBeenCalled()
      })

      test('removes an existing comment like', async () => {
        const deleteChain = rows([])
        const updateChain = rows([])

        db.selectQueue.push(
          rows([makeComment()]),
          rows([makeUser()]),
          rows([makeLike({ postId: null, commentId: TARGET_ID })]),
        )
        db.deleteQueue.push(deleteChain)
        db.updateQueue.push(updateChain)

        const result = await service.toggle(USER_ID, 'comment', TARGET_ID)

        expect(result.data).toEqual({ isLiked: false })
        expect(db.update).toHaveBeenCalledWith(CommentSchema)
        expect(whereParams(updateChain)).toContain(TARGET_ID)
      })

      test('removes an existing reply like', async () => {
        const deleteChain = rows([])
        const updateChain = rows([])

        db.selectQueue.push(
          rows([makeReply()]),
          rows([makeUser()]),
          rows([makeLike({ postId: null, replyId: TARGET_ID })]),
        )
        db.deleteQueue.push(deleteChain)
        db.updateQueue.push(updateChain)

        const result = await service.toggle(USER_ID, 'reply', TARGET_ID)

        expect(result.data).toEqual({ isLiked: false })
        expect(db.update).toHaveBeenCalledWith(ReplySchema)
        expect(whereParams(updateChain)).toContain(TARGET_ID)
      })

      test('does not create a notification when removing a like', async () => {
        db.selectQueue.push(rows([makePost()]), rows([makeUser()]), rows([makeLike()]))
        db.deleteQueue.push(rows([]))
        db.updateQueue.push(rows([]))

        await service.toggle(USER_ID, 'post', TARGET_ID)

        expect(dependencies.notificationsService.create).not.toHaveBeenCalled()
      })
    })

    describe('adding a like', () => {
      test('creates a post like and increments likesCount', async () => {
        const insertChain = rows([])
        const updateChain = rows([{ likesCount: 2 }])

        db.selectQueue.push(rows([makePost()]), rows([makeUser()]), rows([]))
        db.insertQueue.push(insertChain)
        db.updateQueue.push(updateChain)

        const result = await service.toggle(USER_ID, 'post', TARGET_ID)

        expect(result).toEqual({
          success: true,
          message: 'Liked successfully',
          data: { isLiked: true },
        })

        expect(db.insert).toHaveBeenCalledWith(LikeSchema)
        expect(insertChain.values).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: USER_ID,
            postId: TARGET_ID,
            commentId: null,
            replyId: null,
          }),
        )

        expect(db.update).toHaveBeenCalledWith(PostSchema)
        expect(updateChain.set).toHaveBeenCalledTimes(1)
        expect(whereParams(updateChain)).toContain(TARGET_ID)
      })

      test('creates a comment like with the correct target field', async () => {
        const insertChain = rows([])
        const updateChain = rows([{ likesCount: 2 }])

        db.selectQueue.push(rows([makeComment()]), rows([makeUser()]), rows([]))
        db.insertQueue.push(insertChain)
        db.updateQueue.push(updateChain)

        const result = await service.toggle(USER_ID, 'comment', TARGET_ID)

        expect(result.data).toEqual({ isLiked: true })
        expect(db.update).toHaveBeenCalledWith(CommentSchema)
        expect(insertChain.values).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: USER_ID,
            postId: null,
            commentId: TARGET_ID,
            replyId: null,
          }),
        )
      })

      test('creates a reply like with the correct target field', async () => {
        const insertChain = rows([])
        const updateChain = rows([{ likesCount: 2 }])

        db.selectQueue.push(rows([makeReply()]), rows([makeUser()]), rows([]))
        db.insertQueue.push(insertChain)
        db.updateQueue.push(updateChain)

        const result = await service.toggle(USER_ID, 'reply', TARGET_ID)

        expect(result.data).toEqual({ isLiked: true })
        expect(db.update).toHaveBeenCalledWith(ReplySchema)
        expect(insertChain.values).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: USER_ID,
            postId: null,
            commentId: null,
            replyId: TARGET_ID,
          }),
        )
      })

      test('does not notify when the user likes their own post', async () => {
        const insertChain = rows([])
        const updateChain = rows([{ likesCount: 1 }])

        db.selectQueue.push(rows([makePost({ authorId: USER_ID })]), rows([makeUser()]), rows([]))
        db.insertQueue.push(insertChain)
        db.updateQueue.push(updateChain)

        await service.toggle(USER_ID, 'post', TARGET_ID)

        expect(dependencies.notificationsService.create).not.toHaveBeenCalled()
      })

      test('does not notify when the user likes their own comment', async () => {
        const insertChain = rows([])
        const updateChain = rows([{ likesCount: 1 }])

        db.selectQueue.push(rows([makeComment({ userId: USER_ID })]), rows([makeUser()]), rows([]))
        db.insertQueue.push(insertChain)
        db.updateQueue.push(updateChain)

        await service.toggle(USER_ID, 'comment', TARGET_ID)

        expect(dependencies.notificationsService.create).not.toHaveBeenCalled()
      })

      test('does not notify when the user likes their own reply', async () => {
        const insertChain = rows([])
        const updateChain = rows([{ likesCount: 1 }])

        db.selectQueue.push(rows([makeReply({ userId: USER_ID })]), rows([makeUser()]), rows([]))
        db.insertQueue.push(insertChain)
        db.updateQueue.push(updateChain)

        await service.toggle(USER_ID, 'reply', TARGET_ID)

        expect(dependencies.notificationsService.create).not.toHaveBeenCalled()
      })

      test('creates a notification for the first like on another user post', async () => {
        const insertChain = rows([])
        const updateChain = rows([{ likesCount: 1 }])

        db.selectQueue.push(rows([makePost()]), rows([makeUser()]), rows([]))
        db.insertQueue.push(insertChain)
        db.updateQueue.push(updateChain)

        await service.toggle(USER_ID, 'post', TARGET_ID)

        expect(dependencies.notificationsService.create).toHaveBeenCalledWith({
          senderId: USER_ID,
          receiverId: OTHER_USER_ID,
          targetId: TARGET_ID,
          type: NotificationType.LIKE,
          message: 'Zen Allaham liked your post.',
          link: '/notifications',
        })
      })

      test('creates a notification for the first like on another user comment', async () => {
        const insertChain = rows([])
        const updateChain = rows([{ likesCount: 1 }])

        db.selectQueue.push(rows([makeComment()]), rows([makeUser()]), rows([]))
        db.insertQueue.push(insertChain)
        db.updateQueue.push(updateChain)

        await service.toggle(USER_ID, 'comment', TARGET_ID)

        expect(dependencies.notificationsService.create).toHaveBeenCalledWith(
          expect.objectContaining({
            receiverId: OTHER_USER_ID,
            message: 'Zen Allaham liked your comment.',
            type: NotificationType.LIKE,
          }),
        )
      })

      test('creates a notification for the first like on another user reply', async () => {
        const insertChain = rows([])
        const updateChain = rows([{ likesCount: 1 }])

        db.selectQueue.push(rows([makeReply()]), rows([makeUser()]), rows([]))
        db.insertQueue.push(insertChain)
        db.updateQueue.push(updateChain)

        await service.toggle(USER_ID, 'reply', TARGET_ID)

        expect(dependencies.notificationsService.create).toHaveBeenCalledWith(
          expect.objectContaining({
            receiverId: OTHER_USER_ID,
            message: 'Zen Allaham liked your reply.',
            type: NotificationType.LIKE,
          }),
        )
      })

      test('creates a milestone notification every 25 likes', async () => {
        const insertChain = rows([])
        const updateChain = rows([{ likesCount: 25 }])

        db.selectQueue.push(rows([makePost()]), rows([makeUser()]), rows([]))
        db.insertQueue.push(insertChain)
        db.updateQueue.push(updateChain)

        await service.toggle(USER_ID, 'post', TARGET_ID)

        expect(dependencies.notificationsService.create).toHaveBeenCalledWith({
          senderId: USER_ID,
          receiverId: OTHER_USER_ID,
          targetId: TARGET_ID,
          type: NotificationType.LIKE,
          message: 'Zen Allaham and 24 others liked your post.',
          link: '/notifications',
        })
      })

      test('does not create a notification for a non-milestone like', async () => {
        const insertChain = rows([])
        const updateChain = rows([{ likesCount: 7 }])

        db.selectQueue.push(rows([makePost()]), rows([makeUser()]), rows([]))
        db.insertQueue.push(insertChain)
        db.updateQueue.push(updateChain)

        await service.toggle(USER_ID, 'post', TARGET_ID)

        expect(dependencies.notificationsService.create).not.toHaveBeenCalled()
      })

      test('ignores notification errors without failing the like', async () => {
        const insertChain = rows([])
        const updateChain = rows([{ likesCount: 1 }])

        dependencies.notificationsService.create.mockRejectedValue(new Error('Notification failed'))

        db.selectQueue.push(rows([makePost()]), rows([makeUser()]), rows([]))
        db.insertQueue.push(insertChain)
        db.updateQueue.push(updateChain)

        const result = await service.toggle(USER_ID, 'post', TARGET_ID)

        expect(result.data).toEqual({ isLiked: true })
        expect(dependencies.notificationsService.create).toHaveBeenCalledTimes(1)
      })

      test('throws InternalServerError when the updated target is missing', async () => {
        const insertChain = rows([])
        const updateChain = rows([])

        db.selectQueue.push(rows([makePost()]), rows([makeUser()]), rows([]))
        db.insertQueue.push(insertChain)
        db.updateQueue.push(updateChain)

        const error = await captureRejection(service.toggle(USER_ID, 'post', TARGET_ID))

        expect(error).toBeInstanceOf(InternalServerErrorException)
      })

      test('propagates existing like lookup errors', async () => {
        const expectedError = new Error('Like lookup failed')

        db.selectQueue.push(rows([makePost()]), rows([makeUser()]), failing(expectedError))

        const error = await captureRejection(service.toggle(USER_ID, 'post', TARGET_ID))

        expect(error).toBe(expectedError)
      })

      test('propagates insert errors', async () => {
        const expectedError = new Error('Insert failed')

        db.selectQueue.push(rows([makePost()]), rows([makeUser()]), rows([]))
        db.insertQueue.push(failing(expectedError))

        const error = await captureRejection(service.toggle(USER_ID, 'post', TARGET_ID))

        expect(error).toBe(expectedError)
      })

      test('propagates update errors', async () => {
        const expectedError = new Error('Update failed')

        db.selectQueue.push(rows([makePost()]), rows([makeUser()]), rows([]))
        db.insertQueue.push(rows([]))
        db.updateQueue.push(failing(expectedError))

        const error = await captureRejection(service.toggle(USER_ID, 'post', TARGET_ID))

        expect(error).toBe(expectedError)
      })
    })
  })

  describe('findAll', () => {
    test('throws BadRequest when target type is empty', async () => {
      const error = await captureRejection(service.findAll(1, 50, 0, '', TARGET_ID))

      expect(error).toBeInstanceOf(BadRequestException)
      expect(db.select).not.toHaveBeenCalled()
    })

    test('throws BadRequest when target type is invalid', async () => {
      const error = await captureRejection(service.findAll(1, 50, 0, 'user', TARGET_ID))

      expect(error).toBeInstanceOf(BadRequestException)
      expect(db.select).not.toHaveBeenCalled()
    })

    test('returns post likes with pagination', async () => {
      const likesChain = rows([{ like: makeLike(), user: makeUser(), profile: null }])
      const countChain = rows([{ total: 1 }])

      db.selectQueue.push(likesChain, countChain)

      const result = await service.findAll(1, 10, 0, 'post', TARGET_ID)

      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(1)
      expect(result.pagination).toBeDefined()

      expect(likesChain.leftJoin).toHaveBeenCalledTimes(2)
      expect(likesChain.orderBy).toHaveBeenCalledTimes(1)
      expect(likesChain.limit).toHaveBeenCalledWith(10)
      expect(likesChain.offset).toHaveBeenCalledWith(0)

      expect(whereParams(likesChain)).toContain(TARGET_ID)
      expect(whereParams(countChain)).toContain(TARGET_ID)
    })

    test('uses the commentId field for comment likes', async () => {
      const likesChain = rows([])
      const countChain = rows([{ total: 0 }])

      db.selectQueue.push(likesChain, countChain)

      const result = await service.findAll(1, 10, 0, 'comment', TARGET_ID)

      expect(result.data).toEqual([])
      expect(whereParams(likesChain)).toContain(TARGET_ID)
      expect(whereParams(countChain)).toContain(TARGET_ID)
    })

    test('uses the replyId field for reply likes', async () => {
      const likesChain = rows([])
      const countChain = rows([{ total: 0 }])

      db.selectQueue.push(likesChain, countChain)

      const result = await service.findAll(1, 10, 0, 'reply', TARGET_ID)

      expect(result.data).toEqual([])
      expect(whereParams(likesChain)).toContain(TARGET_ID)
      expect(whereParams(countChain)).toContain(TARGET_ID)
    })

    test('uses default pagination arguments', async () => {
      const likesChain = rows([])
      const countChain = rows([{ total: 0 }])

      db.selectQueue.push(likesChain, countChain)

      await service.findAll(1, 50, 0, 'post', TARGET_ID)

      expect(likesChain.limit).toHaveBeenCalledWith(50)
      expect(likesChain.offset).toHaveBeenCalledWith(0)
    })

    test('returns zero total when count query returns no rows', async () => {
      db.selectQueue.push(rows([]), rows([]))

      const result = await service.findAll(1, 10, 0, 'post', TARGET_ID)

      expect(result.success).toBe(true)
      expect(result.data).toEqual([])
      expect(result.pagination).toBeDefined()
    })

    test('propagates likes query errors', async () => {
      const expectedError = new Error('Likes query failed')
      db.selectQueue.push(failing(expectedError))

      const error = await captureRejection(service.findAll(1, 10, 0, 'post', TARGET_ID))

      expect(error).toBe(expectedError)
    })

    test('propagates count query errors', async () => {
      const expectedError = new Error('Count query failed')
      db.selectQueue.push(rows([]), failing(expectedError))

      const error = await captureRejection(service.findAll(1, 10, 0, 'post', TARGET_ID))

      expect(error).toBe(expectedError)
    })
  })

  describe('findMe', () => {
    test('throws BadRequest when target type is empty', async () => {
      const error = await captureRejection(service.findMe(USER_ID, '', TARGET_ID))

      expect(error).toBeInstanceOf(BadRequestException)
      expect(db.select).not.toHaveBeenCalled()
    })

    test('throws BadRequest when target type is invalid', async () => {
      const error = await captureRejection(service.findMe(USER_ID, 'user', TARGET_ID))

      expect(error).toBeInstanceOf(BadRequestException)
      expect(db.select).not.toHaveBeenCalled()
    })

    test('returns only the current user likes for a post', async () => {
      const likesChain = rows([{ like: makeLike(), user: makeUser(), profile: null }])
      const countChain = rows([{ total: 1 }])

      db.selectQueue.push(likesChain, countChain)

      const result = await service.findMe(USER_ID, 'post', TARGET_ID)

      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(1)
      expect(result.pagination).toBeDefined()

      expect(likesChain.leftJoin).toHaveBeenCalledTimes(2)
      expect(likesChain.orderBy).toHaveBeenCalledTimes(1)
      expect(likesChain.limit).toHaveBeenCalledWith(50)
      expect(likesChain.offset).toHaveBeenCalledWith(0)

      expect(whereParams(likesChain)).toContain(TARGET_ID)
      expect(whereParams(likesChain)).toContain(USER_ID)
      expect(whereParams(countChain)).toContain(TARGET_ID)
      expect(whereParams(countChain)).toContain(USER_ID)
    })

    test('filters comment likes by userId and commentId', async () => {
      const likesChain = rows([])
      const countChain = rows([{ total: 0 }])

      db.selectQueue.push(likesChain, countChain)

      const result = await service.findMe(USER_ID, 'comment', TARGET_ID)

      expect(result.data).toEqual([])
      expect(whereParams(likesChain)).toContain(TARGET_ID)
      expect(whereParams(likesChain)).toContain(USER_ID)
      expect(whereParams(countChain)).toContain(TARGET_ID)
      expect(whereParams(countChain)).toContain(USER_ID)
    })

    test('filters reply likes by userId and replyId', async () => {
      const likesChain = rows([])
      const countChain = rows([{ total: 0 }])

      db.selectQueue.push(likesChain, countChain)

      const result = await service.findMe(USER_ID, 'reply', TARGET_ID)

      expect(result.data).toEqual([])
      expect(whereParams(likesChain)).toContain(TARGET_ID)
      expect(whereParams(likesChain)).toContain(USER_ID)
      expect(whereParams(countChain)).toContain(TARGET_ID)
      expect(whereParams(countChain)).toContain(USER_ID)
    })

    test('uses the supplied pagination values', async () => {
      const likesChain = rows([])
      const countChain = rows([{ total: 0 }])

      db.selectQueue.push(likesChain, countChain)

      await service.findMe(USER_ID, 'post', TARGET_ID, 3, 20, 40)

      expect(likesChain.limit).toHaveBeenCalledWith(20)
      expect(likesChain.offset).toHaveBeenCalledWith(40)
    })

    test('propagates likes query errors', async () => {
      const expectedError = new Error('Likes query failed')
      db.selectQueue.push(failing(expectedError))

      const error = await captureRejection(service.findMe(USER_ID, 'post', TARGET_ID))

      expect(error).toBe(expectedError)
    })

    test('propagates count query errors', async () => {
      const expectedError = new Error('Count query failed')
      db.selectQueue.push(rows([]), failing(expectedError))

      const error = await captureRejection(service.findMe(USER_ID, 'post', TARGET_ID))

      expect(error).toBe(expectedError)
    })
  })

  describe('count', () => {
    test('throws BadRequest when target type is empty', async () => {
      const error = await captureRejection(service.count('', TARGET_ID))

      expect(error).toBeInstanceOf(BadRequestException)
      expect(db.select).not.toHaveBeenCalled()
    })

    test('throws BadRequest when target type is invalid', async () => {
      const error = await captureRejection(service.count('user', TARGET_ID))

      expect(error).toBeInstanceOf(BadRequestException)
      expect(db.select).not.toHaveBeenCalled()
    })

    test('returns the post likes count', async () => {
      const targetChain = rows([{ id: TARGET_ID, likesCount: 12 }])
      db.selectQueue.push(targetChain)

      const result = await service.count('post', TARGET_ID)

      expect(result).toEqual({
        success: true,
        data: {
          targetType: 'post',
          targetId: TARGET_ID,
          likesCount: 12,
        },
      })

      expect(db.select).toHaveBeenCalledTimes(1)
      expect(targetChain.limit).toHaveBeenCalledWith(1)
      expect(whereParams(targetChain)).toContain(TARGET_ID)
    })

    test('returns the comment likes count', async () => {
      const targetChain = rows([{ id: TARGET_ID, likesCount: 5 }])
      db.selectQueue.push(targetChain)

      const result = await service.count('comment', TARGET_ID)

      expect(result.data).toEqual({
        targetType: 'comment',
        targetId: TARGET_ID,
        likesCount: 5,
      })

      expect(whereParams(targetChain)).toContain(TARGET_ID)
    })

    test('returns the reply likes count', async () => {
      const targetChain = rows([{ id: TARGET_ID, likesCount: 3 }])
      db.selectQueue.push(targetChain)

      const result = await service.count('reply', TARGET_ID)

      expect(result.data).toEqual({
        targetType: 'reply',
        targetId: TARGET_ID,
        likesCount: 3,
      })

      expect(whereParams(targetChain)).toContain(TARGET_ID)
    })

    test('throws NotFound when post does not exist', async () => {
      db.selectQueue.push(rows([]))

      const error = await captureRejection(service.count('post', TARGET_ID))

      expect(error).toBeInstanceOf(NotFoundException)
    })

    test('throws NotFound when comment does not exist', async () => {
      db.selectQueue.push(rows([]))

      const error = await captureRejection(service.count('comment', TARGET_ID))

      expect(error).toBeInstanceOf(NotFoundException)
    })

    test('throws NotFound when reply does not exist', async () => {
      db.selectQueue.push(rows([]))

      const error = await captureRejection(service.count('reply', TARGET_ID))

      expect(error).toBeInstanceOf(NotFoundException)
    })

    test('propagates database errors', async () => {
      const expectedError = new Error('Target query failed')
      db.selectQueue.push(failing(expectedError))

      const error = await captureRejection(service.count('post', TARGET_ID))

      expect(error).toBe(expectedError)
    })
  })

  describe('isLiked', () => {
    test('throws BadRequest when target type is empty', async () => {
      const error = await captureRejection(service.isLiked(USER_ID, '', TARGET_ID))

      expect(error).toBeInstanceOf(BadRequestException)
      expect(db.select).not.toHaveBeenCalled()
    })

    test('throws BadRequest when target type is invalid', async () => {
      const error = await captureRejection(service.isLiked(USER_ID, 'user', TARGET_ID))

      expect(error).toBeInstanceOf(BadRequestException)
      expect(db.select).not.toHaveBeenCalled()
    })

    test('returns true when the user has liked a post', async () => {
      const queryChain = rows([{ like: makeLike(), user: makeUser(), profile: null }])
      db.selectQueue.push(queryChain)

      const result = await service.isLiked(USER_ID, 'post', TARGET_ID)

      expect(result).toEqual({
        success: true,
        data: { isLiked: true },
      })

      expect(queryChain.leftJoin).toHaveBeenCalledTimes(2)
      expect(queryChain.limit).toHaveBeenCalledWith(1)
      expect(whereParams(queryChain)).toContain(USER_ID)
      expect(whereParams(queryChain)).toContain(TARGET_ID)
    })

    test('returns false when the user has not liked a post', async () => {
      db.selectQueue.push(rows([]))

      const result = await service.isLiked(USER_ID, 'post', TARGET_ID)

      expect(result).toEqual({
        success: true,
        data: { isLiked: false },
      })
    })

    test('checks comment likes using commentId', async () => {
      const queryChain = rows([])
      db.selectQueue.push(queryChain)

      const result = await service.isLiked(USER_ID, 'comment', TARGET_ID)

      expect(result.data).toEqual({ isLiked: false })
      expect(whereParams(queryChain)).toContain(USER_ID)
      expect(whereParams(queryChain)).toContain(TARGET_ID)
    })

    test('checks reply likes using replyId', async () => {
      const queryChain = rows([{ like: makeLike({ replyId: TARGET_ID }) }])
      db.selectQueue.push(queryChain)

      const result = await service.isLiked(USER_ID, 'reply', TARGET_ID)

      expect(result.data).toEqual({ isLiked: true })
      expect(whereParams(queryChain)).toContain(USER_ID)
      expect(whereParams(queryChain)).toContain(TARGET_ID)
    })

    test('propagates database errors', async () => {
      const expectedError = new Error('Like query failed')
      db.selectQueue.push(failing(expectedError))

      const error = await captureRejection(service.isLiked(USER_ID, 'post', TARGET_ID))

      expect(error).toBe(expectedError)
    })
  })
})
