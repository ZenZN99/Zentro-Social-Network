import type { RiserBob } from 'riser-bob'
import { AuthMiddleware } from 'riser-bob'
import { PostsController } from './posts.controller'
import type { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'

export class PostsRouter {
  constructor(
    private readonly bob: RiserBob,
    private readonly controller: PostsController,
    private readonly authMiddleware: AuthMiddleware,
    private readonly userActiveMiddleware: UserActiveMiddleware,
  ) {}

  register(): void {
    // Public routes
    this.bob.spongGroup('/api/posts', (group) => {
      group.spongGet('/', this.controller.findAll)
      group.spongGet('/:postId', this.controller.findOne)
      group.spongGet('/user/:userId', this.controller.findByUserId)

      // Protected routes
      group.spongGroup(
        '/',
        (group) => {
          group.spongGet('/me', this.controller.findMe)
          group.spongPost('/', this.controller.create)
          group.spongPut('/:postId', this.controller.update)
          group.spongDelete('/:postId', this.controller.delete)
        },
        this.authMiddleware.middleware,
        this.userActiveMiddleware.middleware,
      )
    })
  }
}
