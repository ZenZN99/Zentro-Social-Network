import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test'
import { SpongBadRequestException, SpongNotFoundException } from 'riser-bob'
import type { database } from '../../../config/db/drizzle'
import type { NotificationsService } from '../../notifications/notifications.service'
import { NotificationType } from '../../notifications/schemas/enums/notification-type'
import { UserVerificationStatus } from '../schemas/enums/user-verification-status'
import type { UserVerification } from '../schemas/user-verification.schema'

/* -------------------------------------------------------------------------- */
/*  Mock Cloudinary (the service imports it as a default export)              */
/* -------------------------------------------------------------------------- */

const CLOUDINARY_MODULE = '../../../config/cloudinary/cloudinary'

// Copy the real module (if it can be loaded) so it can be restored: mock.module leaks across test files.
const realCloudinaryModule = await import('../../../config/cloudinary/cloudinary').then(
  (loaded) => ({ ...loaded }),
  (): undefined => undefined,
)

interface UploadedImage {
  url: string
  publicId: string
}

const PROFILE_FOLDER = 'zentro/verifications/profile'
const IDENTITY_FOLDER = 'zentro/verifications/identity'

const defaultUpload = async (_file: File, folder: string): Promise<UploadedImage> => ({
  url: `https://cdn.test/${folder}.png`,
  publicId: `${folder}-public-id`,
})

const uploadImage = mock(defaultUpload)
const destroyImagesMany = mock(async (_publicIds: string[]): Promise<void> => undefined)

mock.module(CLOUDINARY_MODULE, () => ({
  default: { images: { uploadImage, destroyImagesMany } },
}))

afterAll(() => {
  if (realCloudinaryModule) {
    mock.module(CLOUDINARY_MODULE, () => realCloudinaryModule)
  }
})

// Imported AFTER mock.module so the service receives the fake Cloudinary.
const { UserVerificationsService } = await import('../user-verifications.service')

/* -------------------------------------------------------------------------- */
/*  Typed test doubles (no `any`)                                             */
/* -------------------------------------------------------------------------- */

type Outcome = { readonly value: unknown } | { readonly error: Error }

class QueryChain implements PromiseLike<unknown> {
  readonly from = mock((..._args: unknown[]): QueryChain => this)
  readonly where = mock((..._args: unknown[]): QueryChain => this)
  readonly orderBy = mock((..._args: unknown[]): QueryChain => this)
  readonly limit = mock((..._args: unknown[]): QueryChain => this)
  readonly offset = mock((..._args: unknown[]): QueryChain => this)
  readonly set = mock((..._args: unknown[]): QueryChain => this)
  readonly values = mock((..._args: unknown[]): QueryChain => this)
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
  }
}

type FakeDb = ReturnType<typeof createFakeDb>

type NotificationInput = Parameters<NotificationsService['create']>[0]

function createFakeNotifications() {
  return { create: mock(async (_input: NotificationInput): Promise<void> => undefined) }
}

type FakeNotifications = ReturnType<typeof createFakeNotifications>

function selectedKeys(db: FakeDb, callIndex: number): string[] {
  const argument = db.select.mock.calls[callIndex]?.[0]
  return typeof argument === 'object' && argument !== null ? Object.keys(argument).sort() : []
}

/* -------------------------------------------------------------------------- */
/*  Fixtures                                                                  */
/* -------------------------------------------------------------------------- */

const USER_ID = 'user-1'
const ADMIN_ID = 'admin-1'
const VERIFICATION_ID = 'verification-1'

const profileFile = new File(['profile'], 'profile.png', { type: 'image/png' })
const identityFile = new File(['identity'], 'identity.png', { type: 'image/png' })

type FormDataLike = Parameters<InstanceType<typeof UserVerificationsService>['create']>[1]

function makeFormData(
  entries: Record<string, string | File | null> = {
    profileImage: profileFile,
    identityDocument: identityFile,
  },
): FormDataLike {
  return { get: (name: string): string | File | null => entries[name] ?? null }
}

const uploaded = (folder: string): UploadedImage => ({
  url: `https://cdn.test/${folder}.png`,
  publicId: `${folder}-public-id`,
})

function makeVerification(overrides: Record<string, unknown> = {}): UserVerification {
  return {
    id: VERIFICATION_ID,
    userId: USER_ID,
    profileImage: { url: 'https://cdn.test/old-profile.png', publicId: 'old-profile-id' },
    identityDocument: { url: 'https://cdn.test/old-identity.png', publicId: 'old-identity-id' },
    status: UserVerificationStatus.REJECTED,
    rejectionReason: 'Blurry photo',
    reviewedBy: ADMIN_ID,
    reviewedAt: new Date('2026-01-02T00:00:00.000Z'),
    submittedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    ...overrides,
  } as unknown as UserVerification
}

const makePending = (overrides: Record<string, unknown> = {}): UserVerification =>
  makeVerification({
    status: UserVerificationStatus.PENDING,
    rejectionReason: null,
    reviewedBy: null,
    reviewedAt: null,
    ...overrides,
  })

/* -------------------------------------------------------------------------- */
/*  Setup                                                                     */
/* -------------------------------------------------------------------------- */

let db: FakeDb
let notifications: FakeNotifications
let service: InstanceType<typeof UserVerificationsService>

beforeEach(() => {
  uploadImage.mockReset()
  uploadImage.mockImplementation(defaultUpload)
  destroyImagesMany.mockReset()
  destroyImagesMany.mockImplementation(async (): Promise<void> => undefined)

  db = createFakeDb()
  notifications = createFakeNotifications()
  service = new UserVerificationsService(
    db as unknown as typeof database,
    notifications as unknown as NotificationsService,
  )
})

/* -------------------------------------------------------------------------- */
/*  create                                                                    */
/* -------------------------------------------------------------------------- */

interface CreateSetup {
  existing?: UserVerification
  admins?: readonly { id: string }[]
  saved?: UserVerification
}

/** Queues db results in the order UserVerificationsService.create consumes them. */
function queueCreate(setup: CreateSetup = {}) {
  const saved = setup.saved ?? makePending()
  const existingChain = rows(setup.existing ? [setup.existing] : [])
  const adminsChain = rows(setup.admins ?? [])
  const writeChain = rows([saved])

  db.select.mockReturnValueOnce(existingChain).mockReturnValueOnce(adminsChain)
  if (setup.existing) {
    db.update.mockReturnValueOnce(writeChain)
  } else {
    db.insert.mockReturnValueOnce(writeChain)
  }

  return { existingChain, adminsChain, writeChain, saved }
}

function expectNothingPersisted() {
  expect(uploadImage).not.toHaveBeenCalled()
  expect(destroyImagesMany).not.toHaveBeenCalled()
  expect(db.insert).not.toHaveBeenCalled()
  expect(db.update).not.toHaveBeenCalled()
  expect(notifications.create).not.toHaveBeenCalled()
}

describe('UserVerificationsService.create — first submission', () => {
  test('uploads both images to their folders and inserts a PENDING request', async () => {
    const { writeChain, saved } = queueCreate({ admins: [{ id: ADMIN_ID }] })

    const result = await service.create(USER_ID, makeFormData())

    expect(uploadImage).toHaveBeenCalledTimes(2)
    expect(uploadImage).toHaveBeenCalledWith(profileFile, PROFILE_FOLDER)
    expect(uploadImage).toHaveBeenCalledWith(identityFile, IDENTITY_FOLDER)
    expect(writeChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        profileImage: uploaded(PROFILE_FOLDER),
        identityDocument: uploaded(IDENTITY_FOLDER),
        status: UserVerificationStatus.PENDING,
      }),
    )
    expect(destroyImagesMany).not.toHaveBeenCalled()
    expect(db.update).not.toHaveBeenCalled()
    expect(result).toEqual({ type: 'created', data: saved })
  })

  test('stores only { url, publicId } for each image', async () => {
    const { writeChain } = queueCreate()

    await service.create(USER_ID, makeFormData())

    const values = writeChain.values.mock.calls[0]?.[0]
    expect(values).toMatchObject({
      profileImage: {
        url: uploaded(PROFILE_FOLDER).url,
        publicId: uploaded(PROFILE_FOLDER).publicId,
      },
    })
    expect(Object.keys((values as { profileImage: object }).profileImage).sort()).toEqual([
      'publicId',
      'url',
    ])
  })

  test('notifies every admin exactly once with the "new request" message', async () => {
    const { saved } = queueCreate({ admins: [{ id: 'admin-a' }, { id: 'admin-b' }] })

    await service.create(USER_ID, makeFormData())

    expect(notifications.create).toHaveBeenCalledTimes(2)
    for (const receiverId of ['admin-a', 'admin-b']) {
      expect(notifications.create).toHaveBeenCalledWith({
        senderId: USER_ID,
        receiverId,
        targetId: saved.id,
        type: NotificationType.USER_VERIFICATION,
        message: 'A user has submitted a new identity verification request.',
        link: '/admin',
      })
    }
  })

  test('still succeeds when there are no admins to notify', async () => {
    queueCreate({ admins: [] })

    const result = await service.create(USER_ID, makeFormData())

    expect(result.type).toBe('created')
    expect(notifications.create).not.toHaveBeenCalled()
  })

  test('does not insert or notify when the first upload fails', async () => {
    db.select.mockReturnValueOnce(rows([]))
    uploadImage.mockRejectedValueOnce(new Error('cloudinary down'))

    await expect(service.create(USER_ID, makeFormData())).rejects.toThrow('cloudinary down')

    expect(db.insert).not.toHaveBeenCalled()
    expect(notifications.create).not.toHaveBeenCalled()
  })

  test('does not notify when the insert fails', async () => {
    db.select.mockReturnValueOnce(rows([]))
    db.insert.mockReturnValueOnce(failing(new Error('insert failed')))

    await expect(service.create(USER_ID, makeFormData())).rejects.toThrow('insert failed')

    expect(notifications.create).not.toHaveBeenCalled()
  })

  // Documents current behaviour: the request is saved but a notification failure surfaces as an error
  // and the remaining admins are not notified (sequential loop, no isolation per admin).
  test('surfaces notification failures to the caller', async () => {
    queueCreate({ admins: [{ id: 'admin-a' }, { id: 'admin-b' }] })
    notifications.create.mockRejectedValueOnce(new Error('notify down'))

    await expect(service.create(USER_ID, makeFormData())).rejects.toThrow('notify down')
  })

  test('propagates a failure of the initial lookup', async () => {
    db.select.mockReturnValueOnce(failing(new Error('db down')))

    await expect(service.create(USER_ID, makeFormData())).rejects.toThrow('db down')
    expectNothingPersisted()
  })
})

describe('UserVerificationsService.create — existing request', () => {
  for (const status of [UserVerificationStatus.PENDING, UserVerificationStatus.APPROVED]) {
    test(`rejects a new submission while the existing request is ${status}`, async () => {
      db.select.mockReturnValueOnce(rows([makeVerification({ status })]))

      await expect(service.create(USER_ID, makeFormData())).rejects.toBeInstanceOf(
        SpongBadRequestException,
      )

      expectNothingPersisted()
    })
  }

  test('resubmits after a rejection: replaces the images and resets the review fields', async () => {
    const existing = makeVerification()
    const { writeChain, saved } = queueCreate({ existing, admins: [{ id: ADMIN_ID }] })

    const result = await service.create(USER_ID, makeFormData())

    expect(destroyImagesMany).toHaveBeenCalledTimes(1)
    expect(destroyImagesMany).toHaveBeenCalledWith(['old-profile-id', 'old-identity-id'])
    expect(writeChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        profileImage: uploaded(PROFILE_FOLDER),
        identityDocument: uploaded(IDENTITY_FOLDER),
        status: UserVerificationStatus.PENDING,
        rejectionReason: null,
        reviewedBy: null,
        reviewedAt: null,
      }),
    )
    expect(writeChain.where).toHaveBeenCalledTimes(1)
    expect(db.insert).not.toHaveBeenCalled()
    expect(result).toEqual({ type: 'resubmitted', data: saved })
  })

  test('uses the "resubmitted" message when notifying admins', async () => {
    queueCreate({ existing: makeVerification(), admins: [{ id: ADMIN_ID }] })

    await service.create(USER_ID, makeFormData())

    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        receiverId: ADMIN_ID,
        type: NotificationType.USER_VERIFICATION,
        message: 'A user has resubmitted an identity verification request.',
      }),
    )
  })

  test('skips image deletion when the old request has no stored publicIds', async () => {
    queueCreate({
      existing: makeVerification({ profileImage: null, identityDocument: null }),
    })

    const result = await service.create(USER_ID, makeFormData())

    expect(destroyImagesMany).not.toHaveBeenCalled()
    expect(result.type).toBe('resubmitted')
  })
})

/* -------------------------------------------------------------------------- */
/*  findPending                                                               */
/* -------------------------------------------------------------------------- */

interface FindPendingSetup {
  verifications: readonly UserVerification[]
  total?: number
  users?: readonly unknown[]
  profiles?: readonly unknown[]
}

/** Queues db.select() results in the order findPending consumes them. */
function queueFindPending(setup: FindPendingSetup) {
  const verificationsChain = rows(setup.verifications)
  const countChain = rows(setup.total === undefined ? [] : [{ total: setup.total }])
  const usersChain = rows(setup.users ?? [])
  const profilesChain = rows(setup.profiles ?? [])

  db.select.mockReturnValueOnce(verificationsChain).mockReturnValueOnce(countChain)
  if (setup.verifications.length > 0) {
    db.select.mockReturnValueOnce(usersChain).mockReturnValueOnce(profilesChain)
  }

  return { verificationsChain, countChain, usersChain, profilesChain }
}

const makeUserRow = (id: string) => ({
  id,
  firstName: `first-${id}`,
  lastName: `last-${id}`,
  email: `${id}@example.com`,
  isActive: true,
})

const makeProfileRow = (userId: string) => ({
  id: `profile-${userId}`,
  userId,
  avatar: null,
  cover: null,
  bio: `bio of ${userId}`,
})

describe('UserVerificationsService.findPending', () => {
  test('returns pending requests with their user and profile attached', async () => {
    const verification = makePending()
    const user = makeUserRow(USER_ID)
    const profile = makeProfileRow(USER_ID)
    queueFindPending({
      verifications: [verification],
      total: 1,
      users: [user],
      profiles: [profile],
    })

    const result = await service.findPending(1, 10)

    expect(result).toEqual({
      verifications: [{ ...verification, user: { ...user, profile } }],
      total: 1,
      page: 1,
      limit: 10,
    })
  })

  test('only queries PENDING requests, oldest first', async () => {
    const { verificationsChain, countChain } = queueFindPending({ verifications: [], total: 0 })

    await service.findPending(1, 10)

    expect(verificationsChain.where).toHaveBeenCalledTimes(1)
    expect(verificationsChain.orderBy).toHaveBeenCalledTimes(1)
    expect(countChain.where).toHaveBeenCalledTimes(1)
  })

  test('uses page=1, limit=10 and offset=0 by default', async () => {
    const { verificationsChain } = queueFindPending({ verifications: [], total: 0 })

    await service.findPending()

    expect(verificationsChain.limit).toHaveBeenCalledWith(10)
    expect(verificationsChain.offset).toHaveBeenCalledWith(0)
  })

  test('derives the offset from page and limit when no offset is supplied', async () => {
    const { verificationsChain } = queueFindPending({ verifications: [], total: 0 })

    await service.findPending(4, 5)

    expect(verificationsChain.limit).toHaveBeenCalledWith(5)
    expect(verificationsChain.offset).toHaveBeenCalledWith(15)
  })

  test('honours an explicit offset supplied by the controller', async () => {
    const { verificationsChain } = queueFindPending({ verifications: [], total: 0 })

    await service.findPending(2, 10, 7)

    expect(verificationsChain.offset).toHaveBeenCalledWith(7)
  })

  test('returns the real total and echoes page and limit', async () => {
    queueFindPending({ verifications: [makePending()], total: 42, users: [], profiles: [] })

    const result = await service.findPending(3, 20)

    expect(result).toMatchObject({ total: 42, page: 3, limit: 20 })
  })

  test('falls back to total = 0 when the count query returns no row', async () => {
    queueFindPending({ verifications: [], total: undefined })

    const result = await service.findPending(1, 10)

    expect(result.total).toBe(0)
  })

  test('skips the user and profile queries when there are no pending requests', async () => {
    queueFindPending({ verifications: [], total: 0 })

    const result = await service.findPending(1, 10)

    expect(result.verifications).toEqual([])
    expect(db.select).toHaveBeenCalledTimes(2)
  })

  test('sets user to null and profile to null when they cannot be found', async () => {
    queueFindPending({
      verifications: [makePending({ userId: 'orphan' }), makePending({ id: 'v2', userId: 'bob' })],
      total: 2,
      users: [makeUserRow('bob')],
      profiles: [],
    })

    const result = await service.findPending(1, 10)

    expect(result.verifications[0]).toMatchObject({ userId: 'orphan', user: null })
    expect(result.verifications[1]).toMatchObject({
      userId: 'bob',
      user: { id: 'bob', profile: null },
    })
  })

  test('maps users and profiles to the right request regardless of row order', async () => {
    queueFindPending({
      verifications: [
        makePending({ id: 'v-alice', userId: 'alice' }),
        makePending({ id: 'v-bob', userId: 'bob' }),
      ],
      total: 2,
      users: [makeUserRow('bob'), makeUserRow('alice')],
      profiles: [makeProfileRow('bob'), makeProfileRow('alice')],
    })

    const result = await service.findPending(1, 10)

    expect(result.verifications[0]).toMatchObject({
      id: 'v-alice',
      user: { id: 'alice', profile: makeProfileRow('alice') },
    })
    expect(result.verifications[1]).toMatchObject({
      id: 'v-bob',
      user: { id: 'bob', profile: makeProfileRow('bob') },
    })
  })

  test('never selects sensitive user columns (password, tokens, ...)', async () => {
    queueFindPending({ verifications: [makePending()], total: 1, users: [], profiles: [] })

    await service.findPending(1, 10)

    // call 0 = verifications, 1 = count, 2 = users, 3 = profiles
    expect(selectedKeys(db, 2)).toEqual(['email', 'firstName', 'id', 'isActive', 'lastName'])
    expect(selectedKeys(db, 3)).toEqual(['avatar', 'bio', 'cover', 'id', 'userId'])
  })

  test('propagates database failures', async () => {
    db.select
      .mockReturnValueOnce(failing(new Error('db down')))
      .mockReturnValueOnce(rows([{ total: 0 }]))

    await expect(service.findPending(1, 10)).rejects.toThrow('db down')
  })

  test('never sends a negative offset to the database', async () => {
    const { verificationsChain } = queueFindPending({ verifications: [], total: 0 })

    await service.findPending(0, 10)

    const offsetArgument = verificationsChain.offset.mock.calls[0]?.[0]
    expect(typeof offsetArgument === 'number' && offsetArgument >= 0).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/*  update (review)                                                           */
/* -------------------------------------------------------------------------- */

function queueUpdate(verification: UserVerification | undefined, updated?: UserVerification) {
  const updateChain = rows([
    updated ?? makeVerification({ status: UserVerificationStatus.APPROVED }),
  ])
  db.select.mockReturnValueOnce(rows(verification ? [verification] : []))
  db.update.mockReturnValueOnce(updateChain)
  return updateChain
}

function expectNoReviewSideEffects() {
  expect(db.update).not.toHaveBeenCalled()
  expect(notifications.create).not.toHaveBeenCalled()
}

describe('UserVerificationsService.update', () => {
  test('approves a pending request, stores the review metadata and notifies the user', async () => {
    const updated = makeVerification({ status: UserVerificationStatus.APPROVED })
    const updateChain = queueUpdate(makePending(), updated)

    const result = await service.update(ADMIN_ID, VERIFICATION_ID, {
      status: UserVerificationStatus.APPROVED,
      rejectionReason: null,
    })

    expect(updateChain.set).toHaveBeenCalledWith({
      status: UserVerificationStatus.APPROVED,
      rejectionReason: 'Congratulations! Your identity has been verified successfully.',
      reviewedBy: ADMIN_ID,
      reviewedAt: expect.any(Date),
      updatedAt: expect.any(Date),
    })
    expect(updateChain.where).toHaveBeenCalledTimes(1)
    expect(notifications.create).toHaveBeenCalledTimes(1)
    expect(notifications.create).toHaveBeenCalledWith({
      senderId: ADMIN_ID,
      receiverId: USER_ID,
      targetId: VERIFICATION_ID,
      type: NotificationType.USER_VERIFICATION_APPROVED,
      message: 'Your identity verification has been approved.',
      link: '/identity-verification',
    })
    expect(result).toEqual({ data: updated })
  })

  test('ignores a client-supplied rejection reason when approving', async () => {
    const updateChain = queueUpdate(makePending())

    await service.update(ADMIN_ID, VERIFICATION_ID, {
      status: UserVerificationStatus.APPROVED,
      rejectionReason: 'injected by client',
    })

    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        rejectionReason: 'Congratulations! Your identity has been verified successfully.',
      }),
    )
  })

  test('rejects a pending request with a trimmed reason and notifies the user', async () => {
    const updateChain = queueUpdate(
      makePending(),
      makeVerification({ status: UserVerificationStatus.REJECTED }),
    )

    await service.update(ADMIN_ID, VERIFICATION_ID, {
      status: UserVerificationStatus.REJECTED,
      rejectionReason: '   Document is blurry   ',
    })

    expect(updateChain.set).toHaveBeenCalledWith({
      status: UserVerificationStatus.REJECTED,
      rejectionReason: 'Document is blurry',
      reviewedBy: ADMIN_ID,
      reviewedAt: expect.any(Date),
      updatedAt: expect.any(Date),
    })
    expect(notifications.create).toHaveBeenCalledWith({
      senderId: ADMIN_ID,
      receiverId: USER_ID,
      targetId: VERIFICATION_ID,
      type: NotificationType.USER_VERIFICATION_REJECTED,
      message: 'Your identity verification has been rejected.',
      link: '/identity-verification',
    })
  })

  test('throws SpongNotFoundException when the request does not exist', async () => {
    db.select.mockReturnValueOnce(rows([]))

    await expect(
      service.update(ADMIN_ID, 'missing', {
        status: UserVerificationStatus.APPROVED,
        rejectionReason: null,
      }),
    ).rejects.toBeInstanceOf(SpongNotFoundException)

    expectNoReviewSideEffects()
  })

  for (const status of [UserVerificationStatus.APPROVED, UserVerificationStatus.REJECTED]) {
    test(`refuses to review a request that is already ${status}`, async () => {
      db.select.mockReturnValueOnce(rows([makeVerification({ status })]))

      await expect(
        service.update(ADMIN_ID, VERIFICATION_ID, {
          status: UserVerificationStatus.APPROVED,
          rejectionReason: null,
        }),
      ).rejects.toBeInstanceOf(SpongBadRequestException)

      expectNoReviewSideEffects()
    })
  }

  const emptyReasons: ReadonlyArray<string | null> = [null, '', '   ', '\n\t ']
  for (const rejectionReason of emptyReasons) {
    test(`requires a rejection reason when rejecting (got ${JSON.stringify(rejectionReason)})`, async () => {
      db.select.mockReturnValueOnce(rows([makePending()]))

      await expect(
        service.update(ADMIN_ID, VERIFICATION_ID, {
          status: UserVerificationStatus.REJECTED,
          rejectionReason,
        }),
      ).rejects.toBeInstanceOf(SpongBadRequestException)

      expectNoReviewSideEffects()
    })
  }

  test('does not notify when the update fails', async () => {
    db.select.mockReturnValueOnce(rows([makePending()]))
    db.update.mockReturnValueOnce(failing(new Error('update failed')))

    await expect(
      service.update(ADMIN_ID, VERIFICATION_ID, {
        status: UserVerificationStatus.APPROVED,
        rejectionReason: null,
      }),
    ).rejects.toThrow('update failed')

    expect(notifications.create).not.toHaveBeenCalled()
  })

  // Documents current behaviour: the review is already saved when the notification error surfaces.
  test('surfaces notification failures to the caller', async () => {
    const updateChain = queueUpdate(makePending())
    notifications.create.mockRejectedValueOnce(new Error('notify down'))

    await expect(
      service.update(ADMIN_ID, VERIFICATION_ID, {
        status: UserVerificationStatus.APPROVED,
        rejectionReason: null,
      }),
    ).rejects.toThrow('notify down')

    expect(updateChain.set).toHaveBeenCalledTimes(1)
  })

  test('propagates a failure of the initial lookup', async () => {
    db.select.mockReturnValueOnce(failing(new Error('db down')))

    await expect(
      service.update(ADMIN_ID, VERIFICATION_ID, {
        status: UserVerificationStatus.APPROVED,
        rejectionReason: null,
      }),
    ).rejects.toThrow('db down')

    expectNoReviewSideEffects()
  })
})
