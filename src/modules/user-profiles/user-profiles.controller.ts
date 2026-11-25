import { eq } from 'drizzle-orm'
import {
  UserProfileSchema,
  type UserProfile,
} from '../../modules/user-profiles/schemas/user-profile.schema'
import { UpdateUserProfileRule } from '../../modules/user-profiles/rules/update'
import cloudinary from '../../config/cloudinary/cloudinary'
import { Validator, type ContextHandler } from 'lykosjs'
import type { Database } from '../../config/db/drizzle'
import { verifyUser } from '../../config/token/verify-user'

const SOCIAL_KEYS = [
  'facebookUrl',
  'instagramUrl',
  'youtubeUrl',
  'threadsUrl',
  'twitterUrl',
  'tiktokUrl',
  'snapchatUrl',
  'pinterestUrl',
  'redditUrl',
  'telegramUrl',
  'whatsappUrl',
] as const

const IMAGE_FIELDS = ['avatar', 'cover'] as const

const UPLOAD_FOLDERS = {
  avatar: 'user-profiles/avatars',
  cover: 'user-profiles/covers',
} as const

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

const MAX_IMAGE_SIZE = 5 * 1024 * 1024

type SocialKey = (typeof SOCIAL_KEYS)[number]
type Socials = UserProfile['socials']
type FieldErrors = Record<string, string[]>
type UploadResult = Awaited<ReturnType<typeof cloudinary.images.uploadImage>>

export class UserProfilesController {
  constructor(private readonly db: Database) {}

  readonly update: ContextHandler = async (ctx, reply) => {
    const userId = ctx.user!.id
    const formData = await ctx.formData()

    const [profile] = await this.db.connection
      .select()
      .from(UserProfileSchema)
      .where(eq(UserProfileSchema.userId, userId))
      .limit(1)

    if (!profile) {
      return reply.NotFound({
        success: false,
        message: 'Profile not found',
      })
    }

    const errors: FieldErrors = {}

    const updates: Partial<Pick<UserProfile, 'bio' | 'website' | 'socials' | 'avatar' | 'cover'>> =
      {}

    const text: { bio?: string; website?: string } = {}

    for (const key of ['bio', 'website'] as const) {
      const value = formData.get(key)
      if (typeof value === 'string') text[key] = value.trim()
    }

    const clearWebsite = text.website === ''
    if (clearWebsite) delete text.website

    if (Object.keys(text).length > 0) {
      const { valid, errors: textErrors } = Validator.validate(text, UpdateUserProfileRule)

      if (valid) Object.assign(updates, text)
      else Object.assign(errors, textErrors)
    }

    if (clearWebsite) updates.website = null

    const rawSocials = formData.get('socials')

    if (typeof rawSocials === 'string') {
      const result = this.parseSocials(rawSocials, profile.socials)

      if (result.socials) updates.socials = result.socials
      Object.assign(errors, result.errors)
    }

    // Validate all images before uploading any of them.
    const imageFiles: Partial<Record<(typeof IMAGE_FIELDS)[number], File>> = {}

    for (const field of IMAGE_FIELDS) {
      const file = formData.get(field)

      if (!(file instanceof File) || file.size === 0) continue

      if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
        errors[field] = ['Only JPEG, PNG, and WebP images are allowed']
        continue
      }

      if (file.size > MAX_IMAGE_SIZE) {
        errors[field] = ['Image size must not exceed 5 MB']
        continue
      }

      imageFiles[field] = file
    }

    if (Object.keys(errors).length > 0) {
      return reply.UnprocessableContent({
        success: false,
        message: 'Validation failed',
        errors,
      })
    }

    const uploaded: UploadResult[] = []
    const oldPublicIds: string[] = []

    let saved: UserProfile

    try {
      for (const field of IMAGE_FIELDS) {
        const file = imageFiles[field]

        if (!file) continue

        const result = await cloudinary.images.uploadImage(file, UPLOAD_FOLDERS[field])

        uploaded.push(result)

        const oldPublicId = profile[field]?.publicId
        if (oldPublicId) oldPublicIds.push(oldPublicId)

        updates[field] = result
      }

      const [row] = await this.db.connection
        .update(UserProfileSchema)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(UserProfileSchema.id, profile.id))
        .returning()

      if (!row) throw new Error('Failed to update profile')

      saved = row
    } catch (error) {
      // Preserve the original upload/database error.
      // Cleanup failures must not replace it.
      if (uploaded.length > 0) {
        try {
          await cloudinary.images.destroyImagesMany(uploaded.map((result) => result.publicId))
        } catch {
          // Cleanup can be retried separately.
        }
      }

      throw error
    }

    // The database save succeeded. Old image cleanup is best-effort.
    await Promise.all(
      oldPublicIds.map(async (publicId) => {
        try {
          await cloudinary.images.destroyImage(publicId)
        } catch {
          // Do not fail a successful profile update because of cleanup.
        }
      }),
    )

    return reply.OK({
      success: true,
      message: 'Profile updated successfully',
      data: {
        avatar: saved.avatar,
        cover: saved.cover,
        bio: saved.bio,
        socials: saved.socials,
        website: saved.website,
        isPrivate: saved.isPrivate,
      },
    })
  }

  private parseSocials(raw: string, current: Socials): { socials?: Socials; errors: FieldErrors } {
    let input: unknown

    try {
      input = JSON.parse(raw)
    } catch {
      return { errors: { socials: ['Invalid JSON format'] } }
    }

    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return { errors: { socials: ['Socials must be an object'] } }
    }

    const socials = { ...current }
    const errors: FieldErrors = {}

    for (const [key, rawValue] of Object.entries(input as Record<string, unknown>)) {
      if (!(SOCIAL_KEYS as readonly string[]).includes(key)) {
        ;(errors.socials ??= []).push(`Unknown social field: ${key}`)
        continue
      }

      const socialKey = key as SocialKey
      const value = typeof rawValue === 'string' ? rawValue.trim() : rawValue

      if (value === null || value === '') {
        socials[socialKey] = null
      } else if (typeof value === 'string' && /^https?:\/\//i.test(value) && URL.canParse(value)) {
        socials[socialKey] = value
      } else {
        errors[key] = ['Must be a valid HTTP or HTTPS URL']
      }
    }

    return Object.keys(errors).length > 0 ? { errors } : { socials, errors }
  }

  verifyToken(token: string) {
    return verifyUser(token)
  }
}
