import { bind, DIModule } from 'lykosjs'
import { Database } from '../../../config/db/drizzle'
import { PostQuotesService } from './post-quotes.service'

export class PostQuotesModule extends DIModule {
  override providers = [Database, bind(PostQuotesService, Database)]
}
