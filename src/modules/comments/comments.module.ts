import { AuthMiddleware, bind, defineAuth, DIModule, Lykos, value } from 'lykosjs'
import { NotificationsModule } from '../notifications/notifications.module'
import { Database } from '../../config/db/drizzle'
import { NotificationsService } from '../notifications/notifications.service'
import { CommentsService } from './comments.service'
import { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'
import { CommentsController } from './comments.controller'
import { CommentsRouter } from './comments.route'

export class CommentsModule extends DIModule {
  override imports = [NotificationsModule]
  override providers = [
    Database,
    bind(CommentsService, Database, NotificationsService),
    UserActiveMiddleware,
  ]

  override controllers = [bind(CommentsController, CommentsService)]
  override routers = [
    bind(CommentsRouter, Lykos, CommentsController, AuthMiddleware, UserActiveMiddleware),
  ]

  override auth = defineAuth({
    verifier: CommentsController,
    mode: 'cookie',
    cookieName: 'accessToken',
  })
}
