import { AuthMiddleware, bind, defineAuth, DIModule, Lykos } from 'lykosjs'
import { NotificationsModule } from '../notifications/notifications.module'
import { Database } from '../../config/db/drizzle'
import { PostMentionsService } from './post-mentions/post-mentions.service'
import { HashtagsService } from './hashtags/hashtags.service'
import { PostHashtagsService } from './post-hashtags/post-hashtags.service'
import { PostQuotesService } from './post-quotes/post-quotes.service'
import { PostRepostsService } from './post-reposts/post-reposts.service'
import { NotificationsService } from '../notifications/notifications.service'
import { PostsService } from './posts.service'
import { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'
import { PostsController } from './posts.controller'
import { PostsRouter } from './posts.route'

export class PostsModule extends DIModule {
  override imports = [NotificationsModule]
  override providers = [
    Database,
    bind(PostMentionsService, Database),
    bind(HashtagsService, Database),
    bind(PostHashtagsService, Database),
    bind(PostQuotesService, Database),
    bind(PostRepostsService, Database, NotificationsService),
    bind(
      PostsService,
      Database,
      PostMentionsService,
      HashtagsService,
      PostHashtagsService,
      PostQuotesService,
      PostRepostsService,
      NotificationsService,
    ),
    UserActiveMiddleware,
  ]

  override controllers = [bind(PostsController, PostsService)]
  override routers = [
    bind(PostsRouter, Lykos, PostsController, AuthMiddleware, UserActiveMiddleware),
  ]

  override auth = defineAuth({
    verifier: PostsController,
    mode: 'cookie',
    cookieName: 'accessToken',
  })
}
