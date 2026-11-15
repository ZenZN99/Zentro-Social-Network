import { pgTable, uuid, text, boolean, timestamp, index } from 'drizzle-orm/pg-core'

import { UserSchema } from '../../users/schemas/user.schema'

export const ConversationSchema = pgTable(
  'conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    senderId: uuid('senderId')
      .notNull()
      .references(() => UserSchema.id),

    receiverId: uuid('receiverId')
      .notNull()
      .references(() => UserSchema.id),

    lastMessage: text('lastMessage').default('').notNull(),

    lastMessageSenderId: uuid('lastMessageSenderId').references(() => UserSchema.id),

    isMutedBySender: boolean('isMutedBySender').default(false).notNull(),

    isMutedByReceiver: boolean('isMutedByReceiver').default(false).notNull(),

    createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),

    updatedAt: timestamp('updatedAt', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('conversations_senderId_idx').on(table.senderId),
    index('conversations_receiverId_idx').on(table.receiverId),
    index('conversations_lastMessageSenderId_idx').on(table.lastMessageSenderId),
  ],
)

export type Conversation = typeof ConversationSchema.$inferSelect
export type NewConversation = typeof ConversationSchema.$inferInsert
