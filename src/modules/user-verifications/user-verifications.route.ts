import type { AuthMiddleware, Lykos } from 'lykosjs'
import { UserVerificationsController } from './user-verifications.controller'
import type { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'
import type { RolesMiddleware } from '../../config/middlewares/roles.middleware'
import { ProtectedMiddleware } from '../../config/middlewares/protected.middleware'

export class UserVerificationsRouter {
  constructor(
    private readonly app: Lykos,
    private readonly controller: UserVerificationsController,
    private readonly authMiddleware: AuthMiddleware,
    private readonly userActiveMiddleware: UserActiveMiddleware,
    private readonly rolesMiddleware: RolesMiddleware,
  ) {}

  register(): void {
    const protectedMiddleware = new ProtectedMiddleware(
      this.authMiddleware,
      this.userActiveMiddleware,
      this.rolesMiddleware,
    )

    // Protected routes

    this.app.group('/api/user-verifications', (auth) => {
      auth.POST('/', this.controller.create, protectedMiddleware.auth())
      auth.GET('/pending', this.controller.findPending, protectedMiddleware.admin())
      auth.PATCH('/:verificationId/status', this.controller.update, protectedMiddleware.admin())
    })
  }
}
