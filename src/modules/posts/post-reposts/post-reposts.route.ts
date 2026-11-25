import type { AuthMiddleware, Lykos } from 'lykosjs'
import type { PostRepostsController } from './post-reposts.controller'
import type { UserActiveMiddleware } from '../../../config/middlewares/user-active.middleware'

export class PostRepostsRouter {
  constructor(
    private readonly app: Lykos,
    private readonly controller: PostRepostsController,
    private readonly authMiddleware: AuthMiddleware,
    private readonly userActiveMiddleware: UserActiveMiddleware,
  ) {}

  register(): void {
    // Public routes
    this.app.group('/api/reposts', (guest) => {
      guest.GET('/:userId', this.controller.findByUserId)

      // Protected routes
      guest.group(
        '/',
        (auth) => {
          auth.POST('/:postId', this.controller.repost)
          auth.GET('/me', this.controller.findMe)
        },
        this.authMiddleware.middleware,
        this.userActiveMiddleware.middleware,
      )
    })
  }
}
