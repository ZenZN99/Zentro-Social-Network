import type { HashtagsService } from './hashtags.service'
import { getPagination } from '../../../utilities/pagination'
import type { ContextHandler } from 'lykosjs'

export class HashtagsController {
  constructor(private readonly hashtagsService: HashtagsService) {}

  readonly findTrending: ContextHandler = async (ctx, reply) => {
    const { page, limit, offset } = getPagination(ctx)

    const hashtags = await this.hashtagsService.findTrending(page, limit, offset)

    return reply.OK({
      success: true,
      data: hashtags,
    })
  }
}
