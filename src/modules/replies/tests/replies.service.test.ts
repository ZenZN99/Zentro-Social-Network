import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { ForbiddenException, InternalServerErrorException, NotFoundException } from 'lykosjs'
import type { Database, database } from '../../../config/db/drizzle'
import { buildPagination } from '../../../utilities/pagination'
import type { NotificationsService } from '../../notifications/notifications.service'
import { NotificationType } from '../../notifications/schemas/enums/notification-type'
import { RepliesService } from '../replies.service'

/* -------------------------------------------------------------------------- */
/*  Typed test doubles (no `any`)                                             */
/* -------------------------------------------------------------------------- */

type Outcome = { readonly value: unknown } | { readonly error: Error }

/**
 * A fake Drizzle query builder: every builder method returns the same chain,
 * and awaiting the chain resolves (or rejects) with the configured outcome.
 */
class QueryChain implements PromiseLike<unknown> {
  readonly from = mock((..._args: unknown[]): QueryChain => this)
  readonly leftJoin = mock((..._args: unknown[]): QueryChain => this)
  readonly where = mock((..._args: unknown[]): QueryChain => this)
  readonly orderBy = mock((..._args: unknown[]): QueryChain => this)
  readonly limit = mock((..._args: unknown[]): QueryChain => this)
  readonly offset = mock((..._args: unknown[]): QueryChain => this)
  readonly values = mock((..._args: unknown[]): QueryChain => this)
  readonly set = mock((..._args: unknown[]): QueryChain => this)
  readonly returning = mock((..._args: unknown[]): QueryChain => this)

  constructor(private readonly outcome: Outcome) {}

  then<R1 = unknown, R2 = never>(
    onfulfilled?: ((value: unknown) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    const settled: Promise<unknown> =
      'error' in this.outcome
        ? Promise.reject(this.outcome.error)
        : Promise.resolve(this.outcome.value)
    return settled.then(onfulfilled, onrejected)
  }
}

const rows = (value: readonly unknown[]): QueryChain => new QueryChain({ value })
const failing = (error: Error): QueryChain => new QueryChain({ error })

type TransactionCallback = (transaction: unknown) => Promise<unknown>

/** The transaction object shares the same mocks as the db, so tests can queue results in one place. */
function createFakeDb() {
  const operations = {
    select: mock((..._args: unknown[]): QueryChain => rows([])),
    insert: mock((..._args: unknown[]): QueryChain => rows([])),
    update: mock((..._args: unknown[]): QueryChain => rows([])),
    delete: mock((..._args: unknown[]): QueryChain => rows([])),
  }
  return {
    ...operations,
    transaction: mock(async (callback: TransactionCallback) => callback(operations)),
  }
}

type FakeDb = ReturnType<typeof createFakeDb>

type NotificationInput = Parameters<NotificationsService['create']>[0]

function createFakeNotifications() {
  return {
    create: mock(async (_input: NotificationInput): Promise<void> => undefined),
  }
}

type FakeNotifications = ReturnType<typeof createFakeNotifications>

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error: unknown) {
    return error
  }
  return undefined
}

const dialect = new PgDialect()

/** Bound parameters of the first `.where(...)` call, so tests can prove WHAT the query filters on. */
function whereParams(chain: QueryChain): unknown[] {
  const condition = chain.where.mock.calls[0]?.[0]
  if (condition === undefined || condition === null) return []
  return dialect.sqlToQuery(condition as SQL).params
}

/** Rendered SQL text of the first `.where(...)` call. */
function whereSql(chain: QueryChain): string {
  const condition = chain.where.mock.calls[0]?.[0]
  if (condition === undefined || condition === null) return ''
  return dialect.sqlToQuery(condition as SQL).sql
}

/** Rendered SQL text of one assignment of the first `.set({...})` call (e.g. `repliesCount + 1`). */
function setClause(chain: QueryChain, key: string): string {
  const assignment = chain.set.mock.calls[0]?.[0] as Record<string, unknown> | undefined
  const value = assignment?.[key]
  return value === undefined ? '' : dialect.sqlToQuery(value as SQL).sql
}

/* -------------------------------------------------------------------------- */
/*  Fixtures                                                                  */
/* -------------------------------------------------------------------------- */

const USER_ID = 'user-1'
const OTHER_ID = 'other-1'
const COMMENT_AUTHOR_ID = 'comment-author'
const COMMENT_ID = 'comment-1'
const POST_ID = 'post-1'
const REPLY_ID = 'reply-1'
const PARENT_ID = 'reply-parent'

const makeComment = (overrides: Record<string, unknown> = {}) => ({
  id: COMMENT_ID,
  postId: POST_ID,
  userId: COMMENT_AUTHOR_ID,
  content: 'a comment',
  repliesCount: 0,
  ...overrides,
})

const makeReply = (overrides: Record<string, unknown> = {}) => ({
  id: REPLY_ID,
  userId: USER_ID,
  commentId: COMMENT_ID,
  content: 'a reply',
  parentReplyId: null,
  likesCount: 0,
  isEdited: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
})

const makeJoinedReply = (overrides: Record<string, unknown> = {}) => ({
  reply: makeReply(),
  user: { id: USER_ID, username: 'zen' },
  profile: {
    id: 'profile-1',
    userId: USER_ID,
    avatar: null,
    cover: null,
    bio: 'hi',
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
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  },
  ...overrides,
})

/* -------------------------------------------------------------------------- */
/*  Tests                                                                     */
/* -------------------------------------------------------------------------- */

let db: FakeDb
let notifications: FakeNotifications
let service: RepliesService

beforeEach(() => {
  db = createFakeDb()
  notifications = createFakeNotifications()
  service = new RepliesService(
    { connection: db } as unknown as Database,
    notifications as unknown as NotificationsService,
  )
})

/* ------------------------------- create ----------------------------------- */

interface CreateSetup {
  comment?: Record<string, unknown> | null
  user?: Record<string, unknown> | null
  /** `undefined` = no parent lookup is queued; `null` = the parent lookup finds nothing. */
  parent?: Record<string, unknown> | null
  inserted?: readonly unknown[]
}

/** Queues db calls in the exact order RepliesService.create consumes them. */
function queueCreate(setup: CreateSetup = {}) {
  const commentChain = rows(setup.comment === null ? [] : [setup.comment ?? makeComment()])
  const userChain = rows(
    setup.user === null ? [] : [setup.user ?? { firstName: 'Zen', lastName: 'User' }],
  )
  const parentChain = rows(
    setup.parent === null || setup.parent === undefined ? [] : [setup.parent],
  )
  const insertChain = rows(setup.inserted ?? [makeReply()])
  const commentUpdate = rows([])
  const postUpdate = rows([])
  const profileUpdate = rows([])

  db.select.mockReturnValueOnce(commentChain).mockReturnValueOnce(userChain)
  if (setup.parent !== undefined) db.select.mockReturnValueOnce(parentChain)
  db.insert.mockReturnValueOnce(insertChain)
  db.update
    .mockReturnValueOnce(commentUpdate)
    .mockReturnValueOnce(postUpdate)
    .mockReturnValueOnce(profileUpdate)

  return {
    commentChain,
    userChain,
    parentChain,
    insertChain,
    commentUpdate,
    postUpdate,
    profileUpdate,
  }
}

describe('RepliesService.create', () => {
  test('creates the reply inside a transaction and returns it', async () => {
    const reply = makeReply()
    queueCreate({ inserted: [reply] })

    const result = await service.create(USER_ID, COMMENT_ID, 'a reply')

    expect(result).toEqual({ success: true, message: 'Reply created successfully', data: reply })
    expect(db.transaction).toHaveBeenCalledTimes(1)
  })

  test('inserts the reply for the authenticated user and the given comment', async () => {
    const { insertChain } = queueCreate()

    await service.create(USER_ID, COMMENT_ID, 'a reply')

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        commentId: COMMENT_ID,
        content: 'a reply',
        parentReplyId: null,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    )
  })

  test('skips the parent lookup for a top-level reply', async () => {
    queueCreate()

    await service.create(USER_ID, COMMENT_ID, 'a reply')

    // comment + user only
    expect(db.select).toHaveBeenCalledTimes(2)
  })

  test('stores the parent reply id when replying to a reply', async () => {
    const { insertChain } = queueCreate({
      parent: { id: PARENT_ID, userId: COMMENT_AUTHOR_ID, commentId: COMMENT_ID },
    })

    await service.create(USER_ID, COMMENT_ID, 'a reply', PARENT_ID)

    expect(db.select).toHaveBeenCalledTimes(3)
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ parentReplyId: PARENT_ID }),
    )
  })

  test('only accepts a parent reply that belongs to the SAME comment', async () => {
    const { parentChain } = queueCreate({
      parent: { id: PARENT_ID, userId: COMMENT_AUTHOR_ID, commentId: COMMENT_ID },
    })

    await service.create(USER_ID, COMMENT_ID, 'a reply', PARENT_ID)

    const params = whereParams(parentChain)
    expect(params).toContain(PARENT_ID)
    expect(params).toContain(COMMENT_ID)
  })

  test('treats an injection-looking parentReplyId as a bound parameter, never as SQL', async () => {
    const payload = "x' OR '1'='1"
    const { parentChain } = queueCreate({ parent: null })

    await captureRejection(service.create(USER_ID, COMMENT_ID, 'a reply', payload))

    expect(whereParams(parentChain)).toContain(payload)
    expect(whereSql(parentChain)).not.toContain(payload)
  })

  test('throws NotFoundException when the parent reply is missing or belongs to another comment', async () => {
    const { insertChain } = queueCreate({ parent: null })

    await expect(service.create(USER_ID, COMMENT_ID, 'a reply', PARENT_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    )

    expect(insertChain.values).not.toHaveBeenCalled()
    expect(db.update).not.toHaveBeenCalled()
    expect(notifications.create).not.toHaveBeenCalled()
  })

  test('throws NotFoundException when the comment does not exist', async () => {
    queueCreate({ comment: null })

    await expect(service.create(USER_ID, 'ghost', 'a reply')).rejects.toBeInstanceOf(
      NotFoundException,
    )

    expect(db.select).toHaveBeenCalledTimes(1)
    expect(db.insert).not.toHaveBeenCalled()
    expect(db.update).not.toHaveBeenCalled()
    expect(notifications.create).not.toHaveBeenCalled()
  })

  test('throws NotFoundException when the author does not exist', async () => {
    queueCreate({ user: null })

    await expect(service.create('ghost', COMMENT_ID, 'a reply')).rejects.toBeInstanceOf(
      NotFoundException,
    )

    expect(db.insert).not.toHaveBeenCalled()
    expect(db.update).not.toHaveBeenCalled()
  })

  test('throws InternalServerErrorException when the insert returns no row, without touching counters', async () => {
    queueCreate({ inserted: [] })

    await expect(service.create(USER_ID, COMMENT_ID, 'a reply')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    )

    expect(db.update).not.toHaveBeenCalled()
    expect(notifications.create).not.toHaveBeenCalled()
  })

  describe('counters', () => {
    test('increments the comment replies count atomically for the right comment', async () => {
      const { commentUpdate } = queueCreate()

      await service.create(USER_ID, COMMENT_ID, 'a reply')

      expect(setClause(commentUpdate, 'repliesCount')).toMatch(/\+ 1/)
      expect(whereParams(commentUpdate)).toContain(COMMENT_ID)
    })

    test("increments the post's comments count for the comment's post", async () => {
      const { postUpdate } = queueCreate()

      await service.create(USER_ID, COMMENT_ID, 'a reply')

      expect(setClause(postUpdate, 'commentsCount')).toMatch(/\+ 1/)
      expect(whereParams(postUpdate)).toContain(POST_ID)
    })

    test("increments the author's profile replies count", async () => {
      const { profileUpdate } = queueCreate()

      await service.create(USER_ID, COMMENT_ID, 'a reply')

      expect(setClause(profileUpdate, 'repliesCount')).toMatch(/\+ 1/)
      expect(whereParams(profileUpdate)).toContain(USER_ID)
    })
  })

  describe('notifications', () => {
    test('notifies the comment author about the reply', async () => {
      queueCreate()

      await service.create(USER_ID, COMMENT_ID, 'a reply')

      expect(notifications.create).toHaveBeenCalledTimes(1)
      expect(notifications.create).toHaveBeenCalledWith({
        senderId: USER_ID,
        receiverId: COMMENT_AUTHOR_ID,
        targetId: REPLY_ID,
        type: NotificationType.REPLY,
        message: 'Zen User replied to your comment.',
        link: `/posts/${POST_ID}`,
      })
    })

    test('does not notify when replying to your own comment', async () => {
      queueCreate({ comment: makeComment({ userId: USER_ID }) })

      await service.create(USER_ID, COMMENT_ID, 'a reply')

      expect(notifications.create).not.toHaveBeenCalled()
    })

    // Documents current behaviour: the notification runs inside the transaction callback, so its
    // failure fails the whole request (and rolls the reply back on a real database).
    test('surfaces notification failures to the caller', async () => {
      queueCreate()
      notifications.create.mockRejectedValueOnce(new Error('notify down'))

      await expect(service.create(USER_ID, COMMENT_ID, 'a reply')).rejects.toThrow('notify down')
    })
  })

  describe('persistence failures', () => {
    test('propagates database failures of the comment lookup', async () => {
      db.select.mockReturnValueOnce(failing(new Error('db down')))

      await expect(service.create(USER_ID, COMMENT_ID, 'a reply')).rejects.toThrow('db down')
      expect(db.insert).not.toHaveBeenCalled()
    })

    test('propagates insert failures without touching counters or notifications', async () => {
      db.select
        .mockReturnValueOnce(rows([makeComment()]))
        .mockReturnValueOnce(rows([{ firstName: 'Zen', lastName: 'User' }]))
      db.insert.mockReturnValueOnce(failing(new Error('insert failed')))

      await expect(service.create(USER_ID, COMMENT_ID, 'a reply')).rejects.toThrow('insert failed')

      expect(db.update).not.toHaveBeenCalled()
      expect(notifications.create).not.toHaveBeenCalled()
    })

    test('propagates counter update failures and sends no notification', async () => {
      db.select
        .mockReturnValueOnce(rows([makeComment()]))
        .mockReturnValueOnce(rows([{ firstName: 'Zen', lastName: 'User' }]))
      db.insert.mockReturnValueOnce(rows([makeReply()]))
      db.update.mockReturnValueOnce(failing(new Error('update failed')))

      await expect(service.create(USER_ID, COMMENT_ID, 'a reply')).rejects.toThrow('update failed')

      expect(notifications.create).not.toHaveBeenCalled()
    })
  })
})

/* ------------------------------- findAll ---------------------------------- */

/** Queues db.select() results in the exact order RepliesService.findAll consumes them. */
function queueFindAll(
  list: readonly unknown[],
  total?: number,
  comment: Record<string, unknown> | null = makeComment(),
) {
  const commentChain = rows(comment === null ? [] : [comment])
  const rowsChain = rows(list)
  const countChain = rows(total === undefined ? [] : [{ total }])
  db.select
    .mockReturnValueOnce(commentChain)
    .mockReturnValueOnce(rowsChain)
    .mockReturnValueOnce(countChain)
  return { commentChain, rowsChain, countChain }
}

describe('RepliesService.findAll', () => {
  test('returns the replies of the comment with pagination', async () => {
    const list = [makeJoinedReply()]
    queueFindAll(list, 25)

    const result = await service.findAll(COMMENT_ID, 2, 10)

    expect(result).toEqual({
      success: true,
      data: list,
      pagination: buildPagination(25, 2, 10),
    })
  })

  test('throws NotFoundException when the comment does not exist', async () => {
    queueFindAll([], 0, null)

    await expect(service.findAll('ghost', 1, 10)).rejects.toBeInstanceOf(NotFoundException)

    expect(db.select).toHaveBeenCalledTimes(1)
  })

  test('scopes both the list and the count to the requested comment', async () => {
    const { commentChain, rowsChain, countChain } = queueFindAll([], 0)

    await service.findAll(COMMENT_ID, 1, 10)

    expect(whereParams(commentChain)).toContain(COMMENT_ID)
    expect(whereParams(rowsChain)).toContain(COMMENT_ID)
    expect(whereParams(countChain)).toContain(COMMENT_ID)
  })

  test('orders replies newest first', async () => {
    const { rowsChain } = queueFindAll([], 0)

    await service.findAll(COMMENT_ID, 1, 10)

    expect(rowsChain.orderBy).toHaveBeenCalledTimes(1)
  })

  test('uses page=1, limit=10 and offset=0 by default', async () => {
    const { rowsChain } = queueFindAll([], 0)

    await service.findAll(COMMENT_ID)

    expect(rowsChain.limit).toHaveBeenCalledWith(10)
    expect(rowsChain.offset).toHaveBeenCalledWith(0)
  })

  test('derives the offset from page and limit when no offset is supplied', async () => {
    const { rowsChain } = queueFindAll([], 0)

    await service.findAll(COMMENT_ID, 3, 5)

    expect(rowsChain.limit).toHaveBeenCalledWith(5)
    expect(rowsChain.offset).toHaveBeenCalledWith(10)
  })

  test('honours an explicit offset supplied by the controller', async () => {
    const { rowsChain } = queueFindAll([], 0)

    await service.findAll(COMMENT_ID, 2, 10, 7)

    expect(rowsChain.offset).toHaveBeenCalledWith(7)
  })

  test('falls back to total = 0 when the count query returns no row', async () => {
    queueFindAll([], undefined)

    const result = await service.findAll(COMMENT_ID, 1, 10)

    expect(result.pagination).toEqual(buildPagination(0, 1, 10))
  })

  test('propagates failures of the list query', async () => {
    db.select
      .mockReturnValueOnce(rows([makeComment()]))
      .mockReturnValueOnce(failing(new Error('db down')))
      .mockReturnValueOnce(rows([{ total: 0 }]))

    await expect(service.findAll(COMMENT_ID, 1, 10)).rejects.toThrow('db down')
  })

  test('propagates failures of the count query', async () => {
    db.select
      .mockReturnValueOnce(rows([makeComment()]))
      .mockReturnValueOnce(rows([]))
      .mockReturnValueOnce(failing(new Error('count failed')))

    await expect(service.findAll(COMMENT_ID, 1, 10)).rejects.toThrow('count failed')
  })
})

/* ------------------------------- findMe ----------------------------------- */

function queueFindMe(list: readonly unknown[], total?: number) {
  const rowsChain = rows(list)
  const countChain = rows(total === undefined ? [] : [{ total }])
  db.select.mockReturnValueOnce(rowsChain).mockReturnValueOnce(countChain)
  return { rowsChain, countChain }
}

describe('RepliesService.findMe', () => {
  test("returns only the given user's replies with pagination", async () => {
    const list = [makeJoinedReply()]
    const { rowsChain, countChain } = queueFindMe(list, 12)

    const result = await service.findMe(USER_ID, 2, 5)

    expect(result).toEqual({ success: true, data: list, pagination: buildPagination(12, 2, 5) })
    expect(whereParams(rowsChain)).toContain(USER_ID)
    expect(whereParams(countChain)).toContain(USER_ID)
  })

  test('orders replies newest first', async () => {
    const { rowsChain } = queueFindMe([], 0)

    await service.findMe(USER_ID, 1, 10)

    expect(rowsChain.orderBy).toHaveBeenCalledTimes(1)
  })

  test('uses page=1, limit=10 and offset=0 by default', async () => {
    const { rowsChain } = queueFindMe([], 0)

    await service.findMe(USER_ID)

    expect(rowsChain.limit).toHaveBeenCalledWith(10)
    expect(rowsChain.offset).toHaveBeenCalledWith(0)
  })

  test('derives the offset from page and limit, or honours an explicit one', async () => {
    const first = queueFindMe([], 0)
    await service.findMe(USER_ID, 3, 5)
    expect(first.rowsChain.offset).toHaveBeenCalledWith(10)

    const second = queueFindMe([], 0)
    await service.findMe(USER_ID, 2, 10, 7)
    expect(second.rowsChain.offset).toHaveBeenCalledWith(7)
  })

  test('falls back to total = 0 when the count query returns no row', async () => {
    queueFindMe([], undefined)

    const result = await service.findMe(USER_ID, 1, 10)

    expect(result.pagination).toEqual(buildPagination(0, 1, 10))
  })

  test('returns an empty list for a user without replies', async () => {
    queueFindMe([], 0)

    const result = await service.findMe(USER_ID, 1, 10)

    expect(result.data).toEqual([])
  })

  test('propagates database failures', async () => {
    db.select
      .mockReturnValueOnce(failing(new Error('db down')))
      .mockReturnValueOnce(rows([{ total: 0 }]))

    await expect(service.findMe(USER_ID, 1, 10)).rejects.toThrow('db down')
  })
})

/* ------------------------------- findOne ---------------------------------- */

describe('RepliesService.findOne', () => {
  test('returns the reply with its author and profile', async () => {
    const joined = makeJoinedReply()
    const chain = rows([joined])
    db.select.mockReturnValueOnce(chain)

    const result = await service.findOne(REPLY_ID)

    expect(result).toEqual({ success: true, data: joined })
    expect(whereParams(chain)).toContain(REPLY_ID)
  })

  test('throws NotFoundException when the reply does not exist', async () => {
    db.select.mockReturnValueOnce(rows([]))

    await expect(service.findOne('ghost')).rejects.toBeInstanceOf(NotFoundException)
  })

  test('treats injection-looking ids as plain data', async () => {
    const payload = "' OR 1=1 --"
    const chain = rows([])
    db.select.mockReturnValueOnce(chain)

    await expect(service.findOne(payload)).rejects.toBeInstanceOf(NotFoundException)

    expect(whereParams(chain)).toContain(payload)
    expect(whereSql(chain)).not.toContain(payload)
  })

  test('propagates database failures', async () => {
    db.select.mockReturnValueOnce(failing(new Error('db down')))

    await expect(service.findOne(REPLY_ID)).rejects.toThrow('db down')
  })
})

/* ------------------------------- update ----------------------------------- */

function queueUpdate(reply: Record<string, unknown> | null, updated?: readonly unknown[]) {
  const lookupChain = rows(reply === null ? [] : [reply])
  const updateChain = rows(updated ?? [makeReply({ content: 'edited', isEdited: true })])
  db.select.mockReturnValueOnce(lookupChain)
  db.update.mockReturnValueOnce(updateChain)
  return { lookupChain, updateChain }
}

describe('RepliesService.update', () => {
  test('lets the author edit the reply, marking it as edited', async () => {
    const updated = makeReply({ content: 'edited', isEdited: true })
    const { updateChain } = queueUpdate(makeReply(), [updated])

    const result = await service.update(USER_ID, REPLY_ID, 'edited')

    expect(result).toEqual({ success: true, message: 'Reply updated successfully', data: updated })
    expect(updateChain.set).toHaveBeenCalledWith({
      content: 'edited',
      isEdited: true,
      updatedAt: expect.any(Date),
    })
    expect(whereParams(updateChain)).toContain(REPLY_ID)
  })

  test('only changes content, isEdited and updatedAt (no owner/comment/parent changes)', async () => {
    const { updateChain } = queueUpdate(makeReply())

    await service.update(USER_ID, REPLY_ID, 'edited')

    expect(Object.keys(updateChain.set.mock.calls[0]?.[0] as object).sort()).toEqual([
      'content',
      'isEdited',
      'updatedAt',
    ])
  })

  test('throws NotFoundException when the reply does not exist', async () => {
    queueUpdate(null)

    await expect(service.update(USER_ID, 'ghost', 'edited')).rejects.toBeInstanceOf(
      NotFoundException,
    )

    expect(db.update).not.toHaveBeenCalled()
  })

  test("throws ForbiddenException when editing someone else's reply", async () => {
    queueUpdate(makeReply({ userId: OTHER_ID }))

    await expect(service.update(USER_ID, REPLY_ID, 'edited')).rejects.toBeInstanceOf(
      ForbiddenException,
    )

    expect(db.update).not.toHaveBeenCalled()
  })

  test('propagates database failures of the lookup', async () => {
    db.select.mockReturnValueOnce(failing(new Error('db down')))

    await expect(service.update(USER_ID, REPLY_ID, 'edited')).rejects.toThrow('db down')
    expect(db.update).not.toHaveBeenCalled()
  })

  test('propagates database failures of the update', async () => {
    db.select.mockReturnValueOnce(rows([makeReply()]))
    db.update.mockReturnValueOnce(failing(new Error('update failed')))

    await expect(service.update(USER_ID, REPLY_ID, 'edited')).rejects.toThrow('update failed')
  })
})

/* ------------------------------- delete ----------------------------------- */

interface DeleteSetup {
  reply?: Record<string, unknown> | null
  comment?: Record<string, unknown> | null
}

/** Queues db calls in the exact order RepliesService.delete consumes them. */
function queueDelete(setup: DeleteSetup = {}) {
  const replyChain = rows(setup.reply === null ? [] : [setup.reply ?? makeReply()])
  const commentChain = rows(setup.comment === null ? [] : [setup.comment ?? makeComment()])
  const deleteChain = rows([])
  const commentUpdate = rows([])
  const postUpdate = rows([])
  const profileUpdate = rows([])

  db.select.mockReturnValueOnce(replyChain).mockReturnValueOnce(commentChain)
  db.delete.mockReturnValueOnce(deleteChain)
  db.update
    .mockReturnValueOnce(commentUpdate)
    .mockReturnValueOnce(postUpdate)
    .mockReturnValueOnce(profileUpdate)

  return { replyChain, commentChain, deleteChain, commentUpdate, postUpdate, profileUpdate }
}

describe('RepliesService.delete', () => {
  test('deletes the reply inside a transaction and reports success', async () => {
    const { deleteChain } = queueDelete()

    const result = await service.delete(USER_ID, REPLY_ID)

    expect(result).toEqual({ success: true, message: 'Reply deleted successfully' })
    expect(db.transaction).toHaveBeenCalledTimes(1)
    expect(db.delete).toHaveBeenCalledTimes(1)
    expect(whereParams(deleteChain)).toContain(REPLY_ID)
  })

  test('decrements the comment, post and author counters', async () => {
    const { commentUpdate, postUpdate, profileUpdate } = queueDelete()

    await service.delete(USER_ID, REPLY_ID)

    expect(setClause(commentUpdate, 'repliesCount')).toMatch(/- 1/)
    expect(whereParams(commentUpdate)).toContain(COMMENT_ID)
    expect(setClause(postUpdate, 'commentsCount')).toMatch(/- 1/)
    expect(whereParams(postUpdate)).toContain(POST_ID)
    expect(setClause(profileUpdate, 'repliesCount')).toMatch(/- 1/)
    expect(whereParams(profileUpdate)).toContain(USER_ID)
  })

  test('throws NotFoundException when the reply does not exist', async () => {
    queueDelete({ reply: null })

    await expect(service.delete(USER_ID, 'ghost')).rejects.toBeInstanceOf(NotFoundException)

    expect(db.select).toHaveBeenCalledTimes(1)
    expect(db.delete).not.toHaveBeenCalled()
    expect(db.update).not.toHaveBeenCalled()
  })

  test("throws ForbiddenException when deleting someone else's reply, changing nothing", async () => {
    queueDelete({ reply: makeReply({ userId: OTHER_ID }) })

    await expect(service.delete(USER_ID, REPLY_ID)).rejects.toBeInstanceOf(ForbiddenException)

    expect(db.select).toHaveBeenCalledTimes(1)
    expect(db.delete).not.toHaveBeenCalled()
    expect(db.update).not.toHaveBeenCalled()
  })

  test('throws NotFoundException when the parent comment is gone, changing nothing', async () => {
    queueDelete({ comment: null })

    await expect(service.delete(USER_ID, REPLY_ID)).rejects.toBeInstanceOf(NotFoundException)

    expect(db.delete).not.toHaveBeenCalled()
    expect(db.update).not.toHaveBeenCalled()
  })

  test('propagates database failures of the lookup', async () => {
    db.select.mockReturnValueOnce(failing(new Error('db down')))

    await expect(service.delete(USER_ID, REPLY_ID)).rejects.toThrow('db down')
    expect(db.delete).not.toHaveBeenCalled()
  })

  test('propagates delete failures without touching counters', async () => {
    db.select.mockReturnValueOnce(rows([makeReply()])).mockReturnValueOnce(rows([makeComment()]))
    db.delete.mockReturnValueOnce(failing(new Error('delete failed')))

    await expect(service.delete(USER_ID, REPLY_ID)).rejects.toThrow('delete failed')

    expect(db.update).not.toHaveBeenCalled()
  })

  test('propagates counter failures', async () => {
    db.select.mockReturnValueOnce(rows([makeReply()])).mockReturnValueOnce(rows([makeComment()]))
    db.delete.mockReturnValueOnce(rows([]))
    db.update.mockReturnValueOnce(failing(new Error('update failed')))

    await expect(service.delete(USER_ID, REPLY_ID)).rejects.toThrow('update failed')
  })
})
