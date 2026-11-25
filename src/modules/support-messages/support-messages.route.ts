import type { AuthMiddleware, Lykos } from 'lykosjs'
import { SupportMessagesController } from './support-messages.controller'
import type { RolesMiddleware } from '../../config/middlewares/roles.middleware'
import type { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'
import { ProtectedMiddleware } from '../../config/middlewares/protected.middleware'

export class SupportMessagesRouter {
  constructor(
    private readonly app: Lykos,
    private readonly controller: SupportMessagesController,
    private readonly authMiddleware: AuthMiddleware,
    private readonly userMiddleware: UserActiveMiddleware,
    private readonly rolesMiddleware: RolesMiddleware,
  ) {}

  register(): void {
    const protectedMiddleware = new ProtectedMiddleware(
      this.authMiddleware,
      this.userMiddleware,
      this.rolesMiddleware,
    )

    // Protected routes
    this.app.group('/api/support-messages', (auth) => {
      auth.POST('/:conversationId', this.controller.create, protectedMiddleware.auth())
      auth.GET('/:conversationId', this.controller.findAll, protectedMiddleware.auth())
      auth.PUT('/:conversationId', this.controller.markAllAsRead, protectedMiddleware.auth())
      auth.DELETE(
        '/:conversationId/:messageId',
        this.controller.delete,
        protectedMiddleware.adminAndSupport(),
      )
    })
  }
}
