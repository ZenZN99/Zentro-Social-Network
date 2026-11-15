import type { RiserBob } from 'riser-bob'
import { AuthMiddleware } from 'riser-bob'
import { RepliesController } from './replies.controller'
import { RepliesRouter } from './replies.route'
import { RepliesService } from './replies.service'
import { database } from '../../config/db/drizzle'
import { verifyUser } from '../../config/token/verify-user'
import { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'
import { NotificationsService } from '../notifications/notifications.service'
import type { Server } from 'socket.io'
import { NotificationsGateway } from '../../config/gateways/notifications.gateway'

export class RepliesModule {
  register(bob: RiserBob, io: Server): void {
    const notificationsGateway = new NotificationsGateway(io)

    const notificationsService = new NotificationsService(database, notificationsGateway)

    const repliesService = new RepliesService(database, notificationsService)

    const repliesController = new RepliesController(repliesService)

    const authMiddleware = new AuthMiddleware(verifyUser, {
      mode: 'cookie',
      cookieName: 'accessToken',
    })

    const userActiveMiddleware = new UserActiveMiddleware()

    const router = new RepliesRouter(bob, repliesController, authMiddleware, userActiveMiddleware)

    router.register()
  }
}
