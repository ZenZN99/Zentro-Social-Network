import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { Database } from '../../../config/db/drizzle'
import { UserRole } from '../../users/schemas/enums/user-role'

class Exception extends Error {
  constructor(public readonly body: unknown) {
    super(
      typeof body === 'object' && body !== null && 'message' in body
        ? String(body.message)
        : ' exception',
    )
  }
}

// Plain snapshots of the real modules (copied BEFORE mocking), so that
// restoring them in afterAll brings back the real exports.
const actualLykos = { ...(await import('lykosjs')) }

mock.module('lykosjs', () => ({
  ...actualLykos,
  BadRequestException: Exception,
  InternalServerErrorException: Exception,
  UnauthorizedException: Exception,
}))

const bcryptHash = mock(async (_value: string, _rounds: number) => 'hashed-value')
const bcryptCompare = mock(async (_value: string, _hash: string) => true)

mock.module('bcryptjs', () => ({
  default: {
    hash: bcryptHash,
    compare: bcryptCompare,
  },
}))

const cookieSet = mock((_name: string, _value: string, _options: unknown) => undefined)

const cookieDelete = mock((_name: string, _options: unknown) => undefined)

const cookieGet = mock((_name: string): string | undefined => undefined)

const cookieApplyTo = mock((response: Response) => response)

const cookieManager = {
  set: cookieSet,
  delete: cookieDelete,
  get: cookieGet,
  applyTo: cookieApplyTo,
}

const fromRequest = mock((_request: Request) => cookieManager)

const actualCookie = { ...(await import('@lykosjs/cookie')) }

mock.module('@lykosjs/cookie', () => ({
  CookieManager: {
    fromRequest,
  },
}))

afterAll(() => {
  mock.module('lykosjs', () => actualLykos)
  mock.module('@lykosjs/cookie', () => actualCookie)
})

const signPair = mock(() => ({
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
}))

const assertAccessToken = mock((_token: string) => undefined)
const assertRefreshToken = mock((_token: string) => undefined)

const verifyRefreshToken = mock((_token: string): { id?: unknown } | null => ({
  id: 'user-id',
}))
const signAccessToken = mock((_payload: unknown) => 'new-access-token')

mock.module('../../../config/token/jwt', () => ({
  default: {
    signPair,
    assertAccessToken,
    assertRefreshToken,
    verifyRefreshToken,
    signAccessToken,
  },
}))

const generateUsernameMock = mock(
  async (_db: unknown, _firstName: string, _lastName: string) => 'zen-user',
)

mock.module('../../../utilities/generate-user-name', () => ({
  generateUsername: generateUsernameMock,
}))

const sanitizeUserMock = mock((_user: unknown) => ({
  id: 'user-id',
  username: 'zen-user',
  email: 'zen@example.com',
}))

mock.module('../../../utilities/sanitize-user', () => ({
  sanitizeUser: sanitizeUserMock,
}))

const { AuthService } = await import('../auth.service')

type Outcome = { value: unknown } | { error: Error }

class QueryChain implements PromiseLike<unknown> {
  constructor(private readonly resolveOutcome: () => unknown) {}

  from() {
    return this
  }

  where() {
    return this
  }

  limit() {
    return this
  }

  values() {
    return this
  }

  returning() {
    return this
  }

  set() {
    return this
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve()
      .then(() => this.resolveOutcome())
      .then(onfulfilled, onrejected)
  }
}

class FakeDb {
  private outcomes: Outcome[] = []

  readonly select = mock(() => this.createChain())

  readonly insert = mock(() => this.createChain())

  readonly update = mock(() => this.createChain())

  setOutcomes(outcomes: Outcome[]) {
    this.outcomes = [...outcomes]
  }

  private nextOutcome(): unknown {
    const outcome = this.outcomes.shift()

    if (!outcome) {
      throw new Error('No mock outcome available')
    }

    if ('error' in outcome) {
      throw outcome.error
    }

    return outcome.value
  }

  private createChain() {
    return new QueryChain(() => this.nextOutcome())
  }
}

const rows = (value: unknown): Outcome => ({ value })

const failing = (message: string): Outcome => ({
  error: new Error(message),
})

const createFakeDb = () => {
  const db = new FakeDb()

  return {
    db,
    service: new AuthService({ connection: db } as unknown as Database),
  }
}

const createRequest = () =>
  ({
    request: new Request('http://localhost'),
  }) as never

const createUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-id',
  firstName: 'Zen',
  lastName: 'Allaham',
  username: 'zen-user',
  email: 'zen@example.com',
  password: 'hashed-password',
  refreshToken: 'hashed-refresh-token',
  role: UserRole.USER,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

const registerBody = {
  firstName: 'Zen',
  lastName: 'Allaham',
  email: 'zen@example.com',
  password: 'Password123!',
}

const loginBody = {
  email: 'zen@example.com',
  password: 'Password123!',
}

const readResponse = async (response: Response) => response.json()

describe('AuthService', () => {
  beforeEach(() => {
    mock.clearAllMocks()

    bcryptHash.mockResolvedValue('hashed-value')
    bcryptCompare.mockResolvedValue(true)

    signPair.mockReturnValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    })

    assertAccessToken.mockReturnValue(undefined)
    assertRefreshToken.mockReturnValue(undefined)

    verifyRefreshToken.mockReturnValue({
      id: 'user-id',
    })

    signAccessToken.mockReturnValue('new-access-token')

    cookieGet.mockReturnValue(undefined)
    cookieApplyTo.mockImplementation((response) => response)

    generateUsernameMock.mockResolvedValue('zen-user')

    sanitizeUserMock.mockReturnValue({
      id: 'user-id',
      username: 'zen-user',
      email: 'zen@example.com',
    })
  })

  describe('register', () => {
    test('should register user successfully', async () => {
      const { db, service } = createFakeDb()

      const user = createUser()

      db.setOutcomes([rows([]), rows([user]), rows([]), rows([user])])

      const response = await service.register(registerBody, createRequest())

      expect(response).toBeInstanceOf(Response)
      expect(response.status).toBe(201)

      expect(await readResponse(response)).toEqual({
        success: true,
        message: 'Account created successfully',
        data: {
          id: 'user-id',
          username: 'zen-user',
          email: 'zen@example.com',
        },
      })

      expect(db.select).toHaveBeenCalledTimes(1)
      expect(db.insert).toHaveBeenCalledTimes(2)
      expect(db.update).toHaveBeenCalledTimes(1)

      expect(bcryptHash).toHaveBeenCalledTimes(2)
      expect(generateUsernameMock).toHaveBeenCalledTimes(1)

      expect(signPair).toHaveBeenCalledTimes(1)
      expect(assertAccessToken).toHaveBeenCalledWith('access-token')
      expect(assertRefreshToken).toHaveBeenCalledWith('refresh-token')

      expect(cookieSet).toHaveBeenCalledTimes(2)
      expect(cookieApplyTo).toHaveBeenCalledTimes(1)
    })

    test('should throw BadRequestException when email already exists', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([rows([createUser()])])

      await expect(service.register(registerBody, createRequest())).rejects.toThrow(
        'Unable to complete registration',
      )

      expect(db.select).toHaveBeenCalledTimes(1)
      expect(db.insert).not.toHaveBeenCalled()
      expect(bcryptHash).not.toHaveBeenCalled()
    })

    test('should hash password with 12 rounds', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([rows([]), rows([createUser()]), rows([]), rows([createUser()])])

      await service.register(registerBody, createRequest())

      expect(bcryptHash).toHaveBeenCalledWith(registerBody.password, 12)
    })

    test('should generate username before inserting user', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([rows([]), rows([createUser()]), rows([]), rows([createUser()])])

      await service.register(registerBody, createRequest())

      expect(generateUsernameMock).toHaveBeenCalledWith(db, 'Zen', 'Allaham')
    })

    test('should throw InternalServerErrorException when updated user is missing', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([rows([]), rows([createUser()]), rows([]), rows([])])

      await expect(service.register(registerBody, createRequest())).rejects.toThrow(
        'Failed to update user',
      )

      expect(db.update).toHaveBeenCalledTimes(1)
      expect(cookieSet).not.toHaveBeenCalled()
    })

    test('should propagate database errors while checking existing user', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([failing('Database select failed')])

      await expect(service.register(registerBody, createRequest())).rejects.toThrow(
        'Database select failed',
      )
    })

    test('should propagate password hashing errors', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([rows([])])

      bcryptHash.mockRejectedValue(new Error('Hash failed'))

      await expect(service.register(registerBody, createRequest())).rejects.toThrow('Hash failed')

      expect(db.insert).not.toHaveBeenCalled()
    })

    test('should propagate profile insertion errors', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([rows([]), rows([createUser()]), failing('Profile insertion failed')])

      await expect(service.register(registerBody, createRequest())).rejects.toThrow(
        'Profile insertion failed',
      )
    })
  })

  describe('login', () => {
    test('should login successfully', async () => {
      const { db, service } = createFakeDb()

      const user = createUser()

      db.setOutcomes([rows([user]), rows([user])])

      const response = await service.login(loginBody, createRequest())

      expect(response).toBeInstanceOf(Response)
      expect(response.status).toBe(200)

      expect(await readResponse(response)).toEqual({
        success: true,
        message: 'Logged in successfully',
        data: {
          id: 'user-id',
          username: 'zen-user',
          email: 'zen@example.com',
        },
      })

      expect(db.select).toHaveBeenCalledTimes(1)
      expect(db.update).toHaveBeenCalledTimes(1)

      expect(bcryptCompare).toHaveBeenCalledWith(loginBody.password, user.password)

      expect(bcryptHash).toHaveBeenCalledWith('refresh-token', 12)

      expect(signPair).toHaveBeenCalledTimes(1)
      expect(cookieSet).toHaveBeenCalledTimes(2)
    })

    test('should throw BadRequestException when user does not exist', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([rows([])])

      await expect(service.login(loginBody, createRequest())).rejects.toThrow(
        'Invalid email or password',
      )

      expect(bcryptCompare).not.toHaveBeenCalled()
      expect(signPair).not.toHaveBeenCalled()
    })

    test('should throw BadRequestException when password is incorrect', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([rows([createUser()])])

      bcryptCompare.mockResolvedValue(false)

      await expect(service.login(loginBody, createRequest())).rejects.toThrow(
        'Invalid email or password',
      )

      expect(bcryptCompare).toHaveBeenCalledTimes(1)
      expect(signPair).not.toHaveBeenCalled()
      expect(db.update).not.toHaveBeenCalled()
    })

    test('should propagate database errors', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([failing('Login query failed')])

      await expect(service.login(loginBody, createRequest())).rejects.toThrow('Login query failed')
    })

    test('should propagate password comparison errors', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([rows([createUser()])])

      bcryptCompare.mockRejectedValue(new Error('Password comparison failed'))

      await expect(service.login(loginBody, createRequest())).rejects.toThrow(
        'Password comparison failed',
      )
    })
  })

  describe('logout', () => {
    test('should logout successfully and delete both cookies', async () => {
      const { service } = createFakeDb()

      const response = await service.logout(createRequest())

      expect(response).toBeInstanceOf(Response)
      expect(response.status).toBe(200)

      expect(await readResponse(response)).toEqual({
        success: true,
        message: 'Logged out successfully',
      })

      expect(fromRequest).toHaveBeenCalledTimes(1)

      expect(cookieDelete).toHaveBeenCalledTimes(2)
      expect(cookieDelete).toHaveBeenNthCalledWith(
        1,
        'accessToken',
        expect.objectContaining({
          httpOnly: true,
          maxAge: 0,
        }),
      )

      expect(cookieDelete).toHaveBeenNthCalledWith(
        2,
        'refreshToken',
        expect.objectContaining({
          httpOnly: true,
          path: '/',
        }),
      )

      expect(cookieApplyTo).toHaveBeenCalledTimes(1)
    })
  })

  describe('me', () => {
    test('should return authenticated user with profile', async () => {
      const { db, service } = createFakeDb()

      const user = createUser()

      const profile = {
        id: 'profile-id',
        avatar: { url: 'avatar.jpg', publicId: '' },
        cover: { url: 'cover.jpg', publicId: '' },
        bio: 'Developer',
      }

      db.setOutcomes([rows([user]), rows([profile])])

      const result = await service.me({
        id: 'user-id',
      })

      expect(result.success).toBe(true)

      expect(result.data).toMatchObject({
        id: 'user-id',
        username: 'zen-user',
        email: 'zen@example.com',
        profile,
      })

      expect(db.select).toHaveBeenCalledTimes(2)
      expect(sanitizeUserMock).toHaveBeenCalledWith(user)
    })

    test('should return null profile when profile does not exist', async () => {
      const { db, service } = createFakeDb()

      const user = createUser()

      db.setOutcomes([rows([user]), rows([])])

      const result = await service.me({
        id: 'user-id',
      })

      expect(result.data.profile).toBeNull()
    })

    test('should throw UnauthorizedException when user does not exist', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([rows([])])

      await expect(service.me({ id: 'missing-user' })).rejects.toThrow('You are not authenticated')

      expect(db.select).toHaveBeenCalledTimes(1)
    })

    test('should propagate user query errors', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([failing('User query failed')])

      await expect(service.me({ id: 'user-id' })).rejects.toThrow('User query failed')
    })

    test('should propagate profile query errors', async () => {
      const { db, service } = createFakeDb()

      db.setOutcomes([rows([createUser()]), failing('Profile query failed')])

      await expect(service.me({ id: 'user-id' })).rejects.toThrow('Profile query failed')
    })
  })

  describe('refreshToken', () => {
    test('should refresh access token successfully', async () => {
      const { db, service } = createFakeDb()

      const user = createUser()

      cookieGet.mockReturnValue('refresh-token')

      db.setOutcomes([rows([user])])

      const response = await service.refreshToken(createRequest())

      expect(response).toBeInstanceOf(Response)
      expect(response.status).toBe(200)

      expect(await readResponse(response)).toEqual({
        success: true,
        message: 'Access token refreshed successfully',
      })

      expect(cookieGet).toHaveBeenCalledWith('refreshToken')
      expect(verifyRefreshToken).toHaveBeenCalledWith('refresh-token')

      expect(bcryptCompare).toHaveBeenCalledWith('refresh-token', user.refreshToken)

      expect(signAccessToken).toHaveBeenCalledTimes(1)

      expect(cookieSet).toHaveBeenCalledWith(
        'accessToken',
        'new-access-token',
        expect.objectContaining({
          httpOnly: true,
        }),
      )

      expect(cookieApplyTo).toHaveBeenCalledTimes(1)
    })

    test('should throw UnauthorizedException when refresh cookie is missing', async () => {
      const { db, service } = createFakeDb()

      cookieGet.mockReturnValue(undefined)

      await expect(service.refreshToken(createRequest())).rejects.toThrow(
        'You are not authenticated',
      )

      expect(verifyRefreshToken).not.toHaveBeenCalled()
      expect(db.select).not.toHaveBeenCalled()
    })

    test('should throw UnauthorizedException when token payload is invalid', async () => {
      const { db, service } = createFakeDb()

      cookieGet.mockReturnValue('invalid-token')

      verifyRefreshToken.mockReturnValue(null)

      await expect(service.refreshToken(createRequest())).rejects.toThrow(
        'You are not authenticated',
      )

      expect(db.select).not.toHaveBeenCalled()
    })

    test('should reject payload without string user id', async () => {
      const { db, service } = createFakeDb()

      cookieGet.mockReturnValue('refresh-token')

      verifyRefreshToken.mockReturnValue({
        id: 123,
      })

      await expect(service.refreshToken(createRequest())).rejects.toThrow(
        'You are not authenticated',
      )

      expect(verifyRefreshToken).toHaveBeenCalledWith('refresh-token')
      expect(db.select).not.toHaveBeenCalled()
    })

    test('should throw UnauthorizedException when user does not exist', async () => {
      const { db, service } = createFakeDb()

      cookieGet.mockReturnValue('refresh-token')

      db.setOutcomes([rows([])])

      await expect(service.refreshToken(createRequest())).rejects.toThrow(
        'You are not authenticated',
      )

      expect(bcryptCompare).not.toHaveBeenCalled()
      expect(cookieSet).not.toHaveBeenCalled()
    })

    test('should throw UnauthorizedException when user has no refresh token', async () => {
      const { db, service } = createFakeDb()

      cookieGet.mockReturnValue('refresh-token')

      db.setOutcomes([rows([createUser({ refreshToken: null })])])

      await expect(service.refreshToken(createRequest())).rejects.toThrow(
        'You are not authenticated',
      )

      expect(bcryptCompare).not.toHaveBeenCalled()
    })

    test('should throw UnauthorizedException when refresh token does not match', async () => {
      const { db, service } = createFakeDb()

      cookieGet.mockReturnValue('refresh-token')

      db.setOutcomes([rows([createUser()])])

      bcryptCompare.mockResolvedValue(false)

      await expect(service.refreshToken(createRequest())).rejects.toThrow(
        'You are not authenticated',
      )

      expect(signAccessToken).not.toHaveBeenCalled()
      expect(cookieSet).not.toHaveBeenCalled()
    })

    test('should propagate database errors', async () => {
      const { db, service } = createFakeDb()

      cookieGet.mockReturnValue('refresh-token')

      db.setOutcomes([failing('Refresh query failed')])

      await expect(service.refreshToken(createRequest())).rejects.toThrow('Refresh query failed')
    })
  })
})
