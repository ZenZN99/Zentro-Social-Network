import { AuthMiddleware, bind, defineAuth, DIModule, Lykos } from 'lykosjs'
import { Database } from '../../config/db/drizzle'
import { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'
import { UserProfilesController } from './user-profiles.controller'
import { UserProfilesRouter } from './user-profiles.route'

export class UserProfilesModule extends DIModule {
  override providers = [Database, UserActiveMiddleware]
  override controllers = [bind(UserProfilesController, Database)]
  override routers = [
    bind(UserProfilesRouter, Lykos, UserProfilesController, AuthMiddleware, UserActiveMiddleware),
  ]
  override auth = defineAuth({
    verifier: UserProfilesController,
    mode: 'cookie',
    cookieName: 'accessToken',
  })
}
