import type { AuthMiddleware, Lykos } from 'lykosjs'
import { SupportConversationsController } from './support-conversations.controller'
import type { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'
import type { RolesMiddleware } from '../../config/middlewares/roles.middleware'
import { ProtectedMiddleware } from '../../config/middlewares/protected.middleware'

export class SupportConversationsRouter {
  constructor(
    private readonly app: Lykos,
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
    this.app.group('/api/support-conversations', (auth) => {
      auth.POST('/', this.controller.create, protectedMiddleware.auth())
      auth.GET('/', this.controller.findAll, protectedMiddleware.adminAndSupport())
      auth.GET('/me', this.controller.findMe, protectedMiddleware.auth())
      auth.GET('/:conversationId', this.controller.findOne, protectedMiddleware.auth())
      auth.PUT('/:conversationId', this.controller.toggle, protectedMiddleware.admin())
    })
  }
}
