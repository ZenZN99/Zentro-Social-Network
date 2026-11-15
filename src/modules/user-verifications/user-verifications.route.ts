import type { RiserBob } from 'riser-bob'
import { AuthMiddleware } from 'riser-bob'
import { UserVerificationsController } from './user-verifications.controller'
import type { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'
import type { RolesMiddleware } from '../../config/middlewares/roles.middleware'
import { ProtectedMiddleware } from '../../config/middlewares/protected.middleware'

export class UserVerificationsRouter {
  constructor(
    private readonly bob: RiserBob,
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

    this.bob.spongGroup('/api/user-verifications', (group) => {
      group.spongPost('/', this.controller.create, protectedMiddleware.auth())
      group.spongGet('/pending', this.controller.findPending, protectedMiddleware.admin())
      group.spongPatch(
        '/:verificationId/status',
        this.controller.update,
        protectedMiddleware.admin(),
      )
    })
  }
}
