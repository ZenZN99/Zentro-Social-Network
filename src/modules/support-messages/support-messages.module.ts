import { AuthMiddleware, bind, defineAuth, DIModule, Lykos } from 'lykosjs'
import { Database } from '../../config/db/drizzle'
import { SupportMessagesService } from './support-messages.service'
import { SupportMessagesController } from './support-messages.controller'
import { SupportMessagesRouter } from './support-messages.route'
import { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'
import { RolesMiddleware } from '../../config/middlewares/roles.middleware'

export class SupportMessagesModule extends DIModule {
  override providers = [
    Database,
    bind(SupportMessagesService, Database),
    UserActiveMiddleware,
    RolesMiddleware,
  ]
  override controllers = [bind(SupportMessagesController, SupportMessagesService)]
  override routers = [
    bind(
      SupportMessagesRouter,
      Lykos,
      SupportMessagesController,
      AuthMiddleware,
      UserActiveMiddleware,
      RolesMiddleware,
    ),
  ]
  override auth = defineAuth({
    verifier: SupportMessagesController,
    mode: 'cookie',
    cookieName: 'accessToken',
  })
}
