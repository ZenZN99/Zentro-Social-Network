import type { RiserBob } from 'riser-bob'
import { AuthMiddleware } from 'riser-bob'
import { BookmarksController } from './bookmarks.controller'
import { BookmarksRouter } from './bookmarks.route'
import { database } from '../../config/db/drizzle'
import { BookmarksService } from './bookmarks.service'
import { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'
import { verifyUser } from '../../config/token/verify-user'

export class BookmarksModule {
  register(bob: RiserBob): void {
    const bookmarksService = new BookmarksService(database)
    const bookmarksController = new BookmarksController(bookmarksService)

    const authMiddleware = new AuthMiddleware(verifyUser, {
      mode: 'cookie',
      cookieName: 'accessToken',
    })

    const userActiveMiddleware = new UserActiveMiddleware()

    const router = new BookmarksRouter(
      bob,
      bookmarksController,
      authMiddleware,
      userActiveMiddleware,
    )

    router.register()
  }
}
