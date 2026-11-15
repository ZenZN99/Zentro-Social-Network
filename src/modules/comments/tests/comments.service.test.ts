import { describe, expect, mock, test } from 'bun:test'
import type { NotificationsService } from '../../notifications/notifications.service'
import type { database } from '../../../config/db/drizzle'
import { NotificationType } from '../../notifications/schemas/enums/notification-type'
import { CommentsService } from '../comments.service'

type Outcome = { value: unknown } | { error: Error }

class QueryChain implements PromiseLike<unknown> {
  constructor(private readonly resolveValue: () => unknown) {}

  from = mock(() => this)
  where = mock(() => this)
  limit = mock(() => this)
  offset = mock(() => this)
  orderBy = mock(() => this)
  leftJoin = mock(() => this)
  values = mock(() => this)
  set = mock(() => this)
  returning = mock(() => this)

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve()
      .then(() => this.resolveValue())
      .then(onfulfilled ?? undefined, onrejected ?? undefined)
  }
}

class FakeDb {
  private outcomes: Outcome[] = []

  select = mock(() => this.createChain())
  insert = mock(() => this.createChain())
  update = mock(() => this.createChain())
  delete = mock(() => this.createChain())

  transaction = mock(async (callback: (transaction: FakeDb) => Promise<unknown>) => callback(this))

  setOutcomes(outcomes: Outcome[]) {
    this.outcomes = [...outcomes]
  }

  private createChain() {
    return new QueryChain(() => {
      const outcome = this.outcomes.shift()

      if (!outcome) {
        throw new Error('No mock outcome available')
      }

      if ('error' in outcome) {
        throw outcome.error
      }

      return outcome.value
    })
  }
}

const rows = (value: unknown): Outcome => ({ value })
const failing = (error: Error): Outcome => ({ error })

const makeDependencies = () => {
  const db = new FakeDb()

  const notificationsService = {
    create: mock(async () => undefined),
  } as unknown as NotificationsService

  const service = new CommentsService(db as unknown as typeof database, notificationsService)

  return {
    db,
    service,
    notificationsService,
  }
}

const post = {
  id: 'post-id',
  authorId: 'post-author-id',
}

const user = {
  id: 'user-id',
  firstName: 'John',
  lastName: 'Doe',
}

const comment = {
  id: 'comment-id',
  userId: 'user-id',
  postId: 'post-id',
  content: 'Test comment',
  isEdited: false,
  likesCount: 0,
  repliesCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const captureRejection = async (promise: Promise<unknown>) => {
  try {
    await promise
    return null
  } catch (error) {
    return error
  }
}

describe('CommentsService', () => {
  describe('create', () => {
    test('should create a comment and increment counters', async () => {
      const { service, db, notificationsService } = makeDependencies()

      const createdComment = {
        ...comment,
        content: 'New comment',
      }

      db.setOutcomes([
        rows([post]), // 1. Find post
        rows([createdComment]), // 2. Insert comment (returning)
        rows([]), // 3. Update post commentsCount
        rows([]), // 4. Update user profile commentsCount
        rows([user]), // 5. Find commenter (for notification, outside transaction)
      ])

      const result = await service.create('user-id', 'post-id', 'New comment')

      expect(result).toEqual({
        success: true,
        message: 'Comment created successfully',
        data: createdComment,
      })

      expect(db.transaction).toHaveBeenCalledTimes(1)
      expect(db.insert).toHaveBeenCalledTimes(1)
      expect(db.update).toHaveBeenCalledTimes(2)

      expect(notificationsService.create).toHaveBeenCalledWith({
        senderId: user.id,
        receiverId: post.authorId,
        targetId: post.id,
        type: NotificationType.COMMENT,
        message: 'John Doe commented on your post.',
        link: '/posts/post-id',
        isRead: false,
      })
    })

    test('should throw when post does not exist', async () => {
      const { service, db } = makeDependencies()

      db.setOutcomes([rows([])])

      const error = await captureRejection(service.create('user-id', 'missing-post', 'Comment'))

      expect(error).toBeDefined()
      expect(error).not.toBeNull()
      expect(db.insert).not.toHaveBeenCalled()
      expect(db.update).not.toHaveBeenCalled()
    })

    test('should not create notification when user comments on own post', async () => {
      const { service, db, notificationsService } = makeDependencies()

      db.setOutcomes([
        rows([{ ...post, authorId: 'user-id' }]), // 1. Find post
        rows([comment]), // 2. Insert comment
        rows([]), // 3. Update post count
        rows([]), // 4. Update user count
      ])

      const result = await service.create('user-id', 'post-id', 'My comment')

      expect(result.success).toBe(true)
      expect(notificationsService.create).not.toHaveBeenCalled()
    })

    test('should not create notification when commenter does not exist', async () => {
      const { service, db, notificationsService } = makeDependencies()

      db.setOutcomes([
        rows([post]), // 1. Find post
        rows([comment]), // 2. Insert comment
        rows([]), // 3. Update post count
        rows([]), // 4. Update user count
        rows([]), // 5. Commenter not found
      ])

      const result = await service.create('user-id', 'post-id', 'Comment')

      expect(result.success).toBe(true)
      expect(notificationsService.create).not.toHaveBeenCalled()
    })

    test('should not fail when notification creation fails', async () => {
      const { service, db, notificationsService } = makeDependencies()

      notificationsService.create = mock(async () => {
        throw new Error('Notification failed')
      })

      db.setOutcomes([rows([post]), rows([comment]), rows([]), rows([]), rows([user])])

      const result = await service.create('user-id', 'post-id', 'Comment')

      expect(result.success).toBe(true)
      expect(notificationsService.create).toHaveBeenCalledTimes(1)
    })

    test('should propagate transaction errors', async () => {
      const { service, db } = makeDependencies()

      db.setOutcomes([failing(new Error('Database transaction failed'))])

      const error = await captureRejection(service.create('user-id', 'post-id', 'Comment'))

      expect(error).toBeDefined()
      expect((error as Error).message).toBe('Database transaction failed')
    })
  })

  describe('findAll', () => {
    test('should return comments with pagination', async () => {
      const { service, db } = makeDependencies()

      const comments = [
        {
          comment,
          user: {
            id: 'user-id',
            username: 'john',
          },
          profile: null,
        },
      ]

      db.setOutcomes([rows([post]), rows(comments), rows([{ total: 25 }])])

      const result = await service.findAll('post-id', 2, 10, 10)

      expect(result).toEqual({
        success: true,
        data: comments,
        pagination: expect.any(Object),
      })
    })

    test('should use default pagination arguments', async () => {
      const { service, db } = makeDependencies()

      db.setOutcomes([rows([post]), rows([]), rows([{ total: 0 }])])

      const result = await service.findAll('post-id')

      expect(result.success).toBe(true)
      expect(result.data).toEqual([])
      expect(result.pagination).toBeDefined()
    })

    test('should throw when post does not exist', async () => {
      const { service, db } = makeDependencies()

      db.setOutcomes([rows([])])

      const error = await captureRejection(service.findAll('missing-post'))

      expect(error).toBeDefined()
      expect(error).not.toBeNull()
    })

    test('should return empty comments when no comments exist', async () => {
      const { service, db } = makeDependencies()

      db.setOutcomes([rows([post]), rows([]), rows([{ total: 0 }])])

      const result = await service.findAll('post-id')

      expect(result.success).toBe(true)
      expect(result.data).toEqual([])
    })

    test('should return zero total when count query returns no rows', async () => {
      const { service, db } = makeDependencies()

      db.setOutcomes([rows([post]), rows([]), rows([])])

      const result = await service.findAll('post-id')

      expect(result.success).toBe(true)
      expect(result.data).toEqual([])
      expect(result.pagination).toBeDefined()
    })
  })

  describe('findMe', () => {
    test('should return user comments with pagination', async () => {
      const { service, db } = makeDependencies()

      const comments = [
        {
          comment,
          user: {
            id: 'user-id',
            username: 'john',
          },
          profile: null,
        },
      ]

      db.setOutcomes([rows(comments), rows([{ total: 12 }])])

      const result = await service.findMe('user-id', 2, 5, 5)

      expect(result).toEqual({
        success: true,
        data: comments,
        pagination: expect.any(Object),
      })
    })

    test('should use default pagination arguments', async () => {
      const { service, db } = makeDependencies()

      db.setOutcomes([rows([]), rows([{ total: 0 }])])

      const result = await service.findMe('user-id')

      expect(result.success).toBe(true)
      expect(result.data).toEqual([])
      expect(result.pagination).toBeDefined()
    })

    test('should return zero total when count query returns no rows', async () => {
      const { service, db } = makeDependencies()

      db.setOutcomes([rows([]), rows([])])

      const result = await service.findMe('user-id')

      expect(result.success).toBe(true)
      expect(result.data).toEqual([])
      expect(result.pagination).toBeDefined()
    })
  })

  describe('findOne', () => {
    test('should return comment with user and profile', async () => {
      const { service, db } = makeDependencies()

      const resultData = {
        comment,
        user: {
          id: 'user-id',
          username: 'john',
        },
        profile: null,
      }

      db.setOutcomes([rows([resultData])])

      const result = await service.findOne('comment-id')

      expect(result).toEqual({
        success: true,
        data: resultData,
      })
    })

    test('should throw when comment does not exist', async () => {
      const { service, db } = makeDependencies()

      db.setOutcomes([rows([])])

      const error = await captureRejection(service.findOne('missing-comment'))

      expect(error).toBeDefined()
      expect(error).not.toBeNull()
    })
  })

  describe('update', () => {
    test('should update comment content', async () => {
      const { service, db } = makeDependencies()

      const updatedComment = {
        ...comment,
        content: 'Updated comment',
        isEdited: true,
      }

      db.setOutcomes([rows([comment]), rows([updatedComment])])

      const result = await service.update('user-id', 'comment-id', 'Updated comment')

      expect(result).toEqual({
        success: true,
        message: 'Comment updated successfully',
        data: updatedComment,
      })

      expect(db.update).toHaveBeenCalledTimes(1)
    })

    test('should throw when comment does not exist', async () => {
      const { service, db } = makeDependencies()

      db.setOutcomes([rows([])])

      const error = await captureRejection(service.update('user-id', 'missing-comment', 'Updated'))

      expect(error).toBeDefined()
      expect(error).not.toBeNull()
      expect(db.update).not.toHaveBeenCalled()
    })

    test('should throw when user does not own comment', async () => {
      const { service, db } = makeDependencies()

      db.setOutcomes([rows([comment])])

      const error = await captureRejection(service.update('another-user', 'comment-id', 'Updated'))

      expect(error).toBeDefined()
      expect(error).not.toBeNull()
      expect(db.update).not.toHaveBeenCalled()
    })

    test('should propagate database errors when fetching comment', async () => {
      const { service, db } = makeDependencies()

      db.setOutcomes([failing(new Error('Database error'))])

      const error = await captureRejection(service.update('user-id', 'comment-id', 'Updated'))

      expect(error).toBeDefined()
      expect((error as Error).message).toBe('Database error')
    })

    test('should propagate database errors when updating comment', async () => {
      const { service, db } = makeDependencies()

      db.setOutcomes([rows([comment]), failing(new Error('Update failed'))])

      const error = await captureRejection(service.update('user-id', 'comment-id', 'Updated'))

      expect(error).toBeDefined()
      expect((error as Error).message).toBe('Update failed')
    })
  })

  describe('delete', () => {
    test('should delete comment and all replies and update counters', async () => {
      const { service, db } = makeDependencies()

      const replies = [
        { id: 'reply-1', userId: 'user-a' },
        { id: 'reply-2', userId: 'user-a' },
        { id: 'reply-3', userId: 'user-b' },
      ]

      db.setOutcomes([
        rows([comment]), // 1. Find comment
        rows(replies), // 2. Find replies
        rows([]), // 3. Delete replies
        rows([]), // 4. Decrement repliesCount for user-a
        rows([]), // 5. Decrement repliesCount for user-b
        rows([]), // 6. Delete comment
        rows([]), // 7. Decrement post commentsCount
        rows([]), // 8. Decrement comment owner's commentsCount
      ])

      const result = await service.delete('user-id', 'comment-id')

      expect(result).toEqual({
        success: true,
        message: 'Comment and all its replies deleted successfully',
      })

      expect(db.transaction).toHaveBeenCalledTimes(1)
      expect(db.delete).toHaveBeenCalledTimes(2)
      // 2 reply-user updates + post update + comment owner update
      expect(db.update).toHaveBeenCalledTimes(4)
    })

    test('should delete comment without reply counter updates when no replies exist', async () => {
      const { service, db } = makeDependencies()

      db.setOutcomes([
        rows([comment]), // 1. Find comment
        rows([]), // 2. Find replies (none)
        rows([]), // 3. Delete replies
        rows([]), // 4. Delete comment
        rows([]), // 5. Decrement post commentsCount
        rows([]), // 6. Decrement comment owner's commentsCount
      ])

      const result = await service.delete('user-id', 'comment-id')

      expect(result.success).toBe(true)
      expect(db.delete).toHaveBeenCalledTimes(2)
      expect(db.update).toHaveBeenCalledTimes(2)
    })

    test('should throw when comment does not exist', async () => {
      const { service, db } = makeDependencies()

      db.setOutcomes([rows([])])

      const error = await captureRejection(service.delete('user-id', 'missing-comment'))

      expect(error).toBeDefined()
      expect(error).not.toBeNull()
      expect(db.delete).not.toHaveBeenCalled()
    })

    test('should throw when user does not own comment', async () => {
      const { service, db } = makeDependencies()

      db.setOutcomes([rows([comment])])

      const error = await captureRejection(service.delete('another-user', 'comment-id'))

      expect(error).toBeDefined()
      expect(error).not.toBeNull()
      expect(db.delete).not.toHaveBeenCalled()
    })

    test('should propagate transaction errors', async () => {
      const { service, db } = makeDependencies()

      db.setOutcomes([failing(new Error('Transaction failed'))])

      const error = await captureRejection(service.delete('user-id', 'comment-id'))

      expect(error).toBeDefined()
      expect((error as Error).message).toBe('Transaction failed')
    })

    test('should propagate errors when fetching replies', async () => {
      const { service, db } = makeDependencies()

      db.setOutcomes([rows([comment]), failing(new Error('Replies query failed'))])

      const error = await captureRejection(service.delete('user-id', 'comment-id'))

      expect(error).toBeDefined()
      expect((error as Error).message).toBe('Replies query failed')
    })
  })
})
