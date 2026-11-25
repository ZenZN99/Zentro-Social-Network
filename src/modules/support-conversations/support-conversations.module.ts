import { AuthMiddleware, bind, defineAuth, DIModule, Lykos } from 'lykosjs'
import { Database } from '../../config/db/drizzle'
import { SupportConversationsService } from './support-conversations.service'
import { SupportConversationsController } from './support-conversations.controller'
import { SupportConversationsRouter } from './support-conversations.route'
import { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'
import { RolesMiddleware } from '../../config/middlewares/roles.middleware'

export class SupportConversationsModule extends DIModule {
  override providers = [
    Database,
    bind(SupportConversationsService, Database),
    UserActiveMiddleware,
    RolesMiddleware,
  ]
  override controllers = [bind(SupportConversationsController, SupportConversationsService)]
  override routers = [
    bind(
      SupportConversationsRouter,
      Lykos,
      SupportConversationsController,
      AuthMiddleware,
      UserActiveMiddleware,
      RolesMiddleware,
    ),
  ]

  override auth = defineAuth({
    verifier: SupportConversationsController,
    mode: 'cookie',
    cookieName: 'accessToken',
  })
}
