import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME!,
  user: process.env.DB_USERNAME!,
  password: process.env.DB_PASSWORD!,
  ssl:
    process.env.DB_SSL === 'true'
      ? {
          rejectUnauthorized: false,
        }
      : undefined,
})

export class Database {
  readonly connection = drizzle(pool);
}

export const database = new Database().connection;
