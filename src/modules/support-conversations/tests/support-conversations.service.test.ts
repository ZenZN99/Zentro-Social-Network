import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import {
  SpongBadRequestException,
  SpongNotFoundException,
  SpongUnauthorizedException,
} from 'riser-bob'
import type { database } from '../../../config/db/drizzle'
import { buildPagination } from '../../../utilities/pagination'
import { UserRole } from '../../users/schemas/enums/user-role'
import { SupportConversationStatus } from '../schemas/enums/status'
import { SupportConversationsService } from '../support-conversations.service'

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

function createFakeDb() {
  return {
    select: mock((..._args: unknown[]): QueryChain => rows([])),
    insert: mock((..._args: unknown[]): QueryChain => rows([])),
    update: mock((..._args: unknown[]): QueryChain => rows([])),
  }
}

type FakeDb = ReturnType<typeof createFakeDb>

/** Keys passed to `db.select({...})` for the n-th select call. */
function selectedKeys(db: FakeDb, callIndex: number): string[] {
  const argument = db.select.mock.calls[callIndex]?.[0]
  return typeof argument === 'object' && argument !== null ? Object.keys(argument).sort() : []
}

const dialect = new PgDialect()

/** Bound parameters of the first `.where(...)` call, so tests can prove WHAT the query filters on. */
function whereParams(chain: QueryChain): unknown[] {
  const condition = chain.where.mock.calls[0]?.[0]
  if (condition === undefined || condition === null) return []
  return dialect.sqlToQuery(condition as SQL).params
}

/* -------------------------------------------------------------------------- */
/*  Fixtures                                                                  */
/* -------------------------------------------------------------------------- */

const USER_ID = 'user-1'
const OTHER_ID = 'other-1'
const ADMIN_ID = 'admin-1'
const SUPPORT_ID = 'support-1'
const CONV_ID = 'conv-1'
const AVATAR = { url: 'https://cdn.test/avatar.png', publicId: 'avatar' }
const SENSITIVE_KEY_PATTERN = /password|token|secret|hash/i

const NON_OPEN_STATUSES = Object.values(SupportConversationStatus).filter(
  (status) => status !== SupportConversationStatus.OPEN,
)

const makeConversation = (overrides: Record<string, unknown> = {}) => ({
  id: CONV_ID,
  userId: USER_ID,
  status: SupportConversationStatus.OPEN,
  lastMessage: null,
  lastMessageSenderId: null,
  closedAt: null,
  closedBy: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  ...overrides,
})

/** Row shape of the join query in `findAll`. */
const makeListRow = (overrides: Record<string, unknown> = {}) => ({
  ...makeConversation(),
  userJoinId: USER_ID,
  userFirstName: 'Zen',
  userLastName: 'User',
  userUsername: 'zen',
  userEmail: 'zen@example.com',

  profileId: 'profile-1',
  profileAvatar: AVATAR,

  senderId: SUPPORT_ID,
  senderFirstName: 'Sam',
  senderLastName: 'Support',

  closedByUserId: ADMIN_ID,
  closedByFirstName: 'Ada',
  closedByLastName: 'Admin',

  ...overrides,
})

/** Row shape of the join query in `findMe`. */
const makeMeRow = (overrides: Record<string, unknown> = {}) => ({
  ...makeConversation(),
  userJoinId: USER_ID,
  userFirstName: 'Zen',
  userLastName: 'User',
  userUsername: 'zen',
  userEmail: 'zen@example.com',
  profileId: 'profile-1',
  profileAvatar: AVATAR,
  senderId: SUPPORT_ID,
  senderFirstName: 'Sam',
  senderLastName: 'Support',
  senderUsername: 'sam',
  senderEmail: 'sam@company.com',
  ...overrides,
})

/** Row shape of the join query in `findOne`. */
const makeOneRow = (overrides: Record<string, unknown> = {}) => ({
  ...makeConversation(),
  userJoinId: USER_ID,
  userFirstName: 'Zen',
  userLastName: 'User',
  userUsername: 'zen',
  userEmail: 'zen@example.com',
  profileId: 'profile-1',
  profileAvatar: AVATAR,
  senderId: SUPPORT_ID,
  senderFirstName: 'Sam',
  senderLastName: 'Support',
  closedByUserId: ADMIN_ID,
  closedByFirstName: 'Ada',
  closedByLastName: 'Admin',
  ...overrides,
})

/* -------------------------------------------------------------------------- */
/*  Tests                                                                     */
/* -------------------------------------------------------------------------- */

let db: FakeDb
let service: SupportConversationsService

beforeEach(() => {
  db = createFakeDb()
  service = new SupportConversationsService(db as unknown as typeof database)
})

/* ------------------------------- create ----------------------------------- */

interface CreateSetup {
  existing?: boolean
  user?: Record<string, unknown> | null
  inserted?: readonly unknown[]
}

/** Queues db calls in the exact order SupportConversationsService.create consumes them. */
function queueCreate(setup: CreateSetup = {}) {
  const existingChain = rows(setup.existing ? [makeConversation()] : [])
  const userChain = rows(setup.user === null ? [] : [setup.user ?? { id: USER_ID }])
  const insertChain = rows(setup.inserted ?? [makeConversation()])

  db.select.mockReturnValueOnce(existingChain).mockReturnValueOnce(userChain)
  db.insert.mockReturnValueOnce(insertChain)

  return { existingChain, userChain, insertChain }
}

describe('SupportConversationsService.create', () => {
  test('opens a new conversation for the user and returns it', async () => {
    const { insertChain } = queueCreate()

    const result = await service.create(USER_ID)

    expect(result).toEqual({
      success: true,
      message: 'Support conversation created successfully',
      data: makeConversation(),
    })
    expect(insertChain.values).toHaveBeenCalledTimes(1)
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        status: SupportConversationStatus.OPEN,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    )
  })

  test('only looks for an OPEN conversation of THIS user (closed ones do not block a new one)', async () => {
    const { existingChain } = queueCreate()

    await service.create(USER_ID)

    const params = whereParams(existingChain)
    expect(params).toContain(USER_ID)
    expect(params).toContain(SupportConversationStatus.OPEN)
  })

  test('rejects when the user already has an open conversation', async () => {
    queueCreate({ existing: true })

    await expect(service.create(USER_ID)).rejects.toBeInstanceOf(SpongBadRequestException)

    expect(db.select).toHaveBeenCalledTimes(1)
    expect(db.insert).not.toHaveBeenCalled()
  })

  test('throws SpongUnauthorizedException when the user does not exist', async () => {
    queueCreate({ user: null })

    await expect(service.create('ghost')).rejects.toBeInstanceOf(SpongUnauthorizedException)

    expect(db.insert).not.toHaveBeenCalled()
  })

  test('looks the user up by id and only selects the id column', async () => {
    const { userChain } = queueCreate()

    await service.create(USER_ID)

    expect(whereParams(userChain)).toContain(USER_ID)
    // call 0 = existing conversation, call 1 = user
    expect(selectedKeys(db, 1)).toEqual(['id'])
  })

  test('propagates database failures of the existing-conversation lookup', async () => {
    db.select.mockReturnValueOnce(failing(new Error('db down')))

    await expect(service.create(USER_ID)).rejects.toThrow('db down')
    expect(db.insert).not.toHaveBeenCalled()
  })

  test('propagates insert failures', async () => {
    db.select.mockReturnValueOnce(rows([])).mockReturnValueOnce(rows([{ id: USER_ID }]))
    db.insert.mockReturnValueOnce(failing(new Error('insert failed')))

    await expect(service.create(USER_ID)).rejects.toThrow('insert failed')
  })
})

/* ------------------------------- findAll ---------------------------------- */

/** Queues db.select() results in the exact order SupportConversationsService.findAll consumes them. */
function queueFindAll(list: readonly unknown[], total?: number) {
  const rowsChain = rows(list)
  const countChain = rows(total === undefined ? [] : [{ total }])
  db.select.mockReturnValueOnce(rowsChain).mockReturnValueOnce(countChain)
  return { rowsChain, countChain }
}

describe('SupportConversationsService.findAll', () => {
  test('returns conversations with user, last sender and closing admin nested', async () => {
    queueFindAll([makeListRow()], 1)

    const result = await service.findAll(1, 10)

    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toMatchObject({
      id: CONV_ID,
      status: SupportConversationStatus.OPEN,
      user: {
        id: USER_ID,
        firstName: 'Zen',
        lastName: 'User',
        username: 'zen',
        email: 'zen@example.com',
        profile: { avatar: AVATAR },
      },
      lastMessageSender: { id: SUPPORT_ID, firstName: 'Sam', lastName: 'Support' },
      closedByUser: { id: ADMIN_ID, firstName: 'Ada', lastName: 'Admin' },
    })
    expect(result.pagination).toEqual(buildPagination(1, 1, 10))
  })

  test('does not leak the flat join columns into the conversation', async () => {
    queueFindAll([makeListRow()], 1)

    const result = await service.findAll(1, 10)

    for (const key of [
      'userJoinId',
      'userFirstName',
      'userLastName',
      'userUsername',
      'userEmail',
      'profileAvatar',
      'senderId',
      'senderFirstName',
      'senderLastName',
      'closedByUserId',
      'closedByFirstName',
      'closedByLastName',
    ]) {
      expect(result.data[0]).not.toHaveProperty(key)
    }
  })

  test('sets user, lastMessageSender and closedByUser to null when the joins are empty', async () => {
    queueFindAll(
      [
        makeListRow({
          userJoinId: null,
          senderId: null,
          closedByUserId: null,
          profileAvatar: null,
        }),
      ],
      1,
    )

    const result = await service.findAll(1, 10)

    expect(result.data[0]).toMatchObject({
      user: null,
      lastMessageSender: null,
      closedByUser: null,
    })
  })

  test('keeps user.profile when the profile has no avatar', async () => {
    queueFindAll([makeListRow({ profileAvatar: null })], 1)

    const result = await service.findAll(1, 10)

    expect(result.data[0]).toMatchObject({
      user: {
        profile: {
          avatar: null,
        },
      },
    })
  })

  test('sets user.profile to null when the user has no profile', async () => {
    queueFindAll([makeListRow({ profileId: null, profileAvatar: null })], 1)

    const result = await service.findAll(1, 10)

    expect(result.data[0]).toMatchObject({
      user: {
        profile: null,
      },
    })
  })

  test('uses page=1, limit=10 and offset=0 by default', async () => {
    const { rowsChain } = queueFindAll([], 0)

    await service.findAll()

    expect(rowsChain.limit).toHaveBeenCalledWith(10)
    expect(rowsChain.offset).toHaveBeenCalledWith(0)
  })

  test('derives the offset from page and limit when no offset is supplied', async () => {
    const { rowsChain } = queueFindAll([], 0)

    await service.findAll(3, 5)

    expect(rowsChain.limit).toHaveBeenCalledWith(5)
    expect(rowsChain.offset).toHaveBeenCalledWith(10)
  })

  test('honours an explicit offset supplied by the controller', async () => {
    const { rowsChain } = queueFindAll([], 0)

    await service.findAll(2, 10, 7)

    expect(rowsChain.offset).toHaveBeenCalledWith(7)
  })

  test('orders conversations by most recently updated first', async () => {
    const { rowsChain } = queueFindAll([], 0)

    await service.findAll(1, 10)

    expect(rowsChain.orderBy).toHaveBeenCalledTimes(1)
  })

  test('builds pagination from the real total count', async () => {
    queueFindAll([makeListRow()], 25)

    const result = await service.findAll(2, 10)

    expect(result.pagination).toEqual(buildPagination(25, 2, 10))
  })

  test('falls back to total = 0 when the count query returns no row', async () => {
    queueFindAll([], undefined)

    const result = await service.findAll(1, 10)

    expect(result.pagination).toEqual(buildPagination(0, 1, 10))
  })

  test('returns an empty list for an empty page', async () => {
    queueFindAll([], 0)

    const result = await service.findAll(5, 10)

    expect(result.data).toEqual([])
  })

  test('never selects sensitive user columns', async () => {
    queueFindAll([], 0)

    await service.findAll(1, 10)

    expect(selectedKeys(db, 0).filter((key) => SENSITIVE_KEY_PATTERN.test(key))).toEqual([])
  })

  test('propagates failures of the list query', async () => {
    db.select
      .mockReturnValueOnce(failing(new Error('db down')))
      .mockReturnValueOnce(rows([{ total: 0 }]))

    await expect(service.findAll(1, 10)).rejects.toThrow('db down')
  })

  test('propagates failures of the count query', async () => {
    db.select.mockReturnValueOnce(rows([])).mockReturnValueOnce(failing(new Error('count failed')))

    await expect(service.findAll(1, 10)).rejects.toThrow('count failed')
  })
})

/* ------------------------------- findMe ----------------------------------- */

describe('SupportConversationsService.findMe', () => {
  test('returns only the conversations of the given user, newest first', async () => {
    const chain = rows([makeMeRow()])
    db.select.mockReturnValueOnce(chain)

    const result = await service.findMe(USER_ID)

    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)
    expect(whereParams(chain)).toContain(USER_ID)
    expect(chain.orderBy).toHaveBeenCalledTimes(1)
  })

  test('nests user and last message sender and strips the flat join columns', async () => {
    db.select.mockReturnValueOnce(rows([makeMeRow()]))

    const result = await service.findMe(USER_ID)

    expect(result.data[0]).toMatchObject({
      id: CONV_ID,
      user: {
        id: USER_ID,
        firstName: 'Zen',
        lastName: 'User',
        username: 'zen',
        email: 'zen@example.com',
        profile: { avatar: AVATAR },
      },
      lastMessageSender: { id: SUPPORT_ID, firstName: 'Sam', lastName: 'Support' },
    })
    for (const key of [
      'userJoinId',
      'userEmail',
      'profileId',
      'profileAvatar',
      'senderId',
      'senderEmail',
    ]) {
      expect(result.data[0]).not.toHaveProperty(key)
    }
  })

  test('sets user, profile and lastMessageSender to null when the joins are empty', async () => {
    db.select.mockReturnValueOnce(
      rows([makeMeRow({ userJoinId: null, profileId: null, profileAvatar: null, senderId: null })]),
    )

    const result = await service.findMe(USER_ID)

    expect(result.data[0]).toMatchObject({ user: null, lastMessageSender: null })
  })

  test('returns an empty list when the user has no conversations', async () => {
    db.select.mockReturnValueOnce(rows([]))

    const result = await service.findMe(USER_ID)

    expect(result).toEqual({ success: true, data: [] })
  })

  test('never selects sensitive user columns', async () => {
    db.select.mockReturnValueOnce(rows([]))

    await service.findMe(USER_ID)

    expect(selectedKeys(db, 0).filter((key) => SENSITIVE_KEY_PATTERN.test(key))).toEqual([])
  })

  test('propagates database failures', async () => {
    db.select.mockReturnValueOnce(failing(new Error('db down')))

    await expect(service.findMe(USER_ID)).rejects.toThrow('db down')
  })
})

/* ------------------------------- findOne ---------------------------------- */

/** Queues db.select() results in the exact order SupportConversationsService.findOne consumes them. */
function queueFindOne(
  currentUser: Record<string, unknown> | null,
  row?: Record<string, unknown> | null,
) {
  const userChain = rows(currentUser === null ? [] : [currentUser])
  const rowChain = rows(row === null || row === undefined ? [] : [row])
  db.select.mockReturnValueOnce(userChain).mockReturnValueOnce(rowChain)
  return { userChain, rowChain }
}

describe('SupportConversationsService.findOne', () => {
  test('returns the conversation to its owner with nested relations', async () => {
    queueFindOne({ id: USER_ID, role: UserRole.USER }, makeOneRow())

    const result = await service.findOne(USER_ID, CONV_ID)

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      id: CONV_ID,
      user: { id: USER_ID, username: 'zen', profile: { avatar: AVATAR } },
      lastMessageSender: { id: SUPPORT_ID, firstName: 'Sam', lastName: 'Support' },
      closedByUser: { id: ADMIN_ID, firstName: 'Ada', lastName: 'Admin' },
    })
  })

  test('does not leak the flat join columns', async () => {
    queueFindOne({ id: USER_ID, role: UserRole.USER }, makeOneRow())

    const result = await service.findOne(USER_ID, CONV_ID)

    for (const key of [
      'userJoinId',
      'userEmail',
      'profileId',
      'profileAvatar',
      'senderId',
      'closedByUserId',
      'closedByFirstName',
    ]) {
      expect(result.data).not.toHaveProperty(key)
    }
  })

  test('sets relations to null when the joins are empty', async () => {
    queueFindOne(
      { id: USER_ID, role: UserRole.USER },
      makeOneRow({ userJoinId: null, profileId: null, senderId: null, closedByUserId: null }),
    )

    const result = await service.findOne(USER_ID, CONV_ID)

    expect(result.data).toMatchObject({ user: null, lastMessageSender: null, closedByUser: null })
  })

  test('sets user.profile to null when the user has no profile', async () => {
    queueFindOne(
      { id: USER_ID, role: UserRole.USER },
      makeOneRow({ profileId: null, profileAvatar: null }),
    )

    const result = await service.findOne(USER_ID, CONV_ID)

    expect(result.data).toMatchObject({ user: { profile: null } })
  })

  test('throws SpongUnauthorizedException when the current user does not exist', async () => {
    db.select.mockReturnValueOnce(rows([]))

    await expect(service.findOne('ghost', CONV_ID)).rejects.toBeInstanceOf(
      SpongUnauthorizedException,
    )

    expect(db.select).toHaveBeenCalledTimes(1)
  })

  test('looks the current user up by id and only selects id and role', async () => {
    const { userChain } = queueFindOne({ id: USER_ID, role: UserRole.USER }, makeOneRow())

    await service.findOne(USER_ID, CONV_ID)

    expect(whereParams(userChain)).toContain(USER_ID)
    expect(selectedKeys(db, 0)).toEqual(['id', 'role'])
  })

  test('restricts a regular user to their OWN conversation (conversation id AND user id)', async () => {
    const { rowChain } = queueFindOne({ id: USER_ID, role: UserRole.USER }, makeOneRow())

    await service.findOne(USER_ID, CONV_ID)

    const params = whereParams(rowChain)
    expect(params).toContain(CONV_ID)
    expect(params).toContain(USER_ID)
  })

  for (const role of [UserRole.ADMIN, UserRole.SUPPORT]) {
    test(`${role} can read any conversation (no ownership filter)`, async () => {
      const { rowChain } = queueFindOne({ id: ADMIN_ID, role }, makeOneRow({ userId: OTHER_ID }))

      const result = await service.findOne(ADMIN_ID, CONV_ID)

      expect(result.success).toBe(true)
      const params = whereParams(rowChain)
      expect(params).toContain(CONV_ID)
      expect(params).not.toContain(ADMIN_ID)
    })
  }

  test('throws SpongNotFoundException when the conversation does not exist (or is not visible to the user)', async () => {
    queueFindOne({ id: USER_ID, role: UserRole.USER }, null)

    await expect(service.findOne(USER_ID, 'ghost')).rejects.toBeInstanceOf(SpongNotFoundException)
  })

  test('never selects sensitive user columns', async () => {
    queueFindOne({ id: USER_ID, role: UserRole.USER }, makeOneRow())

    await service.findOne(USER_ID, CONV_ID)

    expect(selectedKeys(db, 1).filter((key) => SENSITIVE_KEY_PATTERN.test(key))).toEqual([])
  })

  test('propagates database failures of the user lookup', async () => {
    db.select.mockReturnValueOnce(failing(new Error('db down')))

    await expect(service.findOne(USER_ID, CONV_ID)).rejects.toThrow('db down')
  })

  test('propagates database failures of the conversation lookup', async () => {
    db.select
      .mockReturnValueOnce(rows([{ id: USER_ID, role: UserRole.USER }]))
      .mockReturnValueOnce(failing(new Error('db down')))

    await expect(service.findOne(USER_ID, CONV_ID)).rejects.toThrow('db down')
  })
})

/* ------------------------------- toggle ----------------------------------- */

function queueToggle(conversation: Record<string, unknown> | null, updated?: readonly unknown[]) {
  const lookupChain = rows(conversation === null ? [] : [conversation])
  const updateChain = rows(updated ?? [makeConversation()])
  db.select.mockReturnValueOnce(lookupChain)
  db.update.mockReturnValueOnce(updateChain)
  return { lookupChain, updateChain }
}

describe('SupportConversationsService.toggle', () => {
  test('closes an OPEN conversation, recording who closed it and when', async () => {
    const closed = makeConversation({
      status: SupportConversationStatus.CLOSED,
      closedBy: ADMIN_ID,
    })
    const { updateChain } = queueToggle(makeConversation(), [closed])

    const result = await service.toggle(ADMIN_ID, CONV_ID)

    expect(result).toEqual({
      success: true,
      data: closed,
      message: 'Support conversation closed successfully',
    })
    expect(updateChain.set).toHaveBeenCalledWith({
      status: SupportConversationStatus.CLOSED,
      closedAt: expect.any(Date),
      closedBy: ADMIN_ID,
      updatedAt: expect.any(Date),
    })
    expect(whereParams(updateChain)).toContain(CONV_ID)
  })

  for (const status of NON_OPEN_STATUSES) {
    test(`re-opens a ${status} conversation and clears closedAt/closedBy`, async () => {
      const reopened = makeConversation()
      const { updateChain } = queueToggle(makeConversation({ status, closedBy: ADMIN_ID }), [
        reopened,
      ])

      const result = await service.toggle(OTHER_ID, CONV_ID)

      expect(result).toEqual({
        success: true,
        message: 'Support conversation opened successfully',
        data: reopened,
      })
      expect(updateChain.set).toHaveBeenCalledWith({
        status: SupportConversationStatus.OPEN,
        closedAt: null,
        closedBy: null,
        updatedAt: expect.any(Date),
      })
      expect(whereParams(updateChain)).toContain(CONV_ID)
    })
  }

  test('records the admin passed in, not the conversation owner, as the closer', async () => {
    const { updateChain } = queueToggle(makeConversation({ userId: USER_ID }))

    await service.toggle(ADMIN_ID, CONV_ID)

    expect(updateChain.set).toHaveBeenCalledWith(expect.objectContaining({ closedBy: ADMIN_ID }))
  })

  test('throws SpongNotFoundException when the conversation does not exist', async () => {
    queueToggle(null)

    await expect(service.toggle(ADMIN_ID, 'ghost')).rejects.toBeInstanceOf(SpongNotFoundException)

    expect(db.update).not.toHaveBeenCalled()
  })

  test('propagates database failures of the lookup', async () => {
    db.select.mockReturnValueOnce(failing(new Error('db down')))

    await expect(service.toggle(ADMIN_ID, CONV_ID)).rejects.toThrow('db down')
    expect(db.update).not.toHaveBeenCalled()
  })

  test('propagates database failures of the update', async () => {
    db.select.mockReturnValueOnce(rows([makeConversation()]))
    db.update.mockReturnValueOnce(failing(new Error('update failed')))

    await expect(service.toggle(ADMIN_ID, CONV_ID)).rejects.toThrow('update failed')
  })
})
