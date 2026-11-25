import { AuthMiddleware, bind, defineAuth, DIModule, Lykos } from 'lykosjs'
import { NotificationsModule } from '../notifications/notifications.module'
import { Database } from '../../config/db/drizzle'
import { UsersService } from './users.service'
import { NotificationsService } from '../notifications/notifications.service'
import { UsersController } from './users.controller'
import { UsersRouter } from './users.route'
import { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'
import { RolesMiddleware } from '../../config/middlewares/roles.middleware'

export class UsersModule extends DIModule {
  override imports = [NotificationsModule]
  override providers = [
    Database,
    bind(UsersService, Database, NotificationsService),
    UserActiveMiddleware,
    RolesMiddleware,
  ]
  override controllers = [bind(UsersController, UsersService)]
  override routers = [
    bind(
      UsersRouter,
      Lykos,
      UsersController,
      AuthMiddleware,
      UserActiveMiddleware,
      RolesMiddleware,
    ),
  ]
  override auth = defineAuth({
    verifier: UsersController,
    mode: 'cookie',
    cookieName: 'accessToken',
  })
}
