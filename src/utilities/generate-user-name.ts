import { eq } from 'drizzle-orm'
import type { database } from '../config/db/drizzle'
import { UserSchema } from '../modules/users/schemas/user.schema'

export const generateUsername = async (
  db: typeof database,
  firstName: string,
  lastName: string,
): Promise<string> => {
  const baseUsername = `@${firstName}${lastName}`.replace(/\s+/g, '').toLowerCase()

  let username = baseUsername
  let counter = 1

  while (
    (
      await db
        .select({ id: UserSchema.id })
        .from(UserSchema)
        .where(eq(UserSchema.username, username))
        .limit(1)
    )[0]
  ) {
    username = `${baseUsername}${counter++}`
  }

  return username
}
