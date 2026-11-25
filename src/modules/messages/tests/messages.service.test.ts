import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from 'lykosjs'
import type { Database, database } from '../../../config/db/drizzle'
import type { MessagesService as MessagesServiceType } from '../messages.service'
import type { MessagesGateway } from '../../../config/gateways/messages.gateway'
import type { NotificationsService } from '../../notifications/notifications.service'
import { NotificationType } from '../../notifications/schemas/enums/notification-type'
import type { FormDataEntryValue } from 'bun'

/* -------------------------------------------------------------------------- */
/* Cloudinary Mock                                                            */
/* -------------------------------------------------------------------------- */

const uploadImage = mock(async (_file: File, _folder: string) => ({
  url: 'https://res.cloudinary.com/test/image.jpg',
  publicId: 'zentro/messages/test-image',
}))

const uploadFile = mock(async (_file: File, _folder: string) => ({
  url: 'https://res.cloudinary.com/test/file.pdf',
  publicId: 'zentro/messages/test-file',
}))

const destroyImage = mock(async (_publicId: string) => ({
  result: 'ok',
}))

const destroyFile = mock(async (_publicId: string) => ({
  result: 'ok',
}))

const cloudinaryMock = {
  images: {
    uploadImage,
    destroyImage,
  },
  files: {
    uploadFile,
    destroyFile,
  },
}

mock.module('../../../config/cloudinary/cloudinary', () => ({
  default: cloudinaryMock,
}))

const { MessagesService } = await import('../messages.service')

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const USER_ID = 'USER_1'
const OTHER_USER_ID = 'USER_2'
const THIRD_USER_ID = 'USER_3'

const CONVERSATION_ID = 'CONVERSATION_1'
const MESSAGE_ID = 'MESSAGE_1'

const dialect = new PgDialect()

type Outcome = { value: unknown } | { error: Error }

/* -------------------------------------------------------------------------- */
/* Query Chain                                                                */
/* -------------------------------------------------------------------------- */

class QueryChain implements PromiseLike<unknown> {
  outcome: Outcome = { value: [] }

  from = mock((_table?: unknown) => this)
  leftJoin = mock((_table?: unknown, _condition?: unknown) => this)
  innerJoin = mock((_table?: unknown, _condition?: unknown) => this)
  where = mock((_condition?: unknown) => this)
  orderBy = mock((..._args: unknown[]) => this)
  limit = mock((_value?: number) => this)
  values = mock((_value?: unknown) => this)
  set = mock((_value?: unknown) => this)
  returning = mock((_value?: unknown) => this)

  rows(value: unknown): this {
    this.outcome = { value }
    return this
  }

  failing(error: Error): this {
    this.outcome = { error }
    return this
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    if ('error' in this.outcome) {
      return Promise.reject(this.outcome.error).then(onfulfilled, onrejected)
    }

    return Promise.resolve(this.outcome.value).then(onfulfilled, onrejected)
  }
}

/* -------------------------------------------------------------------------- */
/* Fake Database                                                              */
/* -------------------------------------------------------------------------- */

type FakeDb = {
  selectQueue: QueryChain[]
  insertQueue: QueryChain[]
  updateQueue: QueryChain[]
  deleteQueue: QueryChain[]
  select: ReturnType<typeof mock>
  insert: ReturnType<typeof mock>
  update: ReturnType<typeof mock>
  delete: ReturnType<typeof mock>
  transaction: ReturnType<typeof mock>
}

const createFakeDb = (transactionDb?: FakeDb): FakeDb => {
  const db: FakeDb = {
    selectQueue: [],
    insertQueue: [],
    updateQueue: [],
    deleteQueue: [],

    select: mock(() => db.selectQueue.shift() ?? new QueryChain()),
    insert: mock(() => db.insertQueue.shift() ?? new QueryChain()),
    update: mock(() => db.updateQueue.shift() ?? new QueryChain()),
    delete: mock(() => db.deleteQueue.shift() ?? new QueryChain()),

    transaction: mock(async (callback: (tx: FakeDb) => Promise<unknown>) => {
      return callback(transactionDb ?? db)
    }),
  }

  return db
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const rows = (value: unknown): QueryChain => new QueryChain().rows(value)

const failing = (error: Error): QueryChain => new QueryChain().failing(error)

const whereParams = (chain: QueryChain): unknown[] => {
  const condition = chain.where.mock.calls[0]?.[0] as SQL | undefined

  if (!condition) return []

  return dialect.sqlToQuery(condition).params
}

const whereSql = (chain: QueryChain): string => {
  const condition = chain.where.mock.calls[0]?.[0] as SQL | undefined

  if (!condition) return ''

  return dialect.sqlToQuery(condition).sql
}

const captureRejection = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise
    return undefined
  } catch (error) {
    return error
  }
}

const makeConversation = (overrides: Record<string, unknown> = {}) => ({
  id: CONVERSATION_ID,
  senderId: USER_ID,
  receiverId: OTHER_USER_ID,
  lastMessage: 'Hello',
  lastMessageSenderId: USER_ID,
  isMutedBySender: false,
  isMutedByReceiver: false,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...overrides,
})

const makeMessage = (overrides: Record<string, unknown> = {}) => ({
  id: MESSAGE_ID,
  userId: USER_ID,
  conversationId: CONVERSATION_ID,
  content: 'Hello',
  attachments: [],
  isRead: false,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...overrides,
})

const makeJoinedMessage = (overrides: Record<string, unknown> = {}) => ({
  ...makeMessage(),

  userFirstName: 'Zen',
  userLastName: 'Allaham',
  userUsername: 'zen',
  userAvatar: null,

  conversationSenderId: USER_ID,
  conversationReceiverId: OTHER_USER_ID,
  conversationLastMessage: 'Hello',
  conversationLastMessageSenderId: USER_ID,
  conversationIsMutedBySender: false,
  conversationIsMutedByReceiver: false,
  conversationCreatedAt: new Date('2026-01-01'),
  conversationUpdatedAt: new Date('2026-01-01'),

  ...overrides,
})

const makeFormData = (content: string | File | null = 'Hello', files: (string | File)[] = []) => ({
  get: mock((_name: string) => content),
  getAll: mock((name: string) => (name === 'files' ? files : [])),
})

const makeFile = (name = 'test.jpg', type = 'image/jpeg'): File =>
  new File(['test content'], name, { type })

const makeDependencies = () => ({
  messageGateway: {
    sendMessage: mock((_payload: unknown) => undefined),
    sendMessageDeleted: mock((_payload: unknown) => undefined),
  },

  notificationsService: {
    create: mock(async (_payload: unknown) => ({
      success: true,
    })),
  },
})

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

let db: FakeDb
let tx: FakeDb
let dependencies: ReturnType<typeof makeDependencies>
let service: MessagesServiceType

beforeEach(() => {
  uploadImage.mockReset()
  uploadFile.mockReset()
  destroyImage.mockReset()
  destroyFile.mockReset()

  uploadImage.mockImplementation(async () => ({
    url: 'https://res.cloudinary.com/test/image.jpg',
    publicId: 'zentro/messages/test-image',
  }))

  uploadFile.mockImplementation(async () => ({
    url: 'https://res.cloudinary.com/test/file.pdf',
    publicId: 'zentro/messages/test-file',
  }))

  destroyImage.mockImplementation(async () => ({
    result: 'ok',
  }))

  destroyFile.mockImplementation(async () => ({
    result: 'ok',
  }))

  tx = createFakeDb()
  db = createFakeDb(tx)
  dependencies = makeDependencies()

  service = new MessagesService(
    { connection: db } as unknown as Database,
    dependencies.messageGateway as unknown as MessagesGateway,
    dependencies.notificationsService as unknown as NotificationsService,
  )
})

/* -------------------------------------------------------------------------- */
/* create                                                                     */
/* -------------------------------------------------------------------------- */

describe('MessagesService.create', () => {
  const prepareCreate = (options?: {
    conversation?: Record<string, unknown> | null
    joinedMessage?: Record<string, unknown>
    message?: Record<string, unknown>
  }) => {
    const conversation =
      options?.conversation === undefined ? makeConversation() : options.conversation

    db.selectQueue.push(rows([{ id: OTHER_USER_ID }]))

    tx.selectQueue.push(
      rows(conversation ? [conversation] : []),
      rows([options?.joinedMessage ?? makeJoinedMessage()]),
    )

    if (conversation) {
      tx.updateQueue.push(rows([conversation]))
    } else {
      tx.insertQueue.push(rows([makeConversation()]))
    }

    tx.insertQueue.push(rows([options?.message ?? makeMessage()]))
  }

  test('creates a message successfully in an existing conversation', async () => {
    prepareCreate()

    const result = await service.create(USER_ID, OTHER_USER_ID, makeFormData('Hello'))

    expect(result).toMatchObject({
      success: true,
      message: 'Message sent successfully',
      data: {
        id: MESSAGE_ID,
        content: 'Hello',
        user: {
          firstName: 'Zen',
          lastName: 'Allaham',
          username: 'zen',
          profile: null,
        },
        conversation: {
          id: CONVERSATION_ID,
          senderId: USER_ID,
          receiverId: OTHER_USER_ID,
        },
      },
    })

    expect(db.transaction).toHaveBeenCalledTimes(1)
    expect(dependencies.messageGateway.sendMessage).toHaveBeenCalledTimes(1)
    expect(dependencies.notificationsService.create).toHaveBeenCalledTimes(1)
  })

  test('creates a new conversation when one does not exist', async () => {
    prepareCreate({
      conversation: null,
      joinedMessage: makeJoinedMessage(),
    })

    const result = await service.create(USER_ID, OTHER_USER_ID, makeFormData('Hello'))

    expect(result.success).toBe(true)
    expect(tx.insert).toHaveBeenCalledTimes(2)
    expect(tx.update).not.toHaveBeenCalled()
  })

  test('uses the authenticated sender ID when creating the message', async () => {
    prepareCreate()

    await service.create(USER_ID, OTHER_USER_ID, makeFormData('Hello'))

    expect(tx.insert).toHaveBeenCalledTimes(1)

    const messageInsert = tx.insert.mock.calls[0]
    expect(messageInsert).toBeDefined()
  })

  test('trims message content before saving', async () => {
    prepareCreate({
      message: makeMessage({
        content: 'Hello world',
      }),
      joinedMessage: makeJoinedMessage({
        content: 'Hello world',
        conversationLastMessage: 'Hello world',
      }),
    })

    const result = await service.create(USER_ID, OTHER_USER_ID, makeFormData('  Hello world  '))

    expect(result.data.content).toBe('Hello world')
  })

  test('converts whitespace-only content to null', async () => {
    const file = makeFile()

    prepareCreate({
      message: makeMessage({
        content: null,
        attachments: ['https://res.cloudinary.com/test/image.jpg'],
      }),
      joinedMessage: makeJoinedMessage({
        content: null,
        attachments: ['https://res.cloudinary.com/test/image.jpg'],
        conversationLastMessage: 'Attachment',
      }),
    })

    const result = await service.create(USER_ID, OTHER_USER_ID, makeFormData('   ', [file]))

    expect(result.success).toBe(true)
    expect(result.data.content).toBeNull()
  })

  test('rejects a message without content or attachments', async () => {
    const result = await captureRejection(
      service.create(USER_ID, OTHER_USER_ID, makeFormData('   ')),
    )

    expect(result).toBeInstanceOf(BadRequestException)
    expect(db.select).not.toHaveBeenCalled()
    expect(db.transaction).not.toHaveBeenCalled()
  })

  test('rejects when more than five files are provided', async () => {
    const files = Array.from({ length: 6 }, (_, index) => makeFile(`file-${index}.jpg`))

    const result = await captureRejection(
      service.create(USER_ID, OTHER_USER_ID, makeFormData(null, files)),
    )

    expect(result).toBeInstanceOf(BadRequestException)
    expect(uploadImage).not.toHaveBeenCalled()
    expect(db.select).not.toHaveBeenCalled()
  })

  test('accepts exactly five attachments', async () => {
    const files = Array.from({ length: 5 }, (_, index) => makeFile(`file-${index}.jpg`))

    prepareCreate({
      message: makeMessage({
        content: null,
        attachments: Array(5).fill('https://res.cloudinary.com/test/image.jpg'),
      }),
      joinedMessage: makeJoinedMessage({
        content: null,
        attachments: Array(5).fill('https://res.cloudinary.com/test/image.jpg'),
        conversationLastMessage: 'Attachment',
      }),
    })

    const result = await service.create(USER_ID, OTHER_USER_ID, makeFormData(null, files))

    expect(result.success).toBe(true)
    expect(uploadImage).toHaveBeenCalledTimes(5)
  })

  test('rejects sending a message to yourself', async () => {
    const result = await captureRejection(service.create(USER_ID, USER_ID, makeFormData('Hello')))

    expect(result).toBeInstanceOf(BadRequestException)
    expect(db.select).not.toHaveBeenCalled()
  })

  test('rejects when receiver does not exist', async () => {
    db.selectQueue.push(rows([]))

    const result = await captureRejection(
      service.create(USER_ID, OTHER_USER_ID, makeFormData('Hello')),
    )

    expect(result).toBeInstanceOf(NotFoundException)
    expect(db.transaction).not.toHaveBeenCalled()
    expect(dependencies.messageGateway.sendMessage).not.toHaveBeenCalled()
  })

  test('propagates receiver lookup database errors', async () => {
    const error = new Error('Receiver query failed')

    db.selectQueue.push(failing(error))

    const result = await captureRejection(
      service.create(USER_ID, OTHER_USER_ID, makeFormData('Hello')),
    )

    expect(result).toBe(error)
  })

  test('ignores non-File values in attachments', async () => {
    const formData = {
      get: mock((_name: string): FormDataEntryValue | null => null),
      getAll: mock((_name: string): FormDataEntryValue[] => ['value', '123']),
    }

    const result = await captureRejection(service.create(USER_ID, OTHER_USER_ID, formData))

    expect(result).toBeInstanceOf(BadRequestException)
    expect(uploadImage).not.toHaveBeenCalled()
    expect(uploadFile).not.toHaveBeenCalled()
  })

  test('uploads image attachments through Cloudinary images API', async () => {
    prepareCreate({
      message: makeMessage({
        content: null,
        attachments: ['https://res.cloudinary.com/test/image.jpg'],
      }),
      joinedMessage: makeJoinedMessage({
        content: null,
        attachments: ['https://res.cloudinary.com/test/image.jpg'],
        conversationLastMessage: 'Attachment',
      }),
    })

    const file = makeFile()

    await service.create(USER_ID, OTHER_USER_ID, makeFormData(null, [file]))

    expect(uploadImage).toHaveBeenCalledWith(file, 'zentro/messages')
    expect(uploadFile).not.toHaveBeenCalled()
  })

  test('uploads non-image attachments through Cloudinary files API', async () => {
    prepareCreate({
      message: makeMessage({
        content: null,
        attachments: ['https://res.cloudinary.com/test/file.pdf'],
      }),
      joinedMessage: makeJoinedMessage({
        content: null,
        attachments: ['https://res.cloudinary.com/test/file.pdf'],
        conversationLastMessage: 'Attachment',
      }),
    })

    const file = makeFile('document.pdf', 'application/pdf')

    await service.create(USER_ID, OTHER_USER_ID, makeFormData(null, [file]))

    expect(uploadFile).toHaveBeenCalledWith(file, 'zentro/messages')
    expect(uploadImage).not.toHaveBeenCalled()
  })

  test('uses text as the conversation last message when content exists', async () => {
    prepareCreate({
      joinedMessage: makeJoinedMessage({
        conversationLastMessage: 'Hello',
      }),
    })

    await service.create(USER_ID, OTHER_USER_ID, makeFormData('Hello'))

    expect(tx.update).toHaveBeenCalledTimes(1)
  })

  test('uses Attachment as last message when only files are sent', async () => {
    prepareCreate({
      message: makeMessage({
        content: null,
        attachments: ['https://res.cloudinary.com/test/image.jpg'],
      }),
      joinedMessage: makeJoinedMessage({
        content: null,
        attachments: ['https://res.cloudinary.com/test/image.jpg'],
        conversationLastMessage: 'Attachment',
      }),
    })

    const result = await service.create(USER_ID, OTHER_USER_ID, makeFormData(null, [makeFile()]))

    expect(result.data.conversation.lastMessage).toBe('Attachment')
  })

  test('updates the existing conversation before inserting the message', async () => {
    prepareCreate()

    await service.create(USER_ID, OTHER_USER_ID, makeFormData('Hello'))

    expect(tx.update).toHaveBeenCalledTimes(1)
    expect(tx.insert).toHaveBeenCalledTimes(1)
  })

  test('sends a notification when the receiver has not muted the conversation', async () => {
    prepareCreate({
      joinedMessage: makeJoinedMessage({
        conversationIsMutedBySender: false,
        conversationIsMutedByReceiver: false,
      }),
    })

    await service.create(USER_ID, OTHER_USER_ID, makeFormData('Hello'))

    expect(dependencies.notificationsService.create).toHaveBeenCalledWith({
      senderId: USER_ID,
      receiverId: OTHER_USER_ID,
      targetId: MESSAGE_ID,
      type: NotificationType.MESSAGE,
      message: 'Zen sent you a message.',
      link: `/conversations/${CONVERSATION_ID}`,
    })
  })

  test('does not notify when the receiver muted the conversation', async () => {
    prepareCreate({
      joinedMessage: makeJoinedMessage({
        conversationSenderId: USER_ID,
        conversationReceiverId: OTHER_USER_ID,
        conversationIsMutedByReceiver: true,
      }),
    })

    await service.create(USER_ID, OTHER_USER_ID, makeFormData('Hello'))

    expect(dependencies.notificationsService.create).not.toHaveBeenCalled()
    expect(dependencies.messageGateway.sendMessage).toHaveBeenCalledTimes(1)
  })

  test('does not notify when the sender-side participant muted the conversation', async () => {
    prepareCreate({
      joinedMessage: makeJoinedMessage({
        conversationSenderId: OTHER_USER_ID,
        conversationReceiverId: USER_ID,
        conversationIsMutedBySender: true,
      }),
    })

    await service.create(USER_ID, OTHER_USER_ID, makeFormData('Hello'))

    expect(dependencies.notificationsService.create).not.toHaveBeenCalled()
  })

  test('sends the created message through the gateway', async () => {
    prepareCreate()

    await service.create(USER_ID, OTHER_USER_ID, makeFormData('Hello'))

    expect(dependencies.messageGateway.sendMessage).toHaveBeenCalledWith({
      receiverId: OTHER_USER_ID,
      message: expect.objectContaining({
        id: MESSAGE_ID,
        userId: USER_ID,
        conversationId: CONVERSATION_ID,
      }),
    })
  })

  test('returns user profile avatar when available', async () => {
    prepareCreate({
      joinedMessage: makeJoinedMessage({
        userAvatar: {
          url: 'https://example.com/avatar.png',
          publicId: 'avatar-public-id',
        },
      }),
    })

    const result = await service.create(USER_ID, OTHER_USER_ID, makeFormData('Hello'))

    expect(result.data.user.profile).toEqual({
      avatar: {
        url: 'https://example.com/avatar.png',
        publicId: 'avatar-public-id',
      },
    })
  })

  test('returns null profile when avatar is null', async () => {
    prepareCreate({
      joinedMessage: makeJoinedMessage({
        userAvatar: null,
      }),
    })

    const result = await service.create(USER_ID, OTHER_USER_ID, makeFormData('Hello'))

    expect(result.data.user.profile).toBeNull()
  })

  test('cleans up uploaded images when a later operation fails', async () => {
    db.selectQueue.push(rows([{ id: OTHER_USER_ID }]))

    tx.selectQueue.push(rows([]))
    tx.insertQueue.push(rows([makeConversation()]))
    tx.insertQueue.push(failing(new Error('Message insert failed')))

    const result = await captureRejection(
      service.create(USER_ID, OTHER_USER_ID, makeFormData(null, [makeFile()])),
    )

    expect(result).toBeInstanceOf(Error)
    expect(destroyImage).toHaveBeenCalledWith('zentro/messages/test-image')
    expect(dependencies.messageGateway.sendMessage).not.toHaveBeenCalled()
  })

  test('cleans up uploaded files when a later operation fails', async () => {
    db.selectQueue.push(rows([{ id: OTHER_USER_ID }]))

    tx.selectQueue.push(rows([]))
    tx.insertQueue.push(rows([makeConversation()]))
    tx.insertQueue.push(failing(new Error('Message insert failed')))

    const result = await captureRejection(
      service.create(
        USER_ID,
        OTHER_USER_ID,
        makeFormData(null, [makeFile('document.pdf', 'application/pdf')]),
      ),
    )

    expect(result).toBeInstanceOf(Error)
    expect(destroyFile).toHaveBeenCalledWith('zentro/messages/test-file')
  })

  test('does not fail cleanup when Cloudinary destroy fails', async () => {
    db.selectQueue.push(rows([{ id: OTHER_USER_ID }]))

    tx.selectQueue.push(rows([]))
    tx.insertQueue.push(rows([makeConversation()]))
    tx.insertQueue.push(failing(new Error('Message insert failed')))

    destroyImage.mockRejectedValueOnce(new Error('Cloudinary unavailable'))

    const result = await captureRejection(
      service.create(USER_ID, OTHER_USER_ID, makeFormData(null, [makeFile()])),
    )

    expect(result).toBeInstanceOf(Error)
    expect(destroyImage).toHaveBeenCalledTimes(1)
  })

  test('throws when inserted message returns no row', async () => {
    db.selectQueue.push(rows([{ id: OTHER_USER_ID }]))

    tx.selectQueue.push(rows([]))
    tx.insertQueue.push(rows([makeConversation()]))
    tx.insertQueue.push(rows([]))

    const result = await captureRejection(
      service.create(USER_ID, OTHER_USER_ID, makeFormData('Hello')),
    )

    expect(result).toBeInstanceOf(InternalServerErrorException)
  })

  test('throws when the final joined message query returns no row', async () => {
    db.selectQueue.push(rows([{ id: OTHER_USER_ID }]))

    tx.selectQueue.push(rows([]), rows([]))
    tx.insertQueue.push(rows([makeConversation()]))
    tx.insertQueue.push(rows([makeMessage()]))

    const result = await captureRejection(
      service.create(USER_ID, OTHER_USER_ID, makeFormData('Hello')),
    )

    expect(result).toBeInstanceOf(InternalServerErrorException)
  })

  test('REGRESSION: notification failure currently rejects after the message transaction', async () => {
    prepareCreate()

    dependencies.notificationsService.create.mockRejectedValueOnce(
      new Error('Notification service unavailable'),
    )

    const result = await captureRejection(
      service.create(USER_ID, OTHER_USER_ID, makeFormData('Hello')),
    )

    // This currently rejects even though the transaction has completed.
    // Change this expectation after making notifications non-blocking.
    expect(result).toBeInstanceOf(Error)
    expect(dependencies.messageGateway.sendMessage).not.toHaveBeenCalled()
  })

  test('REGRESSION: gateway failure currently rejects after the message transaction', async () => {
    prepareCreate()

    dependencies.messageGateway.sendMessage.mockImplementationOnce(() => {
      throw new Error('Gateway unavailable')
    })

    const result = await captureRejection(
      service.create(USER_ID, OTHER_USER_ID, makeFormData('Hello')),
    )

    expect(result).toBeInstanceOf(Error)
  })
})

/* -------------------------------------------------------------------------- */
/* findAll                                                                    */
/* -------------------------------------------------------------------------- */

describe('MessagesService.findAll', () => {
  test('returns messages for a conversation participant', async () => {
    const message = makeMessage()

    db.selectQueue.push(
      rows([{ id: CONVERSATION_ID }]),
      rows([
        {
          ...message,
          user: {
            id: USER_ID,
            firstName: 'Zen',
            lastName: 'Allaham',
            username: 'zen',
          },
          userAvatar: 'https://example.com/avatar.png',
        },
      ]),
    )

    const result = await service.findAll(USER_ID, CONVERSATION_ID)

    expect(result).toMatchObject({
      success: true,
      data: [
        {
          id: MESSAGE_ID,
          user: {
            id: USER_ID,
            firstName: 'Zen',
            lastName: 'Allaham',
            username: 'zen',
            profile: {
              avatar: 'https://example.com/avatar.png',
            },
          },
        },
      ],
    })
  })

  test('returns null profile when sender avatar is null', async () => {
    db.selectQueue.push(
      rows([{ id: CONVERSATION_ID }]),
      rows([
        {
          ...makeMessage(),
          user: {
            id: USER_ID,
            firstName: 'Zen',
            lastName: 'Allaham',
            username: 'zen',
          },
          userAvatar: null,
        },
      ]),
    )

    const result = await service.findAll(USER_ID, CONVERSATION_ID)

    expect(result.data[0]?.user?.profile).toBeNull()
  })

  test('returns null user when joined user does not exist', async () => {
    db.selectQueue.push(
      rows([{ id: CONVERSATION_ID }]),
      rows([
        {
          ...makeMessage(),
          user: null,
          userAvatar: null,
        },
      ]),
    )

    const result = await service.findAll(USER_ID, CONVERSATION_ID)

    expect(result.data[0]?.user).toBeNull()
  })

  test('returns an empty array when conversation has no messages', async () => {
    db.selectQueue.push(rows([{ id: CONVERSATION_ID }]), rows([]))

    const result = await service.findAll(USER_ID, CONVERSATION_ID)

    expect(result).toEqual({
      success: true,
      data: [],
    })
  })

  test('rejects when conversation does not exist', async () => {
    db.selectQueue.push(rows([]))

    const result = await captureRejection(service.findAll(USER_ID, CONVERSATION_ID))

    expect(result).toBeInstanceOf(NotFoundException)
    expect(db.select).toHaveBeenCalledTimes(1)
  })

  test('rejects users who are not conversation participants', async () => {
    const conversationChain = rows([])

    db.selectQueue.push(conversationChain)

    const result = await captureRejection(service.findAll(THIRD_USER_ID, CONVERSATION_ID))

    expect(result).toBeInstanceOf(NotFoundException)
    expect(whereParams(conversationChain)).toContain(THIRD_USER_ID)
    expect(db.select).toHaveBeenCalledTimes(1)
  })

  test('checks conversation ID and participant ID', async () => {
    const conversationChain = rows([{ id: CONVERSATION_ID }])

    db.selectQueue.push(conversationChain, rows([]))

    await service.findAll(USER_ID, CONVERSATION_ID)

    const params = whereParams(conversationChain)

    expect(params).toContain(CONVERSATION_ID)
    expect(params).toContain(USER_ID)
  })

  test('orders messages by creation date ascending', async () => {
    const messagesChain = rows([])

    db.selectQueue.push(rows([{ id: CONVERSATION_ID }]), messagesChain)

    await service.findAll(USER_ID, CONVERSATION_ID)

    expect(messagesChain.orderBy).toHaveBeenCalledTimes(1)
  })

  test('propagates conversation lookup errors', async () => {
    const error = new Error('Conversation query failed')

    db.selectQueue.push(failing(error))

    const result = await captureRejection(service.findAll(USER_ID, CONVERSATION_ID))

    expect(result).toBe(error)
  })

  test('propagates messages query errors', async () => {
    const error = new Error('Messages query failed')

    db.selectQueue.push(rows([{ id: CONVERSATION_ID }]), failing(error))

    const result = await captureRejection(service.findAll(USER_ID, CONVERSATION_ID))

    expect(result).toBe(error)
  })
})

/* -------------------------------------------------------------------------- */
/* markAllAsRead                                                              */
/* -------------------------------------------------------------------------- */

describe('MessagesService.markAllAsRead', () => {
  test('marks unread messages from the other participant as read', async () => {
    const updateChain = rows([{ id: 'MESSAGE_1' }, { id: 'MESSAGE_2' }])

    db.selectQueue.push(rows([{ id: CONVERSATION_ID }]))
    db.updateQueue.push(updateChain)

    const result = await service.markAllAsRead(USER_ID, CONVERSATION_ID)

    expect(result).toEqual({
      success: true,
      message: 'Messages marked as read successfully',
      data: 2,
    })

    expect(updateChain.set).toHaveBeenCalledTimes(1)

    const values = updateChain.set.mock.calls[0]?.[0] as Record<string, unknown>

    expect(values.isRead).toBe(true)
    expect(values.updatedAt).toBeInstanceOf(Date)
  })

  test('only targets unread messages from other users', async () => {
    const updateChain = rows([])

    db.selectQueue.push(rows([{ id: CONVERSATION_ID }]))
    db.updateQueue.push(updateChain)

    await service.markAllAsRead(USER_ID, CONVERSATION_ID)

    const params = whereParams(updateChain)

    expect(params).toContain(CONVERSATION_ID)
    expect(params).toContain(USER_ID)
    expect(params).toContain(false)
  })

  test('returns zero when there are no unread messages', async () => {
    db.selectQueue.push(rows([{ id: CONVERSATION_ID }]), rows([]))

    const result = await service.markAllAsRead(USER_ID, CONVERSATION_ID)

    expect(result.data).toBe(0)
  })

  test('rejects when conversation does not exist', async () => {
    db.selectQueue.push(rows([]))

    const result = await captureRejection(service.markAllAsRead(USER_ID, CONVERSATION_ID))

    expect(result).toBeInstanceOf(NotFoundException)
    expect(db.update).not.toHaveBeenCalled()
  })

  test('rejects a user who is not a conversation participant', async () => {
    const conversationChain = rows([])

    db.selectQueue.push(conversationChain)

    const result = await captureRejection(service.markAllAsRead(THIRD_USER_ID, CONVERSATION_ID))

    expect(result).toBeInstanceOf(NotFoundException)
    expect(whereParams(conversationChain)).toContain(THIRD_USER_ID)
    expect(db.update).not.toHaveBeenCalled()
  })

  test('propagates conversation lookup errors', async () => {
    const error = new Error('Conversation lookup failed')

    db.selectQueue.push(failing(error))

    const result = await captureRejection(service.markAllAsRead(USER_ID, CONVERSATION_ID))

    expect(result).toBe(error)
  })

  test('propagates update errors', async () => {
    const error = new Error('Message update failed')

    db.selectQueue.push(rows([{ id: CONVERSATION_ID }]))
    db.updateQueue.push(failing(error))

    const result = await captureRejection(service.markAllAsRead(USER_ID, CONVERSATION_ID))

    expect(result).toBe(error)
  })
})

/* -------------------------------------------------------------------------- */
/* findUnreadCount                                                            */
/* -------------------------------------------------------------------------- */

describe('MessagesService.findUnreadCount', () => {
  test('returns the unread messages count', async () => {
    db.selectQueue.push(rows([{ id: CONVERSATION_ID }]), rows([{ unreadCount: 5 }]))

    const result = await service.findUnreadCount(USER_ID, CONVERSATION_ID)

    expect(result).toEqual({
      success: true,
      data: 5,
    })
  })

  test('returns zero when there are no unread messages', async () => {
    db.selectQueue.push(rows([{ id: CONVERSATION_ID }]), rows([{ unreadCount: 0 }]))

    const result = await service.findUnreadCount(USER_ID, CONVERSATION_ID)

    expect(result.data).toBe(0)
  })

  test('returns zero when count query returns no row', async () => {
    db.selectQueue.push(rows([{ id: CONVERSATION_ID }]), rows([]))

    const result = await service.findUnreadCount(USER_ID, CONVERSATION_ID)

    expect(result.data).toBe(0)
  })

  test('rejects when conversation does not exist', async () => {
    db.selectQueue.push(rows([]))

    const result = await captureRejection(service.findUnreadCount(USER_ID, CONVERSATION_ID))

    expect(result).toBeInstanceOf(NotFoundException)
    expect(db.select).toHaveBeenCalledTimes(1)
  })

  test('rejects a user who is not a conversation participant', async () => {
    const conversationChain = rows([])

    db.selectQueue.push(conversationChain)

    const result = await captureRejection(service.findUnreadCount(THIRD_USER_ID, CONVERSATION_ID))

    expect(result).toBeInstanceOf(NotFoundException)
    expect(whereParams(conversationChain)).toContain(THIRD_USER_ID)
    expect(db.select).toHaveBeenCalledTimes(1)
  })

  test('checks conversation ID and participant ID before counting', async () => {
    const conversationChain = rows([{ id: CONVERSATION_ID }])

    db.selectQueue.push(conversationChain, rows([{ unreadCount: 2 }]))

    await service.findUnreadCount(USER_ID, CONVERSATION_ID)

    const params = whereParams(conversationChain)

    expect(params).toContain(CONVERSATION_ID)
    expect(params).toContain(USER_ID)
  })

  test('counts only unread messages from other users', async () => {
    const countChain = rows([{ unreadCount: 2 }])

    db.selectQueue.push(rows([{ id: CONVERSATION_ID }]), countChain)

    await service.findUnreadCount(USER_ID, CONVERSATION_ID)

    const params = whereParams(countChain)

    expect(params).toContain(CONVERSATION_ID)
    expect(params).toContain(USER_ID)
    expect(params).toContain(false)
  })

  test('propagates conversation lookup errors', async () => {
    const error = new Error('Conversation lookup failed')

    db.selectQueue.push(failing(error))

    const result = await captureRejection(service.findUnreadCount(USER_ID, CONVERSATION_ID))

    expect(result).toBe(error)
  })

  test('propagates count query errors', async () => {
    const error = new Error('Count query failed')

    db.selectQueue.push(rows([{ id: CONVERSATION_ID }]), failing(error))

    const result = await captureRejection(service.findUnreadCount(USER_ID, CONVERSATION_ID))

    expect(result).toBe(error)
  })
})

/* -------------------------------------------------------------------------- */
/* delete                                                                     */
/* -------------------------------------------------------------------------- */

describe('MessagesService.delete', () => {
  test('deletes a message successfully', async () => {
    db.selectQueue.push(rows([makeMessage()]), rows([makeConversation()]))

    db.deleteQueue.push(rows([]))

    const result = await service.delete(USER_ID, MESSAGE_ID)

    expect(result).toEqual({
      success: true,
      message: 'Message deleted successfully',
    })

    expect(db.delete).toHaveBeenCalledTimes(1)
    expect(dependencies.messageGateway.sendMessageDeleted).toHaveBeenCalledWith({
      receiverId: OTHER_USER_ID,
      messageId: MESSAGE_ID,
    })
  })

  test('rejects when the message does not exist', async () => {
    db.selectQueue.push(rows([]))

    const result = await captureRejection(service.delete(USER_ID, MESSAGE_ID))

    expect(result).toBeInstanceOf(NotFoundException)
    expect(db.delete).not.toHaveBeenCalled()
    expect(dependencies.messageGateway.sendMessageDeleted).not.toHaveBeenCalled()
  })

  test('rejects when the current user is not the message sender', async () => {
    db.selectQueue.push(
      rows([
        makeMessage({
          userId: OTHER_USER_ID,
        }),
      ]),
    )

    const result = await captureRejection(service.delete(USER_ID, MESSAGE_ID))

    expect(result).toBeInstanceOf(ForbiddenException)
    expect(db.select).toHaveBeenCalledTimes(1)
    expect(db.delete).not.toHaveBeenCalled()
    expect(dependencies.messageGateway.sendMessageDeleted).not.toHaveBeenCalled()
  })

  test('checks the requested message ID', async () => {
    const messageChain = rows([makeMessage()])

    db.selectQueue.push(messageChain, rows([makeConversation()]))

    db.deleteQueue.push(rows([]))

    await service.delete(USER_ID, MESSAGE_ID)

    expect(whereParams(messageChain)).toContain(MESSAGE_ID)
  })

  test('rejects when the message conversation does not exist', async () => {
    db.selectQueue.push(rows([makeMessage()]), rows([]))

    const result = await captureRejection(service.delete(USER_ID, MESSAGE_ID))

    expect(result).toBeInstanceOf(NotFoundException)
    expect(db.delete).not.toHaveBeenCalled()
    expect(dependencies.messageGateway.sendMessageDeleted).not.toHaveBeenCalled()
  })

  test('notifies the other participant when current user is conversation sender', async () => {
    db.selectQueue.push(
      rows([makeMessage({ userId: USER_ID })]),
      rows([
        makeConversation({
          senderId: USER_ID,
          receiverId: OTHER_USER_ID,
        }),
      ]),
    )

    db.deleteQueue.push(rows([]))

    await service.delete(USER_ID, MESSAGE_ID)

    expect(dependencies.messageGateway.sendMessageDeleted).toHaveBeenCalledWith({
      receiverId: OTHER_USER_ID,
      messageId: MESSAGE_ID,
    })
  })

  test('rejects when conversation receiver tries to delete the sender message', async () => {
    db.selectQueue.push(rows([makeMessage({ userId: USER_ID })]))

    const result = await captureRejection(service.delete(OTHER_USER_ID, MESSAGE_ID))

    expect(result).toBeInstanceOf(ForbiddenException)
    expect(db.select).toHaveBeenCalledTimes(1)
    expect(db.delete).not.toHaveBeenCalled()
    expect(dependencies.messageGateway.sendMessageDeleted).not.toHaveBeenCalled()
  })

  test('propagates message lookup errors', async () => {
    const error = new Error('Message lookup failed')

    db.selectQueue.push(failing(error))

    const result = await captureRejection(service.delete(USER_ID, MESSAGE_ID))

    expect(result).toBe(error)
  })

  test('propagates conversation lookup errors', async () => {
    const error = new Error('Conversation lookup failed')

    db.selectQueue.push(rows([makeMessage()]), failing(error))

    const result = await captureRejection(service.delete(USER_ID, MESSAGE_ID))

    expect(result).toBe(error)
    expect(db.delete).not.toHaveBeenCalled()
  })

  test('propagates delete query errors', async () => {
    const error = new Error('Delete failed')

    db.selectQueue.push(rows([makeMessage()]), rows([makeConversation()]))

    db.deleteQueue.push(failing(error))

    const result = await captureRejection(service.delete(USER_ID, MESSAGE_ID))

    expect(result).toBe(error)
    expect(dependencies.messageGateway.sendMessageDeleted).not.toHaveBeenCalled()
  })

  test('does not send delete event when database deletion fails', async () => {
    db.selectQueue.push(rows([makeMessage()]), rows([makeConversation()]))

    db.deleteQueue.push(failing(new Error('Delete failed')))

    await captureRejection(service.delete(USER_ID, MESSAGE_ID))

    expect(dependencies.messageGateway.sendMessageDeleted).not.toHaveBeenCalled()
  })

  test('REGRESSION: deleting a message currently does not update conversation last message', async () => {
    db.selectQueue.push(rows([makeMessage()]), rows([makeConversation()]))

    db.deleteQueue.push(rows([]))

    await service.delete(USER_ID, MESSAGE_ID)

    // This documents the current implementation.
    // After implementing last-message recalculation, update this test
    // to assert the expected conversation update.
    expect(db.update).not.toHaveBeenCalled()
  })
})
