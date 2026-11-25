import { AuthMiddleware, DIModule, Lykos, bind, defineAuth } from 'lykosjs'
import { NotificationsModule } from '../../notifications/notifications.module'
import { Database } from '../../../config/db/drizzle'
import { PostRepostsService } from './post-reposts.service'
import { NotificationsService } from '../../notifications/notifications.service'
import { UserActiveMiddleware } from '../../../config/middlewares/user-active.middleware'
import { PostRepostsController } from './post-reposts.controller'
import { PostRepostsRouter } from './post-reposts.route'

export class PostRepostsModule extends DIModule {
  override imports = [NotificationsModule]
  override providers = [
    Database,
    bind(PostRepostsService, Database, NotificationsService),
    UserActiveMiddleware,
  ]
  override controllers = [bind(PostRepostsController, PostRepostsService)]
  override routers = [
    bind(PostRepostsRouter, Lykos, PostRepostsController, AuthMiddleware, UserActiveMiddleware),
  ]
  override auth = defineAuth({
    verifier: PostRepostsController,
    mode: 'cookie',
    cookieName: 'accessToken',
  })
}
