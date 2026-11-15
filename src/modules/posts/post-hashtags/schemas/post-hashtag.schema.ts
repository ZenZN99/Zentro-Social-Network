import { pgTable, uuid, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { PostSchema } from '../../schemas/post.schema'
import { HashtagSchema } from '../../hashtags/schemas/hashtag.schema'

export const PostHashtagSchema = pgTable(
  'post_hashtags',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    postId: uuid('postId')
      .notNull()
      .references(() => PostSchema.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),

    hashtagId: uuid('hashtagId')
      .notNull()
      .references(() => HashtagSchema.id, {
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
    uniqueIndex('post_hashtags_postId_hashtagId_unique').on(table.postId, table.hashtagId),

    index('post_hashtags_hashtagId_idx').on(table.hashtagId),
  ],
)

export type PostHashtag = typeof PostHashtagSchema.$inferSelect
export type NewPostHashtag = typeof PostHashtagSchema.$inferInsert
