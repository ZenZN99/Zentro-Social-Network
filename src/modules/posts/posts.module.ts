import type { RiserBob } from 'riser-bob'
import { AuthMiddleware } from 'riser-bob'
import { PostsController } from './posts.controller'
import { PostsRouter } from './posts.route'
import { PostsService } from './posts.service'
import { HashtagsService } from './hashtags/hashtags.service'
import { PostMentionsService } from './post-mentions/post-mentions.service'
import { PostHashtagsService } from './post-hashtags/post-hashtags.service'
import { PostQuotesService } from './post-quotes/post-quotes.service'
import { PostRepostsService } from './post-reposts/post-reposts.service'
import { verifyUser } from '../../config/token/verify-user'
import { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'
import { database } from '../../config/db/drizzle'
import { NotificationsService } from '../notifications/notifications.service'
import { NotificationsGateway } from '../../config/gateways/notifications.gateway'
import type { Server } from 'socket.io'

export class PostsModule {
  register(bob: RiserBob, io: Server): void {
    const notificationsGateway = new NotificationsGateway(io)
    const notificationsService = new NotificationsService(database, notificationsGateway)

    const hashtagsService = new HashtagsService(database)

    const postMentionsService = new PostMentionsService(database)

    const postHashtagsService = new PostHashtagsService(database)

    const postQuotesService = new PostQuotesService(database)

    const postRepostsService = new PostRepostsService(database, notificationsService)

    const postsService = new PostsService(
      database,
      postMentionsService,
      hashtagsService,
      postHashtagsService,
      postQuotesService,
      postRepostsService,
      notificationsService,
    )
    const postsController = new PostsController(postsService)

    const authMiddleware = new AuthMiddleware(verifyUser, {
      mode: 'cookie',
      cookieName: 'accessToken',
    })

    const userActiveMiddleware = new UserActiveMiddleware()

    const router = new PostsRouter(bob, postsController, authMiddleware, userActiveMiddleware)

    router.register()
  }
}
