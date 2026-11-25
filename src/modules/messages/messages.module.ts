import { AuthMiddleware, bind, defineAuth, DIModule, Lykos } from 'lykosjs'
import { NotificationsModule } from '../notifications/notifications.module'
import { Database } from '../../config/db/drizzle'
import { MessagesService } from './messages.service'
import { MessagesGateway } from '../../config/gateways/messages.gateway'
import { NotificationsService } from '../notifications/notifications.service'
import { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'
import { MessagesController } from './messages.controller'
import { MessagesRouter } from './messages.route'

export class MessagesModule extends DIModule {
  override imports = [NotificationsModule]
  override providers = [
    Database,
    MessagesGateway,
    bind(MessagesService, Database, MessagesGateway, NotificationsService),
    UserActiveMiddleware,
  ]
  override controllers = [bind(MessagesController, MessagesService)]
  override routers = [
    bind(MessagesRouter, Lykos, MessagesController, AuthMiddleware, UserActiveMiddleware),
  ]
  override auth = defineAuth({
    verifier: MessagesController,
    mode: 'cookie',
    cookieName: 'accessToken',
  })
}
