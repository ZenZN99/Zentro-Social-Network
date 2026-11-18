import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { database } from './drizzle'

export async function migrateDB() {
  await migrate(database, {
    migrationsFolder: './drizzle',
  })

  console.log('Database migrations completed.')
}
