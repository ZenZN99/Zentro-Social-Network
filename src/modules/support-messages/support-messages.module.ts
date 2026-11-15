import type { RiserBob } from 'riser-bob'
import { AuthMiddleware } from 'riser-bob'
import { SupportMessagesController } from './support-messages.controller'
import { SupportMessagesRouter } from './support-messages.route'
import { verifyUser } from '../../config/token/verify-user'
import { SupportMessagesService } from './support-messages.service'
import { database } from '../../config/db/drizzle'
import { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'
import { RolesMiddleware } from '../../config/middlewares/roles.middleware'

export class SupportMessagesModule {
  register(bob: RiserBob): void {
    const supportMessagesService = new SupportMessagesService(database)

    const supportMessagesController = new SupportMessagesController(supportMessagesService)

    const authMiddleware = new AuthMiddleware(verifyUser, {
      mode: 'cookie',
      cookieName: 'accessToken',
    })

    const userActiveMiddleware = new UserActiveMiddleware()
    const rolesMiddleware = new RolesMiddleware()

    const router = new SupportMessagesRouter(
      bob,
      supportMessagesController,
      authMiddleware,
      userActiveMiddleware,
      rolesMiddleware,
    )

    router.register()
  }
}
