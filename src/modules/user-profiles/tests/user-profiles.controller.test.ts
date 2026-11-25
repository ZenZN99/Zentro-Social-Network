import { afterAll, afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
import { Validator } from 'lykosjs'
import type { ContextHandler } from 'lykosjs'
import type { UserProfile } from '../schemas/user-profile.schema'
import { UpdateUserProfileRule } from '../rules/update'
import type { Database } from '../../../config/db/drizzle'

// NOTE: this file must live next to the controller (it uses the same '../../' relative imports).
// If your controller file has a different name, adjust the dynamic import below.

/* -------------------------------------------------------------------------- */
/*  Mock Cloudinary (the controller imports it as a default export)           */
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

const AVATAR_FOLDER = 'user-profiles/avatars'
const COVER_FOLDER = 'user-profiles/covers'
const NEW_AVATAR: UploadedImage = {
  url: 'https://cdn.test/new-avatar.png',
  publicId: 'new-avatar-id',
}
const NEW_COVER: UploadedImage = { url: 'https://cdn.test/new-cover.png', publicId: 'new-cover-id' }

const defaultUpload = async (_file: File, folder: string): Promise<UploadedImage> =>
  folder === AVATAR_FOLDER ? NEW_AVATAR : NEW_COVER

const uploadImage = mock(defaultUpload)
const destroyImage = mock(async (_publicId: string): Promise<void> => undefined)
const destroyImagesMany = mock(async (_publicIds: string[]): Promise<void> => undefined)

mock.module(CLOUDINARY_MODULE, () => ({
  default: { images: { uploadImage, destroyImage, destroyImagesMany } },
}))

afterAll(() => {
  if (realCloudinaryModule) {
    mock.module(CLOUDINARY_MODULE, () => realCloudinaryModule)
  }
})

// Imported AFTER mock.module so the controller receives the fake Cloudinary.
const { UserProfilesController } = await import('../user-profiles.controller')

/* -------------------------------------------------------------------------- */
/*  Typed test doubles (no `any`)                                             */
/* -------------------------------------------------------------------------- */

type Outcome = { readonly value: unknown } | { readonly error: Error }

class QueryChain implements PromiseLike<unknown> {
  readonly from = mock((..._args: unknown[]): QueryChain => this)
  readonly where = mock((..._args: unknown[]): QueryChain => this)
  readonly limit = mock((..._args: unknown[]): QueryChain => this)
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
    update: mock((..._args: unknown[]): QueryChain => rows([])),
  }
}

type FakeDb = ReturnType<typeof createFakeDb>

type Context = Parameters<ContextHandler>[0]
type Reply = Parameters<ContextHandler>[1]

type ResponseMethod = 'OK' | 'NotFound' | 'UnprocessableContent'

interface FakeResponse {
  readonly method: ResponseMethod
  readonly body: unknown
}

function createRes() {
  const build = (method: ResponseMethod) =>
    mock((body: unknown): FakeResponse => ({ method, body }))

  const OK = build('OK')
  const NotFound = build('NotFound')
  const UnprocessableContent = build('UnprocessableContent')

  return {
    res: { OK, NotFound, UnprocessableContent } as unknown as Reply,
    OK,
    NotFound,
    UnprocessableContent,
  }
}

interface ReqOptions {
  /** `null` simulates a request where the auth middleware did not attach a user. */
  user?: { id: string } | null
  form?: FormData
  formDataError?: Error
}

function createReq(options: ReqOptions = {}) {
  const formData = mock(async (): Promise<FormData> => {
    if (options.formDataError) throw options.formDataError
    return options.form ?? new FormData()
  })
  const user = options.user === null ? undefined : (options.user ?? { id: USER_ID })
  return { req: { user, formData } as unknown as Context, formData }
}

type ValidationResult = ReturnType<typeof Validator.validate>

const validResult = {
  valid: true,
  data: {},
  errors: {},
} as unknown as ValidationResult
const makeInvalid = (errors: Record<string, string[]>): ValidationResult =>
  ({ valid: false, errors }) as unknown as ValidationResult

function installValidatorSpy() {
  return spyOn(Validator, 'validate').mockReturnValue(validResult)
}

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error: unknown) {
    return error
  }
  return undefined
}

/* -------------------------------------------------------------------------- */
/*  Fixtures                                                                  */
/* -------------------------------------------------------------------------- */

const USER_ID = 'user-1'
const PROFILE_ID = 'profile-1'
const URL_ERROR = ['Must be a valid HTTP or HTTPS URL']

function makeProfile(overrides: Record<string, unknown> = {}): UserProfile {
  return {
    id: PROFILE_ID,
    userId: USER_ID,
    avatar: { url: 'https://cdn.test/old-avatar.png', publicId: 'old-avatar-id' },
    cover: { url: 'https://cdn.test/old-cover.png', publicId: 'old-cover-id' },
    bio: 'old bio',
    website: 'https://old.example.com',
    socials: { facebookUrl: 'https://facebook.com/old', instagramUrl: null },
    isPrivate: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as unknown as UserProfile
}

function makeForm(fields: Record<string, string | File> = {}): FormData {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) form.set(key, value)
  return form
}

const image = (name = 'photo.png', type = 'image/png', content = 'pixels'): File =>
  new File([content], name, { type })

function setKeys(chain: QueryChain): string[] {
  const argument = chain.set.mock.calls[0]?.[0]
  return typeof argument === 'object' && argument !== null ? Object.keys(argument).sort() : []
}

/* -------------------------------------------------------------------------- */
/*  Setup                                                                     */
/* -------------------------------------------------------------------------- */

let db: FakeDb
let controller: InstanceType<typeof UserProfilesController>
let validateSpy: ReturnType<typeof installValidatorSpy>

beforeEach(() => {
  uploadImage.mockReset()
  uploadImage.mockImplementation(defaultUpload)
  destroyImage.mockReset()
  destroyImage.mockImplementation(async (): Promise<void> => undefined)
  destroyImagesMany.mockReset()
  destroyImagesMany.mockImplementation(async (): Promise<void> => undefined)

  validateSpy = installValidatorSpy()
  db = createFakeDb()
  controller = new UserProfilesController({ connection: db } as unknown as Database)
})

afterEach(() => {
  validateSpy.mockRestore()
})

/** Queues the profile lookup and (when a profile exists) the update result. */
function queueProfile(profile: UserProfile | undefined, saved?: UserProfile) {
  db.select.mockReturnValueOnce(rows(profile ? [profile] : []))
  const updateChain = rows([saved ?? profile ?? makeProfile()])
  if (profile) db.update.mockReturnValueOnce(updateChain)
  return { updateChain, saved: saved ?? profile }
}

function expectNothingWritten() {
  expect(db.update).not.toHaveBeenCalled()
  expect(uploadImage).not.toHaveBeenCalled()
  expect(destroyImage).not.toHaveBeenCalled()
  expect(destroyImagesMany).not.toHaveBeenCalled()
}

/* -------------------------------------------------------------------------- */
/*  Authentication / lookup                                                   */
/* -------------------------------------------------------------------------- */

describe('UserProfilesController.update — lookup', () => {
  test('loads the profile once and updates it with a single scoped query', async () => {
    const { updateChain } = queueProfile(makeProfile())
    const { req } = createReq({ user: { id: 'real-user' } })
    const { res } = createRes()

    await controller.update(req, res)

    expect(db.select).toHaveBeenCalledTimes(1)
    expect(db.update).toHaveBeenCalledTimes(1)
    expect(updateChain.where).toHaveBeenCalledTimes(1)
  })

  test('responds 404 when the user has no profile and writes nothing', async () => {
    queueProfile(undefined)

    const { req } = createReq({
      form: makeForm({ bio: 'hello', avatar: image() }),
    })

    const { res, OK, NotFound } = createRes()

    await controller.update(req, res)

    expect(NotFound).toHaveBeenCalledTimes(1)

    expect(NotFound.mock.calls[0]?.[0]).toEqual({
      success: false,
      message: 'Profile not found',
    })

    expect(OK).not.toHaveBeenCalled()
    expect(validateSpy).not.toHaveBeenCalled()
    expectNothingWritten()
  })

  test('does not touch the database when the form data cannot be parsed', async () => {
    const { req } = createReq({ formDataError: new Error('invalid form data') })
    const { res } = createRes()

    await expect(controller.update(req, res)).rejects.toThrow('invalid form data')

    expect(db.select).not.toHaveBeenCalled()
    expectNothingWritten()
  })

  test('never touches the database when there is no authenticated user', async () => {
    const { req } = createReq({ user: null })
    const { res, OK } = createRes()

    await expect(controller.update(req, res)).rejects.toBeInstanceOf(TypeError)

    expect(db.select).not.toHaveBeenCalled()
    expect(OK).not.toHaveBeenCalled()
    expectNothingWritten()
  })

  test('propagates a failure of the profile lookup', async () => {
    db.select.mockReturnValueOnce(failing(new Error('db down')))
    const { req } = createReq({ form: makeForm({ bio: 'hello' }) })
    const { res } = createRes()

    await expect(controller.update(req, res)).rejects.toThrow('db down')
    expectNothingWritten()
  })
})

/* -------------------------------------------------------------------------- */
/*  Text fields                                                               */
/* -------------------------------------------------------------------------- */

describe('UserProfilesController.update — bio and website', () => {
  test('trims bio and website, validates them and saves them', async () => {
    const { updateChain } = queueProfile(makeProfile())
    const { req } = createReq({
      form: makeForm({ bio: '  hello world  ', website: '  https://zen.dev  ' }),
    })
    const { res } = createRes()

    await controller.update(req, res)

    expect(validateSpy).toHaveBeenCalledTimes(1)
    expect(validateSpy).toHaveBeenCalledWith(
      { bio: 'hello world', website: 'https://zen.dev' },
      UpdateUserProfileRule,
    )
    expect(updateChain.set).toHaveBeenCalledWith({
      bio: 'hello world',
      website: 'https://zen.dev',
      updatedAt: expect.any(Date),
    })
  })

  test('validates only the fields that were sent', async () => {
    queueProfile(makeProfile())
    const { req } = createReq({ form: makeForm({ bio: 'only bio' }) })
    const { res } = createRes()

    await controller.update(req, res)

    expect(validateSpy).toHaveBeenCalledWith({ bio: 'only bio' }, UpdateUserProfileRule)
  })

  for (const blank of ['', '   ', '\n\t ']) {
    test(`clears the website (sets null) when it is blank (${JSON.stringify(blank)}) without validating it`, async () => {
      const { updateChain } = queueProfile(makeProfile())
      const { req } = createReq({ form: makeForm({ website: blank }) })
      const { res } = createRes()

      await controller.update(req, res)

      expect(validateSpy).not.toHaveBeenCalled()
      expect(updateChain.set).toHaveBeenCalledWith({ website: null, updatedAt: expect.any(Date) })
    })
  }

  test('clears the website while still validating a new bio', async () => {
    const { updateChain } = queueProfile(makeProfile())
    const { req } = createReq({ form: makeForm({ bio: 'new bio', website: '' }) })
    const { res } = createRes()

    await controller.update(req, res)

    expect(validateSpy).toHaveBeenCalledWith({ bio: 'new bio' }, UpdateUserProfileRule)
    expect(updateChain.set).toHaveBeenCalledWith({
      bio: 'new bio',
      website: null,
      updatedAt: expect.any(Date),
    })
  })

  test('responds 422 with the rule errors and writes nothing when validation fails', async () => {
    validateSpy.mockReturnValueOnce(makeInvalid({ bio: ['Bio is too long'] }))
    queueProfile(makeProfile())

    const { req } = createReq({
      form: makeForm({ bio: 'x'.repeat(10_000), avatar: image() }),
    })

    const { res, OK, UnprocessableContent } = createRes()

    await controller.update(req, res)

    expect(UnprocessableContent).toHaveBeenCalledTimes(1)

    expect(UnprocessableContent.mock.calls[0]?.[0]).toEqual({
      success: false,
      message: 'Validation failed',
      errors: { bio: ['Bio is too long'] },
    })

    expect(OK).not.toHaveBeenCalled()
    expectNothingWritten()
  })

  test('ignores bio and website sent as files instead of strings', async () => {
    const { updateChain } = queueProfile(makeProfile())
    const { req } = createReq({ form: makeForm({ bio: image('bio.txt', 'text/plain') }) })
    const { res } = createRes()

    await controller.update(req, res)

    expect(validateSpy).not.toHaveBeenCalled()
    expect(setKeys(updateChain)).toEqual(['updatedAt'])
  })

  test('only whitelisted columns can be written (no mass assignment)', async () => {
    const { updateChain } = queueProfile(makeProfile())
    const { req } = createReq({
      form: makeForm({
        id: 'other-profile',
        userId: 'attacker',
        isPrivate: 'true',
        createdAt: '2000-01-01',
        updatedAt: '2000-01-01',
      }),
    })
    const { res } = createRes()

    await controller.update(req, res)

    expect(setKeys(updateChain)).toEqual(['updatedAt'])
    expect(updateChain.set.mock.calls[0]?.[0]).toEqual({ updatedAt: expect.any(Date) })
  })

  test('still saves (touching updatedAt only) when the form is empty', async () => {
    const { updateChain } = queueProfile(makeProfile())
    const { req } = createReq({ form: makeForm() })
    const { res } = createRes()

    const response = await controller.update(req, res)

    expect(validateSpy).not.toHaveBeenCalled()
    expect(setKeys(updateChain)).toEqual(['updatedAt'])
    expect(response).toMatchObject({ method: 'OK' })
  })
})

/* -------------------------------------------------------------------------- */
/*  Socials                                                                   */
/* -------------------------------------------------------------------------- */

describe('UserProfilesController.update — socials', () => {
  async function runSocials(raw: string, profile: UserProfile = makeProfile()) {
    const { updateChain } = queueProfile(profile)
    const { req } = createReq({ form: makeForm({ socials: raw }) })
    const { res, UnprocessableContent } = createRes()

    const result = await controller.update(req, res)

    return {
      result, // the actual value returned by the controller
      response: UnprocessableContent, // the mock (for inspecting calls)
      updateChain,
    }
  }

  test('merges valid URLs into the existing socials and keeps untouched keys', async () => {
    const { updateChain } = await runSocials(JSON.stringify({ twitterUrl: 'https://x.com/zen' }))

    expect(updateChain.set).toHaveBeenCalledWith({
      socials: {
        facebookUrl: 'https://facebook.com/old',
        instagramUrl: null,
        twitterUrl: 'https://x.com/zen',
      },
      updatedAt: expect.any(Date),
    })
  })

  test('accepts http and https URLs (case-insensitive scheme) and trims whitespace', async () => {
    const { updateChain } = await runSocials(
      JSON.stringify({
        facebookUrl: '  HTTPS://facebook.com/zen  ',
        youtubeUrl: 'http://youtube.com/zen',
      }),
    )

    expect(updateChain.set).toHaveBeenCalledWith({
      socials: expect.objectContaining({
        facebookUrl: 'HTTPS://facebook.com/zen',
        youtubeUrl: 'http://youtube.com/zen',
      }),
      updatedAt: expect.any(Date),
    })
  })

  for (const empty of [null, '', '   ']) {
    test(`clears a social link when it is sent as ${JSON.stringify(empty)}`, async () => {
      const { updateChain } = await runSocials(JSON.stringify({ facebookUrl: empty }))

      expect(updateChain.set).toHaveBeenCalledWith({
        socials: { facebookUrl: null, instagramUrl: null },
        updatedAt: expect.any(Date),
      })
    })
  }

  test('works when the profile has no socials yet', async () => {
    const { updateChain } = await runSocials(
      JSON.stringify({ tiktokUrl: 'https://tiktok.com/@zen' }),
      makeProfile({ socials: null }),
    )

    expect(updateChain.set).toHaveBeenCalledWith({
      socials: { tiktokUrl: 'https://tiktok.com/@zen' },
      updatedAt: expect.any(Date),
    })
  })

  test('does not mutate the stored profile object', async () => {
    const profile = makeProfile()
    const before = JSON.stringify(profile.socials)

    await runSocials(JSON.stringify({ twitterUrl: 'https://x.com/zen' }), profile)

    expect(JSON.stringify(profile.socials)).toBe(before)
  })

  test('responds 422 for malformed JSON', async () => {
    const { response, updateChain } = await runSocials('{not json')

    expect(response).toHaveBeenCalledTimes(1)

    expect(response.mock.calls[0]?.[0]).toEqual({
      success: false,
      message: 'Validation failed',
      errors: {
        socials: ['Invalid JSON format'],
      },
    })

    expect(updateChain.set).not.toHaveBeenCalled()
  })

  for (const raw of ['[]', '[1,2]', '"text"', '123', 'null', 'true']) {
    test(`responds 422 when socials is not an object (${raw})`, async () => {
      const { response, updateChain } = await runSocials(raw)

      expect(response).toHaveBeenCalledTimes(1)

      expect(response.mock.calls[0]?.[0]).toEqual({
        success: false,
        message: 'Validation failed',
        errors: { socials: ['Socials must be an object'] },
      })

      expect(updateChain.set).not.toHaveBeenCalled()
    })
  }

  test('rejects unknown social fields', async () => {
    const { response, updateChain } = await runSocials(
      JSON.stringify({
        myspaceUrl: 'https://myspace.com/zen',
        facebookUrl: 'https://facebook.com/zen',
      }),
    )

    expect(response).toHaveBeenCalledTimes(1)

    expect(response.mock.calls[0]?.[0]).toEqual({
      success: false,
      message: 'Validation failed',
      errors: { socials: ['Unknown social field: myspaceUrl'] },
    })

    // all-or-nothing: the valid key must not be applied either
    expect(updateChain.set).not.toHaveBeenCalled()
  })

  test('is not vulnerable to prototype pollution through __proto__ / constructor keys', async () => {
    const { result, updateChain } = await runSocials(
      '{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}',
    )

    expect(result).toMatchObject({ method: 'UnprocessableContent' })
    expect(updateChain.set).not.toHaveBeenCalled()
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  const badUrls = [
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'ftp://files.example.com/x',
    'file:///etc/passwd',
    '//evil.example.com',
    'facebook.com/zen',
    'http://',
    'https://exa mple.com',
    'not a url',
  ]

  for (const url of badUrls) {
    test(`rejects the unsafe/invalid URL ${JSON.stringify(url)}`, async () => {
      const { response, updateChain } = await runSocials(JSON.stringify({ facebookUrl: url }))

      expect(response).toHaveBeenCalledTimes(1)

      expect(response.mock.calls[0]?.[0]).toEqual({
        success: false,
        message: 'Validation failed',
        errors: { facebookUrl: URL_ERROR },
      })

      expect(updateChain.set).not.toHaveBeenCalled()
    })
  }

  for (const value of [123, true, {}, [], ['https://x.com']]) {
    test(`rejects non-string social values (${JSON.stringify(value)})`, async () => {
      const { result, updateChain } = await runSocials(JSON.stringify({ twitterUrl: value }))

      expect(result).toMatchObject({
        method: 'UnprocessableContent',
        body: { errors: { twitterUrl: URL_ERROR } },
      })
      expect(updateChain.set).not.toHaveBeenCalled()
    })
  }

  test('reports every invalid field at once and applies none of them', async () => {
    const { response, updateChain } = await runSocials(
      JSON.stringify({
        facebookUrl: 'javascript:alert(1)',
        twitterUrl: 'ftp://x.com',
        unknownUrl: 'https://x.com',
        youtubeUrl: 'https://youtube.com/ok',
      }),
    )

    expect(response).toHaveBeenCalledTimes(1)

    expect(response.mock.calls[0]?.[0]).toEqual({
      success: false,
      message: 'Validation failed',
      errors: {
        facebookUrl: URL_ERROR,
        twitterUrl: URL_ERROR,
        socials: ['Unknown social field: unknownUrl'],
      },
    })
    expect(updateChain.set).not.toHaveBeenCalled()
  })

  test('merges text validation errors with social errors in one 422 response', async () => {
    validateSpy.mockReturnValueOnce(makeInvalid({ bio: ['Bio is too long'] }))
    queueProfile(makeProfile())

    const { req } = createReq({
      form: makeForm({
        bio: 'x',
        socials: JSON.stringify({ facebookUrl: 'javascript:alert(1)' }),
      }),
    })

    const { res, UnprocessableContent } = createRes()

    await controller.update(req, res)

    expect(UnprocessableContent).toHaveBeenCalledTimes(1)

    expect(UnprocessableContent.mock.calls[0]?.[0]).toEqual({
      success: false,
      message: 'Validation failed',
      errors: {
        bio: ['Bio is too long'],
        facebookUrl: URL_ERROR,
      },
    })
  })

  test('never uploads images when the socials are invalid', async () => {
    queueProfile(makeProfile())
    const { req } = createReq({
      form: makeForm({ socials: '{broken', avatar: image(), cover: image() }),
    })
    const { res } = createRes()

    await controller.update(req, res)

    expectNothingWritten()
  })

  test('ignores a socials field sent as a file', async () => {
    const { updateChain } = queueProfile(makeProfile())
    const { req } = createReq({
      form: makeForm({ socials: image('socials.json', 'application/json') }),
    })
    const { res } = createRes()

    await controller.update(req, res)

    expect(setKeys(updateChain)).toEqual(['updatedAt'])
  })
})

/* -------------------------------------------------------------------------- */
/*  Images                                                                    */
/* -------------------------------------------------------------------------- */

describe('UserProfilesController.update — images', () => {
  test('uploads avatar and cover to their folders and stores the upload results', async () => {
    const avatarFile = image('avatar.png')
    const coverFile = image('cover.png')
    const { updateChain } = queueProfile(makeProfile())
    const { req } = createReq({ form: makeForm({ avatar: avatarFile, cover: coverFile }) })
    const { res } = createRes()

    await controller.update(req, res)

    expect(uploadImage).toHaveBeenCalledTimes(2)
    expect(uploadImage).toHaveBeenCalledWith(avatarFile, AVATAR_FOLDER)
    expect(uploadImage).toHaveBeenCalledWith(coverFile, COVER_FOLDER)
    expect(updateChain.set).toHaveBeenCalledWith({
      avatar: NEW_AVATAR,
      cover: NEW_COVER,
      updatedAt: expect.any(Date),
    })
  })

  test('replaces only the avatar and leaves the cover untouched', async () => {
    const { updateChain } = queueProfile(makeProfile())
    const { req } = createReq({ form: makeForm({ avatar: image() }) })
    const { res } = createRes()

    await controller.update(req, res)

    expect(uploadImage).toHaveBeenCalledTimes(1)
    expect(setKeys(updateChain)).toEqual(['avatar', 'updatedAt'])
    expect(destroyImage).toHaveBeenCalledTimes(1)
    expect(destroyImage).toHaveBeenCalledWith('old-avatar-id')
  })

  test('deletes the replaced images only after the profile has been saved', async () => {
    const events: string[] = []
    const { updateChain } = queueProfile(makeProfile())
    updateChain.returning.mockImplementationOnce((): QueryChain => {
      events.push('saved')
      return updateChain
    })
    destroyImage.mockImplementation(async (publicId: string): Promise<void> => {
      events.push(`destroy:${publicId}`)
    })
    const { req } = createReq({ form: makeForm({ avatar: image(), cover: image() }) })
    const { res } = createRes()

    await controller.update(req, res)

    expect(events[0]).toBe('saved')
    expect([...events.slice(1)].sort()).toEqual(['destroy:old-avatar-id', 'destroy:old-cover-id'])
  })

  test('ignores empty files and non-file values for avatar/cover', async () => {
    const { updateChain } = queueProfile(makeProfile())
    const { req } = createReq({
      form: makeForm({
        avatar: new File([], 'empty.png', { type: 'image/png' }),
        cover: 'not-a-file',
      }),
    })
    const { res } = createRes()

    await controller.update(req, res)

    expect(uploadImage).not.toHaveBeenCalled()
    expect(destroyImage).not.toHaveBeenCalled()
    expect(setKeys(updateChain)).toEqual(['updatedAt'])
  })

  test('does not delete anything when no image was sent', async () => {
    queueProfile(makeProfile())
    const { req } = createReq({ form: makeForm({ bio: 'hello' }) })
    const { res } = createRes()

    await controller.update(req, res)

    expect(uploadImage).not.toHaveBeenCalled()
    expect(destroyImage).not.toHaveBeenCalled()
    expect(destroyImagesMany).not.toHaveBeenCalled()
  })

  test('keeps the old images and removes the new uploads when the save fails', async () => {
    db.select.mockReturnValueOnce(rows([makeProfile()]))
    db.update.mockReturnValueOnce(failing(new Error('db down')))
    const { req } = createReq({ form: makeForm({ avatar: image(), cover: image() }) })
    const { res, OK } = createRes()

    await expect(controller.update(req, res)).rejects.toThrow('db down')

    expect(destroyImage).not.toHaveBeenCalled()
    expect(destroyImagesMany).toHaveBeenCalledTimes(1)
    expect(destroyImagesMany).toHaveBeenCalledWith([NEW_AVATAR.publicId, NEW_COVER.publicId])
    expect(OK).not.toHaveBeenCalled()
  })

  test('removes the new uploads and fails when the update returns no row', async () => {
    db.select.mockReturnValueOnce(rows([makeProfile()]))
    db.update.mockReturnValueOnce(rows([]))
    const { req } = createReq({ form: makeForm({ avatar: image() }) })
    const { res, OK } = createRes()

    await expect(controller.update(req, res)).rejects.toThrow('Failed to update profile')

    expect(destroyImagesMany).toHaveBeenCalledWith([NEW_AVATAR.publicId])
    expect(destroyImage).not.toHaveBeenCalled()
    expect(OK).not.toHaveBeenCalled()
  })

  test('cleans up the avatar and skips the save when the cover upload fails', async () => {
    db.select.mockReturnValueOnce(rows([makeProfile()]))
    uploadImage.mockImplementationOnce(defaultUpload)
    uploadImage.mockRejectedValueOnce(new Error('cloudinary down'))
    const { req } = createReq({ form: makeForm({ avatar: image(), cover: image() }) })
    const { res } = createRes()

    await expect(controller.update(req, res)).rejects.toThrow('cloudinary down')

    expect(db.update).not.toHaveBeenCalled()
    expect(destroyImagesMany).toHaveBeenCalledWith([NEW_AVATAR.publicId])
    expect(destroyImage).not.toHaveBeenCalled()
  })

  describe('image edge cases', () => {
    test('does not try to delete a previous image that does not exist', async () => {
      queueProfile(makeProfile({ avatar: null, cover: null }))
      const { req } = createReq({ form: makeForm({ avatar: image(), cover: image() }) })
      const { res } = createRes()

      await controller.update(req, res)

      expect(destroyImage).not.toHaveBeenCalled()
    })

    test('still succeeds when deleting the old image fails', async () => {
      queueProfile(makeProfile())
      destroyImage.mockRejectedValueOnce(new Error('cloudinary down'))
      const { req } = createReq({ form: makeForm({ avatar: image() }) })
      const { res } = createRes()

      const response = await controller.update(req, res)

      expect(response).toMatchObject({ method: 'OK' })
      expect(destroyImage).toHaveBeenCalledWith('old-avatar-id')
    })

    test('reports the original error even when cleaning up the new uploads fails', async () => {
      db.select.mockReturnValueOnce(rows([makeProfile()]))
      db.update.mockReturnValueOnce(failing(new Error('db down')))
      destroyImagesMany.mockRejectedValueOnce(new Error('cleanup failed'))

      const { req } = createReq({ form: makeForm({ avatar: image() }) })
      const { res } = createRes()

      const error = await captureRejection((async () => controller.update(req, res))())

      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toBe('db down')
    })

    test('does not call the bulk delete with an empty list', async () => {
      db.select.mockReturnValueOnce(rows([makeProfile()]))
      uploadImage.mockRejectedValueOnce(new Error('cloudinary down'))

      const { req } = createReq({ form: makeForm({ avatar: image() }) })
      const { res } = createRes()

      await captureRejection((async () => controller.update(req, res))())

      expect(destroyImagesMany).not.toHaveBeenCalled()
    })

    test('rejects avatar/cover files that are not images', async () => {
      queueProfile(makeProfile())
      const exe = image('malware.exe', 'application/x-msdownload', 'MZ')
      const { req } = createReq({ form: makeForm({ avatar: exe }) })
      const { res, OK } = createRes()

      const response = await controller.update(req, res)

      expect(response).toMatchObject({
        method: 'UnprocessableContent',
        body: { errors: { avatar: ['Only JPEG, PNG, and WebP images are allowed'] } },
      })
      expect(uploadImage).not.toHaveBeenCalled()
      expect(OK).not.toHaveBeenCalled()
    })

    test('rejects oversized images', async () => {
      queueProfile(makeProfile())
      const huge = new File([new Uint8Array(25 * 1024 * 1024)], 'huge.png', { type: 'image/png' })
      const { req } = createReq({ form: makeForm({ cover: huge }) })
      const { res, OK } = createRes()

      const response = await controller.update(req, res)

      expect(response).toMatchObject({
        method: 'UnprocessableContent',
        body: { errors: { cover: ['Image size must not exceed 5 MB'] } },
      })
      expect(uploadImage).not.toHaveBeenCalled()
      expect(OK).not.toHaveBeenCalled()
    })
  })
})

/* -------------------------------------------------------------------------- */
/*  Response                                                                  */
/* -------------------------------------------------------------------------- */

describe('UserProfilesController.update — response', () => {
  test('responds 200 with only the public profile fields taken from the saved row', async () => {
    const saved = makeProfile({
      avatar: NEW_AVATAR,
      bio: 'saved bio',
      website: 'https://saved.example.com',
      socials: {
        facebookUrl: 'https://facebook.com/saved',
      },
      isPrivate: true,
    })

    queueProfile(makeProfile(), saved)

    const { req } = createReq({
      form: makeForm({ bio: 'sent bio' }),
    })

    const { res, OK } = createRes()

    await controller.update(req, res)

    // Exact match: id, userId, createdAt, updatedAt must not leak.
    expect(OK).toHaveBeenCalledTimes(1)

    expect(OK.mock.calls[0]?.[0]).toEqual({
      success: true,
      message: 'Profile updated successfully',
      data: {
        avatar: saved.avatar,
        cover: saved.cover,
        bio: 'saved bio',
        socials: saved.socials,
        website: 'https://saved.example.com',
        isPrivate: true,
      },
    })
  })
})
