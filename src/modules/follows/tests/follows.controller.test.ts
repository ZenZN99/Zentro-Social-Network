import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { FollowsService } from '../follows.service'

const makeRequest = (options?: {
  userId?: string
  params?: Record<string, string | undefined>
}) => ({
  user: options?.userId ? { id: options.userId } : undefined,
  params: options?.params ?? {},
})

const makeResponse = () => ({
  SpongOK: mock((data: unknown) => data),
  SpongBadRequest: mock((data: unknown) => data),
})

const makeDependencies = () => {
  const followsService = {
    toggle: mock(async () => ({
      success: true,
      message: 'User followed successfully',
    })),
    findFollowers: mock(async () => ({
      success: true,
      data: [],
      pagination: {
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
      },
    })),
    findFollowing: mock(async () => ({
      success: true,
      data: [],
      pagination: {
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
      },
    })),
    isFollowing: mock(async () => ({
      isFollowing: true,
    })),
    countFollowers: mock(async () => ({
      success: true,
      data: 25,
    })),
    countFollowing: mock(async () => ({
      success: true,
      data: 15,
    })),
  } as unknown as FollowsService

  return {
    followsService,
    controller: new FollowsController(followsService),
  }
}

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

const { FollowsController } = await import('../follows.controller')

describe('FollowsController', () => {
  beforeEach(() => {
    getPaginationMock.mockClear()
    getPaginationMock.mockReturnValue({
      page: 1,
      limit: 10,
      offset: 0,
    })
  })

  describe('toggle', () => {
    test('should return bad request when followingId is missing', async () => {
      const { controller, followsService } = makeDependencies()
      const spongReq = makeRequest({
        userId: 'follower-id',
      })
      const spongRes = makeResponse()

      await controller.toggle(spongReq as never, spongRes as never)

      expect(spongRes.SpongBadRequest).toHaveBeenCalledWith({
        success: false,
        message: 'User ID is required',
      })
      expect(followsService.toggle).not.toHaveBeenCalled()
    })

    test('should toggle follow and return success response', async () => {
      const { controller, followsService } = makeDependencies()
      const spongReq = makeRequest({
        userId: 'follower-id',
        params: {
          followingId: 'following-id',
        },
      })
      const spongRes = makeResponse()

      await controller.toggle(spongReq as never, spongRes as never)

      expect(followsService.toggle).toHaveBeenCalledWith('follower-id', 'following-id')

      expect(spongRes.SpongOK).toHaveBeenCalledWith({
        success: true,
        message: 'User followed successfully',
        data: {
          isFollowing: undefined,
        },
      })
    })

    test('should return unfollow response', async () => {
      const { controller, followsService } = makeDependencies()

      followsService.toggle = mock(async () => ({
        isFollowing: false,
        message: 'User unfollowed successfully',
      })) as typeof followsService.toggle

      const spongReq = makeRequest({
        userId: 'follower-id',
        params: {
          followingId: 'following-id',
        },
      })
      const spongRes = makeResponse()

      await controller.toggle(spongReq as never, spongRes as never)

      expect(spongRes.SpongOK).toHaveBeenCalledWith({
        success: undefined,
        message: 'User unfollowed successfully',
        data: {
          isFollowing: false,
        },
      })
    })

    test('should propagate service errors', async () => {
      const { controller, followsService } = makeDependencies()
      const serviceError = new Error('Follow failed')

      followsService.toggle = mock(async () => {
        throw serviceError
      }) as typeof followsService.toggle

      const spongReq = makeRequest({
        userId: 'follower-id',
        params: {
          followingId: 'following-id',
        },
      })
      const spongRes = makeResponse()

      await expect(controller.toggle(spongReq as never, spongRes as never)).rejects.toThrow(
        'Follow failed',
      )
    })
  })

  describe('findFollowers', () => {
    test('should return bad request when userId is missing', async () => {
      const { controller, followsService } = makeDependencies()
      const spongReq = makeRequest()
      const spongRes = makeResponse()

      await controller.findFollowers(spongReq as never, spongRes as never)

      expect(spongRes.SpongBadRequest).toHaveBeenCalledWith({
        success: false,
        message: 'User ID is required',
      })
      expect(followsService.findFollowers).not.toHaveBeenCalled()
    })

    test('should return followers with pagination', async () => {
      getPaginationMock.mockReturnValue({
        page: 2,
        limit: 10,
        offset: 10,
      })

      const { controller, followsService } = makeDependencies()
      const spongReq = makeRequest({
        params: {
          userId: 'user-id',
        },
      })
      const spongRes = makeResponse()

      await controller.findFollowers(spongReq as never, spongRes as never)

      expect(getPaginationMock).toHaveBeenCalledWith(spongReq)
      expect(followsService.findFollowers).toHaveBeenCalledWith('user-id', 2, 10, 10)

      expect(spongRes.SpongOK).toHaveBeenCalledWith({
        success: true,
        data: [],
        pagination: {
          page: 1,
          limit: 10,
          total: 0,
          totalPages: 0,
        },
      })
    })

    test('should propagate service errors', async () => {
      const { controller, followsService } = makeDependencies()

      followsService.findFollowers = mock(async () => {
        throw new Error('Find followers failed')
      }) as typeof followsService.findFollowers

      const spongReq = makeRequest({
        params: {
          userId: 'user-id',
        },
      })
      const spongRes = makeResponse()

      await expect(controller.findFollowers(spongReq as never, spongRes as never)).rejects.toThrow(
        'Find followers failed',
      )
    })
  })

  describe('findFollowing', () => {
    test('should return bad request when userId is missing', async () => {
      const { controller, followsService } = makeDependencies()
      const spongReq = makeRequest()
      const spongRes = makeResponse()

      await controller.findFollowing(spongReq as never, spongRes as never)

      expect(spongRes.SpongBadRequest).toHaveBeenCalledWith({
        success: false,
        message: 'User ID is required',
      })
      expect(followsService.findFollowing).not.toHaveBeenCalled()
    })

    test('should return following users with pagination', async () => {
      const { controller, followsService } = makeDependencies()
      const spongReq = makeRequest({
        params: {
          userId: 'user-id',
        },
      })
      const spongRes = makeResponse()

      await controller.findFollowing(spongReq as never, spongRes as never)

      expect(followsService.findFollowing).toHaveBeenCalledWith('user-id', 1, 10, 0)

      expect(spongRes.SpongOK).toHaveBeenCalledWith({
        success: true,
        data: [],
        pagination: {
          page: 1,
          limit: 10,
          total: 0,
          totalPages: 0,
        },
      })
    })

    test('should propagate service errors', async () => {
      const { controller, followsService } = makeDependencies()

      followsService.findFollowing = mock(async () => {
        throw new Error('Find following failed')
      }) as typeof followsService.findFollowing

      const spongReq = makeRequest({
        params: {
          userId: 'user-id',
        },
      })
      const spongRes = makeResponse()

      await expect(controller.findFollowing(spongReq as never, spongRes as never)).rejects.toThrow(
        'Find following failed',
      )
    })
  })

  describe('isFollowing', () => {
    test('should return bad request when followingId is missing', async () => {
      const { controller, followsService } = makeDependencies()
      const spongReq = makeRequest({
        userId: 'follower-id',
      })
      const spongRes = makeResponse()

      await controller.isFollowing(spongReq as never, spongRes as never)

      expect(spongRes.SpongBadRequest).toHaveBeenCalledWith({
        success: false,
        message: 'User ID is required',
      })
      expect(followsService.isFollowing).not.toHaveBeenCalled()
    })

    test('should return following status', async () => {
      const { controller, followsService } = makeDependencies()
      const spongReq = makeRequest({
        userId: 'follower-id',
        params: {
          followingId: 'following-id',
        },
      })
      const spongRes = makeResponse()

      await controller.isFollowing(spongReq as never, spongRes as never)

      expect(followsService.isFollowing).toHaveBeenCalledWith('follower-id', 'following-id')

      expect(spongRes.SpongOK).toHaveBeenCalledWith({
        success: true,
        data: {
          isFollowing: true,
        },
      })
    })

    test('should return false when users are not following each other', async () => {
      const { controller, followsService } = makeDependencies()

      followsService.isFollowing = mock(async () => ({
        isFollowing: false,
      })) as typeof followsService.isFollowing

      const spongReq = makeRequest({
        userId: 'follower-id',
        params: {
          followingId: 'following-id',
        },
      })
      const spongRes = makeResponse()

      await controller.isFollowing(spongReq as never, spongRes as never)

      expect(spongRes.SpongOK).toHaveBeenCalledWith({
        success: true,
        data: {
          isFollowing: false,
        },
      })
    })

    test('should propagate service errors', async () => {
      const { controller, followsService } = makeDependencies()

      followsService.isFollowing = mock(async () => {
        throw new Error('Check follow failed')
      }) as typeof followsService.isFollowing

      const spongReq = makeRequest({
        userId: 'follower-id',
        params: {
          followingId: 'following-id',
        },
      })
      const spongRes = makeResponse()

      await expect(controller.isFollowing(spongReq as never, spongRes as never)).rejects.toThrow(
        'Check follow failed',
      )
    })
  })

  describe('countFollowers', () => {
    test('should return bad request when userId is missing', async () => {
      const { controller, followsService } = makeDependencies()
      const spongReq = makeRequest()
      const spongRes = makeResponse()

      await controller.countFollowers(spongReq as never, spongRes as never)

      expect(spongRes.SpongBadRequest).toHaveBeenCalledWith({
        success: false,
        message: 'User ID is required',
      })
      expect(followsService.countFollowers).not.toHaveBeenCalled()
    })

    test('should return followers count', async () => {
      const { controller, followsService } = makeDependencies()
      const spongReq = makeRequest({
        params: {
          userId: 'user-id',
        },
      })
      const spongRes = makeResponse()

      await controller.countFollowers(spongReq as never, spongRes as never)

      expect(followsService.countFollowers).toHaveBeenCalledWith('user-id')

      expect(spongRes.SpongOK).toHaveBeenCalledWith({
        success: true,
        data: 25,
      })
    })

    test('should propagate service errors', async () => {
      const { controller, followsService } = makeDependencies()

      followsService.countFollowers = mock(async () => {
        throw new Error('Count followers failed')
      }) as typeof followsService.countFollowers

      const spongReq = makeRequest({
        params: {
          userId: 'user-id',
        },
      })
      const spongRes = makeResponse()

      await expect(controller.countFollowers(spongReq as never, spongRes as never)).rejects.toThrow(
        'Count followers failed',
      )
    })
  })

  describe('countFollowing', () => {
    test('should return bad request when userId is missing', async () => {
      const { controller, followsService } = makeDependencies()
      const spongReq = makeRequest()
      const spongRes = makeResponse()

      await controller.countFollowing(spongReq as never, spongRes as never)

      expect(spongRes.SpongBadRequest).toHaveBeenCalledWith({
        success: false,
        message: 'User ID is required',
      })
      expect(followsService.countFollowing).not.toHaveBeenCalled()
    })

    test('should return following count', async () => {
      const { controller, followsService } = makeDependencies()
      const spongReq = makeRequest({
        params: {
          userId: 'user-id',
        },
      })
      const spongRes = makeResponse()

      await controller.countFollowing(spongReq as never, spongRes as never)

      expect(followsService.countFollowing).toHaveBeenCalledWith('user-id')

      expect(spongRes.SpongOK).toHaveBeenCalledWith({
        success: true,
        data: 15,
      })
    })

    test('should propagate service errors', async () => {
      const { controller, followsService } = makeDependencies()

      followsService.countFollowing = mock(async () => {
        throw new Error('Count following failed')
      }) as typeof followsService.countFollowing

      const spongReq = makeRequest({
        params: {
          userId: 'user-id',
        },
      })
      const spongRes = makeResponse()

      await expect(controller.countFollowing(spongReq as never, spongRes as never)).rejects.toThrow(
        'Count following failed',
      )
    })
  })
})
