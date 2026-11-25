import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { Database } from '../../../config/db/drizzle'
import { ConversationsController } from '../conversations.controller'

type Outcome = { value: unknown } | { error: Error }

class QueryChain implements PromiseLike<unknown> {
  constructor(private readonly resolveValue: () => unknown) {}

  from = mock(() => this)
  where = mock(() => this)
  limit = mock(() => this)
  orderBy = mock(() => this)
  leftJoin = mock(() => this)
  set = mock(() => this)

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
  update = mock(() => this.createChain())

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

  const controller = new ConversationsController({ connection: db } as unknown as Database)

  return { db, controller }
}

const makeRequest = (options?: {
  userId?: string
  params?: Record<string, string | undefined>
}) => ({
  user: options?.userId ? { id: options.userId } : undefined,
  params: options?.params ?? {},
})

// findMe replies with reply.OK, while findOne and mute reply with reply.json
const makeResponse = () => ({
  json: mock((data: unknown) => data),
  OK: mock((data: unknown) => data),
  BadRequest: mock((data: unknown) => data),
  NotFound: mock((data: unknown) => data),
})

const now = new Date()

const conversation = {
  id: 'conversation-id',
  senderId: 'sender-id',
  receiverId: 'receiver-id',
  lastMessage: 'Hello',
  lastMessageSenderId: 'sender-id',
  isMutedBySender: false,
  isMutedByReceiver: false,
  createdAt: now,
  updatedAt: now,
}

const conversationWithUsers = {
  ...conversation,
  senderUserId: 'sender-id',
  senderFirstName: 'John',
  senderLastName: 'Doe',
  senderUsername: 'john',
  senderAvatar: 'sender-avatar.png',
  receiverUserId: 'receiver-id',
  receiverFirstName: 'Jane',
  receiverLastName: 'Smith',
  receiverUsername: 'jane',
  receiverAvatar: 'receiver-avatar.png',
}

describe('ConversationsController', () => {
  beforeEach(() => {
    mock.restore()
  })

  describe('findMe', () => {
    test('should return the user conversations with sender and receiver data', async () => {
      const { controller, db } = makeDependencies()
      const Req = makeRequest({ userId: 'sender-id' })
      const Res = makeResponse()

      db.setOutcomes([rows([conversationWithUsers])])

      await controller.findMe(Req as never, Res as never)

      expect(db.select).toHaveBeenCalledTimes(1)

      expect(Res.OK).toHaveBeenCalledWith({
        success: true,
        data: [
          {
            ...conversation,
            sender: {
              id: 'sender-id',
              firstName: 'John',
              lastName: 'Doe',
              username: 'john',
              profile: {
                avatar: 'sender-avatar.png',
              },
            },
            receiver: {
              id: 'receiver-id',
              firstName: 'Jane',
              lastName: 'Smith',
              username: 'jane',
              profile: {
                avatar: 'receiver-avatar.png',
              },
            },
          },
        ],
      })
    })

    test('should return an empty array when user has no conversations', async () => {
      const { controller, db } = makeDependencies()
      const Req = makeRequest({ userId: 'user-id' })
      const Res = makeResponse()

      db.setOutcomes([rows([])])

      await controller.findMe(Req as never, Res as never)

      expect(Res.OK).toHaveBeenCalledWith({
        success: true,
        data: [],
      })
    })

    test('should return null sender and receiver when joined users do not exist', async () => {
      const { controller, db } = makeDependencies()
      const Req = makeRequest({ userId: 'user-id' })
      const Res = makeResponse()

      db.setOutcomes([
        rows([
          {
            ...conversation,
            senderUserId: null,
            senderFirstName: null,
            senderLastName: null,
            senderUsername: null,
            senderAvatar: null,
            receiverUserId: null,
            receiverFirstName: null,
            receiverLastName: null,
            receiverUsername: null,
            receiverAvatar: null,
          },
        ]),
      ])

      await controller.findMe(Req as never, Res as never)

      expect(Res.OK).toHaveBeenCalledWith({
        success: true,
        data: [
          {
            ...conversation,
            sender: null,
            receiver: null,
          },
        ],
      })
    })

    test('should return null profiles when avatars are null', async () => {
      const { controller, db } = makeDependencies()
      const Req = makeRequest({ userId: 'sender-id' })
      const Res = makeResponse()

      db.setOutcomes([
        rows([
          {
            ...conversationWithUsers,
            senderAvatar: null,
            receiverAvatar: null,
          },
        ]),
      ])

      await controller.findMe(Req as never, Res as never)

      expect(Res.OK).toHaveBeenCalledWith({
        success: true,
        data: [
          {
            ...conversation,
            sender: {
              id: 'sender-id',
              firstName: 'John',
              lastName: 'Doe',
              username: 'john',
              profile: null,
            },
            receiver: {
              id: 'receiver-id',
              firstName: 'Jane',
              lastName: 'Smith',
              username: 'jane',
              profile: null,
            },
          },
        ],
      })
    })

    test('should propagate database errors', async () => {
      const { controller, db } = makeDependencies()
      const Req = makeRequest({ userId: 'user-id' })
      const Res = makeResponse()

      db.setOutcomes([failing(new Error('Database error'))])

      await expect(controller.findMe(Req as never, Res as never)).rejects.toThrow('Database error')
    })
  })

  describe('findOne', () => {
    test('should return bad request when conversationId is missing', async () => {
      const { controller, db } = makeDependencies()
      const Req = makeRequest({ userId: 'user-id' })
      const Res = makeResponse()

      await controller.findOne(Req as never, Res as never)

      expect(Res.BadRequest).toHaveBeenCalledWith({
        success: false,
        message: 'Conversation ID is required',
      })

      expect(db.select).not.toHaveBeenCalled()
    })

    test('should return not found when conversation does not exist', async () => {
      const { controller, db } = makeDependencies()
      const Req = makeRequest({
        userId: 'user-id',
        params: {
          conversationId: 'missing-conversation',
        },
      })
      const Res = makeResponse()

      db.setOutcomes([rows([])])

      await controller.findOne(Req as never, Res as never)

      expect(Res.NotFound).toHaveBeenCalledWith({
        success: false,
        message: 'Conversation not found',
      })
    })

    test('should return conversation with sender and receiver details', async () => {
      const { controller, db } = makeDependencies()
      const Req = makeRequest({
        userId: 'sender-id',
        params: {
          conversationId: 'conversation-id',
        },
      })
      const Res = makeResponse()

      db.setOutcomes([rows([conversationWithUsers])])

      await controller.findOne(Req as never, Res as never)

      expect(Res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          ...conversation,
          sender: {
            id: 'sender-id',
            firstName: 'John',
            lastName: 'Doe',
            username: 'john',
            profile: {
              avatar: 'sender-avatar.png',
            },
          },
          receiver: {
            id: 'receiver-id',
            firstName: 'Jane',
            lastName: 'Smith',
            username: 'jane',
            profile: {
              avatar: 'receiver-avatar.png',
            },
          },
        },
      })
    })

    test('should return null sender and receiver when joined users do not exist', async () => {
      const { controller, db } = makeDependencies()
      const Req = makeRequest({
        userId: 'user-id',
        params: {
          conversationId: 'conversation-id',
        },
      })
      const Res = makeResponse()

      db.setOutcomes([
        rows([
          {
            ...conversation,
            senderUserId: null,
            senderFirstName: null,
            senderLastName: null,
            senderUsername: null,
            senderAvatar: null,
            receiverUserId: null,
            receiverFirstName: null,
            receiverLastName: null,
            receiverUsername: null,
            receiverAvatar: null,
          },
        ]),
      ])

      await controller.findOne(Req as never, Res as never)

      expect(Res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          ...conversation,
          sender: null,
          receiver: null,
        },
      })
    })

    test('should return null profiles when avatars are null', async () => {
      const { controller, db } = makeDependencies()
      const Req = makeRequest({
        userId: 'sender-id',
        params: {
          conversationId: 'conversation-id',
        },
      })
      const Res = makeResponse()

      db.setOutcomes([
        rows([
          {
            ...conversationWithUsers,
            senderAvatar: null,
            receiverAvatar: null,
          },
        ]),
      ])

      await controller.findOne(Req as never, Res as never)

      expect(Res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          ...conversation,
          sender: {
            id: 'sender-id',
            firstName: 'John',
            lastName: 'Doe',
            username: 'john',
            profile: null,
          },
          receiver: {
            id: 'receiver-id',
            firstName: 'Jane',
            lastName: 'Smith',
            username: 'jane',
            profile: null,
          },
        },
      })
    })

    test('should propagate database errors', async () => {
      const { controller, db } = makeDependencies()
      const Req = makeRequest({
        userId: 'user-id',
        params: {
          conversationId: 'conversation-id',
        },
      })
      const Res = makeResponse()

      db.setOutcomes([failing(new Error('Database error'))])

      await expect(controller.findOne(Req as never, Res as never)).rejects.toThrow('Database error')
    })
  })

  describe('mute', () => {
    test('should return bad request when conversation id is missing', async () => {
      const { controller, db } = makeDependencies()
      const Req = makeRequest({
        userId: 'sender-id',
      })
      const Res = makeResponse()

      await controller.mute(Req as never, Res as never)

      expect(Res.BadRequest).toHaveBeenCalledWith({
        success: false,
        message: 'Conversation ID is required',
      })

      expect(db.select).not.toHaveBeenCalled()
    })

    test('should return not found when conversation does not exist', async () => {
      const { controller, db } = makeDependencies()
      const Req = makeRequest({
        userId: 'sender-id',
        params: {
          id: 'missing-conversation',
        },
      })
      const Res = makeResponse()

      db.setOutcomes([rows([])])

      await controller.mute(Req as never, Res as never)

      expect(Res.NotFound).toHaveBeenCalledWith({
        success: false,
        message: 'Conversation not found',
      })

      expect(db.update).not.toHaveBeenCalled()
    })

    test('should mute conversation for sender', async () => {
      const { controller, db } = makeDependencies()
      const Req = makeRequest({
        userId: 'sender-id',
        params: {
          id: 'conversation-id',
        },
      })
      const Res = makeResponse()

      db.setOutcomes([rows([conversation]), rows([])])

      await controller.mute(Req as never, Res as never)

      expect(db.update).toHaveBeenCalledTimes(1)

      expect(Res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Conversation muted successfully',
        data: {
          isMuted: true,
        },
      })
    })

    test('should unmute conversation for sender', async () => {
      const { controller, db } = makeDependencies()
      const Req = makeRequest({
        userId: 'sender-id',
        params: {
          id: 'conversation-id',
        },
      })
      const Res = makeResponse()

      db.setOutcomes([
        rows([
          {
            ...conversation,
            isMutedBySender: true,
          },
        ]),
        rows([]),
      ])

      await controller.mute(Req as never, Res as never)

      expect(Res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Conversation unmuted successfully',
        data: {
          isMuted: false,
        },
      })
    })

    test('should mute conversation for receiver', async () => {
      const { controller, db } = makeDependencies()
      const Req = makeRequest({
        userId: 'receiver-id',
        params: {
          id: 'conversation-id',
        },
      })
      const Res = makeResponse()

      db.setOutcomes([rows([conversation]), rows([])])

      await controller.mute(Req as never, Res as never)

      expect(Res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Conversation muted successfully',
        data: {
          isMuted: true,
        },
      })
    })

    test('should unmute conversation for receiver', async () => {
      const { controller, db } = makeDependencies()
      const Req = makeRequest({
        userId: 'receiver-id',
        params: {
          id: 'conversation-id',
        },
      })
      const Res = makeResponse()

      db.setOutcomes([
        rows([
          {
            ...conversation,
            isMutedByReceiver: true,
          },
        ]),
        rows([]),
      ])

      await controller.mute(Req as never, Res as never)

      expect(Res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Conversation unmuted successfully',
        data: {
          isMuted: false,
        },
      })
    })

    test('should propagate database errors when fetching conversation', async () => {
      const { controller, db } = makeDependencies()
      const Req = makeRequest({
        userId: 'sender-id',
        params: {
          id: 'conversation-id',
        },
      })
      const Res = makeResponse()

      db.setOutcomes([failing(new Error('Database error'))])

      await expect(controller.mute(Req as never, Res as never)).rejects.toThrow('Database error')
    })

    test('should propagate database errors when updating conversation', async () => {
      const { controller, db } = makeDependencies()
      const Req = makeRequest({
        userId: 'sender-id',
        params: {
          id: 'conversation-id',
        },
      })
      const Res = makeResponse()

      db.setOutcomes([rows([conversation]), failing(new Error('Update failed'))])

      await expect(controller.mute(Req as never, Res as never)).rejects.toThrow('Update failed')
    })
  })
})
