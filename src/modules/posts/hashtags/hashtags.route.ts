import type { Lykos } from 'lykosjs'
import type { HashtagsController } from './hashtags.controller'

export class HashtagsRouter {
  constructor(
    private readonly app: Lykos,
    private readonly controller: HashtagsController,
  ) {}

  register(): void {
    this.app.GET('/api/hashtags', this.controller.findTrending)
  }
}
