import { AuthMiddleware, bind, defineAuth, DIModule, Lykos } from 'lykosjs'
import { NotificationsModule } from '../notifications/notifications.module'
import { Database } from '../../config/db/drizzle'
import { LikesService } from './likes.service'
import { NotificationsService } from '../notifications/notifications.service'
import { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'
import { LikesController } from './likes.controller'
import { LikesRouter } from './likes.route'

export class LikesModule extends DIModule {
  override imports = [NotificationsModule]
  override providers = [
    Database,
    bind(LikesService, Database, NotificationsService),
    UserActiveMiddleware,
  ]
  override controllers = [bind(LikesController, LikesService)]
  override routers = [
    bind(LikesRouter, Lykos, LikesController, AuthMiddleware, UserActiveMiddleware),
  ]
  override auth = defineAuth({
    verifier: LikesController,
    mode: 'cookie',
    cookieName: 'accessToken',
  })
}
