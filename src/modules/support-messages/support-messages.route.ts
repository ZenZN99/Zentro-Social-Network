import type { RiserBob } from 'riser-bob'
import { AuthMiddleware } from 'riser-bob'
import { SupportMessagesController } from './support-messages.controller'
import type { RolesMiddleware } from '../../config/middlewares/roles.middleware'
import type { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'
import { ProtectedMiddleware } from '../../config/middlewares/protected.middleware'

export class SupportMessagesRouter {
  constructor(
    private readonly bob: RiserBob,
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
    this.bob.spongGroup('/api/support-messages', (group) => {
      group.spongPost('/:conversationId', this.controller.create, protectedMiddleware.auth())
      group.spongGet('/:conversationId', this.controller.findAll, protectedMiddleware.auth())
      group.spongPut('/:conversationId', this.controller.markAllAsRead, protectedMiddleware.auth())
      group.spongDelete(
        '/:coversationId/:messageId',
        this.controller.delete,
        protectedMiddleware.adminAndSupport(),
      )
    })
  }
}
