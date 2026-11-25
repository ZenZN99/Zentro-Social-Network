import type { AuthService, LoginBody, RegisterBody } from './auth.service'
import { Validator, type ContextHandler } from 'lykosjs'
import { RegisterAuthRule } from './rules/register'
import { LoginAuthRule } from './rules/login'
import { verifyUser } from '../../config/token/verify-user'

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  readonly register: ContextHandler = async (ctx, reply) => {
    const body = await ctx.json<RegisterBody>()

    const validation = Validator.validate({ ...body }, RegisterAuthRule)

    if (!validation.valid) {
      return reply.UnprocessableContent({
        success: false,
        message: 'validation failed',
        errors: validation.errors,
      })
    }

    const result = await this.authService.register(validation.data, ctx)

    return result
  }

  readonly login: ContextHandler = async (ctx, reply) => {
    const body = await ctx.json<LoginBody>()

    const validation = Validator.validate({ ...body }, LoginAuthRule)

    if (!validation.valid) {
      return reply.UnprocessableContent({
        success: false,
        message: 'validation failed',
        errors: validation.errors,
      })
    }

    const result = await this.authService.login(validation.data, ctx)

    return result
  }

  readonly logout: ContextHandler = async (ctx, reply) => {
    const result = await this.authService.logout(ctx)

    return result
  }

  readonly me: ContextHandler = async (ctx, reply) => {
    const currentUser = ctx.user!

    const result = await this.authService.me(currentUser)

    return reply.OK({
      success: result.success,
      data: result.data,
    })
  }

  readonly refreshToken: ContextHandler = async (ctx, reply) => {
    const result = await this.authService.refreshToken(ctx)

    return result
  }

  verifyToken(token: string) {
    return verifyUser(token)
  }
}
