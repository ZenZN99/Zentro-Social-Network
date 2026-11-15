import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  index,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'

import { UserSchema } from '../../users/schemas/user.schema'
import { CommentSchema } from '../../comments/schemas/comment.schema'

export const ReplySchema = pgTable(
  'replies',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    content: varchar('content', { length: 300 }).notNull(),

    commentId: uuid('commentId')
      .notNull()
      .references(() => CommentSchema.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),

    userId: uuid('userId')
      .notNull()
      .references(() => UserSchema.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),

    parentReplyId: uuid('parentReplyId').references((): AnyPgColumn => ReplySchema.id, {
      onDelete: 'cascade',
      onUpdate: 'cascade',
    }),

    likesCount: integer('likesCount').notNull().default(0),

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
    index('replies_commentId_idx').on(table.commentId),
    index('replies_userId_idx').on(table.userId),
    index('replies_parentReplyId_idx').on(table.parentReplyId),
    index('replies_createdAt_idx').on(table.createdAt),
  ],
)

export type Reply = typeof ReplySchema.$inferSelect
export type NewReply = typeof ReplySchema.$inferInsert
