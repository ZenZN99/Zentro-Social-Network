import { database } from '../../../config/db/drizzle'
import { PostQuotesService } from './post-quotes.service'

export class PostQuotesModule {
  readonly postQuotesService: PostQuotesService

  constructor() {
    this.postQuotesService = new PostQuotesService(database)
  }
}
