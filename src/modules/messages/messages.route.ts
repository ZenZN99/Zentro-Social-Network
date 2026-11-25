import type { AuthMiddleware, Lykos } from 'lykosjs'
import { MessagesController } from './messages.controller'
import type { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'

export class MessagesRouter {
  constructor(
    private readonly app: Lykos,
    private readonly controller: MessagesController,
    private readonly authMiddleware: AuthMiddleware,
    private readonly userActiveMiddleware: UserActiveMiddleware,
  ) {}

  register(): void {
    // Protected routes

    this.app.group(
      '/api/messages',
      (auth) => {
        auth.POST('/:receiverId', this.controller.create)
        auth.GET('/:conversationId', this.controller.findAll)
        auth.PUT('/:conversationId', this.controller.markAllAsRead)
        auth.GET('/:conversationId/unread-count', this.controller.findUnreadCount)
        auth.DELETE('/:messageId', this.controller.delete)
      },
      this.authMiddleware.middleware,
      this.userActiveMiddleware.middleware,
    )
  }
}
