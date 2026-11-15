import { pgTable, uuid, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'

import { UserSchema } from '../../users/schemas/user.schema'

export const FollowSchema = pgTable(
  'follows',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    followerId: uuid('followerId')
      .notNull()
      .references(() => UserSchema.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),

    followingId: uuid('followingId')
      .notNull()
      .references(() => UserSchema.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),

    createdAt: timestamp('createdAt', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),

    updatedAt: timestamp('updatedAt', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    uniqueIndex('follows_followerId_followingId_unique').on(table.followerId, table.followingId),

    index('follows_followerId_idx').on(table.followerId),
    index('follows_followingId_idx').on(table.followingId),
  ],
)

export type Follow = typeof FollowSchema.$inferSelect
export type NewFollow = typeof FollowSchema.$inferInsert
