import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import {
  SpongBadRequestException,
  SpongInternalServerErrorException,
  SpongNotFoundException,
} from 'riser-bob'
import type { database } from '../../../config/db/drizzle'
import { SupportConversationStatus } from '../../support-conversations/schemas/enums/status'
import { UserRole } from '../../users/schemas/enums/user-role'
import type { User } from '../../users/schemas/user.schema'

/* -------------------------------------------------------------------------- */
/*  Isolate the service from the real Cloudinary client                       */
/* -------------------------------------------------------------------------- */

const CLOUDINARY_MODULE = '../../../config/cloudinary/cloudinary'
// Copy the real module BEFORE mocking so it can be restored afterwards (mock.module leaks across files).
const realCloudinary = { ...(await import('../../../config/cloudinary/cloudinary')) }

type Uploaded = { url: string }

function createFakeCloudinary() {
  return {
    images: {
      uploadImage: mock(
        async (file: File, _folder: string): Promise<Uploaded> => ({
          url: `https://cdn.test/images/${file.name}`,
        }),
      ),
      destroyImage: mock(async (_url: string): Promise<void> => undefined),
    },
    files: {
      uploadFile: mock(
        async (file: File, _folder: string): Promise<Uploaded> => ({
          url: `https://cdn.test/files/${file.name}`,
        }),
      ),
      destroyFile: mock(async (_url: string): Promise<void> => undefined),
    },
  }
}

type FakeCloudinary = ReturnType<typeof createFakeCloudinary>

// The module mock delegates to whatever fake is current, so every test gets a fresh one.
let cloudinary: FakeCloudinary = createFakeCloudinary()

mock.module(CLOUDINARY_MODULE, () => ({
  ...realCloudinary,
  default: {
    images: {
      uploadImage: (file: File, folder: string) => cloudinary.images.uploadImage(file, folder),
      destroyImage: (url: string) => cloudinary.images.destroyImage(url),
    },
    files: {
      uploadFile: (file: File, folder: string) => cloudinary.files.uploadFile(file, folder),
      destroyFile: (url: string) => cloudinary.files.destroyFile(url),
    },
  },
}))

afterAll(() => {
  mock.module(CLOUDINARY_MODULE, () => realCloudinary)
})

const { SupportMessagesService } = await import('../support-messages.service')

type FormLike = Parameters<InstanceType<typeof SupportMessagesService>['create']>[2]

/* -------------------------------------------------------------------------- */
/*  Typed test doubles (no `any`)                                             */
/* -------------------------------------------------------------------------- */

type Outcome = { readonly value: unknown } | { readonly error: Error }

/**
 * A fake Drizzle query builder: every builder method returns the same chain,
 * and awaiting the chain resolves (or rejects) with the configured outcome.
 */
class QueryChain implements PromiseLike<unknown> {
  readonly from = mock((..._args: unknown[]): QueryChain => this)
  readonly leftJoin = mock((..._args: unknown[]): QueryChain => this)
  readonly where = mock((..._args: unknown[]): QueryChain => this)
  readonly orderBy = mock((..._args: unknown[]): QueryChain => this)
  readonly limit = mock((..._args: unknown[]): QueryChain => this)
  readonly values = mock((..._args: unknown[]): QueryChain => this)
  readonly set = mock((..._args: unknown[]): QueryChain => this)
  readonly returning = mock((..._args: unknown[]): QueryChain => this)

  constructor(private readonly outcome: Outcome) {}

  then<R1 = unknown, R2 = never>(
    onfulfilled?: ((value: unknown) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    const settled: Promise<unknown> =
      'error' in this.outcome
        ? Promise.reject(this.outcome.error)
        : Promise.resolve(this.outcome.value)
    return settled.then(onfulfilled, onrejected)
  }
}

const rows = (value: readonly unknown[]): QueryChain => new QueryChain({ value })
const failing = (error: Error): QueryChain => new QueryChain({ error })

function createFakeDb() {
  return {
    select: mock((..._args: unknown[]): QueryChain => rows([])),
    insert: mock((..._args: unknown[]): QueryChain => rows([])),
    update: mock((..._args: unknown[]): QueryChain => rows([])),
    delete: mock((..._args: unknown[]): QueryChain => rows([])),
  }
}

type FakeDb = ReturnType<typeof createFakeDb>

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error: unknown) {
    return error
  }
  return undefined
}

/** Keys passed to `db.select({...})` for the n-th select call. */
function selectedKeys(db: FakeDb, callIndex: number): string[] {
  const argument = db.select.mock.calls[callIndex]?.[0]
  return typeof argument === 'object' && argument !== null ? Object.keys(argument).sort() : []
}

const dialect = new PgDialect()

/** Bound parameters of the first `.where(...)` call, so tests can prove WHAT the query filters on. */
function whereParams(chain: QueryChain): unknown[] {
  const condition = chain.where.mock.calls[0]?.[0]
  if (condition === undefined || condition === null) return []
  return dialect.sqlToQuery(condition as SQL).params
}

/* -------------------------------------------------------------------------- */
/*  Fixtures                                                                  */
/* -------------------------------------------------------------------------- */

const CONV_ID = 'conv-1'
const MESSAGE_ID = 'msg-1'
const OWNER_ID = 'owner-1'
const STRANGER_ID = 'stranger-1'
const ADMIN_ID = 'admin-1'
const SUPPORT_ID = 'support-1'
const UPLOAD_FOLDER = 'support-messages/attachments'
const SENSITIVE_KEY_PATTERN = /password|token|secret|hash/i

const OWNER = makeUser(OWNER_ID)
const STRANGER = makeUser(STRANGER_ID)

function makeUser(id: string, role: UserRole = UserRole.USER): User {
  return {
    id,
    role,
    firstName: 'Test',
    lastName: 'User',
    email: `${id}@example.com`,
  } as unknown as User
}

const makeConversation = (overrides: Record<string, unknown> = {}) => ({
  id: CONV_ID,
  userId: OWNER_ID,
  status: SupportConversationStatus.OPEN,
  lastMessage: null,
  lastMessageSenderId: null,
  ...overrides,
})

/** Row shape returned by the join query of `create`. */
const makeCreatedRow = (overrides: Record<string, unknown> = {}) => ({
  id: MESSAGE_ID,
  conversationId: CONV_ID,
  message: 'hello',
  attachments: [],
  isRead: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  senderId: OWNER_ID,
  senderFirstName: 'Owner',
  senderLastName: 'User',
  senderRole: UserRole.USER,
  profileId: 'profile-1',
  profileAvatar: { url: 'https://cdn.test/avatar.png', publicId: 'avatar' },
  ...overrides,
})

/** Row shape returned by the join query of `findAll`. */
const makeListRow = (overrides: Record<string, unknown> = {}) => ({
  id: MESSAGE_ID,
  conversationId: CONV_ID,
  message: 'hello',
  attachments: [],
  isRead: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  senderId: OWNER_ID,
  senderFirstName: 'Owner',
  senderLastName: 'User',
  senderEmail: 'owner@example.com',
  senderRole: UserRole.USER,
  senderAvatar: { url: 'https://cdn.test/avatar.png', publicId: 'avatar' },
  ...overrides,
})

function makeFile(name: string, type: string, size?: number): File {
  const file = new File(['content'], name, { type })
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size })
  return file
}

interface FormFields {
  message?: unknown
  files?: readonly unknown[]
  /** Any extra form fields an attacker may try to smuggle in (senderId, isRead, ...). */
  extra?: Record<string, unknown>
}

function makeForm(fields: FormFields = {}): FormLike {
  return {
    get: (name: string) => {
      if (name === 'message') return fields.message ?? null
      return fields.extra?.[name] ?? null
    },
    getAll: (name: string) => (name === 'files' ? [...(fields.files ?? [])] : []),
  } as unknown as FormLike
}

/* -------------------------------------------------------------------------- */
/*  Tests                                                                     */
/* -------------------------------------------------------------------------- */

let db: FakeDb
let service: InstanceType<typeof SupportMessagesService>

beforeEach(() => {
  db = createFakeDb()
  cloudinary = createFakeCloudinary()
  service = new SupportMessagesService(db as unknown as typeof database)
})

interface CreateSetup {
  conversation?: Record<string, unknown> | null
  inserted?: readonly unknown[]
  full?: Record<string, unknown> | null
}

/** Queues db calls in the exact order SupportMessagesService.create consumes them. */
function queueCreate(setup: CreateSetup = {}) {
  const conversationChain = rows(
    setup.conversation === null ? [] : [makeConversation(setup.conversation)],
  )
  const insertChain = rows(setup.inserted ?? [{ id: MESSAGE_ID }])
  const updateChain = rows([])
  const fullChain = rows(setup.full === null ? [] : [makeCreatedRow(setup.full)])

  db.select.mockReturnValueOnce(conversationChain).mockReturnValueOnce(fullChain)
  db.insert.mockReturnValueOnce(insertChain)
  db.update.mockReturnValueOnce(updateChain)

  return { conversationChain, insertChain, updateChain, fullChain }
}

function expectNothingUploaded() {
  expect(cloudinary.images.uploadImage).not.toHaveBeenCalled()
  expect(cloudinary.files.uploadFile).not.toHaveBeenCalled()
}

/* -------------------------------------------------------------------------- */
/*  create                                                                    */
/* -------------------------------------------------------------------------- */

describe('SupportMessagesService.create', () => {
  test('creates a text message and returns it with a nested sender', async () => {
    queueCreate()

    const result = await service.create(OWNER, CONV_ID, makeForm({ message: 'hello' }))

    expect(result.success).toBe(true)
    expect(result.message).toBe('Support message created successfully')
    expect(result.data).toMatchObject({
      id: MESSAGE_ID,
      message: 'hello',
      sender: {
        id: OWNER_ID,
        firstName: 'Owner',
        lastName: 'User',
        role: UserRole.USER,
        profile: { avatar: { url: 'https://cdn.test/avatar.png', publicId: 'avatar' } },
      },
    })
  })

  test('does not leak the flat sender* join columns into the message', async () => {
    queueCreate()

    const result = await service.create(OWNER, CONV_ID, makeForm({ message: 'hello' }))

    for (const key of [
      'senderFirstName',
      'senderLastName',
      'senderRole',
      'profileId',
      'profileAvatar',
    ]) {
      expect(result.data).not.toHaveProperty(key)
    }
  })

  test('returns sender = null when the sender account no longer exists', async () => {
    queueCreate({ full: { senderId: null, senderFirstName: null, profileId: null } })

    const result = await service.create(OWNER, CONV_ID, makeForm({ message: 'hello' }))

    expect(result.data).toMatchObject({ sender: null })
  })

  test('inserts an unread message scoped to the conversation and the authenticated sender', async () => {
    const { insertChain } = queueCreate()

    await service.create(OWNER, CONV_ID, makeForm({ message: 'hello' }))

    expect(insertChain.values).toHaveBeenCalledTimes(1)
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: CONV_ID,
        senderId: OWNER_ID,
        message: 'hello',
        attachments: [],
        isRead: false,
      }),
    )
  })

  test('trims the stored message', async () => {
    const { insertChain } = queueCreate()

    await service.create(OWNER, CONV_ID, makeForm({ message: '   hello   ' }))

    expect(insertChain.values).toHaveBeenCalledWith(expect.objectContaining({ message: 'hello' }))
  })

  test('ignores smuggled form fields (senderId, isRead, conversationId)', async () => {
    const { insertChain } = queueCreate()

    await service.create(
      OWNER,
      CONV_ID,
      makeForm({
        message: 'hello',
        extra: { senderId: 'attacker', isRead: 'true', conversationId: 'other-conv' },
      }),
    )

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ senderId: OWNER_ID, conversationId: CONV_ID, isRead: false }),
    )
  })

  test('updates the conversation preview with the trimmed message and sender', async () => {
    const { updateChain } = queueCreate()

    await service.create(OWNER, CONV_ID, makeForm({ message: '  hello  ' }))

    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ lastMessage: 'hello', lastMessageSenderId: OWNER_ID }),
    )
    expect(whereParams(updateChain)).toContain(CONV_ID)
  })

  test('uses "Attachment" as the preview for attachment-only messages', async () => {
    const { updateChain, insertChain } = queueCreate()

    await service.create(OWNER, CONV_ID, makeForm({ files: [makeFile('a.png', 'image/png')] }))

    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ lastMessage: 'Attachment' }),
    )
    expect(insertChain.values).toHaveBeenCalledWith(expect.objectContaining({ message: null }))
  })

  describe('attachments', () => {
    test('uploads images through uploadImage and stores url/type/name', async () => {
      const { insertChain } = queueCreate()
      const image = makeFile('photo.png', 'image/png')

      await service.create(OWNER, CONV_ID, makeForm({ files: [image] }))

      expect(cloudinary.images.uploadImage).toHaveBeenCalledWith(image, UPLOAD_FOLDER)
      expect(cloudinary.files.uploadFile).not.toHaveBeenCalled()
      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [
            { url: 'https://cdn.test/images/photo.png', type: 'image', name: 'photo.png' },
          ],
        }),
      )
    })

    test('uploads non-image files through uploadFile and stores url/type/name', async () => {
      const { insertChain } = queueCreate()
      const pdf = makeFile('doc.pdf', 'application/pdf')

      await service.create(OWNER, CONV_ID, makeForm({ files: [pdf] }))

      expect(cloudinary.files.uploadFile).toHaveBeenCalledWith(pdf, UPLOAD_FOLDER)
      expect(cloudinary.images.uploadImage).not.toHaveBeenCalled()
      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [{ url: 'https://cdn.test/files/doc.pdf', type: 'file', name: 'doc.pdf' }],
        }),
      )
    })

    test('keeps the original order of mixed attachments', async () => {
      const { insertChain } = queueCreate()

      await service.create(
        OWNER,
        CONV_ID,
        makeForm({
          message: 'see attached',
          files: [makeFile('b.pdf', 'application/pdf'), makeFile('a.png', 'image/png')],
        }),
      )

      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [
            { url: 'https://cdn.test/files/b.pdf', type: 'file', name: 'b.pdf' },
            { url: 'https://cdn.test/images/a.png', type: 'image', name: 'a.png' },
          ],
        }),
      )
    })

    test('accepts exactly 5 attachments', async () => {
      queueCreate()
      const files = Array.from({ length: 5 }, (_, i) => makeFile(`f${i}.png`, 'image/png'))

      await service.create(OWNER, CONV_ID, makeForm({ files }))

      expect(cloudinary.images.uploadImage).toHaveBeenCalledTimes(5)
    })

    test('rejects more than 5 attachments before uploading anything', async () => {
      db.select.mockReturnValueOnce(rows([makeConversation()]))
      const files = Array.from({ length: 6 }, (_, i) => makeFile(`f${i}.png`, 'image/png'))

      await expect(service.create(OWNER, CONV_ID, makeForm({ files }))).rejects.toBeInstanceOf(
        SpongBadRequestException,
      )

      expectNothingUploaded()
      expect(db.insert).not.toHaveBeenCalled()
    })

    test('propagates upload failures without inserting or updating anything', async () => {
      db.select.mockReturnValueOnce(rows([makeConversation()]))
      cloudinary.images.uploadImage.mockRejectedValueOnce(new Error('upload failed'))

      await expect(
        service.create(OWNER, CONV_ID, makeForm({ files: [makeFile('a.png', 'image/png')] })),
      ).rejects.toThrow('upload failed')

      expect(db.insert).not.toHaveBeenCalled()
      expect(db.update).not.toHaveBeenCalled()
    })
  })

  describe('validation', () => {
    for (const message of ['', '   ', '\n\t ', null, undefined]) {
      test(`rejects an empty message (${JSON.stringify(message) ?? 'undefined'}) with no attachments`, async () => {
        db.select.mockReturnValueOnce(rows([makeConversation()]))

        await expect(service.create(OWNER, CONV_ID, makeForm({ message }))).rejects.toBeInstanceOf(
          SpongBadRequestException,
        )

        expect(db.insert).not.toHaveBeenCalled()
        expect(db.update).not.toHaveBeenCalled()
        expectNothingUploaded()
      })
    }

    test('allows a whitespace-only message when attachments exist', async () => {
      queueCreate()

      const result = await service.create(
        OWNER,
        CONV_ID,
        makeForm({ message: '   ', files: [makeFile('a.png', 'image/png')] }),
      )

      expect(result.success).toBe(true)
    })
  })

  describe('authorization & conversation state', () => {
    test('throws SpongNotFoundException when the conversation does not exist', async () => {
      db.select.mockReturnValueOnce(rows([]))

      await expect(
        service.create(OWNER, 'ghost', makeForm({ message: 'hello' })),
      ).rejects.toBeInstanceOf(SpongNotFoundException)

      expect(db.insert).not.toHaveBeenCalled()
      expect(db.update).not.toHaveBeenCalled()
      expectNothingUploaded()
    })

    test("hides other users' conversations behind the same not-found error", async () => {
      db.select.mockReturnValueOnce(rows([makeConversation()]))

      await expect(
        service.create(STRANGER, CONV_ID, makeForm({ message: 'hello' })),
      ).rejects.toBeInstanceOf(SpongNotFoundException)

      expect(db.insert).not.toHaveBeenCalled()
      expect(db.update).not.toHaveBeenCalled()
      expectNothingUploaded()
    })

    test('does not let a stranger distinguish "forbidden" from "missing"', async () => {
      db.select.mockReturnValueOnce(rows([]))
      const missing = await captureRejection(
        service.create(STRANGER, 'ghost', makeForm({ message: 'hello' })),
      )
      db.select.mockReturnValueOnce(rows([makeConversation()]))
      const forbidden = await captureRejection(
        service.create(STRANGER, CONV_ID, makeForm({ message: 'hello' })),
      )

      expect(missing).toBeInstanceOf(SpongNotFoundException)
      expect(forbidden).toBeInstanceOf(SpongNotFoundException)
      expect((forbidden as Error).message).toBe((missing as Error).message)
    })

    test('does not upload files for a stranger (no storage abuse on foreign conversations)', async () => {
      db.select.mockReturnValueOnce(rows([makeConversation()]))

      await captureRejection(
        service.create(STRANGER, CONV_ID, makeForm({ files: [makeFile('a.png', 'image/png')] })),
      )

      expectNothingUploaded()
    })

    for (const [label, staff] of [
      ['ADMIN', makeUser(ADMIN_ID, UserRole.ADMIN)],
      ['SUPPORT', makeUser(SUPPORT_ID, UserRole.SUPPORT)],
    ] as const) {
      test(`${label} can reply in any user's conversation`, async () => {
        const { insertChain, updateChain } = queueCreate()

        const result = await service.create(staff, CONV_ID, makeForm({ message: 'we are on it' }))

        expect(result.success).toBe(true)
        expect(insertChain.values).toHaveBeenCalledWith(
          expect.objectContaining({ senderId: staff.id }),
        )
        expect(updateChain.set).toHaveBeenCalledWith(
          expect.objectContaining({ lastMessageSenderId: staff.id }),
        )
      })
    }

    for (const status of Object.values(SupportConversationStatus).filter(
      (value) => value !== SupportConversationStatus.OPEN,
    )) {
      test(`rejects messages when the conversation status is ${status}`, async () => {
        db.select.mockReturnValueOnce(rows([makeConversation({ status })]))

        await expect(
          service.create(OWNER, CONV_ID, makeForm({ message: 'hello' })),
        ).rejects.toBeInstanceOf(SpongBadRequestException)

        expect(db.insert).not.toHaveBeenCalled()
        expectNothingUploaded()
      })

      test(`rejects staff messages too when the conversation status is ${status}`, async () => {
        db.select.mockReturnValueOnce(rows([makeConversation({ status })]))

        await expect(
          service.create(
            makeUser(ADMIN_ID, UserRole.ADMIN),
            CONV_ID,
            makeForm({ message: 'hello' }),
          ),
        ).rejects.toBeInstanceOf(SpongBadRequestException)

        expect(db.insert).not.toHaveBeenCalled()
      })
    }
  })

  describe('persistence failures', () => {
    test('throws SpongInternalServerErrorException when the insert returns no row', async () => {
      const { updateChain } = queueCreate({ inserted: [] })

      await expect(
        service.create(OWNER, CONV_ID, makeForm({ message: 'hello' })),
      ).rejects.toBeInstanceOf(SpongInternalServerErrorException)

      expect(updateChain.set).not.toHaveBeenCalled()
    })

    test('throws SpongNotFoundException when the freshly created message cannot be re-read', async () => {
      queueCreate({ full: null })

      await expect(
        service.create(OWNER, CONV_ID, makeForm({ message: 'hello' })),
      ).rejects.toBeInstanceOf(SpongNotFoundException)
    })

    test('propagates database failures of the conversation lookup', async () => {
      db.select.mockReturnValueOnce(failing(new Error('db down')))

      await expect(service.create(OWNER, CONV_ID, makeForm({ message: 'hello' }))).rejects.toThrow(
        'db down',
      )
      expect(db.insert).not.toHaveBeenCalled()
    })

    test('propagates insert failures', async () => {
      db.select.mockReturnValueOnce(rows([makeConversation()]))
      db.insert.mockReturnValueOnce(failing(new Error('insert failed')))

      await expect(service.create(OWNER, CONV_ID, makeForm({ message: 'hello' }))).rejects.toThrow(
        'insert failed',
      )
      expect(db.update).not.toHaveBeenCalled()
    })
  })

  test('never selects sensitive user columns for the sender join', async () => {
    queueCreate()

    await service.create(OWNER, CONV_ID, makeForm({ message: 'hello' }))

    // call 0 = conversation, call 1 = message + sender + profile
    expect(selectedKeys(db, 1).filter((key) => SENSITIVE_KEY_PATTERN.test(key))).toEqual([])
  })
})

/* -------------------------------------------------------------------------- */
/*  findAll                                                                   */
/* -------------------------------------------------------------------------- */

describe('SupportMessagesService.findAll', () => {
  function queueFindAll(list: readonly unknown[], conversation = makeConversation()) {
    const conversationChain = rows([conversation])
    const messagesChain = rows(list)
    db.select.mockReturnValueOnce(conversationChain).mockReturnValueOnce(messagesChain)
    return { conversationChain, messagesChain }
  }

  test('returns the messages of the conversation ordered oldest-first with nested senders', async () => {
    const { messagesChain } = queueFindAll([makeListRow()])

    const result = await service.findAll(OWNER, CONV_ID)

    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toMatchObject({
      id: MESSAGE_ID,
      message: 'hello',
      sender: {
        id: OWNER_ID,
        firstName: 'Owner',
        lastName: 'User',
        role: UserRole.USER,
        profile: { avatar: { url: 'https://cdn.test/avatar.png', publicId: 'avatar' } },
      },
    })
    expect(messagesChain.orderBy).toHaveBeenCalledTimes(1)
  })

  test('scopes the messages query to the requested conversation', async () => {
    const { messagesChain } = queueFindAll([])

    await service.findAll(OWNER, CONV_ID)

    expect(whereParams(messagesChain)).toContain(CONV_ID)
  })

  test('returns an empty list for a conversation without messages', async () => {
    queueFindAll([])

    const result = await service.findAll(OWNER, CONV_ID)

    expect(result).toEqual({ success: true, data: [] })
  })

  test('sets sender to null when the sender account no longer exists', async () => {
    queueFindAll([makeListRow({ senderId: null, senderFirstName: null, senderAvatar: null })])

    const result = await service.findAll(OWNER, CONV_ID)

    expect(result.data[0]).toMatchObject({ sender: null })
  })

  test('sets sender.profile to null when the sender has no avatar', async () => {
    queueFindAll([makeListRow({ senderAvatar: null })])

    const result = await service.findAll(OWNER, CONV_ID)

    expect(result.data[0]).toMatchObject({ sender: { profile: null } })
  })

  test('does not leak the flat sender* join columns', async () => {
    queueFindAll([makeListRow()])

    const result = await service.findAll(OWNER, CONV_ID)

    for (const key of [
      'senderFirstName',
      'senderLastName',
      'senderEmail',
      'senderRole',
      'senderAvatar',
    ]) {
      expect(result.data[0]).not.toHaveProperty(key)
    }
  })

  test('still returns the history of a closed conversation', async () => {
    const closed = Object.values(SupportConversationStatus).find(
      (status) => status !== SupportConversationStatus.OPEN,
    )
    queueFindAll([makeListRow()], makeConversation({ status: closed }))

    const result = await service.findAll(OWNER, CONV_ID)

    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)
  })

  test('throws SpongNotFoundException when the conversation does not exist', async () => {
    db.select.mockReturnValueOnce(rows([]))

    await expect(service.findAll(OWNER, 'ghost')).rejects.toBeInstanceOf(SpongNotFoundException)
    expect(db.select).toHaveBeenCalledTimes(1)
  })

  test("never reads another user's messages (and never even queries them)", async () => {
    db.select.mockReturnValueOnce(rows([makeConversation()]))

    await expect(service.findAll(STRANGER, CONV_ID)).rejects.toBeInstanceOf(SpongNotFoundException)

    expect(db.select).toHaveBeenCalledTimes(1)
  })

  for (const [label, staff] of [
    ['ADMIN', makeUser(ADMIN_ID, UserRole.ADMIN)],
    ['SUPPORT', makeUser(SUPPORT_ID, UserRole.SUPPORT)],
  ] as const) {
    test(`${label} can read any conversation`, async () => {
      queueFindAll([makeListRow()])

      const result = await service.findAll(staff, CONV_ID)

      expect(result.success).toBe(true)
    })
  }

  test('never selects sensitive user columns', async () => {
    queueFindAll([])

    await service.findAll(OWNER, CONV_ID)

    expect(selectedKeys(db, 1).filter((key) => SENSITIVE_KEY_PATTERN.test(key))).toEqual([])
  })

  test('propagates database failures', async () => {
    db.select
      .mockReturnValueOnce(rows([makeConversation()]))
      .mockReturnValueOnce(failing(new Error('db down')))

    await expect(service.findAll(OWNER, CONV_ID)).rejects.toThrow('db down')
  })
})

/* -------------------------------------------------------------------------- */
/*  markAllAsRead                                                             */
/* -------------------------------------------------------------------------- */

describe('SupportMessagesService.markAllAsRead', () => {
  const UNREAD = [
    {
      id: 'm1',
      conversationId: CONV_ID,
      senderId: STRANGER_ID,
      message: 'Hello',
      attachments: [],
      isRead: true,
      createdAt: new Date('2026-11-15T10:00:00Z'),
      updatedAt: new Date('2026-11-15T10:01:00Z'),
    },
    {
      id: 'm2',
      conversationId: CONV_ID,
      senderId: STRANGER_ID,
      message: 'How are you?',
      attachments: [],
      isRead: true,
      createdAt: new Date('2026-11-15T10:02:00Z'),
      updatedAt: new Date('2026-11-15T10:03:00Z'),
    },
  ]

  function queueMark(updated: readonly unknown[] = UNREAD, conversation = makeConversation()) {
    const updateChain = rows(updated)
    db.select.mockReturnValueOnce(rows([conversation]))
    db.update.mockReturnValueOnce(updateChain)
    return updateChain
  }

  test('marks unread messages as read and returns them', async () => {
    const updateChain = queueMark()

    const result = await service.markAllAsRead(OWNER, CONV_ID)

    expect(result).toEqual({
      success: true,
      message: 'Support messages marked as read successfully',
      data: UNREAD,
    })
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ isRead: true, updatedAt: expect.any(Date) }),
    )
  })

  test('only touches unread messages of the requested conversation', async () => {
    const updateChain = queueMark()

    await service.markAllAsRead(OWNER, CONV_ID)

    const params = whereParams(updateChain)
    expect(params).toContain(CONV_ID)
    expect(params).toContain(false)
  })

  test('returns an empty list when there is nothing to mark', async () => {
    queueMark([])

    const result = await service.markAllAsRead(OWNER, CONV_ID)

    expect(result.data).toEqual([])
  })

  test('throws SpongNotFoundException when the conversation does not exist', async () => {
    db.select.mockReturnValueOnce(rows([]))

    await expect(service.markAllAsRead(OWNER, 'ghost')).rejects.toBeInstanceOf(
      SpongNotFoundException,
    )
    expect(db.update).not.toHaveBeenCalled()
  })

  test("refuses to touch another user's conversation", async () => {
    db.select.mockReturnValueOnce(rows([makeConversation()]))

    await expect(service.markAllAsRead(STRANGER, CONV_ID)).rejects.toBeInstanceOf(
      SpongNotFoundException,
    )
    expect(db.update).not.toHaveBeenCalled()
  })

  for (const [label, staff] of [
    ['ADMIN', makeUser(ADMIN_ID, UserRole.ADMIN)],
    ['SUPPORT', makeUser(SUPPORT_ID, UserRole.SUPPORT)],
  ] as const) {
    test(`${label} can mark any conversation as read`, async () => {
      queueMark()

      const result = await service.markAllAsRead(staff, CONV_ID)

      expect(result.success).toBe(true)
    })
  }

  test('propagates database failures', async () => {
    db.select.mockReturnValueOnce(rows([makeConversation()]))
    db.update.mockReturnValueOnce(failing(new Error('update failed')))

    await expect(service.markAllAsRead(OWNER, CONV_ID)).rejects.toThrow('update failed')
  })
})

/* -------------------------------------------------------------------------- */
/*  delete                                                                    */
/* -------------------------------------------------------------------------- */

describe('SupportMessagesService.delete', () => {
  const storedMessage = (attachments: unknown = []) => ({
    id: MESSAGE_ID,
    conversationId: CONV_ID,
    senderId: OWNER_ID,
    attachments,
  })

  test('deletes the message and reports success', async () => {
    const deleteChain = rows([])
    db.select.mockReturnValueOnce(rows([storedMessage()]))
    db.delete.mockReturnValueOnce(deleteChain)

    const result = await service.delete(CONV_ID, MESSAGE_ID)

    expect(result).toEqual({ success: true, message: 'Support message deleted successfully' })
    expect(db.delete).toHaveBeenCalledTimes(1)
    expect(whereParams(deleteChain)).toContain(MESSAGE_ID)
  })

  test('looks the message up by BOTH conversation id and message id', async () => {
    const lookupChain = rows([storedMessage()])
    db.select.mockReturnValueOnce(lookupChain)

    await service.delete(CONV_ID, MESSAGE_ID)

    const params = whereParams(lookupChain)
    expect(params).toContain(CONV_ID)
    expect(params).toContain(MESSAGE_ID)
  })

  test('throws SpongNotFoundException when the message does not exist', async () => {
    db.select.mockReturnValueOnce(rows([]))

    await expect(service.delete(CONV_ID, 'ghost')).rejects.toBeInstanceOf(SpongNotFoundException)

    expect(db.delete).not.toHaveBeenCalled()
    expect(cloudinary.images.destroyImage).not.toHaveBeenCalled()
    expect(cloudinary.files.destroyFile).not.toHaveBeenCalled()
  })

  test('destroys images through destroyImage and other files through destroyFile', async () => {
    db.select.mockReturnValueOnce(
      rows([
        storedMessage([
          { url: 'https://cdn.test/images/a.png', type: 'image', name: 'a.png' },
          { url: 'https://cdn.test/files/b.pdf', type: 'file', name: 'b.pdf' },
        ]),
      ]),
    )

    await service.delete(CONV_ID, MESSAGE_ID)

    expect(cloudinary.images.destroyImage).toHaveBeenCalledTimes(1)
    expect(cloudinary.images.destroyImage).toHaveBeenCalledWith('https://cdn.test/images/a.png')
    expect(cloudinary.files.destroyFile).toHaveBeenCalledTimes(1)
    expect(cloudinary.files.destroyFile).toHaveBeenCalledWith('https://cdn.test/files/b.pdf')
  })

  test('does not call Cloudinary for messages without attachments', async () => {
    db.select.mockReturnValueOnce(rows([storedMessage([])]))

    await service.delete(CONV_ID, MESSAGE_ID)

    expect(cloudinary.images.destroyImage).not.toHaveBeenCalled()
    expect(cloudinary.files.destroyFile).not.toHaveBeenCalled()
  })

  // Documents current behaviour: a Cloudinary failure aborts the delete and keeps the DB row.
  test('keeps the message when a Cloudinary deletion fails', async () => {
    db.select.mockReturnValueOnce(
      rows([
        storedMessage([{ url: 'https://cdn.test/images/a.png', type: 'image', name: 'a.png' }]),
      ]),
    )
    cloudinary.images.destroyImage.mockRejectedValueOnce(new Error('cloudinary down'))

    await expect(service.delete(CONV_ID, MESSAGE_ID)).rejects.toThrow('cloudinary down')
    expect(db.delete).not.toHaveBeenCalled()
  })

  test('propagates database failures of the lookup', async () => {
    db.select.mockReturnValueOnce(failing(new Error('db down')))

    await expect(service.delete(CONV_ID, MESSAGE_ID)).rejects.toThrow('db down')
    expect(db.delete).not.toHaveBeenCalled()
  })

  test('propagates database failures of the delete', async () => {
    db.select.mockReturnValueOnce(rows([storedMessage()]))
    db.delete.mockReturnValueOnce(failing(new Error('delete failed')))

    await expect(service.delete(CONV_ID, MESSAGE_ID)).rejects.toThrow('delete failed')
  })
})
