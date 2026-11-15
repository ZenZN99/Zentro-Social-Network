import { eq } from 'drizzle-orm'
import { HttpError } from 'riser-bob'
import { UserSchema } from '../../modules/users/schemas/user.schema'
import jwt from './jwt'
import { database } from '../db/drizzle'

export async function verifyUser(token: string) {
  const payload = jwt.verifyAccessToken(token)

  if (!payload || typeof payload.id !== 'string') {
    throw new HttpError(401, 'Token is invalid or expired')
  }

  const [user] = await database
    .select({
      id: UserSchema.id,
      isActive: UserSchema.isActive,
      role: UserSchema.role,
    })
    .from(UserSchema)
    .where(eq(UserSchema.id, payload.id))
    .limit(1)

  if (!user) {
    throw new HttpError(401, 'You are not authenticated')
  }

  return {
    id: user.id,
    isActive: user.isActive,
    role: user.role,
  }
}
