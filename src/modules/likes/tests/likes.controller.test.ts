import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { LikesService } from '../likes.service'
import type { ContextHandler } from 'lykosjs'

const getPagination = mock((_req: HandlerRequest) => ({
  page: 1,
  limit: 50,
  offset: 0,
}))

const actualPagination = await import('../../../utilities/pagination')

mock.module('../../../utilities/pagination', () => ({
  ...actualPagination,
  getPagination,
}))

const { LikesController } = await import('../likes.controller')

type HandlerRequest = Parameters<ContextHandler>[0]
type HandlerResponse = Parameters<ContextHandler>[1]

const USER_ID = 'user-1'
const TARGET_ID = 'target-1'
const TARGET_TYPE = 'post'

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: USER_ID },
    params: {
      targetType: TARGET_TYPE,
      targetId: TARGET_ID,
    },
    query: new URLSearchParams({
      page: '2',
      limit: '50',
    }),
    ...overrides,
  } as unknown as HandlerRequest
}

function makeResponse() {
  return {
    OK: mock((_payload: unknown) => undefined),
    BadRequest: mock((_payload: unknown) => undefined),
  } as unknown as HandlerResponse & {
    OK: ReturnType<typeof mock>
    BadRequest: ReturnType<typeof mock>
  }
}

function makeDependencies() {
  return {
    likesService: {
      toggle: mock(async (_userId: string, _targetType: string, _targetId: string) => ({
        success: true,
        message: 'Liked successfully',
        data: { isLiked: true },
      })),

      findAll: mock(
        async (
          _page: number,
          _limit: number,
          _offset: number,
          _targetType: string,
          _targetId: string,
        ) => ({
          success: true,
          data: [{ id: 'like-1' }],
          pagination: {
            total: 1,
            page: 1,
            limit: 50,
            totalPages: 1,
          },
        }),
      ),

      findMe: mock(
        async (
          _userId: string,
          _targetType: string,
          _targetId: string,
          _page?: number,
          _limit?: number,
          _offset?: number,
        ) => ({
          success: true,
          data: [{ id: 'like-1' }],
          pagination: {
            total: 1,
            page: 1,
            limit: 50,
            totalPages: 1,
          },
        }),
      ),

      count: mock(async (_targetType: string, _targetId: string) => ({
        success: true,
        data: {
          targetType: TARGET_TYPE,
          targetId: TARGET_ID,
          likesCount: 10,
        },
      })),

      isLiked: mock(async (_userId: string, _targetType: string, _targetId: string) => ({
        success: true,
        data: { isLiked: true },
      })),
    },
  }
}

describe('LikesController', () => {
  let dependencies: ReturnType<typeof makeDependencies>
  let controller: InstanceType<typeof LikesController>

  beforeEach(() => {
    dependencies = makeDependencies()

    getPagination.mockClear()
    getPagination.mockImplementation(() => ({
      page: 1,
      limit: 50,
      offset: 0,
    }))

    controller = new LikesController(dependencies.likesService as unknown as LikesService)
  })

  describe('toggle', () => {
    test('returns BadRequest when targetType is missing', async () => {
      const req = makeRequest({
        params: { targetId: TARGET_ID },
      })
      const res = makeResponse()

      await controller.toggle(req, res)

      expect(res.BadRequest).toHaveBeenCalledWith({
        success: false,
        message: 'Target type and Target ID is required',
      })

      expect(dependencies.likesService.toggle).not.toHaveBeenCalled()
    })

    test('returns BadRequest when targetId is missing', async () => {
      const req = makeRequest({
        params: { targetType: TARGET_TYPE },
      })
      const res = makeResponse()

      await controller.toggle(req, res)

      expect(res.BadRequest).toHaveBeenCalledWith({
        success: false,
        message: 'Target type and Target ID is required',
      })

      expect(dependencies.likesService.toggle).not.toHaveBeenCalled()
    })

    test('returns BadRequest when both params are missing', async () => {
      const req = makeRequest({
        params: {},
      })
      const res = makeResponse()

      await controller.toggle(req, res)

      expect(res.BadRequest).toHaveBeenCalledTimes(1)
      expect(dependencies.likesService.toggle).not.toHaveBeenCalled()
    })

    test('calls LikesService.toggle with the authenticated user and params', async () => {
      const req = makeRequest()
      const res = makeResponse()

      await controller.toggle(req, res)

      expect(dependencies.likesService.toggle).toHaveBeenCalledWith(USER_ID, TARGET_TYPE, TARGET_ID)
    })

    test('returns OK with the service result', async () => {
      const req = makeRequest()
      const res = makeResponse()

      await controller.toggle(req, res)

      expect(res.OK).toHaveBeenCalledWith({
        success: true,
        message: 'Liked successfully',
        data: { isLiked: true },
      })
    })

    test('returns the service result when removing a like', async () => {
      dependencies.likesService.toggle.mockResolvedValue({
        success: true,
        message: 'Like removed successfully',
        data: { isLiked: false },
      })

      const req = makeRequest()
      const res = makeResponse()

      await controller.toggle(req, res)

      expect(res.OK).toHaveBeenCalledWith({
        success: true,
        message: 'Like removed successfully',
        data: { isLiked: false },
      })
    })

    test('propagates service errors', async () => {
      const expectedError = new Error('Toggle failed')

      dependencies.likesService.toggle.mockRejectedValue(expectedError)

      const req = makeRequest()
      const res = makeResponse()

      await expect(controller.toggle(req, res)).rejects.toBe(expectedError)

      expect(res.OK).not.toHaveBeenCalled()
    })
  })

  describe('findAll', () => {
    test('returns BadRequest when targetType is missing', async () => {
      const req = makeRequest({
        params: { targetId: TARGET_ID },
      })
      const res = makeResponse()

      await controller.findAll(req, res)

      expect(res.BadRequest).toHaveBeenCalledWith({
        success: false,
        message: 'Target type and Target ID is required',
      })

      expect(dependencies.likesService.findAll).not.toHaveBeenCalled()
      expect(getPagination).not.toHaveBeenCalled()
    })

    test('returns BadRequest when targetId is missing', async () => {
      const req = makeRequest({
        params: { targetType: TARGET_TYPE },
      })
      const res = makeResponse()

      await controller.findAll(req, res)

      expect(res.BadRequest).toHaveBeenCalledTimes(1)
      expect(dependencies.likesService.findAll).not.toHaveBeenCalled()
    })

    test('calls getPagination after validating params', async () => {
      const req = makeRequest()
      const res = makeResponse()

      await controller.findAll(req, res)

      expect(getPagination).toHaveBeenCalledWith(req)
    })

    test('calls LikesService.findAll with pagination and target params', async () => {
      getPagination.mockReturnValue({
        page: 2,
        limit: 20,
        offset: 20,
      })

      const req = makeRequest()
      const res = makeResponse()

      await controller.findAll(req, res)

      expect(dependencies.likesService.findAll).toHaveBeenCalledWith(
        2,
        20,
        20,
        TARGET_TYPE,
        TARGET_ID,
      )
    })

    test('returns OK with likes data', async () => {
      const req = makeRequest()
      const res = makeResponse()

      await controller.findAll(req, res)

      expect(res.OK).toHaveBeenCalledWith({
        success: true,
        data: [{ id: 'like-1' }],
      })
    })

    test('does not include pagination in the response', async () => {
      const req = makeRequest()
      const res = makeResponse()

      await controller.findAll(req, res)

      const payload = res.OK.mock.calls[0]?.[0]

      expect(payload).not.toHaveProperty('pagination')
    })

    test('propagates service errors', async () => {
      const expectedError = new Error('Find all failed')

      dependencies.likesService.findAll.mockRejectedValue(expectedError)

      const req = makeRequest()
      const res = makeResponse()

      await expect(controller.findAll(req, res)).rejects.toBe(expectedError)

      expect(res.OK).not.toHaveBeenCalled()
    })
  })

  describe('findMe', () => {
    test('returns BadRequest when targetType is missing', async () => {
      const req = makeRequest({
        params: { targetId: TARGET_ID },
      })
      const res = makeResponse()

      await controller.findMe(req, res)

      expect(res.BadRequest).toHaveBeenCalledTimes(1)
      expect(dependencies.likesService.findMe).not.toHaveBeenCalled()
    })

    test('returns BadRequest when targetId is missing', async () => {
      const req = makeRequest({
        params: { targetType: TARGET_TYPE },
      })
      const res = makeResponse()

      await controller.findMe(req, res)

      expect(res.BadRequest).toHaveBeenCalledTimes(1)
      expect(dependencies.likesService.findMe).not.toHaveBeenCalled()
    })

    test('calls getPagination after validating params', async () => {
      const req = makeRequest()
      const res = makeResponse()

      await controller.findMe(req, res)

      expect(getPagination).toHaveBeenCalledWith(req)
    })

    test('calls LikesService.findMe with authenticated user and pagination', async () => {
      getPagination.mockReturnValue({
        page: 3,
        limit: 15,
        offset: 30,
      })

      const req = makeRequest()
      const res = makeResponse()

      await controller.findMe(req, res)

      expect(dependencies.likesService.findMe).toHaveBeenCalledWith(
        USER_ID,
        TARGET_TYPE,
        TARGET_ID,
        3,
        15,
        30,
      )
    })

    test('uses the default limit when getPagination returns undefined', async () => {
      getPagination.mockReturnValue({
        page: 1,
        limit: undefined,
        offset: 0,
      } as unknown as ReturnType<typeof getPagination>)

      const req = makeRequest()
      const res = makeResponse()

      await controller.findMe(req, res)

      expect(dependencies.likesService.findMe).toHaveBeenCalledWith(
        USER_ID,
        TARGET_TYPE,
        TARGET_ID,
        1,
        50,
        0,
      )
    })

    test('returns OK with likes data', async () => {
      const req = makeRequest()
      const res = makeResponse()

      await controller.findMe(req, res)

      expect(res.OK).toHaveBeenCalledWith({
        success: true,
        data: [{ id: 'like-1' }],
      })
    })

    test('does not include pagination in the response', async () => {
      const req = makeRequest()
      const res = makeResponse()

      await controller.findMe(req, res)

      const payload = res.OK.mock.calls[0]?.[0]

      expect(payload).not.toHaveProperty('pagination')
    })

    test('propagates service errors', async () => {
      const expectedError = new Error('Find me failed')

      dependencies.likesService.findMe.mockRejectedValue(expectedError)

      const req = makeRequest()
      const res = makeResponse()

      await expect(controller.findMe(req, res)).rejects.toBe(expectedError)

      expect(res.OK).not.toHaveBeenCalled()
    })
  })

  describe('count', () => {
    test('returns BadRequest when targetType is missing', async () => {
      const req = makeRequest({
        params: { targetId: TARGET_ID },
      })
      const res = makeResponse()

      await controller.count(req, res)

      expect(res.BadRequest).toHaveBeenCalledWith({
        success: false,
        message: 'Target type and Target ID is required',
      })

      expect(dependencies.likesService.count).not.toHaveBeenCalled()
    })

    test('returns BadRequest when targetId is missing', async () => {
      const req = makeRequest({
        params: { targetType: TARGET_TYPE },
      })
      const res = makeResponse()

      await controller.count(req, res)

      expect(res.BadRequest).toHaveBeenCalledTimes(1)
      expect(dependencies.likesService.count).not.toHaveBeenCalled()
    })

    test('calls LikesService.count with target params', async () => {
      const req = makeRequest()
      const res = makeResponse()

      await controller.count(req, res)

      expect(dependencies.likesService.count).toHaveBeenCalledWith(TARGET_TYPE, TARGET_ID)
    })

    test('returns OK with count data', async () => {
      const req = makeRequest()
      const res = makeResponse()

      await controller.count(req, res)

      expect(res.OK).toHaveBeenCalledWith({
        success: true,
        data: {
          targetType: TARGET_TYPE,
          targetId: TARGET_ID,
          likesCount: 10,
        },
      })
    })

    test('does not require an authenticated user', async () => {
      const req = makeRequest({
        user: undefined,
      })
      const res = makeResponse()

      await controller.count(req, res)

      expect(dependencies.likesService.count).toHaveBeenCalledWith(TARGET_TYPE, TARGET_ID)
    })

    test('propagates service errors', async () => {
      const expectedError = new Error('Count failed')

      dependencies.likesService.count.mockRejectedValue(expectedError)

      const req = makeRequest()
      const res = makeResponse()

      await expect(controller.count(req, res)).rejects.toBe(expectedError)

      expect(res.OK).not.toHaveBeenCalled()
    })
  })

  describe('isLiked', () => {
    test('returns BadRequest when targetType is missing', async () => {
      const req = makeRequest({
        params: { targetId: TARGET_ID },
      })
      const res = makeResponse()

      await controller.isLiked(req, res)

      expect(res.BadRequest).toHaveBeenCalledTimes(1)
      expect(dependencies.likesService.isLiked).not.toHaveBeenCalled()
    })

    test('returns BadRequest when targetId is missing', async () => {
      const req = makeRequest({
        params: { targetType: TARGET_TYPE },
      })
      const res = makeResponse()

      await controller.isLiked(req, res)

      expect(res.BadRequest).toHaveBeenCalledTimes(1)
      expect(dependencies.likesService.isLiked).not.toHaveBeenCalled()
    })

    test('calls LikesService.isLiked with authenticated user and target params', async () => {
      const req = makeRequest()
      const res = makeResponse()

      await controller.isLiked(req, res)

      expect(dependencies.likesService.isLiked).toHaveBeenCalledWith(
        USER_ID,
        TARGET_TYPE,
        TARGET_ID,
      )
    })

    test('returns OK when the target is liked', async () => {
      const req = makeRequest()
      const res = makeResponse()

      await controller.isLiked(req, res)

      expect(res.OK).toHaveBeenCalledWith({
        success: true,
        data: { isLiked: true },
      })
    })

    test('returns OK when the target is not liked', async () => {
      dependencies.likesService.isLiked.mockResolvedValue({
        success: true,
        data: { isLiked: false },
      })

      const req = makeRequest()
      const res = makeResponse()

      await controller.isLiked(req, res)

      expect(res.OK).toHaveBeenCalledWith({
        success: true,
        data: { isLiked: false },
      })
    })

    test('propagates service errors', async () => {
      const expectedError = new Error('Is liked failed')

      dependencies.likesService.isLiked.mockRejectedValue(expectedError)

      const req = makeRequest()
      const res = makeResponse()

      await expect(controller.isLiked(req, res)).rejects.toBe(expectedError)

      expect(res.OK).not.toHaveBeenCalled()
    })
  })
})
