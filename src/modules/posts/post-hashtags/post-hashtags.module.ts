import { database } from '../../../config/db/drizzle'
import { PostHashtagsService } from './post-hashtags.service'

export class PostHashtagsModule {
  readonly postHashtagsService: PostHashtagsService

  constructor() {
    this.postHashtagsService = new PostHashtagsService(database)
  }
}
