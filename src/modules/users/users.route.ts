import type { RiserBob } from 'riser-bob'
import { AuthMiddleware } from 'riser-bob'
import { UsersController } from './users.controller'
import type { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'
import type { RolesMiddleware } from '../../config/middlewares/roles.middleware'
import { ProtectedMiddleware } from '../../config/middlewares/protected.middleware'

export class UsersRouter {
  constructor(
    private readonly bob: RiserBob,
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

    this.bob.spongGroup('/api/users', (group) => {
      group.spongGet('/', this.controller.findAll)
      group.spongGet('/:username', this.controller.findOneByUsername)

      // Protected routes
      group.spongGroup(
        '/',
        (group) => {
          group.spongPatch('/:userId', this.controller.updateRole)

          group.spongDelete('/:userId', this.controller.block)
        },
        protectedMiddleware.admin(),
      )
    })
  }
}
