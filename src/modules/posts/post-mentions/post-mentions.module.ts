import { bind, DIModule } from 'lykosjs'
import { Database } from '../../../config/db/drizzle'
import { PostMentionsService } from './post-mentions.service'

export class PostMentionsModule extends DIModule {
  override providers = [Database, bind(PostMentionsService, Database)]
}
