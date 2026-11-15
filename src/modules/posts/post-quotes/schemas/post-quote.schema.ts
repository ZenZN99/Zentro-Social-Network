import { pgTable, uuid, timestamp, index } from 'drizzle-orm/pg-core'

import { PostSchema } from '../../schemas/post.schema'

export const PostQuoteSchema = pgTable(
  'post_quotes',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    postId: uuid('postId')
      .notNull()
      .unique()
      .references(() => PostSchema.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),

    quotedPostId: uuid('quotedPostId')
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
  (table) => [index('post_quotes_quotedPostId_idx').on(table.quotedPostId)],
)

export type PostQuote = typeof PostQuoteSchema.$inferSelect
export type NewPostQuote = typeof PostQuoteSchema.$inferInsert
