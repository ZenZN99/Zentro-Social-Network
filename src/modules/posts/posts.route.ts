import type { Lykos, AuthMiddleware } from 'lykosjs'
import { PostsController } from './posts.controller'
import type { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'

export class PostsRouter {
  constructor(
    private readonly app: Lykos,
    private readonly controller: PostsController,
    private readonly authMiddleware: AuthMiddleware,
    private readonly userActiveMiddleware: UserActiveMiddleware,
  ) {}

  register(): void {
    // Public routes
    this.app.group('/api/posts', (guest) => {
      guest.GET('/', this.controller.findAll)
      guest.GET('/:postId', this.controller.findOne)
      guest.GET('/user/:userId', this.controller.findByUserId)

      // Protected routes
      guest.group(
        '/',
        (auth) => {
          auth.GET('/me', this.controller.findMe)
          auth.POST('/', this.controller.create)
          auth.PUT('/:postId', this.controller.update)
          auth.DELETE('/:postId', this.controller.delete)
        },
        this.authMiddleware.middleware,
        this.userActiveMiddleware.middleware,
      )
    })
  }
}
