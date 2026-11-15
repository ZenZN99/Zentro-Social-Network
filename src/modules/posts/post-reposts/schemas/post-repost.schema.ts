import { pgTable, uuid, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { PostSchema } from '../../schemas/post.schema'
import { UserSchema } from '../../../users/schemas/user.schema'

export const PostRepostSchema = pgTable(
  'post_reposts',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    postId: uuid('postId')
      .notNull()
      .references(() => PostSchema.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),

    repostedByUserId: uuid('repostedByUserId')
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
    uniqueIndex('post_reposts_postId_repostedByUserId_unique').on(
      table.postId,
      table.repostedByUserId,
    ),

    index('post_reposts_repostedByUserId_idx').on(table.repostedByUserId),
  ],
)

export type PostRepost = typeof PostRepostSchema.$inferSelect
export type NewPostRepost = typeof PostRepostSchema.$inferInsert
