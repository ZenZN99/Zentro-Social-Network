import type { AuthMiddleware, RiserBob } from 'riser-bob'
import type { PostRepostsController } from './post-reposts.controller'
import type { UserActiveMiddleware } from '../../../config/middlewares/user-active.middleware'

export class PostRepostsRouter {
  constructor(
    private readonly bob: RiserBob,
    private readonly controller: PostRepostsController,
    private readonly authMiddleware: AuthMiddleware,
    private readonly userActiveMiddleware: UserActiveMiddleware,
  ) {}

  register(): void {
    // Public routes
    this.bob.spongGroup('/api/reposts', (group) => {
      group.spongGet('/:userId', this.controller.findByUserId)

      // Protected routes
      group.spongGroup(
        '/',
        (group) => {
          group.spongPost('/:postId', this.controller.repost)
          group.spongGet('/me', this.controller.findMe)
        },
        this.authMiddleware.middleware,
        this.userActiveMiddleware.middleware,
      )
    })
  }
}
