import type { RiserBob } from 'riser-bob'
import { AuthMiddleware } from 'riser-bob'
import { LikesController } from './likes.controller'
import { LikesRouter } from './likes.route'
import { verifyUser } from '../../config/token/verify-user'
import { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'
import { database } from '../../config/db/drizzle'
import type { Server } from 'socket.io'
import { NotificationsGateway } from '../../config/gateways/notifications.gateway'
import { NotificationsService } from '../notifications/notifications.service'
import { LikesService } from './likes.service'

export class LikesModule {
  register(bob: RiserBob, io: Server): void {
    const notificationsGateway = new NotificationsGateway(io)

    const notificationsService = new NotificationsService(database, notificationsGateway)

    const likesService = new LikesService(database, notificationsService)

    const likesController = new LikesController(likesService)

    const authMiddleware = new AuthMiddleware(verifyUser, {
      mode: 'cookie',
      cookieName: 'accessToken',
    })

    const userActiveMiddleware = new UserActiveMiddleware()

    const router = new LikesRouter(bob, likesController, authMiddleware, userActiveMiddleware)

    router.register()
  }
}
