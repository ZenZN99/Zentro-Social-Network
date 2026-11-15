import { pgTable, uuid, text, jsonb, boolean, timestamp, index } from 'drizzle-orm/pg-core'

import { UserSchema } from '../../users/schemas/user.schema'
import { ConversationSchema } from '../../conversations/schemas/conversation.schema'

export const MessageSchema = pgTable(
  'messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    userId: uuid('userId')
      .notNull()
      .references(() => UserSchema.id),

    conversationId: uuid('conversationId')
      .notNull()
      .references(() => ConversationSchema.id),

    content: text('content'),

    attachments: jsonb('attachments').$type<string[] | null>().default([]),

    isRead: boolean('isRead').default(false).notNull(),

    createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),

    updatedAt: timestamp('updatedAt', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('messages_userId_idx').on(table.userId),
    index('messages_conversationId_idx').on(table.conversationId),
  ],
)

export type Message = typeof MessageSchema.$inferSelect
export type NewMessage = typeof MessageSchema.$inferInsert
