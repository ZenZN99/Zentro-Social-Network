import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { BookmarksService } from '../bookmarks.service'
import type { SpongHandler } from 'riser-bob'

const getPaginationMock = mock((_req: unknown) => ({
  page: 1,
  limit: 10,
  offset: 0,
}))

const actualPagination = await import('../../../utilities/pagination')

mock.module('../../../utilities/pagination', () => ({
  ...actualPagination,
  getPagination: getPaginationMock,
}))

const { BookmarksController } = await import('../bookmarks.controller')

type FindMeResult = {
  success: boolean
  bookmarks: {
    bookmark: {
      id: string
      postId: string
    }
    post: null
  }[]
  pagination: {
    total: number
    page: number
    limit: number
    totalPages: number
    hasNextPage: boolean
    hasPreviousPage: boolean
  }
}

const createService = () => ({
  toggle: mock(async (_userId: string, _postId: string) => ({
    success: true,
    isBookmarked: true,
    message: 'Post bookmarked successfully',
  })),

  findMe: mock(
    async (
      _userId: string,
      _page: number,
      _limit: number,
      _offset: number,
    ): Promise<FindMeResult> => ({
      success: true,
      bookmarks: [],
      pagination: {
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    }),
  ),

  isBookmarked: mock(async (_userId: string, _postId: string) => ({
    success: true,
    isBookmarked: true,
  })),

  countByPostId: mock(async (_postId: string) => ({
    success: true,
    bookmarksCount: 5,
  })),

  countMe: mock(async (_userId: string) => ({
    success: true,
    bookmarksCount: 3,
  })),
})

type MockService = ReturnType<typeof createService>

const createRequest = (
  overrides: {
    user?: { id: string }
    params?: Record<string, string | undefined>
  } = {},
) => ({
  user: overrides.user ?? { id: 'user-id' },
  params: overrides.params ?? { postId: 'post-id' },
})

const createResponse = () => ({
  SpongBadRequest: mock((body: unknown) => Response.json(body, { status: 400 })),

  SpongOK: mock((body: unknown) => Response.json(body, { status: 200 })),
})

const invoke = (
  handler: SpongHandler,
  request: ReturnType<typeof createRequest>,
  response: ReturnType<typeof createResponse>,
) => handler(request as never, response as never)
const createController = (service: MockService) =>
  new BookmarksController(service as unknown as BookmarksService)

describe('BookmarksController', () => {
  beforeEach(() => {
    getPaginationMock.mockClear()
    getPaginationMock.mockReturnValue({
      page: 1,
      limit: 10,
      offset: 0,
    })
  })
  describe('toggle', () => {
    test('should toggle bookmark successfully', async () => {
      const service = createService()
      const controller = createController(service)
      const request = createRequest()
      const response = createResponse()

      const result = await invoke(controller.toggle, request, response)

      expect(service.toggle).toHaveBeenCalledWith('user-id', 'post-id')

      expect(response.SpongOK).toHaveBeenCalledWith({
        success: true,
        message: 'Post bookmarked successfully',
        data: {
          isBookmarked: true,
        },
      })

      expect(result).toBeInstanceOf(Response)

      if (!(result instanceof Response)) {
        throw new Error('Expected a Response instance')
      }

      expect(result.status).toBe(200)

      expect(await result.json()).toEqual({
        success: true,
        message: 'Post bookmarked successfully',
        data: {
          isBookmarked: true,
        },
      })
    })

    test('should return BadRequest when postId is missing', async () => {
      const service = createService()
      const controller = createController(service)
      const request = createRequest({
        params: {},
      })
      const response = createResponse()

      await invoke(controller.toggle, request, response)

      expect(response.SpongBadRequest).toHaveBeenCalledWith({
        success: false,
        message: 'Post ID is required',
      })

      expect(service.toggle).not.toHaveBeenCalled()
    })

    test('should return isBookmarked false when bookmark is removed', async () => {
      const service = createService()

      service.toggle.mockResolvedValue({
        success: true,
        isBookmarked: false,
        message: 'Bookmark removed successfully',
      })

      const controller = createController(service)
      const response = createResponse()

      await invoke(controller.toggle, createRequest(), response)

      expect(response.SpongOK).toHaveBeenCalledWith({
        success: true,
        message: 'Bookmark removed successfully',
        data: {
          isBookmarked: false,
        },
      })
    })

    test('should propagate service errors', async () => {
      const service = createService()

      service.toggle.mockRejectedValue(new Error('Toggle failed'))

      const controller = createController(service)

      await expect(invoke(controller.toggle, createRequest(), createResponse())).rejects.toThrow(
        'Toggle failed',
      )
    })
  })

  describe('findMe', () => {
    test('should return user bookmarks successfully', async () => {
      const service = createService()

      service.findMe.mockResolvedValue({
        success: true,
        bookmarks: [
          {
            bookmark: {
              id: 'bookmark-id',
              postId: 'post-id',
            },
            post: null,
          },
        ],
        pagination: {
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      })

      const controller = createController(service)
      const request = createRequest()
      const response = createResponse()

      await invoke(controller.findMe, request, response)

      expect(getPaginationMock).toHaveBeenCalledWith(request)
      expect(service.findMe).toHaveBeenCalledWith('user-id', 1, 10, 0)

      expect(response.SpongOK).toHaveBeenCalledWith({
        success: true,
        data: {
          bookmarks: [
            {
              bookmark: {
                id: 'bookmark-id',
                postId: 'post-id',
              },
              post: null,
            },
          ],
          pagination: {
            total: 1,
            page: 1,
            limit: 10,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false,
          },
        },
      })
    })

    test('should pass custom pagination values to service', async () => {
      getPaginationMock.mockReturnValue({
        page: 3,
        limit: 5,
        offset: 10,
      })

      const service = createService()
      const controller = createController(service)

      await invoke(controller.findMe, createRequest(), createResponse())

      expect(service.findMe).toHaveBeenCalledWith('user-id', 3, 5, 10)
    })

    test('should return empty bookmarks successfully', async () => {
      const service = createService()
      const controller = createController(service)
      const response = createResponse()

      await invoke(controller.findMe, createRequest(), response)

      expect(response.SpongOK).toHaveBeenCalledWith({
        success: true,
        data: {
          bookmarks: [],
          pagination: expect.any(Object),
        },
      })
    })

    test('should propagate service errors', async () => {
      const service = createService()

      service.findMe.mockRejectedValue(new Error('Find bookmarks failed'))

      const controller = createController(service)

      await expect(invoke(controller.findMe, createRequest(), createResponse())).rejects.toThrow(
        'Find bookmarks failed',
      )
    })
  })

  describe('isBookmarked', () => {
    test('should return true when post is bookmarked', async () => {
      const service = createService()
      const controller = createController(service)
      const response = createResponse()

      await invoke(controller.isBookmarked, createRequest(), response)

      expect(service.isBookmarked).toHaveBeenCalledWith('user-id', 'post-id')

      expect(response.SpongOK).toHaveBeenCalledWith({
        success: true,
        data: {
          isBookmarked: true,
        },
      })
    })

    test('should return false when post is not bookmarked', async () => {
      const service = createService()

      service.isBookmarked.mockResolvedValue({
        success: true,
        isBookmarked: false,
      })

      const controller = createController(service)
      const response = createResponse()

      await invoke(controller.isBookmarked, createRequest(), response)

      expect(response.SpongOK).toHaveBeenCalledWith({
        success: true,
        data: {
          isBookmarked: false,
        },
      })
    })

    test('should return BadRequest when postId is missing', async () => {
      const service = createService()
      const controller = createController(service)
      const response = createResponse()

      await invoke(controller.isBookmarked, createRequest({ params: {} }), response)

      expect(response.SpongBadRequest).toHaveBeenCalledWith({
        success: false,
        message: 'Post ID is required',
      })

      expect(service.isBookmarked).not.toHaveBeenCalled()
    })

    test('should propagate service errors', async () => {
      const service = createService()

      service.isBookmarked.mockRejectedValue(new Error('Check bookmark failed'))

      const controller = createController(service)

      await expect(
        invoke(controller.isBookmarked, createRequest(), createResponse()),
      ).rejects.toThrow('Check bookmark failed')
    })
  })

  describe('countByPostId', () => {
    test('should return post bookmarks count', async () => {
      const service = createService()
      const controller = createController(service)
      const response = createResponse()

      await invoke(controller.countByPostId, createRequest(), response)

      expect(service.countByPostId).toHaveBeenCalledWith('post-id')

      expect(response.SpongOK).toHaveBeenCalledWith({
        success: true,
        data: {
          bookmarksCount: 5,
        },
      })
    })

    test('should return BadRequest when postId is missing', async () => {
      const service = createService()
      const controller = createController(service)
      const response = createResponse()

      await invoke(controller.countByPostId, createRequest({ params: {} }), response)

      expect(response.SpongBadRequest).toHaveBeenCalledWith({
        success: false,
        message: 'Post ID is required',
      })

      expect(service.countByPostId).not.toHaveBeenCalled()
    })

    test('should propagate service errors', async () => {
      const service = createService()

      service.countByPostId.mockRejectedValue(new Error('Count by post failed'))

      const controller = createController(service)

      await expect(
        invoke(controller.countByPostId, createRequest(), createResponse()),
      ).rejects.toThrow('Count by post failed')
    })
  })

  describe('countMe', () => {
    test('should return current user bookmarks count', async () => {
      const service = createService()
      const controller = createController(service)
      const response = createResponse()

      await invoke(controller.countMe, createRequest(), response)

      expect(service.countMe).toHaveBeenCalledWith('user-id')

      expect(response.SpongOK).toHaveBeenCalledWith({
        success: true,
        data: {
          bookmarksCount: 3,
        },
      })
    })

    test('should return zero when user has no bookmarks', async () => {
      const service = createService()

      service.countMe.mockResolvedValue({
        success: true,
        bookmarksCount: 0,
      })

      const controller = createController(service)
      const response = createResponse()

      await invoke(controller.countMe, createRequest(), response)

      expect(response.SpongOK).toHaveBeenCalledWith({
        success: true,
        data: {
          bookmarksCount: 0,
        },
      })
    })

    test('should propagate service errors', async () => {
      const service = createService()

      service.countMe.mockRejectedValue(new Error('Count bookmarks failed'))

      const controller = createController(service)

      await expect(invoke(controller.countMe, createRequest(), createResponse())).rejects.toThrow(
        'Count bookmarks failed',
      )
    })
  })
})
