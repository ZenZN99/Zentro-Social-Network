import { and, eq, inArray } from 'drizzle-orm'
import type { NodePgTransaction } from 'drizzle-orm/node-postgres'
import type { ExtractTablesWithRelations } from 'drizzle-orm'
import { PostMentionSchema } from './schemas/post-mention.schema'
import { UserSchema } from '../../users/schemas/user.schema'
import type { database } from '../../../config/db/drizzle'

type Transaction = NodePgTransaction<
  Record<string, never>,
  ExtractTablesWithRelations<Record<string, never>>
>

export class PostMentionsService {
  constructor(private readonly db: typeof database) {}

  async attachMany(
    postId: string,
    userIds: string[],
    transaction?: Transaction,
  ): Promise<string[]> {
    if (!userIds.length) return []

    const uniqueIds = [...new Set(userIds)]

    const attachedIds: string[] = []

    const db = transaction ?? this.db

    for (const mentionedUserId of uniqueIds) {
      const [existing] = await db
        .select({ id: PostMentionSchema.id })
        .from(PostMentionSchema)
        .where(
          and(
            eq(PostMentionSchema.postId, postId),
            eq(PostMentionSchema.mentionedUserId, mentionedUserId),
          ),
        )
        .limit(1)

      if (existing) continue

      await db.insert(PostMentionSchema).values({
        postId,
        mentionedUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      attachedIds.push(mentionedUserId)
    }

    return attachedIds
  }

  async detachMany(postId: string, userIds: string[], transaction?: Transaction): Promise<number> {
    if (!userIds.length) return 0

    const db = transaction ?? this.db

    const deleted = await db
      .delete(PostMentionSchema)
      .where(
        and(
          eq(PostMentionSchema.postId, postId),
          inArray(PostMentionSchema.mentionedUserId, userIds),
        ),
      )
      .returning({ id: PostMentionSchema.id })

    return deleted.length
  }

  async detachAll(postId: string, transaction?: Transaction): Promise<number> {
    const db = transaction ?? this.db

    const deleted = await db
      .delete(PostMentionSchema)
      .where(eq(PostMentionSchema.postId, postId))
      .returning({ id: PostMentionSchema.id })

    return deleted.length
  }

  async findInvalidMentionIds(userIds: string[], transaction?: Transaction): Promise<string[]> {
    const uniqueIds = [...new Set(userIds)]

    if (uniqueIds.length === 0) return []

    const db = transaction ?? this.db

    const users = await db
      .select({ id: UserSchema.id })
      .from(UserSchema)
      .where(inArray(UserSchema.id, uniqueIds))

    const existingIds = new Set(users.map((user) => user.id))

    return uniqueIds.filter((id) => !existingIds.has(id))
  }
}
