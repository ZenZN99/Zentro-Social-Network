import { eq, desc } from 'drizzle-orm'
import type { NodePgTransaction } from 'drizzle-orm/node-postgres'
import type { ExtractTablesWithRelations } from 'drizzle-orm'
import { PostQuoteSchema } from './schemas/post-quote.schema'
import type { database } from '../../../config/db/drizzle'
import { SpongBadRequestException } from 'riser-bob'

type Transaction = NodePgTransaction<
  Record<string, never>,
  ExtractTablesWithRelations<Record<string, never>>
>

export class PostQuotesService {
  constructor(private readonly db: typeof database) {}

  async attach(postId: string, quotedPostId: string, transaction?: Transaction): Promise<void> {
    if (!postId.trim() || !quotedPostId.trim()) {
      throw new SpongBadRequestException('Post IDs are required')
    }

    if (postId === quotedPostId) {
      throw new SpongBadRequestException('A post cannot quote itself')
    }

    const db = transaction ?? this.db

    try {
      await db.insert(PostQuoteSchema).values({
        postId,
        quotedPostId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      ) {
        throw new SpongBadRequestException('This quote already exists')
      }

      throw error
    }
  }

  async detach(postId: string, transaction?: Transaction): Promise<number> {
    const db = transaction ?? this.db

    const deleted = await db
      .delete(PostQuoteSchema)
      .where(eq(PostQuoteSchema.postId, postId))
      .returning({ id: PostQuoteSchema.id })

    return deleted.length
  }

  async findByPostId(postId: string, transaction?: Transaction) {
    const db = transaction ?? this.db

    const [quote] = await db
      .select()
      .from(PostQuoteSchema)
      .where(eq(PostQuoteSchema.postId, postId))
      .orderBy(desc(PostQuoteSchema.createdAt), desc(PostQuoteSchema.id))
      .limit(1)

    return quote ?? null
  }
}
