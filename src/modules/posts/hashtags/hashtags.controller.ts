import type { SpongHandler } from 'riser-bob'
import type { HashtagsService } from './hashtags.service'
import { getPagination } from '../../../utilities/pagination'

export class HashtagsController {
  constructor(private readonly hashtagsService: HashtagsService) {}

  readonly findTrending: SpongHandler = async (spongReq, spongRes) => {
    const { page, limit, offset } = getPagination(spongReq)

    const hashtags = await this.hashtagsService.findTrending(page, limit, offset)

    return spongRes.SpongOK({
      success: true,
      data: hashtags,
    })
  }
}
