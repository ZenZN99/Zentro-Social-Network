import type { RiserBob } from 'riser-bob'
import { AuthMiddleware } from 'riser-bob'
import { MessagesController } from './messages.controller'
import { MessagesRouter } from './messages.route'
import { MessagesService } from './messages.service'
import { database } from '../../config/db/drizzle'
import { verifyUser } from '../../config/token/verify-user'
import { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'
import { NotificationsService } from '../notifications/notifications.service'
import type { Server } from 'socket.io'
import { NotificationsGateway } from '../../config/gateways/notifications.gateway'
import { MessagesGateway } from '../../config/gateways/messages.gateway'

export class MessagesModule {
  register(bob: RiserBob, io: Server): void {
    const notificationsGateway = new NotificationsGateway(io)
    const messagesGateway = new MessagesGateway(io)
    const notificationsService = new NotificationsService(database, notificationsGateway)

    const messagesService = new MessagesService(database, messagesGateway, notificationsService)
    const messagesController = new MessagesController(messagesService)

    const authMiddleware = new AuthMiddleware(verifyUser, {
      mode: 'cookie',
      cookieName: 'accessToken',
    })

    const userActiveMiddleware = new UserActiveMiddleware()

    const router = new MessagesRouter(bob, messagesController, authMiddleware, userActiveMiddleware)

    router.register()
  }
}
