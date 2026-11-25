import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { Database, database } from '../../../../config/db/drizzle'
import { buildPagination } from '../../../../utilities/pagination'
import { NotificationType } from '../../../notifications/schemas/enums/notification-type'
import type { NotificationsService } from '../../../notifications/notifications.service'
import { VisibilityStatus } from '../../schemas/enums/visibility-status'
import { PostRepostsService } from '../post-reposts.service'

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const USER_ID = 'USER_1'
const AUTHOR_ID = 'USER_2'
const POST_ID = 'POST_1'
const REPOST_ID = 'REPOST_1'

const dialect = new PgDialect()

type Outcome = { value: unknown } | { error: Error }

/* -------------------------------------------------------------------------- */
/* Query Chain                                                                */
/* -------------------------------------------------------------------------- */

class QueryChain implements PromiseLike<unknown> {
  outcome: Outcome = { value: [] }

  from = mock((_table?: unknown) => this)
  leftJoin = mock((_table?: unknown, _condition?: unknown) => this)
  where = mock((_condition?: unknown) => this)
  orderBy = mock((..._args: unknown[]) => this)
  limit = mock((_value?: number) => this)
  offset = mock((_value?: number) => this)
  values = mock((_value?: unknown) => this)
  set = mock((_value?: unknown) => this)
  returning = mock((_value?: unknown) => this)

  rows(value: unknown): this {
    this.outcome = { value }
    return this
  }

  failing(error: Error): this {
    this.outcome = { error }
    return this
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    if ('error' in this.outcome) {
      return Promise.reject(this.outcome.error).then(onfulfilled, onrejected)
    }

    return Promise.resolve(this.outcome.value).then(onfulfilled, onrejected)
  }
}

/* -------------------------------------------------------------------------- */
/* Fake Database                                                              */
/* -------------------------------------------------------------------------- */

type FakeDb = {
  selectQueue: QueryChain[]
  insertQueue: QueryChain[]
  updateQueue: QueryChain[]
  deleteQueue: QueryChain[]
  select: ReturnType<typeof mock>
  insert: ReturnType<typeof mock>
  update: ReturnType<typeof mock>
  delete: ReturnType<typeof mock>
  transaction: ReturnType<typeof mock>
}

const createFakeDb = (transactionDb?: FakeDb): FakeDb => {
  const db = {
    selectQueue: [] as QueryChain[],
    insertQueue: [] as QueryChain[],
    updateQueue: [] as QueryChain[],
    deleteQueue: [] as QueryChain[],
    select: mock(() => db.selectQueue.shift() ?? new QueryChain()),
    insert: mock(() => db.insertQueue.shift() ?? new QueryChain()),
    update: mock(() => db.updateQueue.shift() ?? new QueryChain()),
    delete: mock(() => db.deleteQueue.shift() ?? new QueryChain()),
    transaction: mock(async (callback: (tx: FakeDb) => Promise<unknown>) => {
      try {
        return await callback(transactionDb ?? db)
      } catch (error) {
        return { error: error as Error }
      }
    }),
  }

  return db
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const rows = (value: unknown): QueryChain => new QueryChain().rows(value)

const failing = (error: Error): QueryChain => new QueryChain().failing(error)

const whereParams = (chain: QueryChain): unknown[] => {
  const condition = chain.where.mock.calls[0]?.[0] as SQL | undefined

  if (!condition) return []

  return dialect.sqlToQuery(condition).params
}

const captureRejection = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise
    return undefined
  } catch (error) {
    return error
  }
}

const makePostRow = (overrides: Record<string, unknown> = {}) => ({
  id: POST_ID,
  content: 'Test post content',
  images: null,
  authorId: AUTHOR_ID,
  visibility: VisibilityStatus.PUBLIC,
  viewsCount: 0,
  likesCount: 0,
  commentsCount: 0,
  repostsCount: 0,
  bookmarksCount: 0,
  quotesCount: 0,
  isEdited: false,
  isPin: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
})

const makeRepostRow = (overrides: Record<string, unknown> = {}) => ({
  id: REPOST_ID,
  postId: POST_ID,
  repostedByUserId: USER_ID,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
})

const makeUserRow = (overrides: Record<string, unknown> = {}) => ({
  id: USER_ID,
  firstName: 'Zen',
  lastName: 'Allaham',
  ...overrides,
})

const OTHER_USER_ID = 'other-user-id'

const makeJoinedRepostRow = (overrides: Record<string, unknown> = {}) => ({
  repost: makeRepostRow(),
  post: makePostRow(),
  author: {
    id: AUTHOR_ID,
    username: 'author',
  },
  profile: {
    id: 'profile-id',
    userId: OTHER_USER_ID,
    avatar: null,
    cover: null,
    bio: 'Test bio',
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
  },
  ...overrides,
})

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

let db: FakeDb
let transactionDb: FakeDb
let notificationsService: {
  create: ReturnType<typeof mock>
}
let service: PostRepostsService

beforeEach(() => {
  transactionDb = createFakeDb()
  db = createFakeDb(transactionDb)

  notificationsService = {
    create: mock(() => Promise.resolve(undefined)),
  }

  service = new PostRepostsService(
    { connection: db } as unknown as Database,
    notificationsService as unknown as NotificationsService,
  )
})

/* -------------------------------------------------------------------------- */
/* attach                                                                     */
/* -------------------------------------------------------------------------- */

describe('PostRepostsService.attach', () => {
  test('creates a repost relation when it does not exist', async () => {
    db.selectQueue.push(rows([]))
    db.insertQueue.push(rows([]))

    const result = await service.attach(POST_ID, USER_ID)

    expect(result).toBe(true)

    expect(db.select).toHaveBeenCalledTimes(1)
    expect(db.insert).toHaveBeenCalledTimes(1)
    expect(db.insertQueue).toHaveLength(0)
  })

  test('does not create a duplicate repost relation', async () => {
    db.selectQueue.push(rows([{ id: REPOST_ID }]))

    const result = await service.attach(POST_ID, USER_ID)

    expect(result).toBe(false)

    expect(db.select).toHaveBeenCalledTimes(1)
    expect(db.insert).not.toHaveBeenCalled()
  })

  test('checks the correct post and user IDs', async () => {
    const selectChain = rows([])
    db.selectQueue.push(selectChain)
    db.insertQueue.push(rows([]))

    await service.attach(POST_ID, USER_ID)

    expect(whereParams(selectChain)).toEqual([POST_ID, USER_ID])
  })

  test('inserts the correct repost relation values', async () => {
    const insertChain = rows([])

    db.selectQueue.push(rows([]))
    db.insertQueue.push(insertChain)

    await service.attach(POST_ID, USER_ID)

    expect(insertChain.values).toHaveBeenCalledTimes(1)

    const values = insertChain.values.mock.calls[0]?.[0] as Record<string, unknown> | undefined

    expect(values).toMatchObject({
      postId: POST_ID,
      repostedByUserId: USER_ID,
    })

    expect(values?.createdAt).toBeInstanceOf(Date)
    expect(values?.updatedAt).toBeInstanceOf(Date)
  })

  test('uses the provided transaction instead of the main database', async () => {
    const transaction = createFakeDb()

    transaction.selectQueue.push(rows([]))
    transaction.insertQueue.push(rows([]))

    await service.attach(POST_ID, USER_ID, transaction as never)

    expect(transaction.select).toHaveBeenCalledTimes(1)
    expect(transaction.insert).toHaveBeenCalledTimes(1)

    expect(db.select).not.toHaveBeenCalled()
    expect(db.insert).not.toHaveBeenCalled()
  })

  test('propagates select database errors', async () => {
    const error = new Error('Select failed')

    db.selectQueue.push(failing(error))

    const result = await captureRejection(service.attach(POST_ID, USER_ID))

    expect(result).toBe(error)
    expect(db.insert).not.toHaveBeenCalled()
  })

  test('propagates insert database errors', async () => {
    const error = new Error('Insert failed')

    db.selectQueue.push(rows([]))
    db.insertQueue.push(failing(error))

    const result = await captureRejection(service.attach(POST_ID, USER_ID))

    expect(result).toBe(error)
  })
})

describe('PostRepostsService.detachAll', () => {
  test('deletes all repost relations for a post', async () => {
    const deleteChain = rows([{ id: 'REPOST_1' }, { id: 'REPOST_2' }, { id: 'REPOST_3' }])

    db.deleteQueue.push(deleteChain)

    const result = await service.detachAll(POST_ID)

    expect(result).toBe(3)

    expect(db.delete).toHaveBeenCalledTimes(1)
    expect(deleteChain.returning).toHaveBeenCalledTimes(1)
  })

  test('returns zero when no repost relations exist', async () => {
    db.deleteQueue.push(rows([]))

    const result = await service.detachAll(POST_ID)

    expect(result).toBe(0)
  })

  test('filters by the correct post ID', async () => {
    const deleteChain = rows([])

    db.deleteQueue.push(deleteChain)

    await service.detachAll(POST_ID)

    expect(whereParams(deleteChain)).toEqual([POST_ID])
  })

  test('returns the number of deleted rows', async () => {
    db.deleteQueue.push(rows([{ id: 'R1' }, { id: 'R2' }]))

    const result = await service.detachAll(POST_ID)

    expect(result).toBe(2)
  })

  test('uses the provided transaction', async () => {
    const transaction = createFakeDb()

    transaction.deleteQueue.push(rows([{ id: REPOST_ID }]))

    const result = await service.detachAll(POST_ID, transaction as never)

    expect(result).toBe(1)
    expect(transaction.delete).toHaveBeenCalledTimes(1)
    expect(db.delete).not.toHaveBeenCalled()
  })

  test('propagates delete database errors', async () => {
    const error = new Error('Delete failed')

    db.deleteQueue.push(failing(error))

    const result = await captureRejection(service.detachAll(POST_ID))

    expect(result).toBe(error)
  })
})

/* -------------------------------------------------------------------------- */
/* repost                                                                     */
/* -------------------------------------------------------------------------- */

describe('PostRepostsService.repost', () => {
  test('reposts a public post successfully', async () => {
    transactionDb.selectQueue.push(rows([makePostRow()]), rows([]))

    transactionDb.insertQueue.push(rows([]))
    transactionDb.updateQueue.push(rows([]))

    db.selectQueue.push(rows([makeUserRow()]))

    const result = await service.repost(USER_ID, POST_ID)

    expect(result).toEqual({
      success: true,
      message: 'Post reposted successfully',
    })

    expect(db.transaction).toHaveBeenCalledTimes(1)
    expect(transactionDb.insert).toHaveBeenCalledTimes(1)
    expect(transactionDb.update).toHaveBeenCalledTimes(1)
  })

  test('returns an error when the original post does not exist', async () => {
    transactionDb.selectQueue.push(rows([]))

    const result = await service.repost(USER_ID, POST_ID)

    expect(result).toHaveProperty('error')
    expect(result).toHaveProperty('error.message', 'Post not found')

    expect(transactionDb.insert).not.toHaveBeenCalled()
    expect(transactionDb.update).not.toHaveBeenCalled()
  })

  test('does not allow reposting a private post by another user', async () => {
    transactionDb.selectQueue.push(
      rows([
        makePostRow({
          visibility: VisibilityStatus.PRIVATE,
        }),
      ]),
    )

    const result = await service.repost(USER_ID, POST_ID)

    expect(result).toHaveProperty('error')
    expect(result).toHaveProperty('error.message', 'You are not allowed to repost this post')

    expect(transactionDb.insert).not.toHaveBeenCalled()
    expect(transactionDb.update).not.toHaveBeenCalled()
  })

  test('allows the author to repost their own private post', async () => {
    transactionDb.selectQueue.push(
      rows([
        makePostRow({
          authorId: USER_ID,
          visibility: VisibilityStatus.PRIVATE,
        }),
      ]),
      rows([]),
    )

    transactionDb.insertQueue.push(rows([]))
    transactionDb.updateQueue.push(rows([]))

    db.selectQueue.push(rows([makeUserRow()]))

    const result = await service.repost(USER_ID, POST_ID)

    expect(result).toEqual({
      success: true,
      message: 'Post reposted successfully',
    })
  })

  test('does not allow reposting a followers-only post without following the author', async () => {
    transactionDb.selectQueue.push(
      rows([
        makePostRow({
          visibility: VisibilityStatus.FOLLOWERS,
        }),
      ]),
      rows([]),
    )

    const result = await service.repost(USER_ID, POST_ID)

    expect(result).toHaveProperty('error')
    expect(result).toHaveProperty('error.message', 'You are not allowed to repost this post')

    expect(transactionDb.insert).not.toHaveBeenCalled()
  })

  test('allows reposting a followers-only post when the user follows the author', async () => {
    transactionDb.selectQueue.push(
      rows([
        makePostRow({
          visibility: VisibilityStatus.FOLLOWERS,
        }),
      ]),
      rows([{ id: 'FOLLOW_1' }]),
      rows([]),
    )

    transactionDb.insertQueue.push(rows([]))
    transactionDb.updateQueue.push(rows([]))

    db.selectQueue.push(rows([makeUserRow()]))

    const result = await service.repost(USER_ID, POST_ID)

    expect(result).toEqual({
      success: true,
      message: 'Post reposted successfully',
    })
  })

  test('allows the author to repost their own followers-only post', async () => {
    transactionDb.selectQueue.push(
      rows([
        makePostRow({
          authorId: USER_ID,
          visibility: VisibilityStatus.FOLLOWERS,
        }),
      ]),
      rows([]),
    )

    transactionDb.insertQueue.push(rows([]))
    transactionDb.updateQueue.push(rows([]))

    db.selectQueue.push(rows([makeUserRow()]))

    const result = await service.repost(USER_ID, POST_ID)

    expect(result).toEqual({
      success: true,
      message: 'Post reposted successfully',
    })
  })

  test('returns a conflict when the post is already reposted', async () => {
    transactionDb.selectQueue.push(rows([makePostRow()]), rows([{ id: REPOST_ID }]))

    const result = await service.repost(USER_ID, POST_ID)

    expect(result).toHaveProperty('error')
    expect(result).toHaveProperty('error.message', 'You have already reposted this post')

    expect(transactionDb.insert).not.toHaveBeenCalled()
    expect(transactionDb.update).not.toHaveBeenCalled()
  })

  test('increments the original post reposts count', async () => {
    transactionDb.selectQueue.push(rows([makePostRow()]), rows([]))

    transactionDb.insertQueue.push(rows([]))

    const updateChain = rows([])
    transactionDb.updateQueue.push(updateChain)

    db.selectQueue.push(rows([makeUserRow()]))

    await service.repost(USER_ID, POST_ID)

    expect(transactionDb.update).toHaveBeenCalledTimes(1)
    expect(updateChain.set).toHaveBeenCalledTimes(1)

    const values = updateChain.set.mock.calls[0]?.[0] as Record<string, unknown> | undefined

    expect(values?.repostsCount).toBeDefined()

    const updateSql = dialect.sqlToQuery(values?.repostsCount as SQL)

    expect(updateSql.sql).toContain('+ 1')
  })

  test('updates the correct original post', async () => {
    transactionDb.selectQueue.push(rows([makePostRow()]), rows([]))

    transactionDb.insertQueue.push(rows([]))

    const updateChain = rows([])
    transactionDb.updateQueue.push(updateChain)

    db.selectQueue.push(rows([makeUserRow()]))

    await service.repost(USER_ID, POST_ID)

    expect(whereParams(updateChain)).toEqual([POST_ID])
  })

  test('sends a notification to the original author', async () => {
    transactionDb.selectQueue.push(rows([makePostRow()]), rows([]))

    transactionDb.insertQueue.push(rows([]))
    transactionDb.updateQueue.push(rows([]))

    db.selectQueue.push(rows([makeUserRow()]))

    await service.repost(USER_ID, POST_ID)

    expect(notificationsService.create).toHaveBeenCalledTimes(1)

    expect(notificationsService.create).toHaveBeenCalledWith({
      senderId: USER_ID,
      receiverId: AUTHOR_ID,
      targetId: POST_ID,
      type: NotificationType.REPOST,
      message: 'Zen Allaham reposted your post.',
      link: `/posts/${POST_ID}`,
    })
  })

  test('does not notify when the user reposts their own post', async () => {
    transactionDb.selectQueue.push(
      rows([
        makePostRow({
          authorId: USER_ID,
        }),
      ]),
      rows([]),
    )

    transactionDb.insertQueue.push(rows([]))
    transactionDb.updateQueue.push(rows([]))

    db.selectQueue.push(rows([makeUserRow()]))

    await service.repost(USER_ID, POST_ID)

    expect(notificationsService.create).not.toHaveBeenCalled()
  })

  test('does not send a notification when the sender user does not exist', async () => {
    transactionDb.selectQueue.push(rows([makePostRow()]), rows([]))

    transactionDb.insertQueue.push(rows([]))
    transactionDb.updateQueue.push(rows([]))

    db.selectQueue.push(rows([]))

    const result = await service.repost(USER_ID, POST_ID)

    expect(result).toEqual({
      success: true,
      message: 'Post reposted successfully',
    })

    expect(notificationsService.create).not.toHaveBeenCalled()
  })

  test('does not fail the repost when notification creation fails', async () => {
    transactionDb.selectQueue.push(rows([makePostRow()]), rows([]))

    transactionDb.insertQueue.push(rows([]))
    transactionDb.updateQueue.push(rows([]))

    db.selectQueue.push(rows([makeUserRow()]))

    notificationsService.create.mockRejectedValueOnce(new Error('Notification failed'))

    const result = await service.repost(USER_ID, POST_ID)

    expect(result).toEqual({
      success: true,
      message: 'Post reposted successfully',
    })
  })

  test('does not send a notification when the transaction returns an error', async () => {
    db.transaction.mockResolvedValueOnce({
      error: new Error('Transaction failed'),
    })

    const result = await service.repost(USER_ID, POST_ID)

    expect(result).toHaveProperty('error')
    expect(db.select).not.toHaveBeenCalled()
    expect(notificationsService.create).not.toHaveBeenCalled()
  })
})

/* -------------------------------------------------------------------------- */
/* findByUserId                                                               */
/* -------------------------------------------------------------------------- */

describe('PostRepostsService.findByUserId', () => {
  test('returns reposts with their related post, author and profile', async () => {
    const repost = makeJoinedRepostRow()

    db.selectQueue.push(rows([repost]), rows([{ total: 1 }]))

    const result = await service.findByUserId(USER_ID)

    expect(result).toEqual({
      success: true,
      data: [
        {
          repost: repost.repost,
          post: {
            post: repost.post,
            author: repost.author,
            profile: repost.profile,
          },
        },
      ],
      pagination: buildPagination(1, 1, 10),
    })
  })

  test('returns null post when the related post does not exist', async () => {
    const repost = makeJoinedRepostRow({
      post: null,
      author: null,
      profile: null,
    })

    db.selectQueue.push(rows([repost]), rows([{ total: 1 }]))

    const result = await service.findByUserId(USER_ID)

    expect(result.data).toEqual([
      {
        repost: repost.repost,
        post: null,
      },
    ])
  })

  test('returns an empty list when the user has no reposts', async () => {
    db.selectQueue.push(rows([]), rows([{ total: 0 }]))

    const result = await service.findByUserId(USER_ID)

    expect(result).toEqual({
      success: true,
      data: [],
      pagination: buildPagination(0, 1, 10),
    })
  })

  test('uses the correct user ID in both queries', async () => {
    const repostChain = rows([])
    const countChain = rows([{ total: 0 }])

    db.selectQueue.push(repostChain, countChain)

    await service.findByUserId(USER_ID)

    expect(whereParams(repostChain)).toEqual([USER_ID])
    expect(whereParams(countChain)).toEqual([USER_ID])
  })

  test('applies the requested limit and offset', async () => {
    const repostChain = rows([])

    db.selectQueue.push(repostChain, rows([{ total: 25 }]))

    await service.findByUserId(USER_ID, 3, 5, 10)

    expect(repostChain.limit).toHaveBeenCalledWith(5)
    expect(repostChain.offset).toHaveBeenCalledWith(10)
  })

  test('uses default pagination values', async () => {
    const repostChain = rows([])

    db.selectQueue.push(repostChain, rows([{ total: 0 }]))

    await service.findByUserId(USER_ID)

    expect(repostChain.limit).toHaveBeenCalledWith(10)
    expect(repostChain.offset).toHaveBeenCalledWith(0)
  })

  test('orders reposts by creation date descending', async () => {
    const repostChain = rows([])

    db.selectQueue.push(repostChain, rows([{ total: 0 }]))

    await service.findByUserId(USER_ID)

    expect(repostChain.orderBy).toHaveBeenCalledTimes(1)
    expect(repostChain.orderBy.mock.calls[0]).toHaveLength(1)
  })

  test('returns pagination based on the total count', async () => {
    db.selectQueue.push(rows([]), rows([{ total: 35 }]))

    const result = await service.findByUserId(USER_ID, 2, 10, 10)

    expect(result.pagination).toEqual(buildPagination(35, 2, 10))
  })

  test('uses zero as total when the count query returns no rows', async () => {
    db.selectQueue.push(rows([]), rows([]))

    const result = await service.findByUserId(USER_ID)

    expect(result.pagination).toEqual(buildPagination(0, 1, 10))
  })

  test('propagates repost query errors', async () => {
    const error = new Error('Repost query failed')

    db.selectQueue.push(failing(error))

    const result = await captureRejection(service.findByUserId(USER_ID))

    expect(result).toBe(error)
  })

  test('propagates count query errors', async () => {
    const error = new Error('Count query failed')

    db.selectQueue.push(rows([]), failing(error))

    const result = await captureRejection(service.findByUserId(USER_ID))

    expect(result).toBe(error)
  })
})

/* -------------------------------------------------------------------------- */
/* findMe                                                                     */
/* -------------------------------------------------------------------------- */

describe('PostRepostsService.findMe', () => {
  test('returns the current user reposts with related data', async () => {
    const repost = makeJoinedRepostRow()

    db.selectQueue.push(rows([repost]), rows([{ total: 1 }]))

    const result = await service.findMe(USER_ID)

    expect(result).toEqual({
      success: true,
      data: [
        {
          repost: repost.repost,
          post: {
            post: repost.post,
            author: repost.author,
            profile: repost.profile,
          },
        },
      ],
      pagination: buildPagination(1, 1, 10),
    })
  })

  test('returns null post when the related post does not exist', async () => {
    const repost = makeJoinedRepostRow({
      post: null,
      author: null,
      profile: null,
    })

    db.selectQueue.push(rows([repost]), rows([{ total: 1 }]))

    const result = await service.findMe(USER_ID)

    expect(result.data).toEqual([
      {
        repost: repost.repost,
        post: null,
      },
    ])
  })

  test('returns an empty list when no reposts exist', async () => {
    db.selectQueue.push(rows([]), rows([{ total: 0 }]))

    const result = await service.findMe(USER_ID)

    expect(result).toEqual({
      success: true,
      data: [],
      pagination: buildPagination(0, 1, 10),
    })
  })

  test('filters both queries by the current user ID', async () => {
    const repostChain = rows([])
    const countChain = rows([{ total: 0 }])

    db.selectQueue.push(repostChain, countChain)

    await service.findMe(USER_ID)

    expect(whereParams(repostChain)).toEqual([USER_ID])
    expect(whereParams(countChain)).toEqual([USER_ID])
  })

  test('applies the requested limit and offset', async () => {
    const repostChain = rows([])

    db.selectQueue.push(repostChain, rows([{ total: 20 }]))

    await service.findMe(USER_ID, 2, 5, 5)

    expect(repostChain.limit).toHaveBeenCalledWith(5)
    expect(repostChain.offset).toHaveBeenCalledWith(5)
  })

  test('uses default pagination values', async () => {
    const repostChain = rows([])

    db.selectQueue.push(repostChain, rows([{ total: 0 }]))

    await service.findMe(USER_ID)

    expect(repostChain.limit).toHaveBeenCalledWith(10)
    expect(repostChain.offset).toHaveBeenCalledWith(0)
  })

  test('returns pagination based on the total count', async () => {
    db.selectQueue.push(rows([]), rows([{ total: 42 }]))

    const result = await service.findMe(USER_ID, 3, 10, 20)

    expect(result.pagination).toEqual(buildPagination(42, 3, 10))
  })

  test('uses zero as total when the count query returns no rows', async () => {
    db.selectQueue.push(rows([]), rows([]))

    const result = await service.findMe(USER_ID)

    expect(result.pagination).toEqual(buildPagination(0, 1, 10))
  })

  test('propagates repost query errors', async () => {
    const error = new Error('Repost query failed')

    db.selectQueue.push(failing(error))

    const result = await captureRejection(service.findMe(USER_ID))

    expect(result).toBe(error)
  })

  test('propagates count query errors', async () => {
    const error = new Error('Count query failed')

    db.selectQueue.push(rows([]), failing(error))

    const result = await captureRejection(service.findMe(USER_ID))

    expect(result).toBe(error)
  })
})
