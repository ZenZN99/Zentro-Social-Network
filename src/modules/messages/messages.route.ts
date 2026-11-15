import type { RiserBob } from 'riser-bob'
import { AuthMiddleware } from 'riser-bob'
import { MessagesController } from './messages.controller'
import type { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'

export class MessagesRouter {
  constructor(
    private readonly bob: RiserBob,
    private readonly controller: MessagesController,
    private readonly authMiddleware: AuthMiddleware,
    private readonly userActiveMiddleware: UserActiveMiddleware,
  ) {}

  register(): void {
    // Protected routes

    this.bob.spongGroup(
      '/api/messages',
      (group) => {
        group.spongPost('/:receiverId', this.controller.create)
        group.spongGet('/:conversationId', this.controller.findAll)
        group.spongPut('/:conversationId', this.controller.markAllAsRead)
        group.spongGet('/:conversationId/count', this.controller.findUnreadCount)
        group.spongDelete('/:messageId', this.controller.delete)
      },
      this.authMiddleware.middleware,
      this.userActiveMiddleware.middleware,
    )
  }
}
