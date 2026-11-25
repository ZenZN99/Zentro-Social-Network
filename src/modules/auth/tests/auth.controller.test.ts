import { describe, expect, mock, test } from 'bun:test'
import type { AuthService, LoginBody, RegisterBody } from '../auth.service'
import type { User } from '../../users/schemas/user.schema'
import type { ContextHandler } from 'lykosjs'

const registerBody: RegisterBody = {
  firstName: 'Zen',
  lastName: 'Allaham',
  email: 'zen@example.com',
  password: 'Password123!',
}

const loginBody: LoginBody = {
  email: 'zen@example.com',
  password: 'Password123!',
}

const registerResponse = new Response(
  JSON.stringify({
    success: true,
    message: 'Account created successfully',
  }),
  { status: 201 },
)

const loginResponse = new Response(
  JSON.stringify({
    success: true,
    message: 'Logged in successfully',
  }),
  { status: 200 },
)

const logoutResponse = new Response(
  JSON.stringify({
    success: true,
    message: 'Logged out successfully',
  }),
  { status: 200 },
)

const refreshResponse = new Response(
  JSON.stringify({
    success: true,
    message: 'Access token refreshed successfully',
  }),
  { status: 200 },
)

type MeResult = {
  success: boolean
  data: {
    id: string
    username: string
    email: string
    profile: {
      id: string
      bio: string
    } | null
  }
}

const createService = () => ({
  register: mock(async (_body: RegisterBody, _request: never) => registerResponse),

  login: mock(async (_body: LoginBody, _request: never) => loginResponse),

  logout: mock(async (_request: never) => logoutResponse),

  me: mock(
    async (_user: Partial<User>): Promise<MeResult> => ({
      success: true,
      data: {
        id: 'user-id',
        username: 'zen-user',
        email: 'zen@example.com',
        profile: null,
      },
    }),
  ),

  refreshToken: mock(async (_request: never) => refreshResponse),
})

type MockService = ReturnType<typeof createService>

const createRequest = (
  overrides: {
    user?: Partial<User>
    body?: unknown
  } = {},
) => ({
  user: overrides.user ?? ({ id: 'user-id' } as Partial<User>),
  json: mock(async <T>() => overrides.body as T),
})

const createResponse = () => ({
  OK: mock((body: unknown) => ({
    status: 200,
    body,
  })),
})

const createController = (service: MockService) =>
  new AuthController(service as unknown as AuthService)

const invoke = (
  handler: ContextHandler,
  request: ReturnType<typeof createRequest>,
  response: ReturnType<typeof createResponse>,
) => handler(request as never, response as never)

const { AuthController } = await import('../auth.controller')

describe('AuthController', () => {
  describe('register', () => {
    test('should register successfully', async () => {
      const service = createService()
      const controller = createController(service)

      const request = createRequest({
        body: registerBody,
      })

      const response = createResponse()

      const result = await invoke(controller.register, request, response)

      expect(request.json).toHaveBeenCalledTimes(1)

      expect(service.register).toHaveBeenCalledWith(registerBody, request)

      expect(result).toBe(registerResponse)
      expect(response.OK).not.toHaveBeenCalled()
    })

    test('should propagate service errors', async () => {
      const service = createService()

      service.register.mockRejectedValue(new Error('Registration failed'))

      const controller = createController(service)

      await expect(
        invoke(controller.register, createRequest({ body: registerBody }), createResponse()),
      ).rejects.toThrow('Registration failed')
    })

    test('should propagate JSON parsing errors', async () => {
      const service = createService()
      const controller = createController(service)

      const request = createRequest()
      request.json.mockRejectedValue(new Error('Invalid JSON'))

      await expect(invoke(controller.register, request, createResponse())).rejects.toThrow(
        'Invalid JSON',
      )

      expect(service.register).not.toHaveBeenCalled()
    })
  })

  describe('login', () => {
    test('should login successfully', async () => {
      const service = createService()
      const controller = createController(service)

      const request = createRequest({
        body: loginBody,
      })

      const response = createResponse()

      const result = await invoke(controller.login, request, response)

      expect(request.json).toHaveBeenCalledTimes(1)

      expect(service.login).toHaveBeenCalledWith(loginBody, request)

      expect(result).toBe(loginResponse)
      expect(response.OK).not.toHaveBeenCalled()
    })

    test('should propagate service errors', async () => {
      const service = createService()

      service.login.mockRejectedValue(new Error('Login failed'))

      const controller = createController(service)

      await expect(
        invoke(controller.login, createRequest({ body: loginBody }), createResponse()),
      ).rejects.toThrow('Login failed')
    })

    test('should propagate JSON parsing errors', async () => {
      const service = createService()
      const controller = createController(service)

      const request = createRequest()

      request.json.mockRejectedValue(new Error('Invalid JSON'))

      await expect(invoke(controller.login, request, createResponse())).rejects.toThrow(
        'Invalid JSON',
      )

      expect(service.login).not.toHaveBeenCalled()
    })
  })

  describe('logout', () => {
    test('should logout successfully', async () => {
      const service = createService()
      const controller = createController(service)

      const request = createRequest()
      const response = createResponse()

      const result = await invoke(controller.logout, request, response)

      expect(service.logout).toHaveBeenCalledWith(request)
      expect(result).toBe(logoutResponse)
      expect(response.OK).not.toHaveBeenCalled()
    })

    test('should propagate service errors', async () => {
      const service = createService()

      service.logout.mockRejectedValue(new Error('Logout failed'))

      const controller = createController(service)

      await expect(invoke(controller.logout, createRequest(), createResponse())).rejects.toThrow(
        'Logout failed',
      )
    })
  })

  describe('me', () => {
    test('should return current user successfully', async () => {
      const service = createService()
      const controller = createController(service)

      const currentUser = {
        id: 'user-id',
      } as Partial<User>

      const request = createRequest({
        user: currentUser,
      })

      const response = createResponse()

      response.OK.mockImplementation((data) => Response.json(data, { status: 200 }))

      const result = await invoke(controller.me, request, response)

      expect(service.me).toHaveBeenCalledWith(currentUser)

      expect(response.OK).toHaveBeenCalledWith({
        success: true,
        data: {
          id: 'user-id',
          username: 'zen-user',
          email: 'zen@example.com',
          profile: null,
        },
      })

      expect(result).toBeInstanceOf(Response)

      if (!(result instanceof Response)) {
        throw new Error('Expected a Response instance')
      }

      expect(result.status).toBe(200)

      expect(await result.json()).toEqual({
        success: true,
        data: {
          id: 'user-id',
          username: 'zen-user',
          email: 'zen@example.com',
          profile: null,
        },
      })
    })

    test('should return user profile when available', async () => {
      const service = createService()

      service.me.mockResolvedValue({
        success: true,
        data: {
          id: 'user-id',
          username: 'zen-user',
          email: 'zen@example.com',
          profile: {
            id: 'profile-id',
            bio: 'Backend developer',
          },
        },
      })

      const controller = createController(service)
      const response = createResponse()

      response.OK.mockImplementation((data) => Response.json(data, { status: 200 }))

      const result = await invoke(controller.me, createRequest(), response)

      expect(service.me).toHaveBeenCalled()

      expect(response.OK).toHaveBeenCalledWith({
        success: true,
        data: {
          id: 'user-id',
          username: 'zen-user',
          email: 'zen@example.com',
          profile: {
            id: 'profile-id',
            bio: 'Backend developer',
          },
        },
      })

      expect(result).toBeInstanceOf(Response)

      if (!(result instanceof Response)) {
        throw new Error('Expected a Response instance')
      }

      expect(result.status).toBe(200)

      expect(await result.json()).toEqual({
        success: true,
        data: {
          id: 'user-id',
          username: 'zen-user',
          email: 'zen@example.com',
          profile: {
            id: 'profile-id',
            bio: 'Backend developer',
          },
        },
      })
    })

    test('should propagate service errors', async () => {
      const service = createService()

      service.me.mockRejectedValue(new Error('Authentication failed'))

      const controller = createController(service)

      await expect(invoke(controller.me, createRequest(), createResponse())).rejects.toThrow(
        'Authentication failed',
      )

      expect(service.me).toHaveBeenCalled()
    })
  })

  describe('refreshToken', () => {
    test('should refresh token successfully', async () => {
      const service = createService()
      const controller = createController(service)

      const request = createRequest()
      const response = createResponse()

      const result = await invoke(controller.refreshToken, request, response)

      expect(service.refreshToken).toHaveBeenCalledWith(request)
      expect(result).toBe(refreshResponse)
      expect(response.OK).not.toHaveBeenCalled()
    })

    test('should propagate service errors', async () => {
      const service = createService()

      service.refreshToken.mockRejectedValue(new Error('Token refresh failed'))

      const controller = createController(service)

      await expect(
        invoke(controller.refreshToken, createRequest(), createResponse()),
      ).rejects.toThrow('Token refresh failed')
    })
  })
})
