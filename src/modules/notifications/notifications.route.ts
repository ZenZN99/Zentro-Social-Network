import type { AuthMiddleware, Lykos } from 'lykosjs'
import { NotificationsController } from './notifications.controller'
import type { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'

export class NotificationsRouter {
  constructor(
    private readonly app: Lykos,
    private readonly controller: NotificationsController,
    private readonly authMiddleware: AuthMiddleware,
    private readonly userActiveMiddleware: UserActiveMiddleware,
  ) {}

  register(): void {
    // Protected routes
    this.app.group(
      '/api/notifications',
      (auth) => {
        auth.GET('/me', this.controller.findMe)
        auth.PATCH('/:notificationId/read', this.controller.markAsRead)
        auth.PUT('/read-all', this.controller.markAllAsRead)
        auth.DELETE('/:notificationId', this.controller.delete)
      },
      this.authMiddleware.middleware,
      this.userActiveMiddleware.middleware,
    )
  }
}
