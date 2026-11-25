import type { AuthMiddleware, Lykos } from 'lykosjs'
import { AuthController } from './auth.controller'

export class AuthRouter {
  constructor(
    private readonly app: Lykos,
    private readonly controller: AuthController,
    private readonly authMiddleware: AuthMiddleware,
  ) {}

  register(): void {
    // Public routes
    this.app.group('/api/auth', (guest) => {
      guest.POST('/register', this.controller.register)
      guest.POST('/login', this.controller.login)
      guest.POST('/refreshToken', this.controller.refreshToken)

      // Protected routes
      guest.group(
        '/',
        (auth) => {
          auth.POST('/logout', this.controller.logout)
          auth.GET('/me', this.controller.me)
        },
        this.authMiddleware.middleware,
      )
    })
  }
}
