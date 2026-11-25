import type { AuthMiddleware, Lykos } from 'lykosjs'
import { ConversationsController } from './conversations.controller'
import type { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'
import type { RolesMiddleware } from '../../config/middlewares/roles.middleware'
import { ProtectedMiddleware } from '../../config/middlewares/protected.middleware'

export class ConversationsRouter {
  constructor(
    private readonly app: Lykos,
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
    this.app.group(
      '/api/conversations',
      (auth) => {
        auth.GET('/me', this.controller.findMe)
        auth.GET('/:conversationId', this.controller.findOne)
        auth.PATCH('/:conversationId', this.controller.mute)
      },
      protectedMiddleware.auth(),
    )
  }
}
