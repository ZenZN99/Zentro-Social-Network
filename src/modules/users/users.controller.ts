import { getPagination } from '../../utilities/pagination'
import type { UsersService } from './users.service'
import type { UserRole } from './schemas/enums/user-role'
import type { ContextHandler } from 'lykosjs'
import { verifyUser } from '../../config/token/verify-user'

export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  readonly findAll: ContextHandler = async (ctx, reply) => {
    const { page, limit, offset } = getPagination(ctx)

    const result = await this.usersService.findAll(page, limit, offset)

    return reply.OK({
      success: result.success,
      data: {
        users: result.safeUsers,
        pagination: result.pagination,
      },
    })
  }

  readonly findOneByUsername: ContextHandler = async (ctx, reply) => {
    const { username } = ctx.params

    if (!username) {
      return reply.BadRequest({
        success: false,
        message: 'User name is required',
      })
    }

    const result = await this.usersService.findOneByUsername(username)

    return reply.OK({
      success: result.success,
      data: result.data,
    })
  }

  readonly updateRole: ContextHandler = async (ctx, reply) => {
    const adminId = ctx.user!.id
    const { userId } = ctx.params

    if (!userId) {
      return reply.BadRequest({
        success: false,
        message: 'User ID is required',
      })
    }

    const { role } = await ctx.json<{ role: UserRole }>()

    const result = await this.usersService.updateRole(adminId, userId, role)

    return reply.OK({
      success: result.success,
      message: result.message,
    })
  }

  readonly block: ContextHandler = async (ctx, reply) => {
    const adminId = ctx.user!.id
    const { userId } = ctx.params

    if (!userId) {
      return reply.BadRequest({
        success: false,
        message: 'User ID is required',
      })
    }

    const result = await this.usersService.block(adminId, userId)

    return reply.OK({
      success: result.success,
      message: result.message,
    })
  }

  verifyToken(token: string) {
    return verifyUser(token)
  }
}
