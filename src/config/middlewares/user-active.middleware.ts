import type { Context, NextFunc, Reply } from 'lykosjs'

export class UserActiveMiddleware {
  readonly middleware = async (ctx: Context, reply: Reply, next: NextFunc): Promise<Response> => {
    if (!ctx.user) {
      return reply.Unauthorized({
        success: false,
        message: 'You are not authenticated',
      })
    }

    if (!ctx.user.isActive) {
      return reply.Forbidden({
        success: false,
        message: 'Your account is inactive',
      })
    }

    return next()
  }
}
