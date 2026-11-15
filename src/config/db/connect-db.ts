import { pool } from './drizzle'

export async function connectDB(): Promise<void> {
  try {
    await pool.query('SELECT 1')

    console.log('Database connected successfully.')
  } catch (error) {
    console.error('Failed to connect to database:', error)
    throw error
  }
}
