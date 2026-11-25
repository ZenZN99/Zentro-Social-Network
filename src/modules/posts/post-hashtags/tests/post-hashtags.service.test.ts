import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { Database, database } from '../../../../config/db/drizzle'
import { PostHashtagsService } from '../post-hashtags.service'

/* -------------------------------------------------------------------------- */
/* Typed test doubles (no `any`)                                              */
/* -------------------------------------------------------------------------- */

type Outcome = { readonly value: unknown } | { readonly error: Error }

class QueryChain implements PromiseLike<unknown> {
  readonly from = mock((..._args: unknown[]): QueryChain => this)
  readonly where = mock((..._args: unknown[]): QueryChain => this)
  readonly values = mock((..._args: unknown[]): QueryChain => this)
  readonly returning = mock((..._args: unknown[]): QueryChain => this)
  readonly onConflictDoNothing = mock((..._args: unknown[]): QueryChain => this)

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
type Transaction = NonNullable<Parameters<PostHashtagsService['attachMany']>[2]>

const dialect = new PgDialect()

function whereParams(chain: QueryChain): unknown[] {
  const condition = chain.where.mock.calls[0]?.[0]

  if (condition === undefined || condition === null) return []

  return dialect.sqlToQuery(condition as SQL).params
}

function whereSql(chain: QueryChain): string {
  const condition = chain.where.mock.calls[0]?.[0]

  if (condition === undefined || condition === null) return ''

  return dialect.sqlToQuery(condition as SQL).sql
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const POST_ID = 'post-1'
const HASHTAG_ID = 'hashtag-1'
const HASHTAG_ID_2 = 'hashtag-2'
const HASHTAG_ID_3 = 'hashtag-3'

const makePostHashtag = (overrides: Record<string, unknown> = {}) => ({
  id: 'post-hashtag-1',
  postId: POST_ID,
  hashtagId: HASHTAG_ID,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
})

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

let db: FakeDb
let transaction: FakeDb
let service: PostHashtagsService

beforeEach(() => {
  db = createFakeDb()
  transaction = createFakeDb()

  service = new PostHashtagsService({ connection: db } as unknown as Database)
})

const asTransaction = (fake: FakeDb): Transaction => fake as unknown as Transaction

/* -------------------------------------------------------------------------- */
/* attachMany                                                                 */
/* -------------------------------------------------------------------------- */

describe('PostHashtagsService.attachMany', () => {
  test('inserts multiple hashtags and returns the inserted rows', async () => {
    const inserted = [
      makePostHashtag(),
      makePostHashtag({
        id: 'post-hashtag-2',
        hashtagId: HASHTAG_ID_2,
      }),
    ]

    const insertChain = rows(inserted)
    db.insert.mockReturnValueOnce(insertChain)

    const result = await service.attachMany(POST_ID, [HASHTAG_ID, HASHTAG_ID_2])

    expect(result).toEqual(inserted)
    expect(db.insert).toHaveBeenCalledTimes(1)
    expect(insertChain.values).toHaveBeenCalledTimes(1)
    expect(insertChain.onConflictDoNothing).toHaveBeenCalledTimes(1)
    expect(insertChain.returning).toHaveBeenCalledTimes(1)
  })

  test('inserts the correct postId and hashtagIds', async () => {
    const insertChain = rows([])
    db.insert.mockReturnValueOnce(insertChain)

    await service.attachMany(POST_ID, [HASHTAG_ID, HASHTAG_ID_2])

    const values = insertChain.values.mock.calls[0]?.[0]

    expect(values).toEqual([
      expect.objectContaining({
        postId: POST_ID,
        hashtagId: HASHTAG_ID,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
      expect.objectContaining({
        postId: POST_ID,
        hashtagId: HASHTAG_ID_2,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    ])
  })

  test('inserts exactly postId, hashtagId, createdAt and updatedAt for every row', async () => {
    const insertChain = rows([])
    db.insert.mockReturnValueOnce(insertChain)

    await service.attachMany(POST_ID, [HASHTAG_ID, HASHTAG_ID_2])

    const values = insertChain.values.mock.calls[0]?.[0]

    expect(Array.isArray(values)).toBe(true)

    if (!Array.isArray(values)) {
      throw new Error('Expected bulk insert values to be an array')
    }

    for (const value of values) {
      expect(Object.keys(value as object).sort()).toEqual([
        'createdAt',
        'hashtagId',
        'postId',
        'updatedAt',
      ])
    }
  })

  test('removes duplicate hashtag ids before inserting', async () => {
    const insertChain = rows([])
    db.insert.mockReturnValueOnce(insertChain)

    await service.attachMany(POST_ID, [HASHTAG_ID, HASHTAG_ID, HASHTAG_ID_2, HASHTAG_ID])

    expect(insertChain.values).toHaveBeenCalledWith([
      expect.objectContaining({
        postId: POST_ID,
        hashtagId: HASHTAG_ID,
      }),
      expect.objectContaining({
        postId: POST_ID,
        hashtagId: HASHTAG_ID_2,
      }),
    ])
  })

  test('does not query the database when no hashtag ids are given', async () => {
    const result = await service.attachMany(POST_ID, [])

    expect(result).toEqual([])
    expect(db.insert).not.toHaveBeenCalled()
  })

  test('uses onConflictDoNothing to ignore duplicate relations', async () => {
    const insertChain = rows([])
    db.insert.mockReturnValueOnce(insertChain)

    await service.attachMany(POST_ID, [HASHTAG_ID])

    expect(insertChain.onConflictDoNothing).toHaveBeenCalledTimes(1)
    expect(insertChain.returning).toHaveBeenCalledTimes(1)
  })

  test('returns only rows actually inserted when conflicts are ignored', async () => {
    const inserted = [makePostHashtag()]

    const insertChain = rows(inserted)
    db.insert.mockReturnValueOnce(insertChain)

    const result = await service.attachMany(POST_ID, [HASHTAG_ID, HASHTAG_ID_2])

    expect(result).toEqual(inserted)
  })

  test('uses the provided transaction instead of the main connection', async () => {
    const insertChain = rows([makePostHashtag()])
    transaction.insert.mockReturnValueOnce(insertChain)

    const result = await service.attachMany(POST_ID, [HASHTAG_ID], asTransaction(transaction))

    expect(result).toEqual([makePostHashtag()])
    expect(transaction.insert).toHaveBeenCalledTimes(1)
    expect(db.insert).not.toHaveBeenCalled()
  })

  test('falls back to the main connection when no transaction is given', async () => {
    db.insert.mockReturnValueOnce(rows([]))

    await service.attachMany(POST_ID, [HASHTAG_ID])

    expect(db.insert).toHaveBeenCalledTimes(1)
    expect(transaction.insert).not.toHaveBeenCalled()
  })

  test('propagates insert failures untouched', async () => {
    const failure = new Error('insert failed')
    db.insert.mockReturnValueOnce(failing(failure))

    await expect(service.attachMany(POST_ID, [HASHTAG_ID])).rejects.toBe(failure)
  })

  test('propagates insert failures inside a transaction', async () => {
    const failure = new Error('transaction insert failed')
    transaction.insert.mockReturnValueOnce(failing(failure))

    await expect(
      service.attachMany(POST_ID, [HASHTAG_ID], asTransaction(transaction)),
    ).rejects.toBe(failure)

    expect(db.insert).not.toHaveBeenCalled()
  })
})

/* -------------------------------------------------------------------------- */
/* detachMany                                                                 */
/* -------------------------------------------------------------------------- */

describe('PostHashtagsService.detachMany', () => {
  test('deletes hashtags of the post and returns how many were removed', async () => {
    const deleteChain = rows([{ id: 'relation-1' }, { id: 'relation-2' }])

    db.delete.mockReturnValueOnce(deleteChain)

    const removed = await service.detachMany(POST_ID, [HASHTAG_ID, HASHTAG_ID_2])

    expect(removed).toBe(2)
    expect(db.delete).toHaveBeenCalledTimes(1)
    expect(deleteChain.where).toHaveBeenCalledTimes(1)
    expect(deleteChain.returning).toHaveBeenCalledTimes(1)
  })

  test('returns 0 when no hashtags were deleted', async () => {
    db.delete.mockReturnValueOnce(rows([]))

    await expect(service.detachMany(POST_ID, [HASHTAG_ID])).resolves.toBe(0)
  })

  test('counts every deleted row', async () => {
    db.delete.mockReturnValueOnce(
      rows([{ id: 'relation-1' }, { id: 'relation-2' }, { id: 'relation-3' }]),
    )

    await expect(
      service.detachMany(POST_ID, [HASHTAG_ID, HASHTAG_ID_2, HASHTAG_ID_3]),
    ).resolves.toBe(3)
  })

  test('does not query the database when no hashtag ids are given', async () => {
    const removed = await service.detachMany(POST_ID, [])

    expect(removed).toBe(0)
    expect(db.delete).not.toHaveBeenCalled()
  })

  test('filters by both postId and hashtag ids', async () => {
    const deleteChain = rows([])
    db.delete.mockReturnValueOnce(deleteChain)

    await service.detachMany(POST_ID, [HASHTAG_ID, HASHTAG_ID_2])

    expect(deleteChain.where).toHaveBeenCalledTimes(1)

    const params = whereParams(deleteChain)

    expect(params).toContain(POST_ID)
    expect(params).toContain(HASHTAG_ID)
    expect(params).toContain(HASHTAG_ID_2)
  })

  test('only asks the database for the deleted ids', async () => {
    const deleteChain = rows([])
    db.delete.mockReturnValueOnce(deleteChain)

    await service.detachMany(POST_ID, [HASHTAG_ID])

    expect(deleteChain.returning).toHaveBeenCalledWith({
      id: expect.anything(),
    })
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
    transaction.delete.mockReturnValueOnce(rows([{ id: 'relation-1' }]))

    const removed = await service.detachMany(POST_ID, [HASHTAG_ID], asTransaction(transaction))

    expect(removed).toBe(1)
    expect(transaction.delete).toHaveBeenCalledTimes(1)
    expect(db.delete).not.toHaveBeenCalled()
  })

  test('propagates delete failures untouched', async () => {
    const failure = new Error('delete failed')
    db.delete.mockReturnValueOnce(failing(failure))

    await expect(service.detachMany(POST_ID, [HASHTAG_ID])).rejects.toBe(failure)
  })

  test('propagates delete failures inside a transaction', async () => {
    const failure = new Error('transaction delete failed')
    transaction.delete.mockReturnValueOnce(failing(failure))

    await expect(
      service.detachMany(POST_ID, [HASHTAG_ID], asTransaction(transaction)),
    ).rejects.toBe(failure)

    expect(db.delete).not.toHaveBeenCalled()
  })
})

/* -------------------------------------------------------------------------- */
/* detachAll                                                                  */
/* -------------------------------------------------------------------------- */

describe('PostHashtagsService.detachAll', () => {
  test('deletes all hashtags of the given post and returns the count', async () => {
    const deleteChain = rows([{ id: 'relation-1' }, { id: 'relation-2' }])

    db.delete.mockReturnValueOnce(deleteChain)

    const removed = await service.detachAll(POST_ID)

    expect(removed).toBe(2)
    expect(db.delete).toHaveBeenCalledTimes(1)
    expect(deleteChain.where).toHaveBeenCalledTimes(1)
  })

  test('returns 0 when the post has no hashtags', async () => {
    db.delete.mockReturnValueOnce(rows([]))

    await expect(service.detachAll(POST_ID)).resolves.toBe(0)
  })

  test('only deletes hashtags belonging to the given post', async () => {
    const deleteChain = rows([])
    db.delete.mockReturnValueOnce(deleteChain)

    await service.detachAll(POST_ID)

    expect(whereParams(deleteChain)).toEqual([POST_ID])
  })

  test('only asks the database for the deleted ids', async () => {
    const deleteChain = rows([])
    db.delete.mockReturnValueOnce(deleteChain)

    await service.detachAll(POST_ID)

    expect(deleteChain.returning).toHaveBeenCalledWith({
      id: expect.anything(),
    })
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
    transaction.delete.mockReturnValueOnce(rows([{ id: 'relation-1' }]))

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
/* findByPostId                                                               */
/* -------------------------------------------------------------------------- */

describe('PostHashtagsService.findByPostId', () => {
  test('returns all hashtags of the given post', async () => {
    const hashtags = [
      makePostHashtag(),
      makePostHashtag({
        id: 'relation-2',
        hashtagId: HASHTAG_ID_2,
      }),
    ]

    const selectChain = rows(hashtags)
    db.select.mockReturnValueOnce(selectChain)

    const result = await service.findByPostId(POST_ID)

    expect(result).toEqual(hashtags)
    expect(db.select).toHaveBeenCalledTimes(1)
    expect(selectChain.from).toHaveBeenCalledTimes(1)
  })

  test('returns an empty array when the post has no hashtags', async () => {
    db.select.mockReturnValueOnce(rows([]))

    await expect(service.findByPostId(POST_ID)).resolves.toEqual([])
  })

  test('only looks up hashtags belonging to the given post', async () => {
    const selectChain = rows([])
    db.select.mockReturnValueOnce(selectChain)

    await service.findByPostId(POST_ID)

    expect(selectChain.where).toHaveBeenCalledTimes(1)
    expect(whereParams(selectChain)).toEqual([POST_ID])
  })

  test('treats an injection-looking post id as a bound parameter, never as SQL', async () => {
    const payload = "' OR 1=1 --"

    const selectChain = rows([])
    db.select.mockReturnValueOnce(selectChain)

    await service.findByPostId(payload)

    expect(whereParams(selectChain)).toContain(payload)
    expect(whereSql(selectChain)).not.toContain(payload)
  })

  test('uses the provided transaction instead of the main connection', async () => {
    const hashtags = [makePostHashtag()]
    transaction.select.mockReturnValueOnce(rows(hashtags))

    const result = await service.findByPostId(POST_ID, asTransaction(transaction))

    expect(result).toEqual(hashtags)
    expect(transaction.select).toHaveBeenCalledTimes(1)
    expect(db.select).not.toHaveBeenCalled()
  })

  test('falls back to the main connection when no transaction is given', async () => {
    db.select.mockReturnValueOnce(rows([]))

    await service.findByPostId(POST_ID)

    expect(db.select).toHaveBeenCalledTimes(1)
    expect(transaction.select).not.toHaveBeenCalled()
  })

  test('propagates database failures untouched', async () => {
    const failure = new Error('db down')
    db.select.mockReturnValueOnce(failing(failure))

    await expect(service.findByPostId(POST_ID)).rejects.toBe(failure)
  })

  test('propagates database failures inside a transaction', async () => {
    const failure = new Error('transaction db down')
    transaction.select.mockReturnValueOnce(failing(failure))

    await expect(service.findByPostId(POST_ID, asTransaction(transaction))).rejects.toBe(failure)

    expect(db.select).not.toHaveBeenCalled()
  })
})
