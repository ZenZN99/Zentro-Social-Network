import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  integer,
  boolean,
  timestamp,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core'

import { VisibilityStatus } from './enums/visibility-status'
import { UserSchema } from '../../users/schemas/user.schema'

export const visibilityStatusEnum = pgEnum(
  'visibility_status',
  Object.values(VisibilityStatus) as [VisibilityStatus, ...VisibilityStatus[]],
)

export const PostSchema = pgTable(
  'posts',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    content: varchar('content', { length: 300 }).notNull(),

    images: jsonb('images').$type<{ url: string; publicId: string }[] | null>().default(null),

    authorId: uuid('authorId')
      .notNull()
      .references(() => UserSchema.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),

    viewsCount: integer('viewsCount').notNull().default(0),

    likesCount: integer('likesCount').notNull().default(0),

    commentsCount: integer('commentsCount').notNull().default(0),

    repostsCount: integer('repostsCount').notNull().default(0),

    quotesCount: integer('quotesCount').notNull().default(0),

    bookmarksCount: integer('bookmarksCount').notNull().default(0),

    isPin: boolean('isPin').notNull().default(false),

    isEdited: boolean('isEdited').notNull().default(false),

    visibility: visibilityStatusEnum('visibility').notNull().default(VisibilityStatus.PUBLIC),

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
    index('posts_authorId_idx').on(table.authorId),
    index('posts_visibility_idx').on(table.visibility),
    index('posts_createdAt_idx').on(table.createdAt),
    index('posts_authorId_createdAt_idx').on(table.authorId, table.createdAt),
  ],
)

export type Post = typeof PostSchema.$inferSelect
export type NewPost = typeof PostSchema.$inferInsert
