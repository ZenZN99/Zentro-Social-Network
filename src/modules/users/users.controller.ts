import type { SpongHandler } from 'riser-bob'
import { getPagination } from '../../utilities/pagination'
import type { UsersService } from './users.service'
import type { UserRole } from './schemas/enums/user-role'

export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  readonly findAll: SpongHandler = async (spongReq, spongRes) => {
    const { page, limit, offset } = getPagination(spongReq)

    const result = await this.usersService.findAll(page, limit, offset)

    return spongRes.SpongOK({
      success: result.success,
      data: {
        users: result.safeUsers,
        pagination: result.pagination,
      },
    })
  }

  readonly findOneByUsername: SpongHandler = async (spongReq, spongRes) => {
    const { username } = spongReq.params

    if (!username) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'User name is required',
      })
    }

    const result = await this.usersService.findOneByUsername(username)

    return spongRes.SpongOK({
      success: result.success,
      data: result.data,
    })
  }

  readonly updateRole: SpongHandler = async (spongReq, spongRes) => {
    const adminId = spongReq.user!.id
    const { userId } = spongReq.params

    if (!userId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'User ID is required',
      })
    }

    const { role } = await spongReq.json<{ role: UserRole }>()

    const result = await this.usersService.updateRole(adminId, userId, role)

    return spongRes.SpongOK({
      success: result.success,
      message: result.message,
    })
  }

  readonly block: SpongHandler = async (spongReq, spongRes) => {
    const adminId = spongReq.user!.id
    const { userId } = spongReq.params

    if (!userId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'User ID is required',
      })
    }

    const result = await this.usersService.block(adminId, userId)

    return spongRes.SpongOK({
      success: result.success,
      message: result.message,
    })
  }
}
