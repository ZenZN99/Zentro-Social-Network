import type { RiserBob } from 'riser-bob'
import { AuthMiddleware } from 'riser-bob'
import { NotificationsController } from './notifications.controller'
import { NotificationsRouter } from './notifications.route'
import { verifyUser } from '../../config/token/verify-user'
import { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'
import { RolesMiddleware } from '../../config/middlewares/roles.middleware'
import { NotificationsService } from './notifications.service'
import type { Server } from 'socket.io'
import { NotificationsGateway } from '../../config/gateways/notifications.gateway'
import { database } from '../../config/db/drizzle'

export class NotificationsModule {
  register(bob: RiserBob, io: Server): void {
    const notificationGateway = new NotificationsGateway(io)

    io.on('connection', (socket) => {
      notificationGateway.handleConnection(socket)

      socket.on('disconnect', () => {
        notificationGateway.handleDisconnect(socket)
      })
    })

    const notificationsService = new NotificationsService(database, notificationGateway)
    const notificationsController = new NotificationsController(notificationsService)

    const authMiddleware = new AuthMiddleware(verifyUser, {
      mode: 'cookie',
      cookieName: 'token',
    })

    const userActiveMiddleware = new UserActiveMiddleware()
    const rolesMiddleware = new RolesMiddleware()

    const router = new NotificationsRouter(
      bob,
      notificationsController,
      authMiddleware,
      userActiveMiddleware,
      rolesMiddleware,
    )

    router.register()
  }
}
