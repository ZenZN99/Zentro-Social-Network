import type { AuthMiddleware, Lykos } from 'lykosjs'
import { BookmarksController } from './bookmarks.controller'
import type { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'

export class BookmarksRouter {
  constructor(
    private readonly app: Lykos,
    private readonly controller: BookmarksController,
    private readonly authMiddleware: AuthMiddleware,
    private readonly userActiveMiddleware: UserActiveMiddleware,
  ) {}

  register(): void {
    // Public routes

    this.app.group('/api/bookmarks', (guest) => {
      guest.GET('/count/:postId', this.controller.countByPostId)
      guest.group(
        '/',
        (auth) => {
          // Protected routes
          auth.POST('/:postId', this.controller.toggle)
          auth.GET('/me', this.controller.findMe)
          auth.GET('/is-bookmarked/:postId', this.controller.isBookmarked)
          auth.GET('/count/me', this.controller.countMe)
        },
        this.authMiddleware.middleware,
        this.userActiveMiddleware.middleware,
      )
    })
  }
}
