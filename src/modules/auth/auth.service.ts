import {
  BadRequestException,
  InternalServerErrorException,
  UnauthorizedException,
  type Context,
} from 'lykosjs'
import { UserSchema, type User } from '../users/schemas/user.schema'
import { CookieManager, type SameSite } from '@lykosjs/cookie'
import bcrypt from 'bcryptjs'
import { generateUsername } from '../../utilities/generate-user-name'
import { UserRole } from '../users/schemas/enums/user-role'
import jwt from '../../config/token/jwt'
import { sanitizeUser } from '../../utilities/sanitize-user'
import { UserProfileSchema } from '../user-profiles/schemas/user-profile.schema'
import type { Database } from '../../config/db/drizzle'
import { eq } from 'drizzle-orm'

export interface RegisterBody {
  firstName: string
  lastName: string
  email: string
  password: string
}

export interface LoginBody {
  email: string
  password: string
}

export class AuthService {
  constructor(private readonly db: Database) {}

  private getCookieOptions(isLogout = false) {
    return {
      httpOnly: true,
      secure: false, // production : true // localhost: false
      sameSite: 'lax' as SameSite, // production : none // localhost: lax
      maxAge: isLogout ? 0 : 365 * 24 * 60 * 60 * 1000,
    }
  }

  private getRefreshCookieOptions() {
    return {
      httpOnly: true,
      secure: false, // production : true // localhost: false
      sameSite: 'lax' as SameSite, // production : none // localhost: lax
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    }
  }

  async register(body: RegisterBody, ctx: Context) {
    const { firstName, lastName, email, password } = body

    const [existing] = await this.db.connection
      .select()
      .from(UserSchema)
      .where(eq(UserSchema.email, email))
      .limit(1)

    if (existing) {
      throw new BadRequestException({
        success: false,
        message: 'Unable to complete registration',
      })
    }

    const hashed = await bcrypt.hash(password, 12)

    const [newUser] = await this.db.connection
      .insert(UserSchema)
      .values({
        firstName,
        lastName,
        username: await generateUsername(this.db.connection, firstName, lastName),
        email,
        password: hashed,
        role: UserRole.USER,
        isActive: true,
      })
      .returning()

    const user = newUser!

    await this.db.connection.insert(UserProfileSchema).values({
      userId: user.id,
      avatar: {
        url: 'https://res.cloudinary.com/dgagbheuj/image/upload/v1763194734/avatar-default-image_yc4xy4.jpg',
        publicId: '',
      },
      cover: {
        url: 'https://res.cloudinary.com/dgagbheuj/image/upload/v1763194811/cover-default-image_uunwq6.jpg',
        publicId: '',
      },
      bio: 'No bio yet.',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const { accessToken, refreshToken } = jwt.signPair({
      id: user.id,
      role: user.role,
      isActive: user.isActive,
    })

    jwt.assertAccessToken(accessToken)
    jwt.assertRefreshToken(refreshToken)

    const hashedRefreshToken = await bcrypt.hash(refreshToken, 12)

    const [updatedUser] = await this.db.connection
      .update(UserSchema)
      .set({ refreshToken: hashedRefreshToken })
      .where(eq(UserSchema.id, user.id))
      .returning()

    if (!updatedUser) {
      throw new InternalServerErrorException({
        success: false,
        message: 'Failed to update user',
      })
    }

    const cookies = CookieManager.fromRequest(ctx.request)

    cookies.set('accessToken', accessToken, this.getCookieOptions())
    cookies.set('refreshToken', refreshToken, this.getRefreshCookieOptions())

    const safeUser = sanitizeUser(updatedUser)

    const response = Response.json(
      {
        success: true,
        message: 'Account created successfully',
        data: safeUser,
      },
      {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    )

    return cookies.applyTo(response)
  }

  async login(body: LoginBody, ctx: Context) {
    const { email, password } = body

    const [user] = await this.db.connection
      .select()
      .from(UserSchema)
      .where(eq(UserSchema.email, email))
      .limit(1)

    if (!user) {
      throw new BadRequestException({
        success: false,
        message: 'Invalid email or password',
      })
    }

    const isMatch = await bcrypt.compare(password, user.password)

    if (!isMatch) {
      throw new BadRequestException({
        success: false,
        message: 'Invalid email or password',
      })
    }

    const { accessToken, refreshToken } = jwt.signPair({
      id: user.id,
      role: user.role,
      isActive: user.isActive,
    })

    jwt.assertAccessToken(accessToken)
    jwt.assertRefreshToken(refreshToken)

    const hashedRefreshToken = await bcrypt.hash(refreshToken, 12)

    const [updatedUser] = await this.db.connection
      .update(UserSchema)
      .set({ refreshToken: hashedRefreshToken })
      .where(eq(UserSchema.id, user.id))
      .returning()

    const cookies = CookieManager.fromRequest(ctx.request)

    cookies.set('accessToken', accessToken, this.getCookieOptions())
    cookies.set('refreshToken', refreshToken, this.getRefreshCookieOptions())

    const safeUser = sanitizeUser(updatedUser!)

    const response = Response.json(
      {
        success: true,
        message: 'Logged in successfully',
        data: safeUser,
      },
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    )

    return cookies.applyTo(response)
  }

  async logout(ctx: Context) {
    const cookies = CookieManager.fromRequest(ctx.request)

    cookies.delete('accessToken', this.getCookieOptions(true))
    cookies.delete('refreshToken', this.getRefreshCookieOptions())

    const response = Response.json(
      {
        success: true,
        message: 'Logged out successfully',
      },
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    )

    return cookies.applyTo(response)
  }

  async me(currentUser: Partial<User>) {
    const [user] = await this.db.connection
      .select()
      .from(UserSchema)
      .where(eq(UserSchema.id, currentUser.id!))
      .limit(1)

    if (!user) {
      throw new UnauthorizedException({
        success: false,
        message: 'You are not authenticated',
      })
    }

    const [profile] = await this.db.connection
      .select({
        id: UserProfileSchema.id,
        avatar: UserProfileSchema.avatar,
        cover: UserProfileSchema.cover,
        bio: UserProfileSchema.bio,
      })
      .from(UserProfileSchema)
      .where(eq(UserProfileSchema.userId, user.id))
      .limit(1)

    return {
      success: true,
      data: {
        ...sanitizeUser(user),
        profile: profile ?? null,
      },
    }
  }

  async refreshToken(ctx: Context) {
    const cookies = CookieManager.fromRequest(ctx.request)

    const refreshToken = cookies.get('refreshToken')

    if (!refreshToken) {
      throw new UnauthorizedException({
        success: false,
        message: 'You are not authenticated',
      })
    }

    const payload = jwt.verifyRefreshToken(refreshToken)

    if (!payload || typeof payload.id !== 'string') {
      throw new UnauthorizedException({
        success: false,
        message: 'You are not authenticated',
      })
    }

    const [user] = await this.db.connection
      .select()
      .from(UserSchema)
      .where(eq(UserSchema.id, payload.id))
      .limit(1)

    if (!user || !user.refreshToken) {
      throw new UnauthorizedException({
        success: false,
        message: 'You are not authenticated',
      })
    }

    const valid = await bcrypt.compare(refreshToken, user.refreshToken)

    if (!valid) {
      throw new UnauthorizedException({
        success: false,
        message: 'You are not authenticated',
      })
    }

    const accessToken = jwt.signAccessToken({
      id: user.id,
      isActive: user.isActive,
      role: user.role,
    })

    cookies.set('accessToken', accessToken, this.getCookieOptions())

    const response = Response.json(
      {
        success: true,
        message: 'Access token refreshed successfully',
      },
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    )

    return cookies.applyTo(response)
  }
}
