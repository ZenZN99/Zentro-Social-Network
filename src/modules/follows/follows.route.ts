import type { AuthMiddleware, Lykos } from 'lykosjs'
import { FollowsController } from './follows.controller'
import type { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'

export class FollowsRouter {
  constructor(
    private readonly app: Lykos,
    private readonly controller: FollowsController,
    private readonly authMiddleware: AuthMiddleware,
    private readonly userActiveMiddleware: UserActiveMiddleware,
  ) {}

  register(): void {
    // Public routes
    this.app.group('/api/follows', (guest) => {
      guest.GET('/followers/:userId', this.controller.findFollowers)
      guest.GET('/following/:userId', this.controller.findFollowing)
      guest.GET('/count-followers/:userId', this.controller.countFollowers)
      guest.GET('/count-following/:userId', this.controller.countFollowing)

      // Protected routes
      guest.group(
        '/',
        (group) => {
          group.POST('/:followingId', this.controller.toggle)
          group.GET('/is-following/:followingId', this.controller.isFollowing)
        },
        this.authMiddleware.middleware,
        this.userActiveMiddleware.middleware,
      )
    })
  }
}
