import { AuthMiddleware, bind, defineAuth, DIModule, Lykos, value } from 'lykosjs'
import { Database } from '../../config/db/drizzle'
import { BookmarksController } from './bookmarks.controller'
import { BookmarksService } from './bookmarks.service'
import { BookmarksRouter } from './bookmarks.route'
import { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'

export class BookmarksModule extends DIModule {
  override providers = [Database, bind(BookmarksService, Database), UserActiveMiddleware]
  override controllers = [bind(BookmarksController, BookmarksService)]
  override routers = [
    bind(BookmarksRouter, Lykos, BookmarksController, AuthMiddleware, UserActiveMiddleware),
  ]
  override auth = defineAuth({
    verifier: BookmarksController,
    mode: 'cookie',
    cookieName: 'accessToken',
  })
}
