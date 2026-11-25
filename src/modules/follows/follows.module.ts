import { AuthMiddleware, bind, defineAuth, DIModule, Lykos } from 'lykosjs'
import { NotificationsModule } from '../notifications/notifications.module'
import { Database } from '../../config/db/drizzle'
import { FollowsService } from './follows.service'
import { NotificationsService } from '../notifications/notifications.service'
import { FollowsController } from './follows.controller'
import { FollowsRouter } from './follows.route'
import { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'

export class FollowsModule extends DIModule {
  override imports = [NotificationsModule]
  override providers = [
    Database,
    bind(FollowsService, Database, NotificationsService),
    UserActiveMiddleware,
  ]
  override controllers = [bind(FollowsController, FollowsService)]
  override routers = [
    bind(FollowsRouter, Lykos, FollowsController, AuthMiddleware, UserActiveMiddleware),
  ]
  override auth = defineAuth({
    verifier: FollowsController,
    mode: 'cookie',
    cookieName: 'accessToken',
  })
}
