import type { AuthMiddleware, Lykos } from 'lykosjs'
import { LikesController } from './likes.controller'
import type { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'

export class LikesRouter {
  constructor(
    private readonly app: Lykos,
    private readonly controller: LikesController,
    private readonly authMiddleware: AuthMiddleware,
    private readonly userActiveMiddleware: UserActiveMiddleware,
  ) {}

  register(): void {
    // Public routes
    this.app.group('/api/likes', (guest) => {
      guest.GET('/count/:targetType/:targetId', this.controller.count)

      // Protected routes
      guest.group(
        '/',
        (group) => {
          group.POST('/:targetType/:targetId', this.controller.toggle)
          group.GET('/:targetType/:targetId', this.controller.findAll)
          group.GET('/me/:targetType/:targetId', this.controller.findMe)
          group.GET('/is-liked/:targetType/:targetId', this.controller.isLiked)
        },
        this.authMiddleware.middleware,
        this.userActiveMiddleware.middleware,
      )
    })
  }
}
