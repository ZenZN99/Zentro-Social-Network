import type { RiserBob } from 'riser-bob'
import { AuthMiddleware } from 'riser-bob'
import { AuthController } from './auth.controller'

export class AuthRouter {
  constructor(
    private readonly bob: RiserBob,
    private readonly controller: AuthController,
    private readonly authMiddleware: AuthMiddleware,
  ) {}

  register(): void {
    // Public routes
    this.bob.spongGroup('/api/auth', (group) => {
      group.spongGet('/register', this.controller.register)
      group.spongGet('/login', this.controller.login)
      group.spongPost('/refreshToken', this.controller.refreshToken)

      // Protected routes
      group.spongGroup(
        '/',
        (group) => {
          group.spongPost('/logout', this.controller.logout)
          group.spongGet('/me', this.controller.me)
        },
        this.authMiddleware.middleware,
      )
    })
  }
}
