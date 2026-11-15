import type { RiserBob } from 'riser-bob'
import { AuthMiddleware } from 'riser-bob'
import { NotificationsController } from './notifications.controller'
import { ProtectedMiddleware } from '../../config/middlewares/protected.middleware'
import type { RolesMiddleware } from '../../config/middlewares/roles.middleware'
import type { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'

export class NotificationsRouter {
  constructor(
    private readonly bob: RiserBob,
    private readonly controller: NotificationsController,
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
    this.bob.spongGroup(
      '/api/notifications',
      (group) => {
        group.spongGet('/me', this.controller.findMe)
        group.spongPatch('/:notificationId/read', this.controller.markAsRead)
        group.spongPut('/read-all', this.controller.markAllAsRead)
        group.spongDelete('/:notificationId', this.controller.delete)
      },
      protectedMiddleware.auth(),
    )
  }
}
