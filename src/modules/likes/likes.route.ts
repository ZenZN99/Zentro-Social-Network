import type { RiserBob } from 'riser-bob'
import { AuthMiddleware } from 'riser-bob'
import { LikesController } from './likes.controller'
import type { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'

export class LikesRouter {
  constructor(
    private readonly bob: RiserBob,
    private readonly controller: LikesController,
    private readonly authMiddleware: AuthMiddleware,
    private readonly userActiveMiddleware: UserActiveMiddleware,
  ) {}

  register(): void {
    // Public routes
    this.bob.spongGroup('/api/likes', (group) => {
      group.spongGet('/count/:targetType/:targetId', this.controller.count)

      // Protected routes
      group.spongGroup(
        '/',
        (group) => {
          group.spongPost('/:targetType/:targetId', this.controller.toggle)
          group.spongGet('/:targetType/:targetId', this.controller.findAll)
          group.spongGet('/me/:targetType/:targetId', this.controller.findMe)
          group.spongGet('/is-liked/:targetType/:targetId', this.controller.isLiked)
        },
        this.authMiddleware.middleware,
        this.userActiveMiddleware.middleware,
      )
    })
  }
}
