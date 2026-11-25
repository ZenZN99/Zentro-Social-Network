import { AuthMiddleware, bind, defineAuth, DIModule, Lykos } from 'lykosjs'
import { NotificationsModule } from '../notifications/notifications.module'
import { Database } from '../../config/db/drizzle'
import { UserVerificationsService } from './user-verifications.service'
import { NotificationsService } from '../notifications/notifications.service'
import { UserVerificationsController } from './user-verifications.controller'
import { UserVerificationsRouter } from './user-verifications.route'
import { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'
import { RolesMiddleware } from '../../config/middlewares/roles.middleware'

export class UserVerificationsModule extends DIModule {
  override imports = [NotificationsModule]
  override providers = [
    Database,
    bind(UserVerificationsService, Database, NotificationsService),
    UserActiveMiddleware,
    RolesMiddleware,
  ]
  override controllers = [bind(UserVerificationsController, UserVerificationsService)]
  override routers = [
    bind(
      UserVerificationsRouter,
      Lykos,
      UserVerificationsController,
      AuthMiddleware,
      UserActiveMiddleware,
      RolesMiddleware,
    ),
  ]

  override auth = defineAuth({
    verifier: UserVerificationsController,
    mode: 'cookie',
    cookieName: 'accessToken',
  })
}
