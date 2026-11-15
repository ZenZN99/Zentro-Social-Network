import type { RiserBob } from 'riser-bob'
import { AuthMiddleware } from 'riser-bob'
import { SupportConversationsController } from './support-conversations.controller'
import type { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'
import type { RolesMiddleware } from '../../config/middlewares/roles.middleware'
import { ProtectedMiddleware } from '../../config/middlewares/protected.middleware'

export class SupportConversationsRouter {
  constructor(
    private readonly bob: RiserBob,
    private readonly controller: SupportConversationsController,
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
    this.bob.spongGroup('/api/support-conversations', (group) => {
      group.spongPost('/', this.controller.create, protectedMiddleware.auth())
      group.spongGet('/', this.controller.findAll, protectedMiddleware.adminAndSupport())
      group.spongGet('/me', this.controller.findMe, protectedMiddleware.auth())
      group.spongGet('/:conversationId', this.controller.findOne, protectedMiddleware.auth())
      group.spongPut('/:conversationId', this.controller.toggle, protectedMiddleware.admin())
    })
  }
}
