import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { BadRequestException } from 'lykosjs'
import type { Database, database } from '../../../../config/db/drizzle'
import { PostQuotesService } from '../post-quotes.service'

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
  readonly where = mock((..._args: unknown[]): QueryChain => this)
  readonly orderBy = mock((..._args: unknown[]): QueryChain => this)
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
type Transaction = NonNullable<Parameters<PostQuotesService['attach']>[2]>

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

/** Simulates a PostgreSQL unique-violation error (SQLSTATE 23505). */
function uniqueViolation(): Error {
  return Object.assign(new Error('duplicate key value violates unique constraint'), {
    code: '23505',
  })
}

/* -------------------------------------------------------------------------- */
/*  Fixtures                                                                  */
/* -------------------------------------------------------------------------- */

const POST_ID = 'post-1'
const QUOTED_POST_ID = 'post-2'

const makeQuote = (overrides: Record<string, unknown> = {}) => ({
  id: 'quote-1',
  postId: POST_ID,
  quotedPostId: QUOTED_POST_ID,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
})

/* -------------------------------------------------------------------------- */
/*  Tests                                                                     */
/* -------------------------------------------------------------------------- */

let db: FakeDb
let transaction: FakeDb
let service: PostQuotesService

beforeEach(() => {
  db = createFakeDb()
  transaction = createFakeDb()
  service = new PostQuotesService({ connection: db } as unknown as Database)
})

const asTransaction = (fake: FakeDb): Transaction => fake as unknown as Transaction

describe('PostQuotesService.attach', () => {
  test('inserts a quote linking the post to the quoted post and resolves with nothing', async () => {
    const insertChain = rows([])
    db.insert.mockReturnValueOnce(insertChain)

    const result = await service.attach(POST_ID, QUOTED_POST_ID)

    expect(result).toBeUndefined()
    expect(db.insert).toHaveBeenCalledTimes(1)
    expect(insertChain.values).toHaveBeenCalledTimes(1)
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: POST_ID,
        quotedPostId: QUOTED_POST_ID,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    )
  })

  test('inserts exactly postId, quotedPostId, createdAt and updatedAt (nothing else)', async () => {
    const insertChain = rows([])
    db.insert.mockReturnValueOnce(insertChain)

    await service.attach(POST_ID, QUOTED_POST_ID)

    expect(Object.keys(insertChain.values.mock.calls[0]?.[0] as object).sort()).toEqual([
      'createdAt',
      'postId',
      'quotedPostId',
      'updatedAt',
    ])
  })

  test('uses the provided transaction instead of the main connection', async () => {
    const insertChain = rows([])
    transaction.insert.mockReturnValueOnce(insertChain)

    await service.attach(POST_ID, QUOTED_POST_ID, asTransaction(transaction))

    expect(transaction.insert).toHaveBeenCalledTimes(1)
    expect(insertChain.values).toHaveBeenCalledTimes(1)
    expect(db.insert).not.toHaveBeenCalled()
  })

  test('falls back to the main connection when no transaction is given', async () => {
    db.insert.mockReturnValueOnce(rows([]))

    await service.attach(POST_ID, QUOTED_POST_ID)

    expect(db.insert).toHaveBeenCalledTimes(1)
    expect(transaction.insert).not.toHaveBeenCalled()
  })

  test('propagates insert failures untouched', async () => {
    const failure = new Error('insert failed')
    db.insert.mockReturnValueOnce(failing(failure))

    await expect(service.attach(POST_ID, QUOTED_POST_ID)).rejects.toBe(failure)
  })

  test('propagates insert failures inside a transaction so the caller can roll back', async () => {
    const failure = new Error('insert failed')
    transaction.insert.mockReturnValueOnce(failing(failure))

    await expect(service.attach(POST_ID, QUOTED_POST_ID, asTransaction(transaction))).rejects.toBe(
      failure,
    )
  })

  // HARDENING — the service imports BadRequestException but never uses it: validation is missing.
  describe('hardening (EXPECTED TO FAIL until the service is fixed)', () => {
    test('rejects a post that quotes itself', async () => {
      const error = await captureRejection(service.attach(POST_ID, POST_ID))

      expect(error).toBeInstanceOf(BadRequestException)
      expect(db.insert).not.toHaveBeenCalled()
    })

    for (const [postId, quotedPostId] of [
      ['', QUOTED_POST_ID],
      [POST_ID, ''],
      ['   ', QUOTED_POST_ID],
      [POST_ID, '   '],
    ] as const) {
      test(`rejects blank ids (postId=${JSON.stringify(postId)}, quotedPostId=${JSON.stringify(quotedPostId)})`, async () => {
        const error = await captureRejection(service.attach(postId, quotedPostId))

        expect(error).toBeInstanceOf(BadRequestException)
        expect(db.insert).not.toHaveBeenCalled()
      })
    }

    // findByPostId assumes ONE quote per post. If several quotes per post are intended, delete this test.
    test('reports a duplicate quote as 400 instead of leaking a raw database error', async () => {
      db.insert.mockReturnValueOnce(failing(uniqueViolation()))

      const error = await captureRejection(service.attach(POST_ID, QUOTED_POST_ID))

      expect(error).toBeInstanceOf(BadRequestException)
    })
  })
})

describe('PostQuotesService.detach', () => {
  test('deletes the quotes of the post and returns how many were removed', async () => {
    const deleteChain = rows([{ id: 'quote-1' }])
    db.delete.mockReturnValueOnce(deleteChain)

    const removed = await service.detach(POST_ID)

    expect(removed).toBe(1)
    expect(db.delete).toHaveBeenCalledTimes(1)
  })

  test('returns 0 when the post had no quote', async () => {
    db.delete.mockReturnValueOnce(rows([]))

    await expect(service.detach(POST_ID)).resolves.toBe(0)
  })

  test('counts every deleted row', async () => {
    db.delete.mockReturnValueOnce(rows([{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }]))

    await expect(service.detach(POST_ID)).resolves.toBe(3)
  })

  test('only deletes quotes of the given post', async () => {
    const deleteChain = rows([])
    db.delete.mockReturnValueOnce(deleteChain)

    await service.detach(POST_ID)

    expect(deleteChain.where).toHaveBeenCalledTimes(1)
    expect(whereParams(deleteChain)).toEqual([POST_ID])
  })

  test('only asks the database for the deleted ids', async () => {
    const deleteChain = rows([])
    db.delete.mockReturnValueOnce(deleteChain)

    await service.detach(POST_ID)

    expect(Object.keys(deleteChain.returning.mock.calls[0]?.[0] as object)).toEqual(['id'])
  })

  test('treats an injection-looking post id as a bound parameter, never as SQL', async () => {
    const payload = "' OR 1=1 --"
    const deleteChain = rows([])
    db.delete.mockReturnValueOnce(deleteChain)

    await service.detach(payload)

    expect(whereParams(deleteChain)).toContain(payload)
    expect(whereSql(deleteChain)).not.toContain(payload)
  })

  test('uses the provided transaction instead of the main connection', async () => {
    transaction.delete.mockReturnValueOnce(rows([{ id: 'quote-1' }]))

    const removed = await service.detach(POST_ID, asTransaction(transaction))

    expect(removed).toBe(1)
    expect(transaction.delete).toHaveBeenCalledTimes(1)
    expect(db.delete).not.toHaveBeenCalled()
  })

  test('propagates delete failures untouched', async () => {
    const failure = new Error('delete failed')
    db.delete.mockReturnValueOnce(failing(failure))

    await expect(service.detach(POST_ID)).rejects.toBe(failure)
  })

  test('propagates delete failures inside a transaction so the caller can roll back', async () => {
    const failure = new Error('delete failed')
    transaction.delete.mockReturnValueOnce(failing(failure))

    await expect(service.detach(POST_ID, asTransaction(transaction))).rejects.toBe(failure)
  })
})

describe('PostQuotesService.findByPostId', () => {
  test('returns the quote of the post', async () => {
    const quote = makeQuote()
    db.select.mockReturnValueOnce(rows([quote]))

    await expect(service.findByPostId(POST_ID)).resolves.toEqual(quote)
  })

  test('returns null (not undefined) when the post has no quote', async () => {
    db.select.mockReturnValueOnce(rows([]))

    await expect(service.findByPostId(POST_ID)).resolves.toBeNull()
  })

  test('only looks at the given post and fetches a single row', async () => {
    const chain = rows([makeQuote()])
    db.select.mockReturnValueOnce(chain)

    await service.findByPostId(POST_ID)

    expect(whereParams(chain)).toEqual([POST_ID])
    expect(chain.limit).toHaveBeenCalledWith(1)
  })

  test('returns the first row when several are found', async () => {
    const first = makeQuote({ id: 'quote-1' })
    db.select.mockReturnValueOnce(rows([first, makeQuote({ id: 'quote-2' })]))

    await expect(service.findByPostId(POST_ID)).resolves.toEqual(first)
  })

  test('treats an injection-looking post id as a bound parameter, never as SQL', async () => {
    const payload = "' OR 1=1 --"
    const chain = rows([])
    db.select.mockReturnValueOnce(chain)

    await expect(service.findByPostId(payload)).resolves.toBeNull()

    expect(whereParams(chain)).toContain(payload)
    expect(whereSql(chain)).not.toContain(payload)
  })

  test('uses the provided transaction instead of the main connection', async () => {
    const quote = makeQuote()
    transaction.select.mockReturnValueOnce(rows([quote]))

    const result = await service.findByPostId(POST_ID, asTransaction(transaction))

    expect(result).toEqual(quote)
    expect(transaction.select).toHaveBeenCalledTimes(1)
    expect(db.select).not.toHaveBeenCalled()
  })

  test('propagates database failures', async () => {
    db.select.mockReturnValueOnce(failing(new Error('db down')))

    await expect(service.findByPostId(POST_ID)).rejects.toThrow('db down')
  })

  describe('hardening (EXPECTED TO FAIL until the service is fixed)', () => {
    // attach() does not prevent several quotes per post, and LIMIT 1 without ORDER BY then returns
    // an arbitrary one. Either enforce uniqueness in attach() or order deterministically here.
    test('orders deterministically before taking a single row', async () => {
      const chain = rows([makeQuote()])
      db.select.mockReturnValueOnce(chain)

      await service.findByPostId(POST_ID)

      expect(chain.orderBy).toHaveBeenCalled()
    })
  })
})
