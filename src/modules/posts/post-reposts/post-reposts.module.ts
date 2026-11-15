import { AuthMiddleware, type RiserBob } from 'riser-bob'
import { database } from '../../../config/db/drizzle'
import { PostRepostsService } from './post-reposts.service'
import { PostRepostsController } from './post-reposts.controller'
import { verifyUser } from '../../../config/token/verify-user'
import { UserActiveMiddleware } from '../../../config/middlewares/user-active.middleware'
import { PostRepostsRouter } from './post-reposts.route'
import type { Server } from 'socket.io'
import { NotificationsGateway } from '../../../config/gateways/notifications.gateway'
import { NotificationsService } from '../../notifications/notifications.service'

export class PostRepostsModule {
  register(bob: RiserBob, io: Server): void {
    const notificationsGateway = new NotificationsGateway(io)

    const notificationsService = new NotificationsService(database, notificationsGateway)

    const postRepostsService = new PostRepostsService(database, notificationsService)

    const postRepostsController = new PostRepostsController(postRepostsService)

    const authMiddleware = new AuthMiddleware(verifyUser, {
      mode: 'cookie',
      cookieName: 'accessToken',
    })

    const userActiveMiddleware = new UserActiveMiddleware()

    const router = new PostRepostsRouter(
      bob,
      postRepostsController,
      authMiddleware,
      userActiveMiddleware,
    )

    router.register()
  }
}
