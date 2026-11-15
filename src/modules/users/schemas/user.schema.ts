import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  pgEnum,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

import { UserRole } from './enums/user-role'

export const userRoleEnum = pgEnum('user_role', Object.values(UserRole) as [string, ...string[]])

export const UserSchema = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    firstName: varchar('firstName', { length: 50 }).notNull(),

    lastName: varchar('lastName', { length: 50 }).notNull(),

    username: varchar('username', { length: 255 }).notNull(),

    email: varchar('email', { length: 255 }).notNull(),

    password: text('password').notNull(),

    role: userRoleEnum().default(UserRole.USER).notNull(),

    isActive: boolean('isActive').default(true).notNull(),

    lastLoginAt: timestamp('lastLoginAt', {
      mode: 'date',
    }),

    refreshToken: text('refreshToken'),

    createdAt: timestamp('createdAt', {
      mode: 'date',
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp('updatedAt', {
      mode: 'date',
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('users_username_unique').on(table.username),
    uniqueIndex('users_email_unique').on(table.email),
  ],
)

export type User = typeof UserSchema.$inferSelect
export type NewUser = typeof UserSchema.$inferInsert
