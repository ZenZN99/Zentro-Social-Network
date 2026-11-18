import type { RiserBob } from 'riser-bob'
import { AuthMiddleware } from 'riser-bob'
import { CommentsController } from './comments.controller'
import type { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'

export class CommentsRouter {
  constructor(
    private readonly bob: RiserBob,
    private readonly controller: CommentsController,
    private readonly authMiddleware: AuthMiddleware,
    private readonly userActiveMiddleware: UserActiveMiddleware,
  ) {}

  register(): void {
    // Public routes
    this.bob.spongGroup('/api/comments', (group) => {
      group.spongGet('/:postId/all', this.controller.findAll)
      group.spongGet('/:commentId', this.controller.findOne)

      // Protected routes
      group.spongGroup(
        '/',
        (group) => {
          group.spongGet('/me', this.controller.findMe)
          group.spongPost('/:postId', this.controller.create)
          group.spongPut('/:commentId', this.controller.update)
          group.spongDelete('/:commentId', this.controller.delete)
        },
        this.authMiddleware.middleware,
        this.userActiveMiddleware.middleware,
      )
    })
  }
}
