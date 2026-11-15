
import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { SpongInternalServerErrorException, SpongNotFoundException } from 'riser-bob'
import type { database } from '../../../config/db/drizzle'
import type { PostsService as PostsServiceType } from '../posts.service'
import { VisibilityStatus } from '../schemas/enums/visibility-status'
import { NotificationType } from '../../notifications/schemas/enums/notification-type'
import type { PostMentionsService } from '../post-mentions/post-mentions.service'
import type { HashtagsService } from '../hashtags/hashtags.service'
import type { PostHashtagsService } from '../post-hashtags/post-hashtags.service'
import type { PostQuotesService } from '../post-quotes/post-quotes.service'
import type { PostRepostsService } from '../post-reposts/post-reposts.service'
import type { NotificationsService } from '../../notifications/notifications.service'

/* -------------------------------------------------------------------------- */
/* Cloudinary Mock                                                            */
/* -------------------------------------------------------------------------- */

const uploadImage = mock(async (_file: File, _folder: string) => ({
  url: 'https://res.cloudinary.com/test/image.jpg',
  publicId: 'zentro/posts/test-image',
}))

const destroyImage = mock(async (_publicId: string) => ({
  result: 'ok',
}))

const cloudinaryMock = {
  images: {
    uploadImage,
    destroyImage,
  },
}

mock.module('../../../config/cloudinary/cloudinary', () => ({
  default: cloudinaryMock,
}))

const { PostsService } = await import('../posts.service')

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const USER_ID = 'USER_1'
const OTHER_USER_ID = 'USER_2'
const POST_ID = 'POST_1'
const QUOTED_POST_ID = 'POST_2'

const dialect = new PgDialect()

type Outcome = { value: unknown } | { error: Error }

type PostImage = {
  url: string
  publicId: string
}

/* -------------------------------------------------------------------------- */
/* Query Chain                                                                */
/* -------------------------------------------------------------------------- */

class QueryChain implements PromiseLike<unknown> {
  outcome: Outcome = { value: [] }

  from = mock((_table?: unknown) => this)
  leftJoin = mock((_table?: unknown, _condition?: unknown) => this)
  where = mock((_condition?: unknown) => this)
  orderBy = mock((..._args: unknown[]) => this)
  limit = mock((_value?: number) => this)
  offset = mock((_value?: number) => this)
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

const captureRejection = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise
    return undefined
  } catch (error) {
    return error
  }
}

const makePostBase = () => ({
  id: POST_ID,
  authorId: USER_ID,
  content: 'Test post content',
  visibility: VisibilityStatus.PUBLIC,
  isPin: false,
  isEdited: false,
  images: null as PostImage[] | null,
  viewsCount: 0,
  likesCount: 0,
  commentsCount: 0,
  bookmarksCount: 0,
  quotesCount: 0,
  repostsCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
})

const makePost = (
  overrides: Partial<ReturnType<typeof makePostBase>> = {},
) => ({
  ...makePostBase(),
  ...overrides,
})

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  firstName: 'Zen',
  lastName: 'Allaham',
  ...overrides,
})

const makeFormData = (images: (string | File)[] = []) => ({
  get: mock((_name: string) => null),
  getAll: mock((name: string) => (name === 'images' ? images : [])),
})

const makeFile = (): File =>
  new File(['test image'], 'test.jpg', {
    type: 'image/jpeg',
  })

const makePostResult = (
  post = makePost(),
  overrides: Record<string, unknown> = {},
) => ({
  post,
  author: {
    id: USER_ID,
    username: 'zen',
  },
  profile: null,
  ...overrides,
})

const makeDependencies = () => ({
  postMentionsService: {
    findInvalidMentionIds: mock(async (_ids: string[]): Promise<string[]> => []),
    attachMany: mock(async (_postId: string, _ids: string[], _tx?: unknown) => undefined),
    detachAll: mock(async (_postId: string, _tx?: unknown) => undefined),
  },

  hashtagsService: {
    findOrCreateMany: mock(async (_names: string[], _tx?: unknown) => [] as { id: string }[]),
    incrementPostsCount: mock(async (_ids: string[], _tx?: unknown) => undefined),
    decrementPostsCount: mock(async (_ids: string[], _tx?: unknown) => undefined),
  },

  postHashtagsService: {
    attachMany: mock(async (_postId: string, _ids: string[], _tx?: unknown) => undefined),
    detachAll: mock(async (_postId: string, _tx?: unknown) => undefined),
    findByPostId: mock(async (_postId: string, _tx?: unknown) => [] as { hashtagId: string }[]),
  },

  postQuotesService: {
    attach: mock(async (_postId: string, _quotedPostId: string, _tx?: unknown) => undefined),
    findByPostId: mock(
      async (_postId: string, _tx?: unknown) => null as { quotedPostId: string } | null,
    ),
    detach: mock(async (_postId: string, _tx?: unknown) => undefined),
  },

  postRepostsService: {
    detachAll: mock(async (_postId: string, _tx?: unknown) => 0),
  },

  notificationsService: {
    create: mock(async (_payload: unknown) => undefined),
  },
})

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

let db: FakeDb
let tx: FakeDb
let dependencies: ReturnType<typeof makeDependencies>
let service: PostsServiceType

beforeEach(() => {
  uploadImage.mockReset()
  destroyImage.mockReset()

  uploadImage.mockImplementation(async () => ({
    url: 'https://res.cloudinary.com/test/image.jpg',
    publicId: 'zentro/posts/test-image',
  }))

  destroyImage.mockImplementation(async () => ({
    result: 'ok',
  }))

  tx = createFakeDb()
  db = createFakeDb(tx)
  dependencies = makeDependencies()

  service = new PostsService(
    db as unknown as typeof database,
    dependencies.postMentionsService as unknown as PostMentionsService,
    dependencies.hashtagsService as unknown as HashtagsService,
    dependencies.postHashtagsService as unknown as PostHashtagsService,
    dependencies.postQuotesService as unknown as PostQuotesService,
    dependencies.postRepostsService as unknown as PostRepostsService,
    dependencies.notificationsService as unknown as NotificationsService,
  )
})

/* -------------------------------------------------------------------------- */
/* create                                                                     */
/* -------------------------------------------------------------------------- */

describe('PostsService.create', () => {
  const body = {
    content: 'Hello world',
    visibility: VisibilityStatus.PUBLIC,
  } as Parameters<PostsServiceType['create']>[1]

  const prepareCreate = (post = makePost()) => {
    db.selectQueue.push(rows([makeUser()]), rows([]))
    tx.insertQueue.push(rows([post]))
    tx.updateQueue.push(rows([]))
  }

  test('creates a post successfully', async () => {
    const post = makePost()
    prepareCreate(post)

    const result = await service.create(USER_ID, body, makeFormData())

    expect(result).toEqual({
      success: true,
      message: 'Post created successfully',
      data: post,
    })

    expect(db.transaction).toHaveBeenCalledTimes(1)
    expect(tx.insert).toHaveBeenCalledTimes(1)
  })

  test('uses the authenticated user as author', async () => {
    prepareCreate()

    await service.create(USER_ID, body, makeFormData())

    expect(tx.insert).toHaveBeenCalledTimes(1)
  })

  test('uses false as the default isPin value', async () => {
    prepareCreate()

    await service.create(USER_ID, body, makeFormData())

    const insertChain = tx.insert.mock.results[0]?.value as QueryChain
    const values = insertChain.values.mock.calls[0]?.[0] as Record<string, unknown>

    expect(values.authorId).toBe(USER_ID)
    expect(values.isPin).toBe(false)
  })

  test('stores null images when no files are supplied', async () => {
    prepareCreate()

    await service.create(USER_ID, body, makeFormData())

    const insertChain = tx.insert.mock.results[0]?.value as QueryChain
    const values = insertChain.values.mock.calls[0]?.[0] as Record<string, unknown>

    expect(values.images).toBeNull()
    expect(uploadImage).not.toHaveBeenCalled()
  })

  test('uploads images and stores their data', async () => {
    const file = makeFile()
    prepareCreate()

    await service.create(USER_ID, body, makeFormData([file]))

    expect(uploadImage).toHaveBeenCalledWith(file, 'zentro/posts')

    const insertChain = tx.insert.mock.results[0]?.value as QueryChain
    const values = insertChain.values.mock.calls[0]?.[0] as Record<string, unknown>

    expect(values.images).toEqual([
      {
        url: 'https://res.cloudinary.com/test/image.jpg',
        publicId: 'zentro/posts/test-image',
      },
    ])
  })

  test('ignores non-File form values', async () => {
    prepareCreate()

    await service.create(USER_ID, body, makeFormData(['not-a-file']))

    expect(uploadImage).not.toHaveBeenCalled()
  })

  test('wraps missing author errors', async () => {
    db.selectQueue.push(rows([]))

    const error = await captureRejection(
      service.create(USER_ID, body, makeFormData()),
    )

    expect(error).toBeInstanceOf(SpongInternalServerErrorException)
    expect(db.transaction).not.toHaveBeenCalled()
  })

  test('rejects invalid mentions before inserting the post', async () => {
    db.selectQueue.push(rows([makeUser()]))

    dependencies.postMentionsService.findInvalidMentionIds.mockResolvedValueOnce([
      'INVALID_USER',
    ])

    const error = await captureRejection(
      service.create(
        USER_ID,
        {
          ...body,
          mentions: ['INVALID_USER'],
        } as Parameters<PostsServiceType['create']>[1],
        makeFormData(),
      ),
    )

    expect(error).toBeInstanceOf(SpongInternalServerErrorException)
    expect(tx.insert).not.toHaveBeenCalled()
  })

  test('creates and attaches hashtags when provided', async () => {
    prepareCreate()

    dependencies.hashtagsService.findOrCreateMany.mockResolvedValueOnce([
      { id: 'HASH_1' },
      { id: 'HASH_2' },
    ])

    await service.create(
      USER_ID,
      {
        ...body,
        hashtags: ['bun', 'typescript'],
      } as Parameters<PostsServiceType['create']>[1],
      makeFormData(),
    )

    expect(dependencies.hashtagsService.findOrCreateMany).toHaveBeenCalledWith(
      ['bun', 'typescript'],
      expect.anything(),
    )

    expect(dependencies.postHashtagsService.attachMany).toHaveBeenCalledWith(
      POST_ID,
      ['HASH_1', 'HASH_2'],
      expect.anything(),
    )

    expect(dependencies.hashtagsService.incrementPostsCount).toHaveBeenCalledWith(
      ['HASH_1', 'HASH_2'],
      expect.anything(),
    )
  })

  test('does not call hashtag services for an empty list', async () => {
    prepareCreate()

    await service.create(
      USER_ID,
      {
        ...body,
        hashtags: [],
      } as Parameters<PostsServiceType['create']>[1],
      makeFormData(),
    )

    expect(dependencies.hashtagsService.findOrCreateMany).not.toHaveBeenCalled()
    expect(dependencies.postHashtagsService.attachMany).not.toHaveBeenCalled()
    expect(dependencies.hashtagsService.incrementPostsCount).not.toHaveBeenCalled()
  })

  test('attaches mentions when provided', async () => {
    prepareCreate()

    await service.create(
      USER_ID,
      {
        ...body,
        mentions: [OTHER_USER_ID],
      } as Parameters<PostsServiceType['create']>[1],
      makeFormData(),
    )

    expect(dependencies.postMentionsService.attachMany).toHaveBeenCalledWith(
      POST_ID,
      [OTHER_USER_ID],
      expect.anything(),
    )
  })

  test('does not attach empty mentions', async () => {
    prepareCreate()

    await service.create(
      USER_ID,
      {
        ...body,
        mentions: [],
      } as Parameters<PostsServiceType['create']>[1],
      makeFormData(),
    )

    expect(dependencies.postMentionsService.attachMany).not.toHaveBeenCalled()
  })

  test('attaches a quoted post and increments its quote count', async () => {
    db.selectQueue.push(rows([makeUser()]), rows([]))

    tx.selectQueue.push(rows([makePost({ id: QUOTED_POST_ID })]))
    tx.insertQueue.push(rows([makePost()]))
    tx.updateQueue.push(rows([]), rows([]))

    await service.create(
      USER_ID,
      {
        ...body,
        quotedPostId: QUOTED_POST_ID,
      } as Parameters<PostsServiceType['create']>[1],
      makeFormData(),
    )

    expect(dependencies.postQuotesService.attach).toHaveBeenCalledWith(
      POST_ID,
      QUOTED_POST_ID,
      expect.anything(),
    )

    expect(tx.update).toHaveBeenCalledTimes(2)
  })

  test('rejects when the quoted post does not exist', async () => {
    db.selectQueue.push(rows([makeUser()]))
    tx.selectQueue.push(rows([]))

    const error = await captureRejection(
      service.create(
        USER_ID,
        {
          ...body,
          quotedPostId: QUOTED_POST_ID,
        } as Parameters<PostsServiceType['create']>[1],
        makeFormData(),
      ),
    )

    expect(error).toBeInstanceOf(SpongInternalServerErrorException)
    expect(tx.insert).not.toHaveBeenCalled()
  })

  test('increments the author profile posts count', async () => {
    prepareCreate()

    await service.create(USER_ID, body, makeFormData())

    const updateChain = tx.update.mock.results[0]?.value as QueryChain
    const values = updateChain.set.mock.calls[0]?.[0] as Record<string, unknown>

    expect(values.postsCount).toBeDefined()
  })

  test('notifies followers after creating the post', async () => {
    db.selectQueue.push(
      rows([makeUser()]),
      rows([{ followerId: OTHER_USER_ID }]),
    )

    tx.insertQueue.push(rows([makePost()]))
    tx.updateQueue.push(rows([]))

    await service.create(USER_ID, body, makeFormData())

    expect(dependencies.notificationsService.create).toHaveBeenCalledWith({
      senderId: USER_ID,
      receiverId: OTHER_USER_ID,
      targetId: POST_ID,
      type: NotificationType.NEW_POST,
      message: 'Zen Allaham published a new post.',
      link: `/posts/${POST_ID}`,
    })
  })

  test('does not notify when there are no followers', async () => {
    prepareCreate()

    await service.create(USER_ID, body, makeFormData())

    expect(dependencies.notificationsService.create).not.toHaveBeenCalled()
  })

  test('cleans uploaded images when insertion fails', async () => {
    db.selectQueue.push(rows([makeUser()]))
    tx.insertQueue.push(failing(new Error('Insert failed')))

    const error = await captureRejection(
      service.create(USER_ID, body, makeFormData([makeFile()])),
    )

    expect(error).toBeInstanceOf(SpongInternalServerErrorException)
    expect(destroyImage).toHaveBeenCalledWith('zentro/posts/test-image')
  })

  test('cleans uploaded images when author does not exist', async () => {
    db.selectQueue.push(rows([]))

    await captureRejection(
      service.create(USER_ID, body, makeFormData([makeFile()])),
    )

    expect(destroyImage).toHaveBeenCalledWith('zentro/posts/test-image')
  })

  test('wraps database errors', async () => {
    db.selectQueue.push(failing(new Error('Database unavailable')))

    const error = await captureRejection(
      service.create(USER_ID, body, makeFormData()),
    )

    expect(error).toBeInstanceOf(SpongInternalServerErrorException)
  })

  test('wraps notification errors after the post transaction', async () => {
    db.selectQueue.push(
      rows([makeUser()]),
      rows([{ followerId: OTHER_USER_ID }]),
    )

    tx.insertQueue.push(rows([makePost()]))
    tx.updateQueue.push(rows([]))

    dependencies.notificationsService.create.mockRejectedValueOnce(
      new Error('Notification service unavailable'),
    )

    const error = await captureRejection(
      service.create(USER_ID, body, makeFormData()),
    )

    expect(error).toBeInstanceOf(SpongInternalServerErrorException)
    expect(tx.insert).toHaveBeenCalledTimes(1)
  })
})

/* -------------------------------------------------------------------------- */
/* findAll                                                                    */
/* -------------------------------------------------------------------------- */

describe('PostsService.findAll', () => {
  test('returns posts and pagination', async () => {
    const posts = [
      {
        post: makePost(),
        author: null,
        profile: null,
        followers: null,
      },
    ]

    db.selectQueue.push(rows(posts), rows([{ total: 25 }]))

    const result = await service.findAll(USER_ID, 2, 10, 10)

    expect(result).toEqual({
      success: true,
      posts,
      pagination: expect.objectContaining({
        page: 2,
        limit: 10,
      }),
    })
  })

  test('applies the requested limit and offset', async () => {
    const postsChain = rows([])

    db.selectQueue.push(postsChain, rows([{ total: 0 }]))

    await service.findAll(USER_ID, 3, 5, 10)

    expect(postsChain.limit).toHaveBeenCalledWith(5)
    expect(postsChain.offset).toHaveBeenCalledWith(10)
  })

  test('uses default pagination values', async () => {
    const postsChain = rows([])

    db.selectQueue.push(postsChain, rows([{ total: 0 }]))

    await service.findAll(USER_ID)

    expect(postsChain.limit).toHaveBeenCalledWith(10)
    expect(postsChain.offset).toHaveBeenCalledWith(0)
  })

  test('uses zero when count query returns no rows', async () => {
    db.selectQueue.push(rows([]), rows([]))

    const result = await service.findAll(USER_ID)

    expect(result.pagination).toBeDefined()
  })

  test('uses public visibility for anonymous visitors', async () => {
    const postsChain = rows([])

    db.selectQueue.push(postsChain, rows([{ total: 0 }]))

    await service.findAll('')

    const condition = postsChain.where.mock.calls[0]?.[0] as SQL
    const params = dialect.sqlToQuery(condition).params

    expect(params).toContain(VisibilityStatus.PUBLIC)
    expect(params).not.toContain(VisibilityStatus.FOLLOWERS)
  })

  test('includes the supplied user ID in visibility conditions', async () => {
    const postsChain = rows([])

    db.selectQueue.push(postsChain, rows([{ total: 0 }]))

    await service.findAll(USER_ID)

    expect(whereParams(postsChain)).toContain(USER_ID)
  })

  test('propagates post query failures', async () => {
    const error = new Error('Posts query failed')

    db.selectQueue.push(failing(error), rows([{ total: 0 }]))

    const result = await captureRejection(service.findAll(USER_ID))

    expect(result).toBe(error)
  })

  test('propagates count query failures', async () => {
    const error = new Error('Count query failed')

    db.selectQueue.push(rows([]), failing(error))

    const result = await captureRejection(service.findAll(USER_ID))

    expect(result).toBe(error)
  })
})

/* -------------------------------------------------------------------------- */
/* findMe                                                                     */
/* -------------------------------------------------------------------------- */

describe('PostsService.findMe', () => {
  test('returns the authenticated user posts', async () => {
    const posts = [{ post: makePost() }]

    db.selectQueue.push(rows(posts), rows([{ total: 1 }]))

    const result = await service.findMe(USER_ID)

    expect(result).toMatchObject({
      success: true,
      posts,
    })
  })

  test('filters posts by author ID', async () => {
    const postsChain = rows([])

    db.selectQueue.push(postsChain, rows([{ total: 0 }]))

    await service.findMe(USER_ID)

    expect(whereParams(postsChain)).toContain(USER_ID)
  })

  test('applies limit and offset', async () => {
    const postsChain = rows([])

    db.selectQueue.push(postsChain, rows([{ total: 0 }]))

    await service.findMe(USER_ID, 2, 5, 5)

    expect(postsChain.limit).toHaveBeenCalledWith(5)
    expect(postsChain.offset).toHaveBeenCalledWith(5)
  })

  test('returns an empty array when no posts exist', async () => {
    db.selectQueue.push(rows([]), rows([{ total: 0 }]))

    const result = await service.findMe(USER_ID)

    expect(result.posts).toEqual([])
  })

  test('propagates query failures', async () => {
    const error = new Error('Find me failed')

    db.selectQueue.push(failing(error), rows([{ total: 0 }]))

    const result = await captureRejection(service.findMe(USER_ID))

    expect(result).toBe(error)
  })
})

/* -------------------------------------------------------------------------- */
/* findByUserId                                                               */
/* -------------------------------------------------------------------------- */

describe('PostsService.findByUserId', () => {
  test('returns target user posts', async () => {
    const posts = [{ post: makePost() }]

    db.selectQueue.push(
      rows([{ id: OTHER_USER_ID }]),
      rows([]),
      rows(posts),
      rows([{ total: 1 }]),
    )

    const result = await service.findByUserId(OTHER_USER_ID, USER_ID)

    expect(result).toMatchObject({
      success: true,
      posts,
    })
  })

  test('throws when target user does not exist', async () => {
    db.selectQueue.push(rows([]))

    const error = await captureRejection(
      service.findByUserId(OTHER_USER_ID, USER_ID),
    )

    expect(error).toBeInstanceOf(SpongNotFoundException)
    expect(db.select).toHaveBeenCalledTimes(1)
  })

  test('does not query follows for anonymous visitors', async () => {
    db.selectQueue.push(
      rows([{ id: OTHER_USER_ID }]),
      rows([]),
      rows([{ total: 0 }]),
    )

    await service.findByUserId(OTHER_USER_ID, '')

    expect(db.select).toHaveBeenCalledTimes(3)
  })

  test('queries followed users for authenticated visitors', async () => {
    db.selectQueue.push(
      rows([{ id: OTHER_USER_ID }]),
      rows([{ followingId: OTHER_USER_ID }]),
      rows([]),
      rows([{ total: 0 }]),
    )

    await service.findByUserId(OTHER_USER_ID, USER_ID)

    expect(db.select).toHaveBeenCalledTimes(4)
  })

  test('allows all visibility levels when viewing own profile', async () => {
    const postsChain = rows([])

    db.selectQueue.push(
      rows([{ id: USER_ID }]),
      rows([]),
      postsChain,
      rows([{ total: 0 }]),
    )

    await service.findByUserId(USER_ID, USER_ID)

    const params = whereParams(postsChain)

    expect(params).toContain(VisibilityStatus.PRIVATE)
    expect(params).toContain(VisibilityStatus.FOLLOWERS)
    expect(params).toContain(VisibilityStatus.PUBLIC)
  })

  test('allows followers-only posts when visitor follows target user', async () => {
    const postsChain = rows([])

    db.selectQueue.push(
      rows([{ id: OTHER_USER_ID }]),
      rows([{ followingId: OTHER_USER_ID }]),
      postsChain,
      rows([{ total: 0 }]),
    )

    await service.findByUserId(OTHER_USER_ID, USER_ID)

    const params = whereParams(postsChain)

    expect(params).toContain(VisibilityStatus.FOLLOWERS)
    expect(params).toContain(VisibilityStatus.PUBLIC)
    expect(params).not.toContain(VisibilityStatus.PRIVATE)
  })

  test('excludes private posts when viewing another user profile', async () => {
    const postsChain = rows([])

    db.selectQueue.push(
      rows([{ id: OTHER_USER_ID }]),
      rows([]),
      postsChain,
      rows([{ total: 0 }]),
    )

    await service.findByUserId(OTHER_USER_ID, USER_ID)

    expect(whereParams(postsChain)).not.toContain(VisibilityStatus.PRIVATE)
  })

  test('excludes followers-only posts when visitor does not follow target', async () => {
    const postsChain = rows([])

    db.selectQueue.push(
      rows([{ id: OTHER_USER_ID }]),
      rows([]),
      postsChain,
      rows([{ total: 0 }]),
    )

    await service.findByUserId(OTHER_USER_ID, USER_ID)

    expect(whereParams(postsChain)).not.toContain(VisibilityStatus.FOLLOWERS)
  })

  test('applies pagination', async () => {
    const postsChain = rows([])

    db.selectQueue.push(
      rows([{ id: OTHER_USER_ID }]),
      rows([]),
      postsChain,
      rows([{ total: 0 }]),
    )

    await service.findByUserId(OTHER_USER_ID, USER_ID, 2, 5, 5)

    expect(postsChain.limit).toHaveBeenCalledWith(5)
    expect(postsChain.offset).toHaveBeenCalledWith(5)
  })

  test('propagates target user query errors', async () => {
    const error = new Error('User query failed')

    db.selectQueue.push(failing(error))

    const result = await captureRejection(
      service.findByUserId(OTHER_USER_ID, USER_ID),
    )

    expect(result).toBe(error)
  })
})

/* -------------------------------------------------------------------------- */
/* findOne                                                                    */
/* -------------------------------------------------------------------------- */

describe('PostsService.findOne', () => {
  test('returns a public post', async () => {
    const post = makePostResult()

    db.selectQueue.push(rows([post]))

    const result = await service.findOne(POST_ID, OTHER_USER_ID)

    expect(result).toEqual({
      success: true,
      data: post,
    })
  })

  test('throws when the post does not exist', async () => {
    db.selectQueue.push(rows([]))

    const error = await captureRejection(
      service.findOne(POST_ID, USER_ID),
    )

    expect(error).toBeInstanceOf(SpongNotFoundException)
  })

  test('allows the author to view their private post', async () => {
    const post = makePostResult(
      makePost({ visibility: VisibilityStatus.PRIVATE }),
    )

    db.selectQueue.push(rows([post]))

    const result = await service.findOne(POST_ID, USER_ID)

    expect(result.success).toBe(true)
    expect(db.select).toHaveBeenCalledTimes(1)
  })

  test('hides private posts from other users', async () => {
    const post = makePostResult(
      makePost({ visibility: VisibilityStatus.PRIVATE }),
    )

    db.selectQueue.push(rows([post]))

    const error = await captureRejection(
      service.findOne(POST_ID, OTHER_USER_ID),
    )

    expect(error).toBeInstanceOf(SpongNotFoundException)
    expect(db.select).toHaveBeenCalledTimes(1)
  })

  test('allows the author to view their followers-only post', async () => {
    const post = makePostResult(
      makePost({ visibility: VisibilityStatus.FOLLOWERS }),
    )

    db.selectQueue.push(rows([post]))

    const result = await service.findOne(POST_ID, USER_ID)

    expect(result.success).toBe(true)
    expect(db.select).toHaveBeenCalledTimes(1)
  })

  test('allows a follower to view a followers-only post', async () => {
    const post = makePostResult(
      makePost({ visibility: VisibilityStatus.FOLLOWERS }),
    )

    db.selectQueue.push(
      rows([post]),
      rows([{ id: 'FOLLOW_1' }]),
    )

    const result = await service.findOne(POST_ID, OTHER_USER_ID)

    expect(result.success).toBe(true)
    expect(db.select).toHaveBeenCalledTimes(2)
  })

  test('hides followers-only posts from non-followers', async () => {
    const post = makePostResult(
      makePost({ visibility: VisibilityStatus.FOLLOWERS }),
    )

    db.selectQueue.push(
      rows([post]),
      rows([]),
    )

    const error = await captureRejection(
      service.findOne(POST_ID, OTHER_USER_ID),
    )

    expect(error).toBeInstanceOf(SpongNotFoundException)
  })

  test('hides followers-only posts from anonymous visitors', async () => {
    const post = makePostResult(
      makePost({ visibility: VisibilityStatus.FOLLOWERS }),
    )

    db.selectQueue.push(rows([post]))

    const error = await captureRejection(
      service.findOne(POST_ID, ''),
    )

    expect(error).toBeInstanceOf(SpongNotFoundException)
    expect(db.select).toHaveBeenCalledTimes(1)
  })

  test('uses the correct follower and author IDs', async () => {
    const post = makePostResult(
      makePost({ visibility: VisibilityStatus.FOLLOWERS }),
    )

    const followChain = rows([{ id: 'FOLLOW_1' }])

    db.selectQueue.push(
      rows([post]),
      followChain,
    )

    await service.findOne(POST_ID, OTHER_USER_ID)

    expect(whereParams(followChain)).toEqual([
      OTHER_USER_ID,
      USER_ID,
    ])
  })
})

/* -------------------------------------------------------------------------- */
/* update                                                                     */
/* -------------------------------------------------------------------------- */

describe('PostsService.update', () => {
  const body = {
    content: 'Updated content',
  } as Parameters<PostsServiceType['update']>[2]

  const prepareUpdate = (
    existingPost = makePost(),
    updatedPost = makePost(),
  ) => {
    tx.selectQueue.push(rows([existingPost]))
    tx.updateQueue.push(rows([updatedPost]))
  }

  test('updates a post successfully', async () => {
    const updatedPost = makePost({ content: 'Updated content' })

    prepareUpdate(makePost(), updatedPost)

    const result = await service.update(
      USER_ID,
      POST_ID,
      body,
      makeFormData(),
    )

    expect(result).toEqual({
      success: true,
      message: 'Post updated successfully',
      data: updatedPost,
    })
  })

  test('rejects updating a post not owned by the user', async () => {
    tx.selectQueue.push(rows([]))

    const error = await captureRejection(
      service.update(USER_ID, POST_ID, body, makeFormData()),
    )

    expect(error).toBeInstanceOf(SpongInternalServerErrorException)
    expect(tx.update).not.toHaveBeenCalled()
  })

  test('checks both post ID and owner ID', async () => {
    const selectChain = rows([makePost()])

    tx.selectQueue.push(selectChain)
    tx.updateQueue.push(rows([makePost()]))

    await service.update(USER_ID, POST_ID, body, makeFormData())

    expect(whereParams(selectChain)).toEqual([
      POST_ID,
      USER_ID,
    ])
  })

  test('does not upload images when no new files are supplied', async () => {
    prepareUpdate(
      makePost({
        images: [
          {
            url: 'https://example.com/old.jpg',
            publicId: 'old-image',
          },
        ],
      }),
    )

    await service.update(USER_ID, POST_ID, body, makeFormData())

    expect(uploadImage).not.toHaveBeenCalled()
  })

  test('preserves existing images when no new images are uploaded', async () => {
    const existingImages: PostImage[] = [
      {
        url: 'https://example.com/old.jpg',
        publicId: 'old-image',
      },
    ]

    const updateChain = rows([makePost({ images: existingImages })])

    tx.selectQueue.push(rows([makePost({ images: existingImages })]))
    tx.updateQueue.push(updateChain)

    await service.update(USER_ID, POST_ID, body, makeFormData())

    const values = updateChain.set.mock.calls[0]?.[0] as Record<string, unknown>

    expect(values.images).toBeUndefined()
    expect(uploadImage).not.toHaveBeenCalled()
  })

  test('uploads and appends new images to existing images', async () => {
    const existingImages: PostImage[] = [
      {
        url: 'https://example.com/old.jpg',
        publicId: 'old-image',
      },
    ]

    const updateChain = rows([
      makePost({
        images: [
          ...existingImages,
          {
            url: 'https://res.cloudinary.com/test/image.jpg',
            publicId: 'zentro/posts/test-image',
          },
        ],
      }),
    ])

    tx.selectQueue.push(rows([makePost({ images: existingImages })]))
    tx.updateQueue.push(updateChain)

    const file = makeFile()

    await service.update(
      USER_ID,
      POST_ID,
      body,
      makeFormData([file]),
    )

    expect(uploadImage).toHaveBeenCalledWith(file, 'zentro/posts')

    const values = updateChain.set.mock.calls[0]?.[0] as Record<string, unknown>

    expect(values.images).toEqual([
      ...existingImages,
      {
        url: 'https://res.cloudinary.com/test/image.jpg',
        publicId: 'zentro/posts/test-image',
      },
    ])
  })

  test('does not sync hashtags when hashtags are omitted', async () => {
    prepareUpdate()

    await service.update(USER_ID, POST_ID, body, makeFormData())

    expect(dependencies.postHashtagsService.findByPostId).not.toHaveBeenCalled()
    expect(dependencies.postHashtagsService.detachAll).not.toHaveBeenCalled()
  })

  test('removes existing hashtag relations when hashtags are empty', async () => {
    prepareUpdate()

    dependencies.postHashtagsService.findByPostId.mockResolvedValueOnce([
      { hashtagId: 'HASH_1' },
      { hashtagId: 'HASH_2' },
    ])

    await service.update(
      USER_ID,
      POST_ID,
      {
        ...body,
        hashtags: [],
      } as Parameters<PostsServiceType['update']>[2],
      makeFormData(),
    )

    expect(dependencies.postHashtagsService.detachAll).toHaveBeenCalledWith(
      POST_ID,
      expect.anything(),
    )

    expect(dependencies.hashtagsService.decrementPostsCount).toHaveBeenCalledWith(
      ['HASH_1', 'HASH_2'],
      expect.anything(),
    )

    expect(dependencies.postHashtagsService.attachMany).not.toHaveBeenCalled()
  })

  test('does not decrement counters for retained hashtags', async () => {
    prepareUpdate()

    dependencies.postHashtagsService.findByPostId.mockResolvedValueOnce([
      { hashtagId: 'HASH_1' },
      { hashtagId: 'HASH_2' },
    ])

    dependencies.hashtagsService.findOrCreateMany.mockResolvedValueOnce([
      { id: 'HASH_1' },
      { id: 'HASH_2' },
    ])

    await service.update(
      USER_ID,
      POST_ID,
      {
        ...body,
        hashtags: ['one', 'two'],
      } as Parameters<PostsServiceType['update']>[2],
      makeFormData(),
    )

    expect(dependencies.hashtagsService.decrementPostsCount).toHaveBeenCalledWith(
      [],
      expect.anything(),
    )
  })

  test('decrements counters for removed hashtags', async () => {
    prepareUpdate()

    dependencies.postHashtagsService.findByPostId.mockResolvedValueOnce([
      { hashtagId: 'HASH_1' },
      { hashtagId: 'HASH_2' },
    ])

    dependencies.hashtagsService.findOrCreateMany.mockResolvedValueOnce([
      { id: 'HASH_2' },
    ])

    await service.update(
      USER_ID,
      POST_ID,
      {
        ...body,
        hashtags: ['two'],
      } as Parameters<PostsServiceType['update']>[2],
      makeFormData(),
    )

    expect(dependencies.hashtagsService.decrementPostsCount).toHaveBeenCalledWith(
      ['HASH_1'],
      expect.anything(),
    )
  })

  test('attaches new hashtag relations', async () => {
    prepareUpdate()

    dependencies.hashtagsService.findOrCreateMany.mockResolvedValueOnce([
      { id: 'HASH_1' },
    ])

    await service.update(
      USER_ID,
      POST_ID,
      {
        ...body,
        hashtags: ['bun'],
      } as Parameters<PostsServiceType['update']>[2],
      makeFormData(),
    )

    expect(dependencies.postHashtagsService.attachMany).toHaveBeenCalledWith(
      POST_ID,
      ['HASH_1'],
      expect.anything(),
    )
  })

  test('validates mentions before replacing existing mentions', async () => {
    prepareUpdate()

    dependencies.postMentionsService.findInvalidMentionIds.mockResolvedValueOnce([
      'INVALID',
    ])

    const error = await captureRejection(
      service.update(
        USER_ID,
        POST_ID,
        {
          ...body,
          mentions: ['INVALID'],
        } as Parameters<PostsServiceType['update']>[2],
        makeFormData(),
      ),
    )

    expect(error).toBeInstanceOf(SpongInternalServerErrorException)
    expect(dependencies.postMentionsService.detachAll).not.toHaveBeenCalled()
  })

  test('replaces mentions when valid IDs are provided', async () => {
    prepareUpdate()

    await service.update(
      USER_ID,
      POST_ID,
      {
        ...body,
        mentions: [OTHER_USER_ID],
      } as Parameters<PostsServiceType['update']>[2],
      makeFormData(),
    )

    expect(dependencies.postMentionsService.detachAll).toHaveBeenCalledWith(
      POST_ID,
      expect.anything(),
    )

    expect(dependencies.postMentionsService.attachMany).toHaveBeenCalledWith(
      POST_ID,
      [OTHER_USER_ID],
      expect.anything(),
    )
  })

  test('detaches mentions when mentions are empty', async () => {
    prepareUpdate()

    await service.update(
      USER_ID,
      POST_ID,
      {
        ...body,
        mentions: [],
      } as Parameters<PostsServiceType['update']>[2],
      makeFormData(),
    )

    expect(dependencies.postMentionsService.detachAll).toHaveBeenCalledWith(
      POST_ID,
      expect.anything(),
    )

    expect(dependencies.postMentionsService.attachMany).not.toHaveBeenCalled()
  })

  test('returns success with undefined data when update returns no row', async () => {
    tx.selectQueue.push(rows([makePost()]))
    tx.updateQueue.push(rows([]))

    const result = await service.update(
      USER_ID,
      POST_ID,
      body,
      makeFormData(),
    )

    expect(result).toEqual({
      success: true,
      message: 'Post updated successfully',
      data: undefined,
    })
  })

  test('cleans uploaded images when ownership check fails', async () => {
    tx.selectQueue.push(rows([]))

    const error = await captureRejection(
      service.update(
        USER_ID,
        POST_ID,
        body,
        makeFormData([makeFile()]),
      ),
    )

    expect(error).toBeInstanceOf(SpongInternalServerErrorException)
    expect(uploadImage).toHaveBeenCalledTimes(1)
    expect(destroyImage).toHaveBeenCalledWith('zentro/posts/test-image')
  })

  test('cleans uploaded images when update query fails', async () => {
    tx.selectQueue.push(rows([makePost()]))
    tx.updateQueue.push(failing(new Error('Update failed')))

    const error = await captureRejection(
      service.update(
        USER_ID,
        POST_ID,
        body,
        makeFormData([makeFile()]),
      ),
    )

    expect(error).toBeInstanceOf(SpongInternalServerErrorException)
    expect(destroyImage).toHaveBeenCalledWith('zentro/posts/test-image')
  })

  test('wraps update database errors', async () => {
    tx.selectQueue.push(failing(new Error('Database failure')))

    const error = await captureRejection(
      service.update(USER_ID, POST_ID, body, makeFormData()),
    )

    expect(error).toBeInstanceOf(SpongInternalServerErrorException)
  })
})

/* -------------------------------------------------------------------------- */
/* delete                                                                     */
/* -------------------------------------------------------------------------- */

describe('PostsService.delete', () => {
  test('deletes a post successfully', async () => {
    tx.selectQueue.push(rows([makePost()]))

    const result = await service.delete(USER_ID, POST_ID)

    expect(result).toEqual({
      success: true,
      message: 'Post deleted successfully',
    })

    expect(db.transaction).toHaveBeenCalledTimes(1)
    expect(tx.delete).toHaveBeenCalledTimes(1)
  })

  test('rejects deleting a post not owned by the user', async () => {
    tx.selectQueue.push(rows([]))

    const error = await captureRejection(
      service.delete(USER_ID, POST_ID),
    )

    expect(error).toBeInstanceOf(SpongInternalServerErrorException)
    expect(dependencies.postMentionsService.detachAll).not.toHaveBeenCalled()
  })

  test('checks both post ID and owner ID', async () => {
    const selectChain = rows([makePost()])

    tx.selectQueue.push(selectChain)

    await service.delete(USER_ID, POST_ID)

    expect(whereParams(selectChain)).toEqual([
      POST_ID,
      USER_ID,
    ])
  })

  test('deletes post mentions', async () => {
    tx.selectQueue.push(rows([makePost()]))

    await service.delete(USER_ID, POST_ID)

    expect(dependencies.postMentionsService.detachAll).toHaveBeenCalledWith(
      POST_ID,
      expect.anything(),
    )
  })

  test('deletes hashtag relations', async () => {
    tx.selectQueue.push(rows([makePost()]))

    await service.delete(USER_ID, POST_ID)

    expect(dependencies.postHashtagsService.detachAll).toHaveBeenCalledWith(
      POST_ID,
      expect.anything(),
    )
  })

  test('does not detach a quote when no quote exists', async () => {
    tx.selectQueue.push(rows([makePost()]))

    dependencies.postQuotesService.findByPostId.mockResolvedValueOnce(null)

    await service.delete(USER_ID, POST_ID)

    expect(dependencies.postQuotesService.detach).not.toHaveBeenCalled()
    expect(tx.update).toHaveBeenCalledTimes(1)
  })

  test('decrements quoted post count and detaches quote relation', async () => {
    tx.selectQueue.push(rows([makePost()]))

    dependencies.postQuotesService.findByPostId.mockResolvedValueOnce({
      quotedPostId: QUOTED_POST_ID,
    })

    await service.delete(USER_ID, POST_ID)

    expect(dependencies.postQuotesService.detach).toHaveBeenCalledWith(
      POST_ID,
      expect.anything(),
    )

    expect(tx.update).toHaveBeenCalledTimes(2)
  })

  test('decrements author posts count', async () => {
    tx.selectQueue.push(rows([makePost()]))

    await service.delete(USER_ID, POST_ID)

    expect(tx.update).toHaveBeenCalledTimes(1)

    const updateChain = tx.update.mock.results[0]?.value as QueryChain
    const values = updateChain.set.mock.calls[0]?.[0] as Record<string, unknown>

    expect(values.postsCount).toBeDefined()
  })

  test('does not update repost count when there are no reposts', async () => {
    tx.selectQueue.push(rows([makePost()]))

    dependencies.postRepostsService.detachAll.mockResolvedValueOnce(0)

    await service.delete(USER_ID, POST_ID)

    expect(dependencies.postRepostsService.detachAll).toHaveBeenCalledWith(
      POST_ID,
      expect.anything(),
    )

    expect(tx.update).toHaveBeenCalledTimes(1)
  })

  test('decrements repost count by the number of deleted reposts', async () => {
    tx.selectQueue.push(rows([makePost()]))

    dependencies.postRepostsService.detachAll.mockResolvedValueOnce(3)

    await service.delete(USER_ID, POST_ID)

    expect(tx.update).toHaveBeenCalledTimes(2)
  })

  test('deletes the post record', async () => {
    tx.selectQueue.push(rows([makePost()]))

    await service.delete(USER_ID, POST_ID)

    expect(tx.delete).toHaveBeenCalledTimes(1)
  })

  test('deletes images from Cloudinary after successful deletion', async () => {
    const images: PostImage[] = [
      {
        url: 'https://example.com/image.jpg',
        publicId: 'image-1',
      },
    ]

    tx.selectQueue.push(rows([makePost({ images })]))

    await service.delete(USER_ID, POST_ID)

    expect(destroyImage).toHaveBeenCalledWith('image-1')
  })

  test('does not delete Cloudinary images when transaction fails', async () => {
    tx.selectQueue.push(rows([]))

    await captureRejection(
      service.delete(USER_ID, POST_ID),
    )

    expect(destroyImage).not.toHaveBeenCalled()
  })

  test('does not fail deletion when Cloudinary cleanup fails', async () => {
    const images: PostImage[] = [
      {
        url: 'https://example.com/image.jpg',
        publicId: 'image-1',
      },
    ]

    tx.selectQueue.push(rows([makePost({ images })]))

    destroyImage.mockRejectedValueOnce(new Error('Cloudinary unavailable'))

    const result = await service.delete(USER_ID, POST_ID)

    expect(result).toEqual({
      success: true,
      message: 'Post deleted successfully',
    })
  })

  test('wraps database errors in an internal server exception', async () => {
    tx.selectQueue.push(failing(new Error('Database unavailable')))

    const error = await captureRejection(
      service.delete(USER_ID, POST_ID),
    )

    expect(error).toBeInstanceOf(SpongInternalServerErrorException)
  })
})
