import { and, eq, inArray } from 'drizzle-orm'
import type { NodePgTransaction } from 'drizzle-orm/node-postgres'
import type { ExtractTablesWithRelations } from 'drizzle-orm'
import { PostHashtagSchema } from './schemas/post-hashtag.schema'
import type { database } from '../../../config/db/drizzle'

type Transaction = NodePgTransaction<
  Record<string, never>,
  ExtractTablesWithRelations<Record<string, never>>
>

export class PostHashtagsService {
  constructor(private readonly db: typeof database) {}

  async attachMany(postId: string, hashtagIds: string[], transaction?: Transaction) {
    if (!hashtagIds.length) return []

    const uniqueIds = [...new Set(hashtagIds)]

    const db = transaction ?? this.db

    return db
      .insert(PostHashtagSchema)
      .values(
        uniqueIds.map((hashtagId) => ({
          postId,
          hashtagId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      )
      .onConflictDoNothing()
      .returning()
  }

  async detachMany(postId: string, hashtagIds: string[], transaction?: Transaction) {
    if (!hashtagIds.length) return 0

    const db = transaction ?? this.db

    const deleted = await db
      .delete(PostHashtagSchema)
      .where(
        and(eq(PostHashtagSchema.postId, postId), inArray(PostHashtagSchema.hashtagId, hashtagIds)),
      )
      .returning({ id: PostHashtagSchema.id })

    return deleted.length
  }

  async detachAll(postId: string, transaction?: Transaction): Promise<number> {
    const db = transaction ?? this.db

    const deleted = await db
      .delete(PostHashtagSchema)
      .where(eq(PostHashtagSchema.postId, postId))
      .returning({ id: PostHashtagSchema.id })

    return deleted.length
  }

  async findByPostId(postId: string, transaction?: Transaction) {
    const db = transaction ?? this.db

    return db.select().from(PostHashtagSchema).where(eq(PostHashtagSchema.postId, postId))
  }
}
