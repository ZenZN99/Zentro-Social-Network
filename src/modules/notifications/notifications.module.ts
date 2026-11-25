import { AuthMiddleware, bind, defineAuth, DIModule, Lykos } from 'lykosjs'
import { Database } from '../../config/db/drizzle'
import { NotificationsGateway } from '../../config/gateways/notifications.gateway'
import { NotificationsService } from './notifications.service'
import { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'
import { NotificationsController } from './notifications.controller'
import { NotificationsRouter } from './notifications.route'

export class NotificationsModule extends DIModule {
  override providers = [
    Database,
    NotificationsGateway,
    bind(NotificationsService, Database, NotificationsGateway),
    UserActiveMiddleware,
  ]
  override controllers = [bind(NotificationsController, NotificationsService)]
  override routers = [
    bind(NotificationsRouter, Lykos, NotificationsController, AuthMiddleware, UserActiveMiddleware),
  ]
  override auth = defineAuth({
    verifier: NotificationsController,
    mode: 'cookie',
    cookieName: 'accessToken',
  })

  override exports = [NotificationsService]
}
