import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { database } from '../../../../config/db/drizzle'
import { PostMentionsService } from '../post-mentions.service'

/* -------------------------------------------------------------------------- */
/* Typed test doubles (no `any`)                                              */
/* -------------------------------------------------------------------------- */

type Outcome = { readonly value: unknown } | { readonly error: Error }

/**
 * A fake Drizzle query builder: every builder method returns the same chain,
 * and awaiting the chain resolves (or rejects) with the configured outcome.
 */
class QueryChain implements PromiseLike<unknown> {
  readonly from = mock((..._args: unknown[]): QueryChain => this)
  readonly where = mock((..._args: unknown[]): QueryChain => this)
  readonly limit = mock((..._args: unknown[]): QueryChain => this)
  readonly values = mock((..._args: unknown[]): QueryChain => this)
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
    delete: mock((..._args: unknown[]): QueryChain => rows([])),
  }
}

type FakeDb = ReturnType<typeof createFakeDb>
type Transaction = NonNullable<Parameters<PostMentionsService['attachMany']>[2]>

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error: unknown) {
    return error
  }

  return undefined
}

const dialect = new PgDialect()

/** Bound parameters of the first `.where(...)` call. */
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

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const POST_ID = 'post-1'
const USER_ID = 'user-1'
const USER_ID_2 = 'user-2'
const USER_ID_3 = 'user-3'

const makeMention = (overrides: Record<string, unknown> = {}) => ({
  id: 'mention-1',
  postId: POST_ID,
  mentionedUserId: USER_ID,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
})

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

let db: FakeDb
let transaction: FakeDb
let service: PostMentionsService

beforeEach(() => {
  db = createFakeDb()
  transaction = createFakeDb()

  service = new PostMentionsService(db as unknown as typeof database)
})

const asTransaction = (fake: FakeDb): Transaction => fake as unknown as Transaction

/* -------------------------------------------------------------------------- */
/* attachMany                                                                 */
/* -------------------------------------------------------------------------- */

describe('PostMentionsService.attachMany', () => {
  test('attaches multiple users and returns their ids', async () => {
    db.select.mockReturnValueOnce(rows([])).mockReturnValueOnce(rows([]))

    const firstInsert = rows([])
    const secondInsert = rows([])

    db.insert.mockReturnValueOnce(firstInsert).mockReturnValueOnce(secondInsert)

    const result = await service.attachMany(POST_ID, [USER_ID, USER_ID_2])

    expect(result).toEqual([USER_ID, USER_ID_2])

    expect(db.select).toHaveBeenCalledTimes(2)
    expect(db.insert).toHaveBeenCalledTimes(2)

    expect(firstInsert.values).toHaveBeenCalledTimes(1)
    expect(secondInsert.values).toHaveBeenCalledTimes(1)
  })

  test('inserts the correct postId and mentionedUserId', async () => {
    db.select.mockReturnValueOnce(rows([]))

    const insertChain = rows([])
    db.insert.mockReturnValueOnce(insertChain)

    await service.attachMany(POST_ID, [USER_ID])

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: POST_ID,
        mentionedUserId: USER_ID,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    )
  })

  test('inserts exactly postId, mentionedUserId, createdAt and updatedAt', async () => {
    db.select.mockReturnValueOnce(rows([]))

    const insertChain = rows([])
    db.insert.mockReturnValueOnce(insertChain)

    await service.attachMany(POST_ID, [USER_ID])

    expect(Object.keys(insertChain.values.mock.calls[0]?.[0] as object).sort()).toEqual([
      'createdAt',
      'mentionedUserId',
      'postId',
      'updatedAt',
    ])
  })

  test('removes duplicate user ids before processing', async () => {
    db.select.mockReturnValueOnce(rows([])).mockReturnValueOnce(rows([]))

    db.insert.mockReturnValueOnce(rows([])).mockReturnValueOnce(rows([]))

    const result = await service.attachMany(POST_ID, [USER_ID, USER_ID, USER_ID_2, USER_ID])

    expect(result).toEqual([USER_ID, USER_ID_2])
    expect(db.select).toHaveBeenCalledTimes(2)
    expect(db.insert).toHaveBeenCalledTimes(2)
  })

  test('does not insert a mention that already exists', async () => {
    db.select.mockReturnValueOnce(rows([{ id: 'existing-mention' }]))

    const result = await service.attachMany(POST_ID, [USER_ID])

    expect(result).toEqual([])
    expect(db.select).toHaveBeenCalledTimes(1)
    expect(db.insert).not.toHaveBeenCalled()
  })

  test('attaches only users that do not already have a mention', async () => {
    db.select
      .mockReturnValueOnce(rows([{ id: 'existing-mention' }]))
      .mockReturnValueOnce(rows([]))
      .mockReturnValueOnce(rows([]))

    db.insert.mockReturnValueOnce(rows([])).mockReturnValueOnce(rows([]))

    const result = await service.attachMany(POST_ID, [USER_ID, USER_ID_2, USER_ID_3])

    expect(result).toEqual([USER_ID_2, USER_ID_3])
    expect(db.select).toHaveBeenCalledTimes(3)
    expect(db.insert).toHaveBeenCalledTimes(2)
  })

  test('returns an empty array without querying the database when no users are given', async () => {
    const result = await service.attachMany(POST_ID, [])

    expect(result).toEqual([])
    expect(db.select).not.toHaveBeenCalled()
    expect(db.insert).not.toHaveBeenCalled()
  })

  test('uses the provided transaction instead of the main connection', async () => {
    transaction.select.mockReturnValueOnce(rows([]))
    transaction.insert.mockReturnValueOnce(rows([]))

    const result = await service.attachMany(POST_ID, [USER_ID], asTransaction(transaction))

    expect(result).toEqual([USER_ID])
    expect(transaction.select).toHaveBeenCalledTimes(1)
    expect(transaction.insert).toHaveBeenCalledTimes(1)

    expect(db.select).not.toHaveBeenCalled()
    expect(db.insert).not.toHaveBeenCalled()
  })

  test('falls back to the main connection when no transaction is given', async () => {
    db.select.mockReturnValueOnce(rows([]))
    db.insert.mockReturnValueOnce(rows([]))

    await service.attachMany(POST_ID, [USER_ID])

    expect(db.select).toHaveBeenCalledTimes(1)
    expect(db.insert).toHaveBeenCalledTimes(1)

    expect(transaction.select).not.toHaveBeenCalled()
    expect(transaction.insert).not.toHaveBeenCalled()
  })

  test('filters existing mentions by both postId and mentionedUserId', async () => {
    const selectChain = rows([])
    db.select.mockReturnValueOnce(selectChain)
    db.insert.mockReturnValueOnce(rows([]))

    await service.attachMany(POST_ID, [USER_ID])

    expect(selectChain.where).toHaveBeenCalledTimes(1)
    expect(whereParams(selectChain)).toEqual([POST_ID, USER_ID])
  })

  test('treats injection-looking ids as bound parameters, never as SQL', async () => {
    const payload = "' OR 1=1 --"

    const selectChain = rows([])
    db.select.mockReturnValueOnce(selectChain)
    db.insert.mockReturnValueOnce(rows([]))

    await service.attachMany(POST_ID, [payload])

    expect(whereParams(selectChain)).toContain(payload)
    expect(whereSql(selectChain)).not.toContain(payload)
  })

  test('propagates lookup failures untouched', async () => {
    const failure = new Error('lookup failed')
    db.select.mockReturnValueOnce(failing(failure))

    await expect(service.attachMany(POST_ID, [USER_ID])).rejects.toBe(failure)

    expect(db.insert).not.toHaveBeenCalled()
  })

  test('propagates insert failures untouched', async () => {
    const failure = new Error('insert failed')

    db.select.mockReturnValueOnce(rows([]))
    db.insert.mockReturnValueOnce(failing(failure))

    await expect(service.attachMany(POST_ID, [USER_ID])).rejects.toBe(failure)
  })

  test('propagates failures inside a transaction so the caller can roll back', async () => {
    const failure = new Error('transaction insert failed')

    transaction.select.mockReturnValueOnce(rows([]))
    transaction.insert.mockReturnValueOnce(failing(failure))

    await expect(service.attachMany(POST_ID, [USER_ID], asTransaction(transaction))).rejects.toBe(
      failure,
    )

    expect(db.insert).not.toHaveBeenCalled()
  })
})

/* -------------------------------------------------------------------------- */
/* detachMany                                                                 */
/* -------------------------------------------------------------------------- */

describe('PostMentionsService.detachMany', () => {
  test('deletes mentions for the given users and returns the deleted count', async () => {
    const deleteChain = rows([{ id: 'mention-1' }, { id: 'mention-2' }])
    db.delete.mockReturnValueOnce(deleteChain)

    const removed = await service.detachMany(POST_ID, [USER_ID, USER_ID_2])

    expect(removed).toBe(2)
    expect(db.delete).toHaveBeenCalledTimes(1)
    expect(deleteChain.where).toHaveBeenCalledTimes(1)
    expect(deleteChain.returning).toHaveBeenCalledTimes(1)
  })

  test('returns 0 when no mentions were deleted', async () => {
    db.delete.mockReturnValueOnce(rows([]))

    await expect(service.detachMany(POST_ID, [USER_ID])).resolves.toBe(0)
  })

  test('counts every deleted row', async () => {
    db.delete.mockReturnValueOnce(
      rows([{ id: 'mention-1' }, { id: 'mention-2' }, { id: 'mention-3' }]),
    )

    await expect(service.detachMany(POST_ID, [USER_ID, USER_ID_2, USER_ID_3])).resolves.toBe(3)
  })

  test('returns 0 without querying the database when no user ids are given', async () => {
    const removed = await service.detachMany(POST_ID, [])

    expect(removed).toBe(0)
    expect(db.delete).not.toHaveBeenCalled()
  })

  test('filters by both postId and mentioned user ids', async () => {
    const deleteChain = rows([])
    db.delete.mockReturnValueOnce(deleteChain)

    await service.detachMany(POST_ID, [USER_ID, USER_ID_2])

    expect(deleteChain.where).toHaveBeenCalledTimes(1)

    const params = whereParams(deleteChain)

    expect(params).toContain(POST_ID)
    expect(params).toContain(USER_ID)
    expect(params).toContain(USER_ID_2)
  })

  test('only asks the database for the deleted ids', async () => {
    const deleteChain = rows([])
    db.delete.mockReturnValueOnce(deleteChain)

    await service.detachMany(POST_ID, [USER_ID])

    expect(deleteChain.returning).toHaveBeenCalledWith({ id: expect.anything() })
  })

  test('treats injection-looking ids as bound parameters, never as SQL', async () => {
    const payload = "' OR 1=1 --"

    const deleteChain = rows([])
    db.delete.mockReturnValueOnce(deleteChain)

    await service.detachMany(POST_ID, [payload])

    expect(whereParams(deleteChain)).toContain(payload)
    expect(whereSql(deleteChain)).not.toContain(payload)
  })

  test('uses the provided transaction instead of the main connection', async () => {
    transaction.delete.mockReturnValueOnce(rows([{ id: 'mention-1' }]))

    const removed = await service.detachMany(POST_ID, [USER_ID], asTransaction(transaction))

    expect(removed).toBe(1)
    expect(transaction.delete).toHaveBeenCalledTimes(1)
    expect(db.delete).not.toHaveBeenCalled()
  })

  test('propagates delete failures untouched', async () => {
    const failure = new Error('delete failed')
    db.delete.mockReturnValueOnce(failing(failure))

    await expect(service.detachMany(POST_ID, [USER_ID])).rejects.toBe(failure)
  })

  test('propagates delete failures inside a transaction', async () => {
    const failure = new Error('transaction delete failed')
    transaction.delete.mockReturnValueOnce(failing(failure))

    await expect(service.detachMany(POST_ID, [USER_ID], asTransaction(transaction))).rejects.toBe(
      failure,
    )

    expect(db.delete).not.toHaveBeenCalled()
  })
})

/* -------------------------------------------------------------------------- */
/* detachAll                                                                  */
/* -------------------------------------------------------------------------- */

describe('PostMentionsService.detachAll', () => {
  test('deletes all mentions of the given post and returns the count', async () => {
    const deleteChain = rows([{ id: 'mention-1' }, { id: 'mention-2' }])

    db.delete.mockReturnValueOnce(deleteChain)

    const removed = await service.detachAll(POST_ID)

    expect(removed).toBe(2)
    expect(db.delete).toHaveBeenCalledTimes(1)
    expect(deleteChain.where).toHaveBeenCalledTimes(1)
  })

  test('returns 0 when the post has no mentions', async () => {
    db.delete.mockReturnValueOnce(rows([]))

    await expect(service.detachAll(POST_ID)).resolves.toBe(0)
  })

  test('only deletes mentions belonging to the given post', async () => {
    const deleteChain = rows([])
    db.delete.mockReturnValueOnce(deleteChain)

    await service.detachAll(POST_ID)

    expect(whereParams(deleteChain)).toEqual([POST_ID])
  })

  test('only asks the database for the deleted ids', async () => {
    const deleteChain = rows([])
    db.delete.mockReturnValueOnce(deleteChain)

    await service.detachAll(POST_ID)

    expect(deleteChain.returning).toHaveBeenCalledWith({ id: expect.anything() })
  })

  test('treats an injection-looking post id as a bound parameter, never as SQL', async () => {
    const payload = "' OR 1=1 --"

    const deleteChain = rows([])
    db.delete.mockReturnValueOnce(deleteChain)

    await service.detachAll(payload)

    expect(whereParams(deleteChain)).toContain(payload)
    expect(whereSql(deleteChain)).not.toContain(payload)
  })

  test('uses the provided transaction instead of the main connection', async () => {
    transaction.delete.mockReturnValueOnce(rows([{ id: 'mention-1' }]))

    const removed = await service.detachAll(POST_ID, asTransaction(transaction))

    expect(removed).toBe(1)
    expect(transaction.delete).toHaveBeenCalledTimes(1)
    expect(db.delete).not.toHaveBeenCalled()
  })

  test('propagates delete failures untouched', async () => {
    const failure = new Error('delete failed')
    db.delete.mockReturnValueOnce(failing(failure))

    await expect(service.detachAll(POST_ID)).rejects.toBe(failure)
  })

  test('propagates delete failures inside a transaction', async () => {
    const failure = new Error('transaction delete failed')
    transaction.delete.mockReturnValueOnce(failing(failure))

    await expect(service.detachAll(POST_ID, asTransaction(transaction))).rejects.toBe(failure)

    expect(db.delete).not.toHaveBeenCalled()
  })
})

/* -------------------------------------------------------------------------- */
/* findInvalidMentionIds                                                      */
/* -------------------------------------------------------------------------- */

describe('PostMentionsService.findInvalidMentionIds', () => {
  test('returns ids that do not exist in the users table', async () => {
    db.select.mockReturnValueOnce(rows([{ id: USER_ID }, { id: USER_ID_3 }]))

    const result = await service.findInvalidMentionIds([USER_ID, USER_ID_2, USER_ID_3])

    expect(result).toEqual([USER_ID_2])
    expect(db.select).toHaveBeenCalledTimes(1)
  })

  test('returns an empty array when all users exist', async () => {
    db.select.mockReturnValueOnce(rows([{ id: USER_ID }, { id: USER_ID_2 }]))

    const result = await service.findInvalidMentionIds([USER_ID, USER_ID_2])

    expect(result).toEqual([])
  })

  test('returns all ids when none of the users exist', async () => {
    db.select.mockReturnValueOnce(rows([]))

    const result = await service.findInvalidMentionIds([USER_ID, USER_ID_2, USER_ID_3])

    expect(result).toEqual([USER_ID, USER_ID_2, USER_ID_3])
  })

  test('removes duplicate ids before querying and returning results', async () => {
    const selectChain = rows([{ id: USER_ID }])
    db.select.mockReturnValueOnce(selectChain)

    const result = await service.findInvalidMentionIds([USER_ID, USER_ID, USER_ID_2, USER_ID_2])

    expect(result).toEqual([USER_ID_2])
    expect(db.select).toHaveBeenCalledTimes(1)

    const params = whereParams(selectChain)

    expect(params).toContain(USER_ID)
    expect(params).toContain(USER_ID_2)
  })

  test('returns an empty array without querying the database when no ids are given', async () => {
    const result = await service.findInvalidMentionIds([])

    expect(result).toEqual([])
    expect(db.select).not.toHaveBeenCalled()
  })

  test('queries users using the provided ids as bound parameters', async () => {
    const selectChain = rows([])
    db.select.mockReturnValueOnce(selectChain)

    await service.findInvalidMentionIds([USER_ID, USER_ID_2])

    expect(selectChain.where).toHaveBeenCalledTimes(1)

    const params = whereParams(selectChain)

    expect(params).toContain(USER_ID)
    expect(params).toContain(USER_ID_2)
  })

  test('treats injection-looking user ids as bound parameters, never as SQL', async () => {
    const payload = "' OR 1=1 --"

    const selectChain = rows([])
    db.select.mockReturnValueOnce(selectChain)

    await service.findInvalidMentionIds([payload])

    expect(whereParams(selectChain)).toContain(payload)
    expect(whereSql(selectChain)).not.toContain(payload)
  })

  test('uses the provided transaction instead of the main connection', async () => {
    transaction.select.mockReturnValueOnce(rows([{ id: USER_ID }]))

    const result = await service.findInvalidMentionIds(
      [USER_ID, USER_ID_2],
      asTransaction(transaction),
    )

    expect(result).toEqual([USER_ID_2])
    expect(transaction.select).toHaveBeenCalledTimes(1)
    expect(db.select).not.toHaveBeenCalled()
  })

  test('falls back to the main connection when no transaction is given', async () => {
    db.select.mockReturnValueOnce(rows([{ id: USER_ID }]))

    await service.findInvalidMentionIds([USER_ID])

    expect(db.select).toHaveBeenCalledTimes(1)
    expect(transaction.select).not.toHaveBeenCalled()
  })

  test('propagates database failures untouched', async () => {
    const failure = new Error('db down')
    db.select.mockReturnValueOnce(failing(failure))

    await expect(service.findInvalidMentionIds([USER_ID])).rejects.toBe(failure)
  })

  test('propagates database failures inside a transaction', async () => {
    const failure = new Error('transaction db down')
    transaction.select.mockReturnValueOnce(failing(failure))

    await expect(service.findInvalidMentionIds([USER_ID], asTransaction(transaction))).rejects.toBe(
      failure,
    )

    expect(db.select).not.toHaveBeenCalled()
  })
})
