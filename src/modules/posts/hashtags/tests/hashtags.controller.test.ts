import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { HashtagsService } from '../hashtags.service'
import { HashtagsController } from '../hashtags.controller'
import { getPagination } from '../../../../utilities/pagination'

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const makeRequest = (overrides: Record<string, unknown> = {}) => ({
  query: new URLSearchParams({
    page: '1',
    limit: '10',
  }),
  ...overrides,
})

const makeResponse = () => ({
  OK: mock((..._args: unknown[]) => ({
    status: 200,
  })),
})

const makeTrendingResult = (overrides: Record<string, unknown> = {}) => ({
  success: true,
  data: [
    {
      id: 'hashtag-1',
      name: 'typescript',
      postsCount: 25,
    },
    {
      id: 'hashtag-2',
      name: 'javascript',
      postsCount: 18,
    },
  ],
  pagination: {
    page: 1,
    limit: 10,
    total: 2,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  },
  ...overrides,
})

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

let findTrending: ReturnType<typeof mock>
let hashtagsService: {
  findTrending: ReturnType<typeof mock>
}
let controller: HashtagsController

beforeEach(() => {
  findTrending = mock(() => Promise.resolve(makeTrendingResult()))

  hashtagsService = {
    findTrending,
  }

  controller = new HashtagsController(hashtagsService as unknown as HashtagsService)
})

const invokeFindTrending = async (
  request: ReturnType<typeof makeRequest>,
  response: ReturnType<typeof makeResponse>,
): Promise<unknown> => {
  const handler = controller.findTrending as unknown as (
    req: unknown,
    res: unknown,
  ) => Promise<unknown>

  return handler(request, response)
}

/* -------------------------------------------------------------------------- */
/* findTrending                                                               */
/* -------------------------------------------------------------------------- */

describe('HashtagsController.findTrending', () => {
  test('returns trending hashtags successfully', async () => {
    const result = makeTrendingResult()

    findTrending.mockResolvedValueOnce(result)

    const req = makeRequest()
    const res = makeResponse()

    await invokeFindTrending(req, res)

    expect(res.OK).toHaveBeenCalledTimes(1)
    expect(res.OK).toHaveBeenCalledWith({
      success: true,
      data: result,
    })
  })

  test('calls findTrending with pagination values from the request', async () => {
    const req = makeRequest({
      query: new URLSearchParams({
        page: '2',
        limit: '5',
      }),
    })

    const res = makeResponse()

    const pagination = getPagination(req as never)

    await invokeFindTrending(req, res)

    expect(findTrending).toHaveBeenCalledWith(pagination.page, pagination.limit, pagination.offset)
  })

  test('uses default pagination when query parameters are missing', async () => {
    const req = makeRequest()
    const res = makeResponse()

    const pagination = getPagination(req as never)

    await invokeFindTrending(req, res)

    expect(findTrending).toHaveBeenCalledWith(pagination.page, pagination.limit, pagination.offset)
  })

  test('returns an empty data result successfully', async () => {
    const result = makeTrendingResult({
      data: [],
      pagination: {
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    })

    findTrending.mockResolvedValueOnce(result)

    const req = makeRequest()
    const res = makeResponse()

    await invokeFindTrending(req, res)

    expect(res.OK).toHaveBeenCalledWith({
      success: true,
      data: result,
    })
  })

  test('preserves the service response without modifying its structure', async () => {
    const result = makeTrendingResult({
      pagination: {
        page: 3,
        limit: 5,
        total: 25,
        totalPages: 5,
        hasNextPage: true,
        hasPreviousPage: true,
      },
    })

    findTrending.mockResolvedValueOnce(result)

    const req = makeRequest()
    const res = makeResponse()

    await invokeFindTrending(req, res)

    const response = res.OK.mock.calls[0]?.[0]

    expect(response).toEqual({
      success: true,
      data: result,
    })
    expect(response).not.toHaveProperty('pagination', result.pagination)
  })

  test('returns the result of OK', async () => {
    const responseResult = { status: 200, body: 'OK' }
    const req = makeRequest()

    const res = {
      OK: mock(() => responseResult),
    }

    const result = await invokeFindTrending(req, res)

    expect(result).toBe(responseResult)
  })

  test('propagates service errors untouched', async () => {
    const failure = new Error('Failed to fetch trending hashtags')

    findTrending.mockRejectedValueOnce(failure)

    const req = makeRequest()
    const res = makeResponse()

    await expect(invokeFindTrending(req, res)).rejects.toBe(failure)

    expect(res.OK).not.toHaveBeenCalled()
  })

  test('does not call the service more than once', async () => {
    const req = makeRequest()
    const res = makeResponse()

    await invokeFindTrending(req, res)

    expect(findTrending).toHaveBeenCalledTimes(1)
  })
})
