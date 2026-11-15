import { pgTable, uuid, jsonb, text, timestamp, pgEnum } from 'drizzle-orm/pg-core'

import { UserSchema } from '../../users/schemas/user.schema'
import { UserVerificationStatus } from './enums/user-verification-status'

export const userVerificationStatusEnum = pgEnum(
  'user_verification_status',
  Object.values(UserVerificationStatus) as [UserVerificationStatus, ...UserVerificationStatus[]],
)

export const UserVerificationSchema = pgTable('user_verifications', {
  id: uuid('id').defaultRandom().primaryKey(),

  userId: uuid('userId')
    .notNull()
    .references(() => UserSchema.id, {
      onDelete: 'cascade',
      onUpdate: 'cascade',
    }),

  profileImage: jsonb('profileImage')
    .$type<{
      url: string
      publicId: string
    } | null>()
    .default(null),

  identityDocument: jsonb('identityDocument')
    .$type<{
      url: string
      publicId: string
    } | null>()
    .default(null),

  status: userVerificationStatusEnum('status'),

  rejectionReason: text('rejectionReason'),

  submittedAt: timestamp('submittedAt', {
    withTimezone: true,
    mode: 'date',
  }),

  reviewedAt: timestamp('reviewedAt', {
    withTimezone: true,
    mode: 'date',
  }),

  reviewedBy: uuid('reviewedBy').references(() => UserSchema.id, {
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
})

export type UserVerification = typeof UserVerificationSchema.$inferSelect
export type NewUserVerification = typeof UserVerificationSchema.$inferInsert
