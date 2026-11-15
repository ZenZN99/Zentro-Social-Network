import type { RiserBob } from 'riser-bob'
import { AuthMiddleware } from 'riser-bob'
import { UserVerificationsController } from './user-verifications.controller'
import { UserVerificationsRouter } from './user-verifications.route'
import { UserVerificationsService } from './user-verifications.service'
import { verifyUser } from '../../config/token/verify-user'
import { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'
import { RolesMiddleware } from '../../config/middlewares/roles.middleware'
import { database } from '../../config/db/drizzle'
import type { Server } from 'socket.io'
import { NotificationsService } from '../notifications/notifications.service'
import { NotificationsGateway } from '../../config/gateways/notifications.gateway'

export class UserVerificationsModule {
  register(bob: RiserBob, io: Server): void {
    const notificationGateway = new NotificationsGateway(io)

    const notificationsService = new NotificationsService(database, notificationGateway)

    const userVerificationsService = new UserVerificationsService(database, notificationsService)
    const userVerificationsController = new UserVerificationsController(userVerificationsService)

    const authMiddleware = new AuthMiddleware(verifyUser, {
      mode: 'cookie',
      cookieName: 'accessToken',
    })

    const userActiveMiddleware = new UserActiveMiddleware()
    const rolesMiddleware = new RolesMiddleware()

    const router = new UserVerificationsRouter(
      bob,
      userVerificationsController,
      authMiddleware,
      userActiveMiddleware,
      rolesMiddleware,
    )

    router.register()
  }
}
