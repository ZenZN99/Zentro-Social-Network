import type { AuthMiddleware, Lykos } from 'lykosjs'
import { CommentsController } from './comments.controller'
import type { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'

export class CommentsRouter {
  constructor(
    private readonly app: Lykos,
    private readonly controller: CommentsController,
    private readonly authMiddleware: AuthMiddleware,
    private readonly userActiveMiddleware: UserActiveMiddleware,
  ) {}

  register(): void {
    // Public routes
    this.app.group('/api/comments', (guest) => {
      guest.GET('/:postId/all', this.controller.findAll)
      guest.POST('/:commentId', this.controller.findOne)

      // Protected routes
      guest.group(
        '/',
        (auth) => {
          auth.GET('/me', this.controller.findMe)
          auth.POST('/:postId', this.controller.create)
          auth.PUT('/:commentId', this.controller.update)
          auth.DELETE('/:commentId', this.controller.delete)
        },
        this.authMiddleware.middleware,
        this.userActiveMiddleware.middleware,
      )
    })
  }
}
