import { bind, DIModule, Lykos } from 'lykosjs'
import { Database } from '../../../config/db/drizzle'
import { HashtagsService } from './hashtags.service'
import { HashtagsController } from './hashtags.controller'
import { HashtagsRouter } from './hashtags.route'

export class HashtagsModule extends DIModule {
  override providers = [Database, bind(HashtagsService, Database)]
  override controllers = [bind(HashtagsController, HashtagsService)]
  override routers = [bind(HashtagsRouter, Lykos, HashtagsController)]
}
