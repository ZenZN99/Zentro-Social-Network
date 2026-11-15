import type { RiserBob } from 'riser-bob'
import { AuthMiddleware } from 'riser-bob'
import { FollowsController } from './follows.controller'
import { FollowsRouter } from './follows.route'
import { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'
import { FollowsService } from './follows.service'
import { database } from '../../config/db/drizzle'
import { verifyUser } from '../../config/token/verify-user'
import type { Server } from 'socket.io'
import { NotificationsGateway } from '../../config/gateways/notifications.gateway'
import { NotificationsService } from '../notifications/notifications.service'

export class FollowsModule {
  register(bob: RiserBob, io: Server): void {
    const notificationsGateway = new NotificationsGateway(io)

    const notificationsService = new NotificationsService(database, notificationsGateway)

    const followsService = new FollowsService(database, notificationsService)

    const followsController = new FollowsController(followsService)

    const authMiddleware = new AuthMiddleware(verifyUser, {
      mode: 'cookie',
      cookieName: 'accessToken',
    })

    const userActiveMiddleware = new UserActiveMiddleware()

    const router = new FollowsRouter(bob, followsController, authMiddleware, userActiveMiddleware)

    router.register()
  }
}
