import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/**/*.schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME!,
    user: process.env.DB_USERNAME!,
    password: process.env.DB_PASSWORD!,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  },
})
