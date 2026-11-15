import { pgTable, uuid, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { UserSchema } from '../../users/schemas/user.schema'
import { PostSchema } from '../../posts/schemas/post.schema'

export const BookmarkSchema = pgTable(
  'bookmarks',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    userId: uuid('userId')
      .notNull()
      .references(() => UserSchema.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),

    postId: uuid('postId')
      .notNull()
      .references(() => PostSchema.id, {
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
    uniqueIndex('bookmarks_userId_postId_unique').on(table.userId, table.postId),

    index('bookmarks_userId_idx').on(table.userId),
    index('bookmarks_postId_idx').on(table.postId),
    index('bookmarks_createdAt_idx').on(table.createdAt),
  ],
)

export type Bookmark = typeof BookmarkSchema.$inferSelect
export type NewBookmark = typeof BookmarkSchema.$inferInsert
