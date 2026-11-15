import type { User } from '../modules/users/schemas/user.schema'

export function sanitizeUser(user: User) {
  const { password, refreshToken, ...safe } = user

  return safe
}
