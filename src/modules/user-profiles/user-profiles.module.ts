import type { RiserBob } from 'riser-bob'
import { AuthMiddleware } from 'riser-bob'
import { UserProfilesController } from './user-profiles.controller'
import { UserProfilesRouter } from './user-profiles.route'
import { UserProfileSchema } from './schemas/user-profile.schema'
import { verifyUser } from '../../config/token/verify-user'
import { UserActiveMiddleware } from '../../config/middlewares/user-active.middleware'
import { database } from '../../config/db/drizzle'

export class UserProfilesModule {
  register(bob: RiserBob): void {
    const userProfilesController = new UserProfilesController(database, UserProfileSchema)

    const authMiddleware = new AuthMiddleware(verifyUser, {
      mode: 'cookie',
      cookieName: 'accessToken',
    })

    const userActiveMiddleware = new UserActiveMiddleware()

    const router = new UserProfilesRouter(
      bob,
      userProfilesController,
      authMiddleware,
      userActiveMiddleware,
    )

    router.register()
  }
}
