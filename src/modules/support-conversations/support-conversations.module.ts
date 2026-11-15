import type { RiserBob } from 'riser-bob'
import { AuthMiddleware } from 'riser-bob'
import { SupportConversationsController } from './support-conversations.controller'
import { SupportConversationsRouter } from './support-conversations.route'
import { SupportConversationsService } from './support-conversations.service'
import { database } from '../../config/db/drizzle'
import { verifyUser } from '../../config/token/verify-user'
import { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'
import { RolesMiddleware } from '../../config/middlewares/roles.middleware'

export class SupportConversationsModule {
  register(bob: RiserBob): void {
    const supportConversationsService = new SupportConversationsService(database)

    const supportConversationsController = new SupportConversationsController(
      supportConversationsService,
    )

    const authMiddleware = new AuthMiddleware(verifyUser, {
      mode: 'cookie',
      cookieName: 'accessToken',
    })

    const userActiveMiddleware = new UserActiveMiddleware()
    const rolesMiddleware = new RolesMiddleware()

    const router = new SupportConversationsRouter(
      bob,
      supportConversationsController,
      authMiddleware,
      userActiveMiddleware,
      rolesMiddleware,
    )

    router.register()
  }
}
