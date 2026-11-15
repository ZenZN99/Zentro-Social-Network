import type { RiserBob } from 'riser-bob'
import { AuthMiddleware } from 'riser-bob'
import { UsersController } from './users.controller'
import { UsersRouter } from './users.route'
import { UsersService } from './users.service'
import { verifyUser } from '../../config/token/verify-user'
import { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'
import { RolesMiddleware } from '../../config/middlewares/roles.middleware'
import { database } from '../../config/db/drizzle'
import { NotificationsService } from '../notifications/notifications.service'
import type { Server } from 'socket.io'
import { NotificationsGateway } from '../../config/gateways/notifications.gateway'

export class UsersModule {
  register(bob: RiserBob, io: Server): void {
    const notificationGateway = new NotificationsGateway(io)

    const notificationsService = new NotificationsService(database, notificationGateway)

    const usersService = new UsersService(database, notificationsService)
    const usersController = new UsersController(usersService)

    const authMiddleware = new AuthMiddleware(verifyUser, {
      mode: 'cookie',
      cookieName: 'accessToken',
    })

    const userActiveMiddleware = new UserActiveMiddleware()
    const rolesMiddleware = new RolesMiddleware()

    const router = new UsersRouter(
      bob,
      usersController,
      authMiddleware,
      userActiveMiddleware,
      rolesMiddleware,
    )

    router.register()
  }
}
