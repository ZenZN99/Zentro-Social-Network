import type { RiserBob } from 'riser-bob'
import { HashtagsService } from './hashtags.service'
import { HashtagsController } from './hashtags.controller'
import { HashtagsRouter } from './hashtags.route'
import { database } from '../../../config/db/drizzle'

export class HashtagsModule {
  register(bob: RiserBob): void {
    const hashtagsService = new HashtagsService(database)

    const hashtagsController = new HashtagsController(hashtagsService)

    const router = new HashtagsRouter(bob, hashtagsController)

    router.register()
  }
}
