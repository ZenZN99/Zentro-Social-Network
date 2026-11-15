import type { RiserBob } from 'riser-bob'
import type { HashtagsController } from './hashtags.controller'

export class HashtagsRouter {
  constructor(
    private readonly bob: RiserBob,
    private readonly controller: HashtagsController,
  ) {}

  register(): void {
    this.bob.spongGet('/api/hashtags', this.controller.findTrending)
  }
}
