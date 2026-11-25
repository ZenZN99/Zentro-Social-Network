import {
  MiddlewarePipeline,
  type ContextMiddleware,
  type Context,
  type Reply,
  type NextFunc,
} from 'lykosjs'
import { AuthMiddleware } from 'lykosjs'
import { UserActiveMiddleware } from './user-active.middleware'
import { RolesMiddleware } from './roles.middleware'
import { UserRole } from '../../modules/users/schemas/enums/user-role'

export class ProtectedMiddleware {
  constructor(
    private readonly authMiddleware: AuthMiddleware,
    private readonly userActiveMiddleware: UserActiveMiddleware,
    private readonly rolesMiddleware: RolesMiddleware,
  ) {}

  auth(...middlewares: ContextMiddleware<Context>[]): ContextMiddleware<Context> {
    const pipeline = new MiddlewarePipeline<Context>()

    pipeline.use(this.authMiddleware.middleware).use(this.userActiveMiddleware.middleware)

    for (const middleware of middlewares) {
      pipeline.use(middleware)
    }

    return (ctx: Context, reply: Reply, next: NextFunc) => pipeline.execute(ctx, reply, next)
  }

  admin(): ContextMiddleware<Context> {
    return this.auth(this.rolesMiddleware.allow(UserRole.ADMIN))
  }

  adminAndSupport(): ContextMiddleware<Context> {
    return this.auth(this.rolesMiddleware.allow(UserRole.ADMIN, UserRole.SUPPORT))
  }
}
