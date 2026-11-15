import type { RiserBob } from 'riser-bob'
import { AuthMiddleware } from 'riser-bob'
import { RepliesController } from './replies.controller'
import type { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'

export class RepliesRouter {
  constructor(
    private readonly bob: RiserBob,
    private readonly controller: RepliesController,
    private readonly authMiddleware: AuthMiddleware,
    private readonly userActiveMiddleware: UserActiveMiddleware,
  ) {}

  register(): void {
    // Public routes

    this.bob.spongGroup('/api/replies', (group) => {
      group.spongGet('/', this.controller.findAll)
      group.spongGet('/:replyId', this.controller.findOne)

      // Protected routes
      group.spongGroup(
        '/',
        (group) => {
          group.spongGet('/me', this.controller.findMe)
          group.spongPost('/', this.controller.create)
          group.spongPut('/:replyId', this.controller.update)
          group.spongDelete('/:replyId', this.controller.delete)
        },
        this.authMiddleware.middleware,
        this.userActiveMiddleware.middleware,
      )
    })
  }
}
