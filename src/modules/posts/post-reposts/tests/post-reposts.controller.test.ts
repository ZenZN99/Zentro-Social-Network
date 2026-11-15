import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { PostRepostsService } from '../post-reposts.service'

/* -------------------------------------------------------------------------- */
/* Pagination mock                                                            */
/* -------------------------------------------------------------------------- */

const actualPagination = await import('../../../../utilities/pagination')

const getPaginationMock = mock((_req: unknown) => ({
  page: 1,
  limit: 10,
  offset: 0,
}))

mock.module('../../../../utilities/pagination', () => ({
  ...actualPagination,
  getPagination: getPaginationMock,
}))

const { PostRepostsController } = await import('../post-reposts.controller')

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const USER_ID = 'USER_1'
const AUTHOR_ID = 'USER_2'
const POST_ID = 'POST_1'

const makeRequest = (overrides: Record<string, unknown> = {}) => ({
  user: {
    id: USER_ID,
  },
  params: {},
  query: new URLSearchParams({
    page: '1',
    limit: '10',
  }),
  ...overrides,
})

const makeResponse = () => ({
  SpongOK: mock((payload: unknown) => ({
    status: 200,
    payload,
  })),
  SpongBadRequest: mock((payload: unknown) => ({
    status: 400,
    payload,
  })),
})

const makeRepostResult = (overrides: Record<string, unknown> = {}) => ({
  success: true,
  message: 'Post reposted successfully',
  ...overrides,
})

const makeFindResult = (overrides: Record<string, unknown> = {}) => ({
  success: true,
  data: [
    {
      repost: {
        id: 'REPOST_1',
        postId: POST_ID,
        repostedByUserId: USER_ID,
      },
      post: {
        post: {
          id: POST_ID,
          authorId: AUTHOR_ID,
        },
        author: {
          id: AUTHOR_ID,
          username: 'author',
        },
        profile: null,
      },
    },
  ],
  pagination: {
    page: 1,
    limit: 10,
    total: 1,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  },
  ...overrides,
})

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

let repost: ReturnType<typeof mock>
let findByUserId: ReturnType<typeof mock>
let findMe: ReturnType<typeof mock>

let postRepostsService: {
  repost: ReturnType<typeof mock>
  findByUserId: ReturnType<typeof mock>
  findMe: ReturnType<typeof mock>
}

let controller: InstanceType<typeof PostRepostsController>

beforeEach(() => {
  getPaginationMock.mockClear()
  getPaginationMock.mockReturnValue({
    page: 1,
    limit: 10,
    offset: 0,
  })

  repost = mock(() => Promise.resolve(makeRepostResult()))
  findByUserId = mock(() => Promise.resolve(makeFindResult()))
  findMe = mock(() => Promise.resolve(makeFindResult()))

  postRepostsService = {
    repost,
    findByUserId,
    findMe,
  }

  controller = new PostRepostsController(postRepostsService as unknown as PostRepostsService)
})

const invokeHandler = async (
  handler: unknown,
  request: ReturnType<typeof makeRequest>,
  response: ReturnType<typeof makeResponse>,
): Promise<unknown> => {
  const callback = handler as (req: unknown, res: unknown) => Promise<unknown>

  return callback(request, response)
}

/* -------------------------------------------------------------------------- */
/* repost                                                                     */
/* -------------------------------------------------------------------------- */

describe('PostRepostsController.repost', () => {
  test('reposts a post successfully', async () => {
    const req = makeRequest({
      params: {
        postId: POST_ID,
      },
    })

    const res = makeResponse()

    await invokeHandler(controller.repost, req, res)

    expect(repost).toHaveBeenCalledTimes(1)
    expect(repost).toHaveBeenCalledWith(USER_ID, POST_ID)

    expect(res.SpongOK).toHaveBeenCalledWith({
      success: true,
      message: 'Post reposted successfully',
    })
  })

  test('returns BadRequest when postId is missing', async () => {
    const req = makeRequest()
    const res = makeResponse()

    await invokeHandler(controller.repost, req, res)

    expect(res.SpongBadRequest).toHaveBeenCalledTimes(1)
    expect(res.SpongBadRequest).toHaveBeenCalledWith({
      success: false,
      message: 'Post ID is required',
    })

    expect(repost).not.toHaveBeenCalled()
    expect(res.SpongOK).not.toHaveBeenCalled()
  })

  test('returns BadRequest when postId is empty', async () => {
    const req = makeRequest({
      params: {
        postId: '',
      },
    })

    const res = makeResponse()

    await invokeHandler(controller.repost, req, res)

    expect(res.SpongBadRequest).toHaveBeenCalledWith({
      success: false,
      message: 'Post ID is required',
    })

    expect(repost).not.toHaveBeenCalled()
  })

  test('passes the authenticated user ID to the service', async () => {
    const req = makeRequest({
      user: {
        id: 'USER_99',
      },
      params: {
        postId: POST_ID,
      },
    })

    const res = makeResponse()

    await invokeHandler(controller.repost, req, res)

    expect(repost).toHaveBeenCalledWith('USER_99', POST_ID)
  })

  test('returns the service success result', async () => {
    repost.mockResolvedValueOnce({
      success: true,
      message: 'Post reposted successfully',
    })

    const req = makeRequest({
      params: {
        postId: POST_ID,
      },
    })

    const res = makeResponse()

    await invokeHandler(controller.repost, req, res)

    expect(res.SpongOK).toHaveBeenCalledWith({
      success: true,
      message: 'Post reposted successfully',
    })
  })

  test('returns the service failure result', async () => {
    repost.mockResolvedValueOnce({
      success: false,
      message: 'Repost failed',
    })

    const req = makeRequest({
      params: {
        postId: POST_ID,
      },
    })

    const res = makeResponse()

    await invokeHandler(controller.repost, req, res)

    expect(res.SpongOK).toHaveBeenCalledWith({
      success: false,
      message: 'Repost failed',
    })
  })

  test('does not expose additional service properties in the response', async () => {
    repost.mockResolvedValueOnce({
      success: true,
      message: 'Post reposted successfully',
      authorId: AUTHOR_ID,
    })

    const req = makeRequest({
      params: {
        postId: POST_ID,
      },
    })

    const res = makeResponse()

    await invokeHandler(controller.repost, req, res)

    expect(res.SpongOK).toHaveBeenCalledWith({
      success: true,
      message: 'Post reposted successfully',
    })

    const response = res.SpongOK.mock.calls[0]?.[0] as Record<string, unknown> | undefined

    expect(response).not.toHaveProperty('authorId')
  })

  test('propagates service errors', async () => {
    const error = new Error('Repost failed')

    repost.mockRejectedValueOnce(error)

    const req = makeRequest({
      params: {
        postId: POST_ID,
      },
    })

    const res = makeResponse()

    await expect(invokeHandler(controller.repost, req, res)).rejects.toBe(error)

    expect(res.SpongOK).not.toHaveBeenCalled()
  })
})

/* -------------------------------------------------------------------------- */
/* findByUserId                                                               */
/* -------------------------------------------------------------------------- */

describe('PostRepostsController.findByUserId', () => {
  test('returns user reposts successfully', async () => {
    const result = makeFindResult()

    findByUserId.mockResolvedValueOnce(result)

    const req = makeRequest({
      params: {
        userId: USER_ID,
      },
    })

    const res = makeResponse()

    await invokeHandler(controller.findByUserId, req, res)

    expect(findByUserId).toHaveBeenCalledTimes(1)
    expect(findByUserId).toHaveBeenCalledWith(USER_ID, 1, 10, 0)

    expect(res.SpongOK).toHaveBeenCalledWith({
      success: true,
      data: {
        reposts: result.data,
        pagination: result.pagination,
      },
    })
  })

  test('returns BadRequest when userId is missing', async () => {
    const req = makeRequest()
    const res = makeResponse()

    await invokeHandler(controller.findByUserId, req, res)

    expect(res.SpongBadRequest).toHaveBeenCalledTimes(1)
    expect(res.SpongBadRequest).toHaveBeenCalledWith({
      success: false,
      message: 'User ID is required',
    })

    expect(findByUserId).not.toHaveBeenCalled()
    expect(res.SpongOK).not.toHaveBeenCalled()
  })

  test('returns BadRequest when userId is empty', async () => {
    const req = makeRequest({
      params: {
        userId: '',
      },
    })

    const res = makeResponse()

    await invokeHandler(controller.findByUserId, req, res)

    expect(res.SpongBadRequest).toHaveBeenCalledWith({
      success: false,
      message: 'User ID is required',
    })

    expect(findByUserId).not.toHaveBeenCalled()
  })

  test('passes the requested user ID to the service', async () => {
    const req = makeRequest({
      params: {
        userId: 'USER_99',
      },
    })

    const res = makeResponse()

    await invokeHandler(controller.findByUserId, req, res)

    expect(findByUserId).toHaveBeenCalledWith('USER_99', 1, 10, 0)
  })

  test('passes pagination values from the request', async () => {
    getPaginationMock.mockReturnValue({
      page: 2,
      limit: 5,
      offset: 5,
    })

    const req = makeRequest({
      params: {
        userId: USER_ID,
      },
      query: new URLSearchParams({
        page: '2',
        limit: '5',
      }),
    })

    const res = makeResponse()

    await invokeHandler(controller.findByUserId, req, res)

    expect(getPaginationMock).toHaveBeenCalledWith(req)
    expect(findByUserId).toHaveBeenCalledWith(USER_ID, 2, 5, 5)
  })

  test('uses default pagination when query parameters are missing', async () => {
    const req = makeRequest({
      params: {
        userId: USER_ID,
      },
      query: new URLSearchParams(),
    })

    const res = makeResponse()

    await invokeHandler(controller.findByUserId, req, res)

    expect(getPaginationMock).toHaveBeenCalledWith(req)
    expect(findByUserId).toHaveBeenCalledWith(USER_ID, 1, 10, 0)
  })

  test('returns empty reposts successfully', async () => {
    const result = makeFindResult({
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

    findByUserId.mockResolvedValueOnce(result)

    const req = makeRequest({
      params: {
        userId: USER_ID,
      },
    })

    const res = makeResponse()

    await invokeHandler(controller.findByUserId, req, res)

    expect(res.SpongOK).toHaveBeenCalledWith({
      success: true,
      data: {
        reposts: [],
        pagination: result.pagination,
      },
    })
  })

  test('preserves the service pagination in the response', async () => {
    const result = makeFindResult({
      pagination: {
        page: 3,
        limit: 5,
        total: 25,
        totalPages: 5,
        hasNextPage: true,
        hasPreviousPage: true,
      },
    })

    findByUserId.mockResolvedValueOnce(result)

    const req = makeRequest({
      params: {
        userId: USER_ID,
      },
    })

    const res = makeResponse()

    await invokeHandler(controller.findByUserId, req, res)

    expect(res.SpongOK).toHaveBeenCalledWith({
      success: true,
      data: {
        reposts: result.data,
        pagination: result.pagination,
      },
    })
  })

  test('propagates service errors', async () => {
    const error = new Error('Failed to fetch user reposts')

    findByUserId.mockRejectedValueOnce(error)

    const req = makeRequest({
      params: {
        userId: USER_ID,
      },
    })

    const res = makeResponse()

    await expect(invokeHandler(controller.findByUserId, req, res)).rejects.toBe(error)

    expect(res.SpongOK).not.toHaveBeenCalled()
  })
})

/* -------------------------------------------------------------------------- */
/* findMe                                                                     */
/* -------------------------------------------------------------------------- */

describe('PostRepostsController.findMe', () => {
  test('returns authenticated user reposts successfully', async () => {
    const result = makeFindResult()

    findMe.mockResolvedValueOnce(result)

    const req = makeRequest()
    const res = makeResponse()

    await invokeHandler(controller.findMe, req, res)

    expect(findMe).toHaveBeenCalledTimes(1)
    expect(findMe).toHaveBeenCalledWith(USER_ID, 1, 10, 0)

    expect(res.SpongOK).toHaveBeenCalledWith({
      success: true,
      data: {
        reposts: result.data,
        pagination: result.pagination,
      },
    })
  })

  test('uses the authenticated user ID instead of request params', async () => {
    const req = makeRequest({
      user: {
        id: 'USER_99',
      },
      params: {
        userId: 'USER_OTHERS',
      },
    })

    const res = makeResponse()

    await invokeHandler(controller.findMe, req, res)

    expect(findMe).toHaveBeenCalledWith('USER_99', 1, 10, 0)
  })

  test('passes pagination values from the request', async () => {
    getPaginationMock.mockReturnValue({
      page: 3,
      limit: 5,
      offset: 10,
    })

    const req = makeRequest({
      query: new URLSearchParams({
        page: '3',
        limit: '5',
      }),
    })

    const res = makeResponse()

    await invokeHandler(controller.findMe, req, res)

    expect(getPaginationMock).toHaveBeenCalledWith(req)
    expect(findMe).toHaveBeenCalledWith(USER_ID, 3, 5, 10)
  })

  test('uses default pagination when query parameters are missing', async () => {
    const req = makeRequest({
      query: new URLSearchParams(),
    })

    const res = makeResponse()

    await invokeHandler(controller.findMe, req, res)

    expect(getPaginationMock).toHaveBeenCalledWith(req)
    expect(findMe).toHaveBeenCalledWith(USER_ID, 1, 10, 0)
  })

  test('returns empty reposts successfully', async () => {
    const result = makeFindResult({
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

    findMe.mockResolvedValueOnce(result)

    const req = makeRequest()
    const res = makeResponse()

    await invokeHandler(controller.findMe, req, res)

    expect(res.SpongOK).toHaveBeenCalledWith({
      success: true,
      data: {
        reposts: [],
        pagination: result.pagination,
      },
    })
  })

  test('preserves the service response structure', async () => {
    const result = makeFindResult()

    findMe.mockResolvedValueOnce(result)

    const req = makeRequest()
    const res = makeResponse()

    await invokeHandler(controller.findMe, req, res)

    expect(res.SpongOK).toHaveBeenCalledWith({
      success: result.success,
      data: {
        reposts: result.data,
        pagination: result.pagination,
      },
    })
  })

  test('does not expose additional service properties', async () => {
    findMe.mockResolvedValueOnce({
      ...makeFindResult(),
      internalField: 'private',
    })

    const req = makeRequest()
    const res = makeResponse()

    await invokeHandler(controller.findMe, req, res)

    const response = res.SpongOK.mock.calls[0]?.[0] as Record<string, unknown> | undefined

    expect(response).not.toHaveProperty('internalField')
  })

  test('propagates service errors', async () => {
    const error = new Error('Failed to fetch current user reposts')

    findMe.mockRejectedValueOnce(error)

    const req = makeRequest()
    const res = makeResponse()

    await expect(invokeHandler(controller.findMe, req, res)).rejects.toBe(error)

    expect(res.SpongOK).not.toHaveBeenCalled()
  })
})