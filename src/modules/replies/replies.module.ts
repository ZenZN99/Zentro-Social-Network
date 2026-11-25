import { AuthMiddleware, bind, defineAuth, DIModule, Lykos } from 'lykosjs'
import { NotificationsModule } from '../notifications/notifications.module'
import { Database } from '../../config/db/drizzle'
import { RepliesService } from './replies.service'
import { NotificationsService } from '../notifications/notifications.service'
import { RepliesController } from './replies.controller'
import { RepliesRouter } from './replies.route'
import { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'

export class RepliesModule extends DIModule {
  override imports = [NotificationsModule]
  override providers = [
    Database,
    bind(RepliesService, Database, NotificationsService),
    UserActiveMiddleware,
  ]
  override controllers = [bind(RepliesController, RepliesService)]
  override routers = [
    bind(RepliesRouter, Lykos, RepliesController, AuthMiddleware, UserActiveMiddleware),
  ]
  override auth = defineAuth({
    verifier: RepliesController,
    mode: 'cookie',
    cookieName: 'accessToken',
  })
}
