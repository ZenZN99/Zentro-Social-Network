import { pgTable, uuid, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { UserSchema } from '../../users/schemas/user.schema'
import { PostSchema } from '../../posts/schemas/post.schema'
import { CommentSchema } from '../../comments/schemas/comment.schema'
import { ReplySchema } from '../../replies/schemas/reply.schema'

export const LikeSchema = pgTable(
  'likes',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    userId: uuid('userId')
      .notNull()
      .references(() => UserSchema.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),

    postId: uuid('postId').references(() => PostSchema.id, {
      onDelete: 'cascade',
      onUpdate: 'cascade',
    }),

    commentId: uuid('commentId').references(() => CommentSchema.id, {
      onDelete: 'cascade',
      onUpdate: 'cascade',
    }),

    replyId: uuid('replyId').references(() => ReplySchema.id, {
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
    index('likes_userId_idx').on(table.userId),
    index('likes_postId_idx').on(table.postId),
    index('likes_commentId_idx').on(table.commentId),
    index('likes_replyId_idx').on(table.replyId),

    uniqueIndex('likes_userId_postId_unique').on(table.userId, table.postId),

    uniqueIndex('likes_userId_commentId_unique').on(table.userId, table.commentId),

    uniqueIndex('likes_userId_replyId_unique').on(table.userId, table.replyId),
  ],
)

export type Like = typeof LikeSchema.$inferSelect
export type NewLike = typeof LikeSchema.$inferInsert
