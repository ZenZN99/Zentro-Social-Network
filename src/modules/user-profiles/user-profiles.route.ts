import { UserProfilesController } from './user-profiles.controller'
import type { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'
import type { AuthMiddleware, Lykos } from 'lykosjs'

export class UserProfilesRouter {
  constructor(
    private readonly app: Lykos,
    private readonly controller: UserProfilesController,
    private readonly authMiddleware: AuthMiddleware,
    private readonly userActiveMiddleware: UserActiveMiddleware,
  ) {}

  register(): void {
    // Protected routes

    this.app.PUT(
      '/api/user-profiles',
      this.controller.update,
      this.authMiddleware.middleware,
      this.userActiveMiddleware.middleware,
    )
  }
}
