import type { RiserBob } from 'riser-bob'
import { AuthMiddleware } from 'riser-bob'
import { AuthController } from './auth.controller'
import { AuthRouter } from './auth.route'
import { AuthService } from './auth.service'
import { verifyUser } from '../../config/token/verify-user'
import { database } from '../../config/db/drizzle'

export class AuthModule {
  register(bob: RiserBob): void {
    const authService = new AuthService(database)
    const authController = new AuthController(authService)

    const authMiddleware = new AuthMiddleware(verifyUser, {
      mode: 'cookie',
      cookieName: 'accessToken',
    })

    const router = new AuthRouter(bob, authController, authMiddleware)

    router.register()
  }
}
