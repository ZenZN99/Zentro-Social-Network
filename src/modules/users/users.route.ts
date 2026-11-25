import type { AuthMiddleware, Lykos } from 'lykosjs'
import { UsersController } from './users.controller'
import type { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'
import type { RolesMiddleware } from '../../config/middlewares/roles.middleware'
import { ProtectedMiddleware } from '../../config/middlewares/protected.middleware'

export class UsersRouter {
  constructor(
    private readonly app: Lykos,
    private readonly controller: UsersController,
    private readonly authMiddleware: AuthMiddleware,
    private readonly userActiveMiddleware: UserActiveMiddleware,
    private readonly rolesMiddleware: RolesMiddleware,
  ) {}

  register(): void {
    const protectedMiddleware = new ProtectedMiddleware(
      this.authMiddleware,
      this.userActiveMiddleware,
      this.rolesMiddleware,
    )

    // Public routes

    this.app.group('/api/users', (guest) => {
      guest.GET('/', this.controller.findAll)
      guest.GET('/:username', this.controller.findOneByUsername)

      // Protected routes
      guest.group(
        '/',
        (auth) => {
          auth.PATCH('/:userId', this.controller.updateRole)
          auth.DELETE('/:userId', this.controller.block)
        },
        protectedMiddleware.admin(),
      )
    })
  }
}
