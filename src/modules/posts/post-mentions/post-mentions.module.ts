import { database } from '../../../config/db/drizzle'
import { PostMentionsService } from './post-mentions.service'

export class PostMentionsModule {
  readonly postMentionsService: PostMentionsService

  constructor() {
    this.postMentionsService = new PostMentionsService(database)
  }
}
