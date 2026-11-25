import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { BadRequestException, InternalServerErrorException } from 'lykosjs'
import type { Database, database } from '../../../../config/db/drizzle'
import { HashtagsService } from '../hashtags.service'
import { buildPagination } from '../../../../utilities/pagination'

// Typed test doubles (no `any`)

type Outcome = { readonly value: unknown } | { readonly error: Error }

class QueryChain implements PromiseLike<unknown> {
  readonly from = mock((..._args: unknown[]): QueryChain => this)
  readonly where = mock((..._args: unknown[]): QueryChain => this)
  readonly limit = mock((..._args: unknown[]): QueryChain => this)
  readonly offset = mock((..._args: unknown[]): QueryChain => this)
  readonly orderBy = mock((..._args: unknown[]): QueryChain => this)
  readonly values = mock((..._args: unknown[]): QueryChain => this)
  readonly onConflictDoNothing = mock((..._args: unknown[]): QueryChain => this)
  readonly returning = mock((..._args: unknown[]): QueryChain => this)
  readonly set = mock((..._args: unknown[]): QueryChain => this)

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
type Transaction = NonNullable<Parameters<HashtagsService['findOrCreate']>[1]>

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error: unknown) {
    return error
  }

  return undefined
}

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

const HASHTAG_ID = 'hashtag-1'
const HASHTAG_ID_2 = 'hashtag-2'
const HASHTAG_ID_3 = 'hashtag-3'

const makeHashtag = (overrides: Record<string, unknown> = {}) => ({
  id: HASHTAG_ID,
  name: 'typescript',
  postsCount: 0,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
})

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

let db: FakeDb
let transaction: FakeDb
let service: HashtagsService

beforeEach(() => {
  db = createFakeDb()
  transaction = createFakeDb()

  service = new HashtagsService({ connection: db } as unknown as Database)
})

const asTransaction = (fake: FakeDb): Transaction => fake as unknown as Transaction

/* -------------------------------------------------------------------------- */
/* findOrCreate                                                               */
/* -------------------------------------------------------------------------- */

describe('HashtagsService.findOrCreate', () => {
  test('creates a hashtag and returns the inserted row', async () => {
    const hashtag = makeHashtag()

    const insertChain = rows([hashtag])
    db.insert.mockReturnValueOnce(insertChain)

    const result = await service.findOrCreate('typescript')

    expect(result).toEqual(hashtag)
    expect(db.insert).toHaveBeenCalledTimes(1)
    expect(insertChain.values).toHaveBeenCalledTimes(1)
    expect(insertChain.onConflictDoNothing).toHaveBeenCalledTimes(1)
    expect(insertChain.returning).toHaveBeenCalledTimes(1)
  })

  test('normalizes the hashtag name before inserting', async () => {
    const insertChain = rows([makeHashtag()])
    db.insert.mockReturnValueOnce(insertChain)

    await service.findOrCreate('  #TypeScript  ')

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'typescript',
        postsCount: 0,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    )
  })

  test('removes only the first leading hash symbol', async () => {
    const insertChain = rows([makeHashtag({ name: '#typescript' })])
    db.insert.mockReturnValueOnce(insertChain)

    await service.findOrCreate('##TypeScript')

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '#typescript',
      }),
    )
  })

  test('rejects an empty hashtag name', async () => {
    const error = await captureRejection(service.findOrCreate(''))

    expect(error).toBeInstanceOf(BadRequestException)
    expect(db.insert).not.toHaveBeenCalled()
  })

  test('rejects a whitespace-only hashtag name', async () => {
    const error = await captureRejection(service.findOrCreate('   '))

    expect(error).toBeInstanceOf(BadRequestException)
    expect(db.insert).not.toHaveBeenCalled()
  })

  test('rejects a hashtag name longer than 100 characters after normalization', async () => {
    const error = await captureRejection(service.findOrCreate(`#${'a'.repeat(101)}`))

    expect(error).toBeInstanceOf(BadRequestException)
    expect(db.insert).not.toHaveBeenCalled()
  })

  test('accepts a hashtag name containing exactly 100 characters', async () => {
    const name = 'a'.repeat(100)
    const insertChain = rows([makeHashtag({ name })])

    db.insert.mockReturnValueOnce(insertChain)

    const result = await service.findOrCreate(name)

    expect(result).toEqual(makeHashtag({ name }))
    expect(db.insert).toHaveBeenCalledTimes(1)
  })

  test('uses the existing hashtag when the insert conflicts', async () => {
    const existing = makeHashtag()

    const selectChain = rows([existing])

    db.insert.mockReturnValueOnce(rows([]))
    db.select.mockReturnValueOnce(selectChain)

    const result = await service.findOrCreate('typescript')

    expect(result).toEqual(existing)
    expect(db.insert).toHaveBeenCalledTimes(1)
    expect(db.select).toHaveBeenCalledTimes(1)
    expect(whereParams(selectChain)).toEqual(['typescript'])
    expect(selectChain.limit).toHaveBeenCalledWith(1)
  })

  test('returns undefined when insert conflicts but no existing row is found', async () => {
    db.insert.mockReturnValueOnce(rows([]))
    db.select.mockReturnValueOnce(rows([]))

    const result = await service.findOrCreate('typescript')

    expect(result).toBeUndefined()
  })

  test('does not query for an existing hashtag when insertion succeeds', async () => {
    db.insert.mockReturnValueOnce(rows([makeHashtag()]))

    await service.findOrCreate('typescript')

    expect(db.select).not.toHaveBeenCalled()
  })

  test('uses the provided transaction instead of the main connection', async () => {
    transaction.insert.mockReturnValueOnce(rows([makeHashtag()]))

    const result = await service.findOrCreate('typescript', asTransaction(transaction))

    expect(result).toEqual(makeHashtag())
    expect(transaction.insert).toHaveBeenCalledTimes(1)
    expect(db.insert).not.toHaveBeenCalled()
  })

  test('uses the transaction for the conflict lookup too', async () => {
    const existing = makeHashtag()

    transaction.insert.mockReturnValueOnce(rows([]))
    transaction.select.mockReturnValueOnce(rows([existing]))

    const result = await service.findOrCreate('typescript', asTransaction(transaction))

    expect(result).toEqual(existing)
    expect(transaction.insert).toHaveBeenCalledTimes(1)
    expect(transaction.select).toHaveBeenCalledTimes(1)
    expect(db.insert).not.toHaveBeenCalled()
    expect(db.select).not.toHaveBeenCalled()
  })

  test('propagates insert failures untouched', async () => {
    const failure = new Error('insert failed')
    db.insert.mockReturnValueOnce(failing(failure))

    await expect(service.findOrCreate('typescript')).rejects.toBe(failure)
  })

  test('propagates conflict lookup failures untouched', async () => {
    const failure = new Error('lookup failed')

    db.insert.mockReturnValueOnce(rows([]))
    db.select.mockReturnValueOnce(failing(failure))

    await expect(service.findOrCreate('typescript')).rejects.toBe(failure)
  })
})

/* -------------------------------------------------------------------------- */
/* findOrCreateMany                                                           */
/* -------------------------------------------------------------------------- */

describe('HashtagsService.findOrCreateMany', () => {
  test('creates multiple hashtags and returns their rows', async () => {
    const first = makeHashtag()
    const second = makeHashtag({
      id: HASHTAG_ID_2,
      name: 'javascript',
    })

    db.insert.mockReturnValueOnce(rows([first])).mockReturnValueOnce(rows([second]))

    const result = await service.findOrCreateMany(['typescript', 'javascript'])

    expect(result).toEqual([first, second])
    expect(db.insert).toHaveBeenCalledTimes(2)
  })

  test('trims names and removes duplicate names before processing', async () => {
    db.insert
      .mockReturnValueOnce(rows([makeHashtag()]))
      .mockReturnValueOnce(rows([makeHashtag({ id: HASHTAG_ID_2, name: 'javascript' })]))

    const result = await service.findOrCreateMany([
      'typescript',
      ' typescript ',
      'javascript',
      'typescript',
    ])

    expect(result).toHaveLength(2)
    expect(db.insert).toHaveBeenCalledTimes(2)
  })

  test('ignores empty and whitespace-only names', async () => {
    db.insert.mockReturnValueOnce(rows([makeHashtag()]))

    const result = await service.findOrCreateMany(['', '   ', 'typescript', ' '])

    expect(result).toEqual([makeHashtag()])
    expect(db.insert).toHaveBeenCalledTimes(1)
  })

  test('returns an empty array when no valid names are given', async () => {
    const result = await service.findOrCreateMany(['', '   ', ''])

    expect(result).toEqual([])
    expect(db.insert).not.toHaveBeenCalled()
    expect(db.select).not.toHaveBeenCalled()
  })

  test('uses findOrCreate for each unique name', async () => {
    db.insert
      .mockReturnValueOnce(rows([makeHashtag()]))
      .mockReturnValueOnce(rows([makeHashtag({ id: HASHTAG_ID_2, name: 'javascript' })]))

    await service.findOrCreateMany(['typescript', 'typescript', 'javascript'])

    expect(db.insert).toHaveBeenCalledTimes(2)
  })

  test('throws an internal server error when a hashtag cannot be found or created', async () => {
    db.insert.mockReturnValueOnce(rows([]))
    db.select.mockReturnValueOnce(rows([]))

    const error = await captureRejection(service.findOrCreateMany(['typescript']))

    expect(error).toBeInstanceOf(InternalServerErrorException)
  })

  test('includes the failed hashtag name in the error message', async () => {
    db.insert.mockReturnValueOnce(rows([]))
    db.select.mockReturnValueOnce(rows([]))

    const error = await captureRejection(service.findOrCreateMany(['typescript']))

    expect(error).toBeInstanceOf(InternalServerErrorException)

    if (error instanceof Error) {
      expect(error.message).toContain('typescript')
    }
  })

  test('uses the provided transaction for every hashtag', async () => {
    transaction.insert
      .mockReturnValueOnce(rows([makeHashtag()]))
      .mockReturnValueOnce(rows([makeHashtag({ id: HASHTAG_ID_2, name: 'javascript' })]))

    const result = await service.findOrCreateMany(
      ['typescript', 'javascript'],
      asTransaction(transaction),
    )

    expect(result).toHaveLength(2)
    expect(transaction.insert).toHaveBeenCalledTimes(2)
    expect(db.insert).not.toHaveBeenCalled()
  })

  test('propagates database failures untouched', async () => {
    const failure = new Error('db down')
    db.insert.mockReturnValueOnce(failing(failure))

    await expect(service.findOrCreateMany(['typescript'])).rejects.toBe(failure)
  })
})

/* -------------------------------------------------------------------------- */
/* findByName                                                                 */
/* -------------------------------------------------------------------------- */

describe('HashtagsService.findByName', () => {
  test('returns the matching hashtag', async () => {
    const hashtag = makeHashtag()
    const selectChain = rows([hashtag])

    db.select.mockReturnValueOnce(selectChain)

    const result = await service.findByName('typescript')

    expect(result).toEqual(hashtag)
    expect(selectChain.limit).toHaveBeenCalledWith(1)
  })

  test('normalizes the name before searching', async () => {
    const selectChain = rows([makeHashtag()])
    db.select.mockReturnValueOnce(selectChain)

    await service.findByName('  #TypeScript  ')

    expect(whereParams(selectChain)).toEqual(['typescript'])
  })

  test('returns null when the hashtag does not exist', async () => {
    db.select.mockReturnValueOnce(rows([]))

    await expect(service.findByName('typescript')).resolves.toBeNull()
  })

  test('uses the provided transaction instead of the main connection', async () => {
    const hashtag = makeHashtag()
    transaction.select.mockReturnValueOnce(rows([hashtag]))

    const result = await service.findByName('typescript', asTransaction(transaction))

    expect(result).toEqual(hashtag)
    expect(transaction.select).toHaveBeenCalledTimes(1)
    expect(db.select).not.toHaveBeenCalled()
  })

  test('propagates database failures untouched', async () => {
    const failure = new Error('db down')
    db.select.mockReturnValueOnce(failing(failure))

    await expect(service.findByName('typescript')).rejects.toBe(failure)
  })

  test('treats an injection-looking name as a bound parameter, never as SQL', async () => {
    const payload = "' OR 1=1 --"
    const selectChain = rows([])

    db.select.mockReturnValueOnce(selectChain)

    await service.findByName(payload)

    expect(whereParams(selectChain)).toContain(payload.toLowerCase())
    expect(whereSql(selectChain)).not.toContain(payload)
  })
})
/* -------------------------------------------------------------------------- */
/* findTrending                                                               */
/* -------------------------------------------------------------------------- */

describe('HashtagsService.findTrending', () => {
  test('returns hashtags with pagination', async () => {
    const hashtags = [makeHashtag(), makeHashtag({ id: HASHTAG_ID_2, name: 'javascript' })]

    db.select.mockReturnValueOnce(rows(hashtags)).mockReturnValueOnce(rows([{ total: 12 }]))

    const result = await service.findTrending(2, 5)

    expect(result).toEqual({
      success: true,
      data: hashtags,
      pagination: buildPagination(12, 2, 5),
    })
  })

  test('orders by postsCount descending and name ascending', async () => {
    const listChain = rows([])
    db.select.mockReturnValueOnce(listChain).mockReturnValueOnce(rows([{ total: 0 }]))

    await service.findTrending()

    expect(listChain.orderBy).toHaveBeenCalledTimes(1)
    expect(listChain.orderBy.mock.calls[0]?.length).toBe(2)
  })

  test('uses page=1, limit=10 and offset=0 by default', async () => {
    const listChain = rows([])

    db.select.mockReturnValueOnce(listChain).mockReturnValueOnce(rows([{ total: 0 }]))

    await service.findTrending()

    expect(listChain.limit).toHaveBeenCalledWith(10)
    expect(listChain.offset).toHaveBeenCalledWith(0)
  })

  test('derives the offset from page and limit', async () => {
    const listChain = rows([])

    db.select.mockReturnValueOnce(listChain).mockReturnValueOnce(rows([{ total: 0 }]))

    await service.findTrending(3, 5)

    expect(listChain.offset).toHaveBeenCalledWith(10)
  })

  test('honours an explicit offset', async () => {
    const listChain = rows([])

    db.select.mockReturnValueOnce(listChain).mockReturnValueOnce(rows([{ total: 0 }]))

    await service.findTrending(2, 10, 7)

    expect(listChain.offset).toHaveBeenCalledWith(7)
  })

  test('falls back to total = 0 when the count query returns no row', async () => {
    db.select.mockReturnValueOnce(rows([])).mockReturnValueOnce(rows([]))

    const result = await service.findTrending(1, 10)

    expect(result.pagination).toEqual(buildPagination(0, 1, 10))
  })

  test('propagates list query failures', async () => {
    const failure = new Error('list query failed')

    db.select.mockReturnValueOnce(failing(failure)).mockReturnValueOnce(rows([{ total: 0 }]))

    await expect(service.findTrending()).rejects.toBe(failure)
  })

  test('propagates count query failures', async () => {
    const failure = new Error('count query failed')

    db.select.mockReturnValueOnce(rows([])).mockReturnValueOnce(failing(failure))

    await expect(service.findTrending()).rejects.toBe(failure)
  })
})

/* -------------------------------------------------------------------------- */
/* incrementPostsCount                                                        */
/* -------------------------------------------------------------------------- */

describe('HashtagsService.incrementPostsCount', () => {
  test('increments postsCount for the given hashtag ids', async () => {
    const updateChain = rows([])
    db.update.mockReturnValueOnce(updateChain)

    await service.incrementPostsCount([HASHTAG_ID, HASHTAG_ID_2])

    expect(db.update).toHaveBeenCalledTimes(1)
    expect(updateChain.set).toHaveBeenCalledTimes(1)
    expect(updateChain.where).toHaveBeenCalledTimes(1)
  })

  test('uses SQL arithmetic instead of replacing the count with a fixed value', async () => {
    const updateChain = rows([])
    db.update.mockReturnValueOnce(updateChain)

    await service.incrementPostsCount([HASHTAG_ID])

    const values = updateChain.set.mock.calls[0]?.[0] as {
      postsCount: SQL
    }

    const query = dialect.sqlToQuery(values.postsCount)

    expect(query.sql).toMatch(/postsCount|posts_count/)
    expect(query.sql).toContain('+ 1')
  })
  test('filters by the given hashtag ids', async () => {
    const updateChain = rows([])
    db.update.mockReturnValueOnce(updateChain)

    await service.incrementPostsCount([HASHTAG_ID, HASHTAG_ID_2])

    const params = whereParams(updateChain)

    expect(params).toContain(HASHTAG_ID)
    expect(params).toContain(HASHTAG_ID_2)
  })

  test('does not query the database when no ids are given', async () => {
    await service.incrementPostsCount([])

    expect(db.update).not.toHaveBeenCalled()
  })

  test('uses the provided transaction instead of the main connection', async () => {
    transaction.update.mockReturnValueOnce(rows([]))

    await service.incrementPostsCount([HASHTAG_ID], asTransaction(transaction))

    expect(transaction.update).toHaveBeenCalledTimes(1)
    expect(db.update).not.toHaveBeenCalled()
  })

  test('propagates update failures untouched', async () => {
    const failure = new Error('increment failed')
    db.update.mockReturnValueOnce(failing(failure))

    await expect(service.incrementPostsCount([HASHTAG_ID])).rejects.toBe(failure)
  })
})

/* -------------------------------------------------------------------------- */
/* decrementPostsCount                                                        */
/* -------------------------------------------------------------------------- */

describe('HashtagsService.decrementPostsCount', () => {
  test('decrements postsCount for the given hashtag ids', async () => {
    const updateChain = rows([])
    db.update.mockReturnValueOnce(updateChain)

    await service.decrementPostsCount([HASHTAG_ID, HASHTAG_ID_2])

    expect(db.update).toHaveBeenCalledTimes(1)
    expect(updateChain.set).toHaveBeenCalledTimes(1)
    expect(updateChain.where).toHaveBeenCalledTimes(1)
  })

  test('uses SQL arithmetic instead of replacing the count with a fixed value', async () => {
    const updateChain = rows([])
    db.update.mockReturnValueOnce(updateChain)

    await service.decrementPostsCount([HASHTAG_ID])

    const values = updateChain.set.mock.calls[0]?.[0] as {
      postsCount: SQL
    }

    const query = dialect.sqlToQuery(values.postsCount)

    expect(query.sql).toMatch(/postsCount|posts_count/)
    expect(query.sql).toContain('- 1')
  })

  test('filters by the given hashtag ids', async () => {
    const updateChain = rows([])
    db.update.mockReturnValueOnce(updateChain)

    await service.decrementPostsCount([HASHTAG_ID, HASHTAG_ID_2])

    const params = whereParams(updateChain)

    expect(params).toContain(HASHTAG_ID)
    expect(params).toContain(HASHTAG_ID_2)
  })

  test('does not query the database when no ids are given', async () => {
    await service.decrementPostsCount([])

    expect(db.update).not.toHaveBeenCalled()
  })

  test('uses the provided transaction instead of the main connection', async () => {
    transaction.update.mockReturnValueOnce(rows([]))

    await service.decrementPostsCount([HASHTAG_ID], asTransaction(transaction))

    expect(transaction.update).toHaveBeenCalledTimes(1)
    expect(db.update).not.toHaveBeenCalled()
  })

  test('propagates update failures untouched', async () => {
    const failure = new Error('decrement failed')
    db.update.mockReturnValueOnce(failing(failure))

    await expect(service.decrementPostsCount([HASHTAG_ID])).rejects.toBe(failure)
  })
})
