import { pgTable, uuid, varchar, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core'

import { UserSchema } from '../../users/schemas/user.schema'
import { PostSchema } from '../../posts/schemas/post.schema'

export const CommentSchema = pgTable(
  'comments',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    content: varchar('content', { length: 300 }).notNull(),

    postId: uuid('postId')
      .notNull()
      .references(() => PostSchema.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),

    userId: uuid('userId')
      .notNull()
      .references(() => UserSchema.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),

    likesCount: integer('likesCount').notNull().default(0),

    repliesCount: integer('repliesCount').notNull().default(0),

    isEdited: boolean('isEdited').notNull().default(false),

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
    index('comments_postId_idx').on(table.postId),
    index('comments_userId_idx').on(table.userId),
    index('comments_postId_createdAt_idx').on(table.postId, table.createdAt),
  ],
)

export type Comment = typeof CommentSchema.$inferSelect
export type NewComment = typeof CommentSchema.$inferInsert
