import { describe, expect, it, mock } from 'bun:test'
import type { ContextHandler } from 'lykosjs'
import { UsersController } from '../users.controller'
import type { UsersService } from '../users.service'
import { UserRole } from '../schemas/enums/user-role'

type Context = Parameters<ContextHandler>[0]
type Reply = Parameters<ContextHandler>[1]

function createReq({
  params = {},
  user = { id: 'admin-1' },
  body = {},
}: {
  params?: Record<string, string | undefined>
  user?: { id: string } | undefined
  body?: Record<string, unknown>
} = {}) {
  const req = {
    params,
    user,
    json: async <T>() => body as T,
  }

  return req as unknown as Context
}

function createRes() {
  const OK = mock((_body: unknown) => undefined)
  const BadRequest = mock((_body: unknown) => undefined)

  const res = {
    OK,
    BadRequest,
  } as unknown as Reply

  return { res, OK, BadRequest }
}

function createController() {
  const usersService = {
    findAll: mock(async () => ({
      success: true,
      safeUsers: [],
      pagination: {},
    })),
    findOneByUsername: mock(async () => ({
      success: true,
      data: {},
    })),
    updateRole: mock(async () => ({
      success: true,
      message: 'User role updated successfully',
    })),
    block: mock(async () => ({
      success: true,
      message: 'User blocked successfully',
    })),
  }

  const controller = new UsersController(usersService as unknown as UsersService)

  return { controller, usersService }
}

describe('UsersController', () => {
  describe('findAll', () => {
    it('should return users and pagination', async () => {
      const { controller, usersService } = createController()
      const { res, OK } = createRes()

      await controller.findAll(createReq(), res)

      expect(usersService.findAll).toHaveBeenCalledTimes(1)
      expect(OK).toHaveBeenCalledTimes(1)
      expect(OK.mock.calls[0]?.[0]).toEqual({
        success: true,
        data: {
          users: [],
          pagination: {},
        },
      })
    })
  })

  describe('findOneByUsername', () => {
    it('should return bad request when username is missing', async () => {
      const { controller, usersService } = createController()
      const { res, BadRequest, OK } = createRes()

      await controller.findOneByUsername(createReq(), res)

      expect(BadRequest).toHaveBeenCalledTimes(1)
      expect(BadRequest.mock.calls[0]?.[0]).toEqual({
        success: false,
        message: 'User name is required',
      })
      expect(usersService.findOneByUsername).not.toHaveBeenCalled()
      expect(OK).not.toHaveBeenCalled()
    })

    it('should call service with username and return result', async () => {
      const { controller, usersService } = createController()
      const { res, OK } = createRes()

      await controller.findOneByUsername(createReq({ params: { username: 'zen' } }), res)

      expect(usersService.findOneByUsername).toHaveBeenCalledWith('zen')
      expect(OK).toHaveBeenCalledTimes(1)
      expect(OK.mock.calls[0]?.[0]).toEqual({
        success: true,
        data: {},
      })
    })
  })

  describe('updateRole', () => {
    it('should return bad request when userId is missing', async () => {
      const { controller, usersService } = createController()
      const { res, BadRequest, OK } = createRes()

      await controller.updateRole(createReq(), res)

      expect(BadRequest).toHaveBeenCalledTimes(1)
      expect(BadRequest.mock.calls[0]?.[0]).toEqual({
        success: false,
        message: 'User ID is required',
      })
      expect(usersService.updateRole).not.toHaveBeenCalled()
      expect(OK).not.toHaveBeenCalled()
    })

    it('should call service with adminId, userId and role', async () => {
      const { controller, usersService } = createController()
      const { res, OK } = createRes()

      await controller.updateRole(
        createReq({
          params: { userId: 'user-1' },
          user: { id: 'admin-1' },
          body: { role: UserRole.SUPPORT },
        }),
        res,
      )

      expect(usersService.updateRole).toHaveBeenCalledWith('admin-1', 'user-1', UserRole.SUPPORT)

      expect(OK).toHaveBeenCalledTimes(1)
      expect(OK.mock.calls[0]?.[0]).toEqual({
        success: true,
        message: 'User role updated successfully',
      })
    })
  })

  describe('block', () => {
    it('should return bad request when userId is missing', async () => {
      const { controller, usersService } = createController()
      const { res, BadRequest, OK } = createRes()

      await controller.block(createReq(), res)

      expect(BadRequest).toHaveBeenCalledTimes(1)
      expect(BadRequest.mock.calls[0]?.[0]).toEqual({
        success: false,
        message: 'User ID is required',
      })
      expect(usersService.block).not.toHaveBeenCalled()
      expect(OK).not.toHaveBeenCalled()
    })

    it('should call service with adminId and userId', async () => {
      const { controller, usersService } = createController()
      const { res, OK } = createRes()

      await controller.block(
        createReq({
          params: { userId: 'user-1' },
          user: { id: 'admin-1' },
        }),
        res,
      )

      expect(usersService.block).toHaveBeenCalledWith('admin-1', 'user-1')

      expect(OK).toHaveBeenCalledTimes(1)
      expect(OK.mock.calls[0]?.[0]).toEqual({
        success: true,
        message: 'User blocked successfully',
      })
    })
  })
})
