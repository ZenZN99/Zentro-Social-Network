import { pgTable, uuid, varchar, boolean, timestamp, pgEnum, index } from 'drizzle-orm/pg-core'

import { UserSchema } from '../../users/schemas/user.schema'
import { NotificationType } from './enums/notification-type'

export const notificationTypeEnum = pgEnum(
  'notification_type',
  Object.values(NotificationType) as [string, ...string[]],
)

export const NotificationSchema = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    senderId: uuid('senderId')
      .notNull()
      .references(() => UserSchema.id),

    receiverId: uuid('receiverId')
      .notNull()
      .references(() => UserSchema.id),

    targetId: uuid('targetId'),

    type: notificationTypeEnum('type').notNull(),

    message: varchar('message', { length: 255 }).notNull(),

    isRead: boolean('isRead').default(false).notNull(),

    link: varchar('link', { length: 500 }),

    createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),

    updatedAt: timestamp('updatedAt', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [index('notifications_receiverId_idx').on(table.receiverId)],
)

export type Notification = typeof NotificationSchema.$inferSelect
export type NewNotification = typeof NotificationSchema.$inferInsert
