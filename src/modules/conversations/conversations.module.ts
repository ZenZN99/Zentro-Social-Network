import type { RiserBob } from 'riser-bob'
import { AuthMiddleware } from 'riser-bob'
import { ConversationsController } from './conversations.controller'
import { ConversationsRouter } from './conversations.route'
import { RolesMiddleware } from '../../config/middlewares/roles.middleware'
import { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'
import { database } from '../../config/db/drizzle'
import { verifyUser } from '../../config/token/verify-user'

export class ConversationsModule {
  register(bob: RiserBob): void {
    const conversationsController = new ConversationsController(database)

    const authMiddleware = new AuthMiddleware(verifyUser, {
      mode: 'cookie',
      cookieName: 'accessToken',
    })

    const userMiddleware = new UserActiveMiddleware()

    const rolesMiddleware = new RolesMiddleware()

    const router = new ConversationsRouter(
      bob,
      conversationsController,
      authMiddleware,
      userMiddleware,
      rolesMiddleware,
    )

    router.register()
  }
}
