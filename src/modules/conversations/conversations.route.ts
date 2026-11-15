import type { RiserBob } from 'riser-bob'
import { AuthMiddleware } from 'riser-bob'
import { ConversationsController } from './conversations.controller'
import type { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'
import type { RolesMiddleware } from '../../config/middlewares/roles.middleware'
import { ProtectedMiddleware } from '../../config/middlewares/protected.middleware'

export class ConversationsRouter {
  constructor(
    private readonly bob: RiserBob,
    private readonly controller: ConversationsController,
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
    this.bob.spongGroup(
      '/api/conversations',
      (group) => {
        group.spongGet('/me', this.controller.findMe)
        group.spongGet('/:conversationId', this.controller.findOne)
        group.spongPatch('/:conversationId', this.controller.mute)
      },
      protectedMiddleware.auth(),
    )
  }
}
