import { BookmarkSchema } from './schemas/bookmark.schema'
import { PostSchema } from '../posts/schemas/post.schema'
import { buildPagination } from '../../utilities/pagination'
import { UserSchema } from '../users/schemas/user.schema'
import { UserProfileSchema } from '../user-profiles/schemas/user-profile.schema'
import type { Database, database } from '../../config/db/drizzle'
import { and, count, desc, eq, sql } from 'drizzle-orm'
import { NotFoundException } from 'lykosjs'

export class BookmarksService {
  constructor(private readonly db: Database) {}

  async toggle(userId: string, postId: string) {
    return this.db.connection.transaction(async (transaction) => {
      const [post] = await transaction
        .select()
        .from(PostSchema)
        .where(eq(PostSchema.id, postId))
        .for('update')
        .limit(1)

      if (!post) {
        throw new NotFoundException({
          success: false,
          message: 'Post not found',
        })
      }

      const [bookmark] = await transaction
        .select()
        .from(BookmarkSchema)
        .where(and(eq(BookmarkSchema.userId, userId), eq(BookmarkSchema.postId, postId)))
        .limit(1)

      if (bookmark) {
        await transaction.delete(BookmarkSchema).where(eq(BookmarkSchema.id, bookmark.id))

        await transaction
          .update(PostSchema)
          .set({
            bookmarksCount: sql`${PostSchema.bookmarksCount} - 1`,
          })
          .where(eq(PostSchema.id, postId))

        return {
          success: true,
          isBookmarked: false,
          message: 'Bookmark removed successfully',
        }
      }

      await transaction.insert(BookmarkSchema).values({
        userId,
        postId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      await transaction
        .update(PostSchema)
        .set({
          bookmarksCount: sql`${PostSchema.bookmarksCount} + 1`,
        })
        .where(eq(PostSchema.id, postId))

      return {
        success: true,
        isBookmarked: true,
        message: 'Post bookmarked successfully',
      }
    })
  }

  async findMe(userId: string, page = 1, limit = 10, offset = (page - 1) * limit) {
    const bookmarks = await this.db.connection
      .select({
        bookmark: BookmarkSchema,
        post: PostSchema,
        author: {
          id: UserSchema.id,
          username: UserSchema.username,
        },
        profile: UserProfileSchema,
      })
      .from(BookmarkSchema)
      .leftJoin(PostSchema, eq(BookmarkSchema.postId, PostSchema.id))
      .leftJoin(UserSchema, eq(PostSchema.authorId, UserSchema.id))
      .leftJoin(UserProfileSchema, eq(UserSchema.id, UserProfileSchema.userId))
      .where(eq(BookmarkSchema.userId, userId))
      .orderBy(desc(BookmarkSchema.createdAt))
      .limit(limit)
      .offset(offset)

    const data = bookmarks.map(({ bookmark, post, author, profile }) => ({
      bookmark,
      post: post
        ? {
            post,
            author,
            profile,
          }
        : null,
    }))

    const [{ total } = { total: 0 }] = await this.db.connection
      .select({
        total: count(),
      })
      .from(BookmarkSchema)
      .where(eq(BookmarkSchema.userId, userId))

    return {
      success: true,
      bookmarks: data,
      pagination: buildPagination(total, page, limit),
    }
  }

  async isBookmarked(userId: string, postId: string) {
    const [bookmark] = await this.db.connection
      .select({
        id: BookmarkSchema.id,
      })
      .from(BookmarkSchema)
      .where(and(eq(BookmarkSchema.userId, userId), eq(BookmarkSchema.postId, postId)))
      .limit(1)

    return {
      success: true,
      isBookmarked: !!bookmark,
    } as const
  }

  async countByPostId(postId: string) {
    const [post] = await this.db.connection
      .select({
        id: PostSchema.id,
        bookmarksCount: PostSchema.bookmarksCount,
      })
      .from(PostSchema)
      .where(eq(PostSchema.id, postId))
      .limit(1)

    if (!post) {
      throw new NotFoundException({
        success: false,
        message: 'Post not found',
      })
    }

    return {
      success: true,
      bookmarksCount: post.bookmarksCount,
    } as const
  }

  async countMe(userId: string) {
    const [{ bookmarksCount = 0 } = {}] = await this.db.connection
      .select({
        bookmarksCount: count(),
      })
      .from(BookmarkSchema)
      .where(eq(BookmarkSchema.userId, userId))

    return {
      success: true,
      bookmarksCount,
    } as const
  }
}
