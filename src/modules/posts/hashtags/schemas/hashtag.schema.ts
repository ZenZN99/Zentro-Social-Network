import { pgTable, uuid, varchar, integer, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'

export const HashtagSchema = pgTable(
  'hashtags',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    name: varchar('name', { length: 100 }).notNull().unique(),

    postsCount: integer('postsCount').notNull().default(0),

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
    uniqueIndex('hashtags_name_unique').on(table.name),
    index('hashtags_postsCount_idx').on(table.postsCount),
  ],
)

export type Hashtag = typeof HashtagSchema.$inferSelect
export type NewHashtag = typeof HashtagSchema.$inferInsert
