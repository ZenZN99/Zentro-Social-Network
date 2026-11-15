import type { RiserBob } from 'riser-bob'
import { AuthMiddleware } from 'riser-bob'
import { CommentsController } from './comments.controller'
import { CommentsRouter } from './comments.route'
import { verifyUser } from '../../config/token/verify-user'
import { CommentsService } from './comments.service'
import { database } from '../../config/db/drizzle'
import { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'
import type { Server } from 'socket.io'
import { NotificationsGateway } from '../../config/gateways/notifications.gateway'
import { NotificationsService } from '../notifications/notifications.service'

export class CommentsModule {
  register(bob: RiserBob, io: Server): void {
    const notificationsGateway = new NotificationsGateway(io)

    const notificationsService = new NotificationsService(database, notificationsGateway)

    const commentsService = new CommentsService(database, notificationsService)

    const commentsController = new CommentsController(commentsService)

    const authMiddleware = new AuthMiddleware(verifyUser, {
      mode: 'cookie',
      cookieName: 'accessToken',
    })

    const userActiveMiddleware = new UserActiveMiddleware()

    const router = new CommentsRouter(bob, commentsController, authMiddleware, userActiveMiddleware)

    router.register()
  }
}
