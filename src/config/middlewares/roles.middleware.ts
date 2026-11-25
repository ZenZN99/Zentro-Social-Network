import type { Context, ContextMiddleware } from 'lykosjs'
import { UserRole } from '../../modules/users/schemas/enums/user-role'

const isUserRole = (role: unknown): role is UserRole =>
  Object.values(UserRole).some((value) => value === role)

export class RolesMiddleware {
  allow(...allowedRoles: UserRole[]): ContextMiddleware<Context> {
    return async (ctx, reply, next) => {
      const user = ctx.user

      if (!user) {
        return reply.Unauthorized({
          success: false,
          message: 'You are not authenticated',
        })
      }

      if (!isUserRole(user.role) || !allowedRoles.includes(user.role)) {
        return reply.Forbidden({
          success: false,
          message: "You don't have permission to access this resource",
        })
      }

      return next()
    }
  }
}
