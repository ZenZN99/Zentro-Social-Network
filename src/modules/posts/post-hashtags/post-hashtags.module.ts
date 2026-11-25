import { bind, DIModule } from 'lykosjs'
import { Database } from '../../../config/db/drizzle'
import { PostHashtagsService } from './post-hashtags.service'

export class PostHashtagsModule extends DIModule {
  override providers = [Database, bind(PostHashtagsService, Database)]
}
