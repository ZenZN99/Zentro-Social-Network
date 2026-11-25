import { AuthMiddleware, bind, defineAuth, DIModule, Lykos } from 'lykosjs'
import { Database } from '../../config/db/drizzle'
import { ConversationsController } from './conversations.controller'
import { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'
import { RolesMiddleware } from '../../config/middlewares/roles.middleware'
import { ConversationsRouter } from './conversations.route'

export class ConversationsModule extends DIModule {
  override providers = [Database, UserActiveMiddleware, RolesMiddleware]
  override controllers = [bind(ConversationsController, Database)]
  override routers = [
    bind(
      ConversationsRouter,
      Lykos,
      ConversationsController,
      AuthMiddleware,
      UserActiveMiddleware,
      RolesMiddleware,
    ),
  ]
  override auth = defineAuth({
    verifier: ConversationsController,
    mode: 'cookie',
    cookieName: 'accessToken',
  })
}
