import { eq, desc, asc, count, inArray, sql } from 'drizzle-orm'
import type { NodePgTransaction } from 'drizzle-orm/node-postgres'
import type { ExtractTablesWithRelations } from 'drizzle-orm'
import { HashtagSchema } from './schemas/hashtag.schema'
import { buildPagination } from '../../../utilities/pagination'
import type { Database } from '../../../config/db/drizzle'
import { BadRequestException, InternalServerErrorException } from 'lykosjs'

type Transaction = NodePgTransaction<
  Record<string, never>,
  ExtractTablesWithRelations<Record<string, never>>
>

export class HashtagsService {
  constructor(private readonly db: Database) {}

  async findOrCreate(name: string, transaction?: Transaction) {
    const normalizedName = name.trim().replace(/^#/, '').toLowerCase()

    if (!normalizedName || normalizedName.length > 100) {
      throw new BadRequestException({
        success: false,
        message: 'Invalid hashtag name',
      })
    }

    const db = transaction ?? this.db.connection

    const [hashtag] = await db
      .insert(HashtagSchema)
      .values({
        name: normalizedName,
        postsCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing({ target: HashtagSchema.name })
      .returning()

    if (hashtag) {
      return hashtag
    }

    const [existingHashtag] = await db
      .select()
      .from(HashtagSchema)
      .where(eq(HashtagSchema.name, normalizedName))
      .limit(1)

    return existingHashtag
  }

  async findOrCreateMany(names: string[], transaction?: Transaction) {
    const uniqueNames = [...new Set(names.map((name) => name.trim()).filter(Boolean))]

    const hashtags = []

    for (const name of uniqueNames) {
      const hashtag = await this.findOrCreate(name, transaction)

      if (!hashtag) {
        throw new InternalServerErrorException({
          success: false,
          message: `Failed to find or create hashtag: ${name}`,
        })
      }

      hashtags.push(hashtag)
    }

    return hashtags
  }

  async findByName(name: string, transaction?: Transaction) {
    const normalizedName = name.trim().replace(/^#/, '').toLowerCase()

    const db = transaction ?? this.db.connection

    const [hashtag] = await db
      .select()
      .from(HashtagSchema)
      .where(eq(HashtagSchema.name, normalizedName))
      .limit(1)

    return hashtag ?? null
  }

  async findTrending(page = 1, limit = 10, offset = (page - 1) * limit) {
    const [hashtags, countResult] = await Promise.all([
      this.db.connection
        .select()
        .from(HashtagSchema)
        .orderBy(desc(HashtagSchema.postsCount), asc(HashtagSchema.name))
        .limit(limit)
        .offset(offset),

      this.db.connection.select({ total: count() }).from(HashtagSchema),
    ])

    const total = countResult[0]?.total ?? 0

    return {
      success: true,
      data: hashtags,
      pagination: buildPagination(total, page, limit),
    }
  }

  async incrementPostsCount(hashtagIds: string[], transaction?: Transaction): Promise<void> {
    if (hashtagIds.length === 0) return

    const db = transaction ?? this.db.connection

    await db
      .update(HashtagSchema)
      .set({
        postsCount: sql`${HashtagSchema.postsCount} + 1`,
      })
      .where(inArray(HashtagSchema.id, hashtagIds))
  }

  async decrementPostsCount(hashtagIds: string[], transaction?: Transaction): Promise<void> {
    if (hashtagIds.length === 0) return

    const db = transaction ?? this.db.connection

    await db
      .update(HashtagSchema)
      .set({
        postsCount: sql`${HashtagSchema.postsCount} - 1`,
      })
      .where(inArray(HashtagSchema.id, hashtagIds))
  }
}
