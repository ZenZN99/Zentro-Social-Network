import type { RiserBob } from 'riser-bob'
import { AuthMiddleware } from 'riser-bob'
import { FollowsController } from './follows.controller'
import type { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'

export class FollowsRouter {
  constructor(
    private readonly bob: RiserBob,
    private readonly controller: FollowsController,
    private readonly authMiddleware: AuthMiddleware,
    private readonly userActiveMiddleware: UserActiveMiddleware,
  ) {}

  register(): void {
    // Public routes
    this.bob.spongGroup('/api/follows', (group) => {
      group.spongGet('/followers/:userId', this.controller.findFollowers)
      group.spongGet('/following/:userId', this.controller.findFollowing)
      group.spongGet('/count-followers', this.controller.countFollowers)
      group.spongGet('/count-following', this.controller.countFollowing)

      // Protected routes
      group.spongGroup(
        '/',
        (group) => {
          group.spongPost('/:followingId', this.controller.toggle)
          group.spongGet('/is-following/:followingId', this.controller.isFollowing)
        },
        this.authMiddleware.middleware,
        this.userActiveMiddleware.middleware,
      )
    })
  }
}
