import { pgTable, uuid, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { PostSchema } from '../../schemas/post.schema'
import { UserSchema } from '../../../users/schemas/user.schema'

export const PostMentionSchema = pgTable(
  'post_mentions',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    postId: uuid('postId')
      .notNull()
      .references(() => PostSchema.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),

    mentionedUserId: uuid('mentionedUserId')
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
    uniqueIndex('post_mentions_postId_mentionedUserId_unique').on(
      table.postId,
      table.mentionedUserId,
    ),

    index('post_mentions_mentionedUserId_idx').on(table.mentionedUserId),
  ],
)

export type PostMention = typeof PostMentionSchema.$inferSelect
export type NewPostMention = typeof PostMentionSchema.$inferInsert
