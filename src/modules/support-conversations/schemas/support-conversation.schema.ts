import { pgTable, uuid, text, timestamp, pgEnum, index } from 'drizzle-orm/pg-core'
import { UserSchema } from '../../users/schemas/user.schema'
import { SupportConversationStatus } from './enums/status'

export const supportConversationStatusEnum = pgEnum(
  'support_conversation_status',
  Object.values(SupportConversationStatus) as [string, ...string[]],
)

export const SupportConversationSchema = pgTable(
  'support_conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    userId: uuid('userId')
      .notNull()
      .references(() => UserSchema.id),

    status: supportConversationStatusEnum().default(SupportConversationStatus.OPEN).notNull(),

    lastMessage: text('lastMessage').default(''),

    lastMessageSenderId: uuid('lastMessageSenderId').references(() => UserSchema.id),

    closedAt: timestamp('closedAt', { mode: 'date' }),

    closedBy: uuid('closedBy').references(() => UserSchema.id),

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
    index('support_conversations_userId_idx').on(table.userId),
    index('support_conversations_status_idx').on(table.status),
  ],
)

export type SupportConversation = typeof SupportConversationSchema.$inferSelect
export type NewSupportConversation = typeof SupportConversationSchema.$inferInsert
