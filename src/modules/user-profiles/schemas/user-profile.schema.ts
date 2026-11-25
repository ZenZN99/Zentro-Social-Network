import { pgTable, uuid, jsonb, varchar, boolean, integer, timestamp } from 'drizzle-orm/pg-core'

import { UserSchema } from '../../users/schemas/user.schema'

export const UserProfileSchema = pgTable('user_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),

  userId: uuid('userId')
    .notNull()
    .unique()
    .references(() => UserSchema.id, {
      onDelete: 'cascade',
      onUpdate: 'cascade',
    }),

  avatar: jsonb('avatar')
    .$type<{
      url: string
      publicId: string
    } | null>()
    .default(null),

  cover: jsonb('cover')
    .$type<{
      url: string
      publicId: string
    } | null>()
    .default(null),

  bio: varchar('bio', { length: 300 }).notNull().default(''),

  socials: jsonb('socials')
    .$type<{
      facebookUrl: string | null
      instagramUrl: string | null
      youtubeUrl: string | null
      threadsUrl: string | null
      twitterUrl: string | null
      tiktokUrl: string | null
      snapchatUrl: string | null
      pinterestUrl: string | null
      redditUrl: string | null
      telegramUrl: string | null
      whatsappUrl: string | null
    }>()
    .notNull()
    .default({
      facebookUrl: null,
      instagramUrl: null,
      youtubeUrl: null,
      threadsUrl: null,
      twitterUrl: null,
      tiktokUrl: null,
      snapchatUrl: null,
      pinterestUrl: null,
      redditUrl: null,
      telegramUrl: null,
      whatsappUrl: null,
    }),

  website: varchar('website', { length: 2048 }),

  isPrivate: boolean('isPrivate').notNull().default(false),

  postsCount: integer('postsCount').notNull().default(0),

  commentsCount: integer('commentsCount').notNull().default(0),

  repliesCount: integer('repliesCount').notNull().default(0),

  followingCount: integer('followingCount').notNull().default(0),

  followersCount: integer('followersCount').notNull().default(0),

  createdAt: timestamp('createdAt', {
    withTimezone: true,
    mode: 'date',
  }).notNull(),

  updatedAt: timestamp('updatedAt', {
    withTimezone: true,
    mode: 'date',
  }).notNull(),
})

export type UserProfile = typeof UserProfileSchema.$inferSelect
export type NewUserProfile = typeof UserProfileSchema.$inferInsert


