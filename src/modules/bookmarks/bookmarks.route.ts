import type { RiserBob } from 'riser-bob'
import { AuthMiddleware } from 'riser-bob'
import { BookmarksController } from './bookmarks.controller'
import type { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'

export class BookmarksRouter {
  constructor(
    private readonly bob: RiserBob,
    private readonly controller: BookmarksController,
    private readonly authMiddleware: AuthMiddleware,
    private readonly userActiveMiddleware: UserActiveMiddleware,
  ) {}

  register(): void {
    // Public routes

    this.bob.spongGroup('/api/bookmarks', (group) => {
      group.spongGet('/api/bookmarks/count/:postId', this.controller.countByPostId)
      group.spongGroup(
        '/',
        (group) => {
          // Protected routes
          group.spongPost('/:postId', this.controller.toggle)
          group.spongGet('/me', this.controller.findMe)
          group.spongGet('/is-bookmarked', this.controller.isBookmarked)
          group.spongGet('/count/me', this.controller.countMe)
        },
        this.authMiddleware.middleware,
        this.userActiveMiddleware.middleware,
      )
    })
  }
}
