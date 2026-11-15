import { VisibilityStatus } from './schemas/enums/visibility-status'
import cloudinary from '../../config/cloudinary/cloudinary'
import { buildPagination } from '../../utilities/pagination'
import { UserSchema } from '../users/schemas/user.schema'
import { UserProfileSchema } from '../user-profiles/schemas/user-profile.schema'
import { FollowSchema } from '../follows/schemas/follow.schema'
import type { database } from '../../config/db/drizzle'
import { PostSchema } from './schemas/post.schema'
import { and, count, desc, eq, isNotNull, or, sql } from 'drizzle-orm'
import type { PostMentionsService } from './post-mentions/post-mentions.service'
import type { HashtagsService } from './hashtags/hashtags.service'
import type { PostHashtagsService } from './post-hashtags/post-hashtags.service'
import type { PostQuotesService } from './post-quotes/post-quotes.service'
import type { PostRepostsService } from './post-reposts/post-reposts.service'
import type { CreatePostBody, UpdatePostBody } from './posts.controller'
import type { NotificationsService } from '../notifications/notifications.service'
import { NotificationType } from '../notifications/schemas/enums/notification-type'
import {
  SpongInternalServerErrorException,
  SpongNotFoundException,
  SpongUnprocessableEntityException,
} from 'riser-bob'

export class PostsService {
  constructor(
    private readonly db: typeof database,
    private readonly postMentionsService: PostMentionsService,
    private readonly hashtagsService: HashtagsService,
    private readonly postHashtagsService: PostHashtagsService,
    private readonly postQuotesService: PostQuotesService,
    private readonly postRepostsService: PostRepostsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(
    userId: string,
    body: CreatePostBody,
    formData: {
      get(name: string): string | File | null
      getAll(name: string): (string | File)[]
    },
  ) {
    const { content, visibility, isPin, mentions = [], hashtags = [], quotedPostId } = body

    // 2. Extract images
    const imageFiles = formData
      .getAll('images')
      .filter((item): item is File => item instanceof File)

    // 3. Upload images
    const uploadedImages: {
      url: string
      publicId: string
    }[] = []

    try {
      for (const image of imageFiles) {
        const result = await cloudinary.images.uploadImage(image, 'zentro/posts')

        uploadedImages.push({
          url: result.url,
          publicId: result.publicId,
        })
      }

      // ADDED: Fetch sender user (used for notification message)
      const [user] = await this.db
        .select({
          firstName: UserSchema.firstName,
          lastName: UserSchema.lastName,
        })
        .from(UserSchema)
        .where(eq(UserSchema.id, userId))
        .limit(1)

      if (!user) {
        throw new SpongNotFoundException({
          success: false,
          message: 'User not found',
        })
      }

      // 4. Create post and optional relations
      const post = await this.db.transaction(async (transaction) => {
        // 4.1 Check quoted post if provided
        if (quotedPostId) {
          const [originalPost] = await transaction
            .select()
            .from(PostSchema)
            .where(eq(PostSchema.id, quotedPostId))
            .limit(1)

          if (!originalPost) {
            throw new SpongNotFoundException({
              success: false,
              message: 'Quoted post not found',
            })
          }

          // Check access permissions to originalPost here
        }

        const invalidMentionIds = await this.postMentionsService.findInvalidMentionIds(
          mentions,
          transaction,
        )

        if (invalidMentionIds.length > 0) {
          throw new SpongUnprocessableEntityException({
            success: false,
            message: 'Some mentioned users do not exist',
            errors: {
              mentions: invalidMentionIds,
            },
          })
        }

        // 4.2 Create the post
        const [newPost] = await transaction
          .insert(PostSchema)
          .values({
            authorId: userId,
            content,
            visibility,
            isPin: isPin ?? false,
            images: uploadedImages.length ? uploadedImages : null,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning()

        if (!newPost) {
          throw new SpongInternalServerErrorException({
            success: false,
            message: 'Failed to create post',
          })
        }

        // Increment user's posts count
        await transaction
          .update(UserProfileSchema)
          .set({
            postsCount: sql`${UserProfileSchema.postsCount} + 1`,
          })
          .where(eq(UserProfileSchema.userId, userId))

        // 4.3 Create and attach hashtags only if provided
        if (hashtags.length > 0) {
          const hashtagRecords = await this.hashtagsService.findOrCreateMany(hashtags, transaction)

          const hashtagIds = hashtagRecords.map((hashtag) => hashtag.id)

          await this.postHashtagsService.attachMany(newPost.id, hashtagIds, transaction)

          // Increment hashtags posts count
          await this.hashtagsService.incrementPostsCount(hashtagIds, transaction)
        }

        // 4.4 Attach mentions only if provided
        if (mentions.length > 0) {
          await this.postMentionsService.attachMany(newPost.id, mentions, transaction)
        }

        // 4.5 Attach quote only if provided
        if (quotedPostId) {
          await this.postQuotesService.attach(newPost.id, quotedPostId, transaction)

          // Increment original post quotes count
          await transaction
            .update(PostSchema)
            .set({
              quotesCount: sql`${PostSchema.quotesCount} + 1`,
            })
            .where(eq(PostSchema.id, quotedPostId))
        }

        return newPost
      })

      const followers = await this.db
        .select({
          followerId: FollowSchema.followerId,
        })
        .from(FollowSchema)
        .where(eq(FollowSchema.followingId, userId))
      /**
       * Notifications are currently created concurrently using Promise.all.
       * If notification volume or database load increases, consider moving
       * notification processing to BullMQ for asynchronous, background execution.
       */
      await Promise.all(
        followers.map(({ followerId }) =>
          this.notificationsService.create({
            senderId: userId,
            receiverId: followerId,
            targetId: post.id,
            type: NotificationType.NEW_POST,
            message: `${user.firstName} ${user.lastName} published a new post.`,
            link: `/posts/${post.id}`,
          }),
        ),
      )

      return {
        success: true,
        message: 'Post created successfully',
        data: post,
      } as const
    } catch (error) {
      await Promise.allSettled(
        uploadedImages.map((image) => cloudinary.images.destroyImage(image.publicId)),
      )

      throw new SpongInternalServerErrorException(
        {
          success: false,
          message: 'Failed to create post',
        },
        { cause: error },
      )
    }
  }

  async findAll(userId: string, page = 1, limit = 10, offset = (page - 1) * limit) {
    const visibilityConditions = [eq(PostSchema.visibility, VisibilityStatus.PUBLIC)]

    if (userId) {
      visibilityConditions.push(
        eq(PostSchema.authorId, userId),
        and(eq(PostSchema.visibility, VisibilityStatus.FOLLOWERS), isNotNull(FollowSchema.id))!,
      )
    }

    const whereCondition = or(...visibilityConditions)

    const [posts, countResult] = await Promise.all([
      this.db
        .select({
          post: PostSchema,
          author: {
            id: UserSchema.id,
            username: UserSchema.username,
          },
          profile: UserProfileSchema,
          followers: {
            id: FollowSchema.id,
          },
        })
        .from(PostSchema)
        .leftJoin(UserSchema, eq(PostSchema.authorId, UserSchema.id))
        .leftJoin(UserProfileSchema, eq(UserSchema.id, UserProfileSchema.userId))
        .leftJoin(
          FollowSchema,
          and(eq(FollowSchema.followingId, UserSchema.id), eq(FollowSchema.followerId, userId)),
        )
        .where(whereCondition)
        .orderBy(desc(PostSchema.createdAt))
        .limit(limit)
        .offset(offset),

      this.db
        .select({ total: count() })
        .from(PostSchema)
        .leftJoin(UserSchema, eq(PostSchema.authorId, UserSchema.id))
        .leftJoin(
          FollowSchema,
          and(eq(FollowSchema.followingId, UserSchema.id), eq(FollowSchema.followerId, userId)),
        )
        .where(whereCondition),
    ])

    const total = countResult[0]?.total ?? 0

    return {
      success: true,
      posts,
      pagination: buildPagination(total, page, limit),
    }
  }

  async findMe(userId: string, page = 1, limit = 10, offset = (page - 1) * limit) {
    const [posts, countResult] = await Promise.all([
      this.db
        .select({
          post: PostSchema,
          author: {
            id: UserSchema.id,
            username: UserSchema.username,
          },
          profile: UserProfileSchema,
        })
        .from(PostSchema)
        .leftJoin(UserSchema, eq(PostSchema.authorId, UserSchema.id))
        .leftJoin(UserProfileSchema, eq(UserSchema.id, UserProfileSchema.userId))
        .where(eq(PostSchema.authorId, userId))
        .orderBy(desc(PostSchema.createdAt))
        .limit(limit)
        .offset(offset),

      this.db.select({ total: count() }).from(PostSchema).where(eq(PostSchema.authorId, userId)),
    ])

    const total = countResult[0]?.total ?? 0

    return {
      success: true,
      posts,
      pagination: buildPagination(total, page, limit),
    }
  }

  async findByUserId(
    targetUserId: string,
    currentUserId: string,
    page = 1,
    limit = 10,
    offset = (page - 1) * limit,
  ) {
    const [user] = await this.db
      .select({ id: UserSchema.id })
      .from(UserSchema)
      .where(eq(UserSchema.id, targetUserId))
      .limit(1)

    if (!user) {
      throw new SpongNotFoundException({
        success: false,
        message: 'User not found',
      })
    }

    const followedUserIds = currentUserId
      ? await this.db
          .select({ followingId: FollowSchema.followingId })
          .from(FollowSchema)
          .where(eq(FollowSchema.followerId, currentUserId))
          .then((rows) => rows.map((row) => row.followingId))
      : []

    const visibilityConditions =
      currentUserId === targetUserId
        ? [
            eq(PostSchema.visibility, VisibilityStatus.PUBLIC),
            eq(PostSchema.visibility, VisibilityStatus.FOLLOWERS),
            eq(PostSchema.visibility, VisibilityStatus.PRIVATE),
          ]
        : followedUserIds.includes(targetUserId)
          ? [
              eq(PostSchema.visibility, VisibilityStatus.PUBLIC),
              eq(PostSchema.visibility, VisibilityStatus.FOLLOWERS),
            ]
          : [eq(PostSchema.visibility, VisibilityStatus.PUBLIC)]

    const whereCondition = and(eq(PostSchema.authorId, targetUserId), or(...visibilityConditions))

    const [posts, countResult] = await Promise.all([
      this.db
        .select({
          post: PostSchema,
          author: {
            id: UserSchema.id,
            username: UserSchema.username,
          },
          profile: UserProfileSchema,
          followers: {
            id: FollowSchema.id,
          },
        })
        .from(PostSchema)
        .leftJoin(UserSchema, eq(PostSchema.authorId, UserSchema.id))
        .leftJoin(UserProfileSchema, eq(UserSchema.id, UserProfileSchema.userId))
        .leftJoin(
          FollowSchema,
          and(
            eq(FollowSchema.followingId, UserSchema.id),
            eq(FollowSchema.followerId, currentUserId),
          ),
        )
        .where(whereCondition)
        .orderBy(desc(PostSchema.createdAt))
        .limit(limit)
        .offset(offset),

      this.db.select({ total: count() }).from(PostSchema).where(whereCondition),
    ])

    const total = countResult[0]?.total ?? 0

    return {
      success: true,
      posts,
      pagination: buildPagination(total, page, limit),
    }
  }

  async findOne(postId: string, userId: string) {
    const [post] = await this.db
      .select({
        post: PostSchema,
        author: {
          id: UserSchema.id,
          username: UserSchema.username,
        },
        profile: UserProfileSchema,
      })
      .from(PostSchema)
      .leftJoin(UserSchema, eq(PostSchema.authorId, UserSchema.id))
      .leftJoin(UserProfileSchema, eq(UserSchema.id, UserProfileSchema.userId))
      .where(eq(PostSchema.id, postId))
      .limit(1)

    if (!post) {
      throw new SpongNotFoundException({
        success: false,
        message: 'Post not found',
      })
    }

    if (post.post.visibility === VisibilityStatus.PRIVATE && post.post.authorId !== userId) {
      throw new SpongNotFoundException({
        success: false,
        message: 'Post not found',
      })
    }

    if (post.post.visibility === VisibilityStatus.FOLLOWERS && post.post.authorId !== userId) {
      if (!userId) {
        throw new SpongNotFoundException({
          success: false,
          message: 'Post not found',
        })
      }

      const [follow] = await this.db
        .select({ id: FollowSchema.id })
        .from(FollowSchema)
        .where(
          and(
            eq(FollowSchema.followerId, userId),
            eq(FollowSchema.followingId, post.post.authorId),
          ),
        )
        .limit(1)

      if (!follow) {
        throw new SpongNotFoundException({
          success: false,
          message: 'Post not found',
        })
      }
    }

    return {
      success: true,
      data: post,
    } as const
  }

  async update(
    userId: string,
    postId: string,
    body: UpdatePostBody,
    formData: {
      get(name: string): string | File | null
      getAll(name: string): (string | File)[]
    },
  ) {
    const { content, visibility, isPin, mentions, hashtags } = body

    // 2. Extract images
    const imageFiles = formData
      .getAll('images')
      .filter((item): item is File => item instanceof File)

    // 3. Upload new images
    const uploadedImages: {
      url: string
      publicId: string
    }[] = []

    try {
      for (const image of imageFiles) {
        const result = await cloudinary.images.uploadImage(image, 'zentro/posts')

        uploadedImages.push({
          url: result.url,
          publicId: result.publicId,
        })
      }

      // 4. Update post and optional relations
      const post = await this.db.transaction(async (transaction) => {
        // 4.1 Find post and verify ownership
        const [existingPost] = await transaction
          .select()
          .from(PostSchema)
          .where(and(eq(PostSchema.id, postId), eq(PostSchema.authorId, userId)))
          .limit(1)

        if (!existingPost) {
          throw new SpongNotFoundException({
            success: false,
            message: 'Post not found',
          })
        }

        // 4.2 Preserve existing images and append new ones
        const currentImages = existingPost.images ?? []

        const updatedImages = [...currentImages, ...uploadedImages]

        // 4.3 Update basic post fields
        const [updatedPost] = await transaction
          .update(PostSchema)
          .set({
            ...(content !== undefined && { content }),
            ...(visibility !== undefined && { visibility }),
            ...(isPin !== undefined && { isPin }),
            ...(uploadedImages.length > 0 && {
              images: updatedImages,
            }),
            isEdited: true,
            updatedAt: new Date(),
          })
          .where(eq(PostSchema.id, postId))
          .returning()

        // 4.4 Sync hashtags only if provided
        if (hashtags !== undefined) {
          // Get current hashtag relations
          const currentHashtags = await this.postHashtagsService.findByPostId(postId, transaction)

          // Find or create new hashtags
          const hashtagRecords =
            hashtags.length > 0
              ? await this.hashtagsService.findOrCreateMany(hashtags, transaction)
              : []

          // Find removed hashtags
          const newHashtagIds = new Set(hashtagRecords.map((hashtag) => hashtag.id))

          const removedHashtagIds = currentHashtags
            .filter((item) => !newHashtagIds.has(item.hashtagId))
            .map((item) => item.hashtagId)

          // Remove old relations
          await this.postHashtagsService.detachAll(postId, transaction)

          // Decrement removed hashtags counters
          await this.hashtagsService.decrementPostsCount(removedHashtagIds, transaction)

          // Attach new relations
          if (hashtagRecords.length > 0) {
            await this.postHashtagsService.attachMany(
              postId,
              hashtagRecords.map((hashtag) => hashtag.id),
              transaction,
            )
          }
        }

        // 4.5 Attach mentions only if provided
        if (mentions !== undefined) {
          const invalidMentionIds = await this.postMentionsService.findInvalidMentionIds(
            mentions,
            transaction,
          )

          if (invalidMentionIds.length > 0) {
            throw new SpongUnprocessableEntityException({
              success: false,
              message: 'Some mentioned users do not exist',
              errors: {
                mentions: invalidMentionIds,
              },
            })
          }

          await this.postMentionsService.detachAll(postId, transaction)

          if (mentions.length > 0) {
            await this.postMentionsService.attachMany(postId, mentions, transaction)
          }
        }

        return updatedPost
      })

      return {
        success: true,
        message: 'Post updated successfully',
        data: post,
      } as const
    } catch (error) {
      // 5. Cleanup newly uploaded images if update fails
      await Promise.allSettled(
        uploadedImages.map((image) => cloudinary.images.destroyImage(image.publicId)),
      )

      throw new SpongInternalServerErrorException(
        {
          success: false,
          message: 'Failed to update post',
        },
        {
          cause: error,
        },
      )
    }
  }

  async delete(userId: string, postId: string) {
    try {
      // 1. Delete post and relations inside transaction
      const deletedPost = await this.db.transaction(async (transaction) => {
        // 1.1 Find post and verify ownership
        const [post] = await transaction
          .select()
          .from(PostSchema)
          .where(and(eq(PostSchema.id, postId), eq(PostSchema.authorId, userId)))
          .limit(1)

        if (!post) {
          throw new SpongNotFoundException({
            success: false,
            message: 'Post not found',
          })
        }

        // 2. Delete mentions
        await this.postMentionsService.detachAll(post.id, transaction)

        // 3. Delete hashtag relations
        await this.postHashtagsService.detachAll(post.id, transaction)

        // 4. Find quote relation if exists
        const quote = await this.postQuotesService.findByPostId(post.id, transaction)

        if (quote) {
          // Decrement original post quotes count
          await transaction
            .update(PostSchema)
            .set({
              quotesCount: sql`${PostSchema.quotesCount} - 1`,
            })
            .where(eq(PostSchema.id, quote.quotedPostId))

          // Delete quote relation
          await this.postQuotesService.detach(post.id, transaction)
        }

        // 5. Decrement user's posts count
        await transaction
          .update(UserProfileSchema)
          .set({
            postsCount: sql`${UserProfileSchema.postsCount} - 1`,
          })
          .where(eq(UserProfileSchema.userId, userId))

        // 6. Delete all reposts and decrement reposts count
        const deletedReposts = await this.postRepostsService.detachAll(post.id, transaction)

        if (deletedReposts > 0) {
          await transaction
            .update(PostSchema)
            .set({
              repostsCount: sql`${PostSchema.repostsCount} - ${deletedReposts}`,
            })
            .where(eq(PostSchema.id, post.id))
        }

        // 7. Delete post
        await transaction.delete(PostSchema).where(eq(PostSchema.id, post.id))

        return post
      })

      // 8. Delete images from Cloudinary after successful transaction
      const images = deletedPost.images ?? []

      await Promise.allSettled(
        images.map((image) => cloudinary.images.destroyImage(image.publicId)),
      )

      return {
        success: true,
        message: 'Post deleted successfully',
      } as const
    } catch (error) {
      throw new SpongInternalServerErrorException(
        {
          success: false,
          message: 'Failed to delete post',
        },
        {
          cause: error,
        },
      )
    }
  }
}
