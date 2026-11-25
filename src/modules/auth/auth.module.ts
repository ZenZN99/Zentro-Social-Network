import { AuthMiddleware, bind, defineAuth, DIModule, Lykos, value } from 'lykosjs'
import { Database } from '../../config/db/drizzle'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { AuthRouter } from './auth.route'

export class AuthModule extends DIModule {
  override providers = [Database, bind(AuthService, Database)]
  override controllers = [bind(AuthController, AuthService)]
  override routers = [bind(AuthRouter, Lykos, AuthController, AuthMiddleware)]
  override auth = defineAuth({
    verifier: AuthController,
    mode: 'cookie',
    cookieName: 'accessToken',
  })
}
