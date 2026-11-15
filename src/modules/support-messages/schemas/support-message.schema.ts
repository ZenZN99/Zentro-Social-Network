import { pgTable, uuid, text, jsonb, boolean, timestamp, index } from 'drizzle-orm/pg-core'

import { SupportConversationSchema } from '../../support-conversations/schemas/support-conversation.schema'
import { UserSchema } from '../../users/schemas/user.schema'

export const SupportMessageSchema = pgTable(
  'support_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    conversationId: uuid('conversationId')
      .notNull()
      .references(() => SupportConversationSchema.id),

    senderId: uuid('senderId')
      .notNull()
      .references(() => UserSchema.id),

    message: text('message'),

    attachments: jsonb('attachments')
      .$type<
        {
          url: string
          type: 'image' | 'file'
          name: string
        }[]
      >()
      .default([])
      .notNull(),
    isRead: boolean('isRead').default(false).notNull(),

    createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),

    updatedAt: timestamp('updatedAt', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('support_messages_conversationId_idx').on(table.conversationId),
    index('support_messages_senderId_idx').on(table.senderId),
  ],
)

export type SupportMessage = typeof SupportMessageSchema.$inferSelect
export type NewSupportMessage = typeof SupportMessageSchema.$inferInsert
