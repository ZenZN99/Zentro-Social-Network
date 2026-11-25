import type { AuthMiddleware, Lykos } from 'lykosjs'
import { RepliesController } from './replies.controller'
import type { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'

export class RepliesRouter {
  constructor(
    private readonly app: Lykos,
    private readonly controller: RepliesController,
    private readonly authMiddleware: AuthMiddleware,
    private readonly userActiveMiddleware: UserActiveMiddleware,
  ) {}

  register(): void {
    // Public routes

    this.app.group('/api/replies', (guest) => {
      guest.GET('/:commentId/all', this.controller.findAll)
      guest.GET('/:replyId', this.controller.findOne)

      // Protected routes
      guest.group(
        '/',
        (auth) => {
          auth.GET('/me', this.controller.findMe)
          auth.POST('/:commentId', this.controller.create)
          auth.PUT('/:replyId', this.controller.update)
          auth.DELETE('/:replyId', this.controller.delete)
        },
        this.authMiddleware.middleware,
        this.userActiveMiddleware.middleware,
      )
    })
  }
}
