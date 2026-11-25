import { afterAll, afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
import { BadRequestException, NotFoundException, Validator } from 'lykosjs'
import type { ContextHandler } from 'lykosjs'
import type { UserVerificationsService } from '../user-verifications.service'
import { UserVerificationStatus } from '../schemas/enums/user-verification-status'
import { UpdateUserVerificationRule } from '../rules/update'

/* -------------------------------------------------------------------------- */
/*  Isolate the controller from the real pagination helper                    */
/* -------------------------------------------------------------------------- */

const PAGINATION_MODULE = '../../../utilities/pagination'
// Copy the real module BEFORE mocking so it can be restored afterwards (mock.module leaks across files).
const realPagination = { ...(await import('../../../utilities/pagination')) }

const getPaginationMock = mock(
  (..._args: Parameters<typeof realPagination.getPagination>) =>
    ({ page: 2, limit: 5, offset: 5 }) as ReturnType<typeof realPagination.getPagination>,
)

mock.module(PAGINATION_MODULE, () => ({ ...realPagination, getPagination: getPaginationMock }))

afterAll(() => {
  mock.module(PAGINATION_MODULE, () => realPagination)
})

const { UserVerificationsController } = await import('../user-verifications.controller')

/* -------------------------------------------------------------------------- */
/*  Typed test doubles (no `any`)                                             */
/* -------------------------------------------------------------------------- */

type Req = Parameters<ContextHandler>[0]
type Res = Parameters<ContextHandler>[1]

type ResponseMethod = 'OK' | 'Created' | 'NotFound' | 'UnprocessableContent'

interface FakeResponse {
  readonly method: ResponseMethod
  readonly body: unknown
}

type FormDataLike = Parameters<UserVerificationsService['create']>[1]

interface ReqOptions {
  params?: Record<string, string | undefined>
  /** `null` simulates a request where the auth middleware did not attach a user. */
  user?: { id: string } | null
  body?: unknown
  jsonError?: Error
  formData?: FormDataLike
  formDataError?: Error
}

function createReq(options: ReqOptions = {}) {
  const formData = options.formData ?? { get: (): null => null }
  const json = mock(async (): Promise<unknown> => {
    if (options.jsonError) throw options.jsonError
    return options.body
  })
  const formDataFn = mock(async (): Promise<FormDataLike> => {
    if (options.formDataError) throw options.formDataError
    return formData
  })
  const user = options.user === null ? undefined : (options.user ?? { id: 'user-1' })
  const req = { params: options.params ?? {}, user, json, formData: formDataFn }
  return { req: req as unknown as Req, json, formData: formDataFn, formDataValue: formData }
}

function createRes() {
  const build = () => mock((_body: unknown): void => {})

  const OK = build()
  const Created = build()
  const NotFound = build()
  const UnprocessableContent = build()

  const res = {
    OK,
    Created,
    NotFound,
    UnprocessableContent,
  } as unknown as Res

  return {
    res,
    OK,
    Created,
    NotFound,
    UnprocessableContent,
  }
}
type CreateResult = Awaited<ReturnType<UserVerificationsService['create']>>
type FindPendingResult = Awaited<ReturnType<UserVerificationsService['findPending']>>
type UpdateResult = Awaited<ReturnType<UserVerificationsService['update']>>
type UpdateBody = Parameters<UserVerificationsService['update']>[2]

const verificationData = { id: 'verification-1', userId: 'user-1', status: 'PENDING' }

const createdResult = { type: 'created', data: verificationData } as unknown as CreateResult
const resubmittedResult = { type: 'resubmitted', data: verificationData } as unknown as CreateResult

const findPendingResult = {
  verifications: [{ ...verificationData, user: null }],
  total: 25,
  page: 2,
  limit: 5,
} as unknown as FindPendingResult

const updateResult = {
  data: { ...verificationData, status: 'APPROVED' },
} as unknown as UpdateResult

function createFakeService() {
  return {
    create: mock(
      async (_userId: string, _formData: FormDataLike): Promise<CreateResult> => createdResult,
    ),
    findPending: mock(
      async (_page?: number, _limit?: number, _offset?: number): Promise<FindPendingResult> =>
        findPendingResult,
    ),
    update: mock(
      async (_adminId: string, _verificationId: string, _body: UpdateBody): Promise<UpdateResult> =>
        updateResult,
    ),
  }
}

type FakeService = ReturnType<typeof createFakeService>

type ValidationResult = ReturnType<typeof Validator.validate>

const validResult = { valid: true, errors: [] } as unknown as ValidationResult
const invalidErrors = { status: ['Status must be APPROVED or REJECTED'] }
const invalidResult = { valid: false, errors: invalidErrors } as unknown as ValidationResult

function installValidatorSpy() {
  return spyOn(Validator, 'validate').mockReturnValue(validResult)
}

/* -------------------------------------------------------------------------- */
/*  Setup                                                                     */
/* -------------------------------------------------------------------------- */

let service: FakeService
let controller: InstanceType<typeof UserVerificationsController>
let validateSpy: ReturnType<typeof installValidatorSpy>

beforeEach(() => {
  getPaginationMock.mockClear()
  validateSpy = installValidatorSpy()
  service = createFakeService()
  controller = new UserVerificationsController(service as unknown as UserVerificationsService)
})

afterEach(() => {
  validateSpy.mockRestore()
})

/* -------------------------------------------------------------------------- */
/*  create                                                                    */
/* -------------------------------------------------------------------------- */

describe('UserVerificationsController.create', () => {
  test('passes the authenticated user id and the parsed form data to the service', async () => {
    const { req, formDataValue } = createReq({ user: { id: 'real-user' } })
    const { res } = createRes()

    await controller.create(req, res)

    expect(service.create).toHaveBeenCalledTimes(1)
    expect(service.create.mock.calls[0]?.[0]).toBe('real-user')
    expect(service.create.mock.calls[0]?.[1]).toBe(formDataValue)
  })

  test('responds 201 with the created request on a first submission', async () => {
    const { req } = createReq()
    const { res, Created, OK } = createRes()

    await controller.create(req, res)

    expect(Created).toHaveBeenCalledTimes(1)
    expect(OK).not.toHaveBeenCalled()

    expect(Created.mock.calls[0]?.[0]).toEqual({
      success: true,
      message: 'Verification request submitted successfully.',
      data: verificationData,
    })
  })

  test('responds 200 with the updated request on a resubmission', async () => {
    service.create.mockResolvedValueOnce(resubmittedResult)
    const { req } = createReq()
    const { res, OK, Created } = createRes()

    await controller.create(req, res)

    expect(OK).toHaveBeenCalledTimes(1)
    expect(Created).not.toHaveBeenCalled()

    expect(OK.mock.calls[0]?.[0]).toEqual({
      success: true,
      message: 'Verification request resubmitted successfully',
      data: verificationData,
    })
  })

  test('uses the user id from the session, never from the form data or params', async () => {
    const { req } = createReq({
      user: { id: 'real-user' },
      params: { userId: 'attacker' },
      formData: { get: (name: string) => (name === 'userId' ? 'attacker' : null) },
    })
    const { res } = createRes()

    await controller.create(req, res)

    expect(service.create.mock.calls[0]?.[0]).toBe('real-user')
  })

  test('does not call the service when the request is not multipart form data', async () => {
    const { req } = createReq({ formDataError: new Error('invalid form data') })
    const { res, Created, OK } = createRes()

    await expect(controller.create(req, res)).rejects.toThrow('invalid form data')

    expect(service.create).not.toHaveBeenCalled()
    expect(Created).not.toHaveBeenCalled()
    expect(OK).not.toHaveBeenCalled()
  })

  test('lets service errors propagate without sending a success response', async () => {
    service.create.mockRejectedValueOnce(
      new BadRequestException({
        success: false,
        message: 'Your account has already been verified.',
      }),
    )
    const { req } = createReq()
    const { res, Created, OK } = createRes()

    await expect(controller.create(req, res)).rejects.toBeInstanceOf(BadRequestException)

    expect(Created).not.toHaveBeenCalled()
    expect(OK).not.toHaveBeenCalled()
  })

  test('never calls the service when there is no authenticated user', async () => {
    const { req } = createReq({ user: null })
    const { res, Created, OK } = createRes()

    await expect(controller.create(req, res)).rejects.toThrow()

    expect(service.create).not.toHaveBeenCalled()
    expect(Created).not.toHaveBeenCalled()
    expect(OK).not.toHaveBeenCalled()
  })
})

/* -------------------------------------------------------------------------- */
/*  findPending                                                               */
/* -------------------------------------------------------------------------- */

describe('UserVerificationsController.findPending', () => {
  test('reads pagination from the request and forwards it to the service', async () => {
    const { req } = createReq()
    const { res } = createRes()

    await controller.findPending(req, res)

    expect(getPaginationMock).toHaveBeenCalledWith(req)
    expect(service.findPending).toHaveBeenCalledTimes(1)
    expect(service.findPending).toHaveBeenCalledWith(2, 5, 5)
  })

  test('responds 200 with the requests and pagination built from the total', async () => {
    const { req } = createReq()
    const { res, OK } = createRes()

    await controller.findPending(req, res)

    expect(OK).toHaveBeenCalledTimes(1)

    expect(OK.mock.calls[0]?.[0]).toEqual({
      success: true,
      data: {
        verifications: findPendingResult.verifications,
        pagination: realPagination.buildPagination(25, 2, 5),
      },
    })
  })

  test('propagates service errors without sending a success response', async () => {
    service.findPending.mockRejectedValueOnce(new Error('db down'))
    const { req } = createReq()
    const { res, OK } = createRes()

    await expect(controller.findPending(req, res)).rejects.toThrow('db down')
    expect(OK).not.toHaveBeenCalled()
  })
})

/* -------------------------------------------------------------------------- */
/*  update                                                                    */
/* -------------------------------------------------------------------------- */

const approveBody: UpdateBody = { status: UserVerificationStatus.APPROVED, rejectionReason: null }

describe('UserVerificationsController.update', () => {
  test('validates the body against UpdateUserVerificationRule', async () => {
    const { req } = createReq({ params: { verificationId: 'verification-1' }, body: approveBody })
    const { res } = createRes()

    await controller.update(req, res)

    expect(validateSpy).toHaveBeenCalledTimes(1)
    expect(validateSpy).toHaveBeenCalledWith(approveBody, UpdateUserVerificationRule)
  })

  test('passes adminId, verificationId and body to the service and responds 200', async () => {
    const { req } = createReq({
      user: { id: 'admin-1' },
      params: { verificationId: 'verification-1' },
      body: approveBody,
    })

    const { res, OK } = createRes()

    await controller.update(req, res)

    expect(service.update).toHaveBeenCalledWith('admin-1', 'verification-1', approveBody)

    expect(OK).toHaveBeenCalledTimes(1)

    expect(OK.mock.calls[0]?.[0]).toEqual({
      success: true,
      message: 'Verification request reviewed successfully.',
      data: updateResult.data,
    })
  })

  test('takes the admin id from the session, never from the request body', async () => {
    const { req } = createReq({
      user: { id: 'real-admin' },
      params: { verificationId: 'verification-1' },
      body: { ...approveBody, adminId: 'attacker', reviewedBy: 'attacker' },
    })
    const { res } = createRes()

    await controller.update(req, res)

    expect(service.update.mock.calls[0]?.[0]).toBe('real-admin')
  })

  for (const verificationId of [undefined, '']) {
    test(`responds 404 and never reads the body when verificationId is ${JSON.stringify(verificationId) ?? 'undefined'}`, async () => {
      const { req, json } = createReq({
        params: { verificationId },
        body: approveBody,
      })

      const { res, NotFound, OK } = createRes()

      await controller.update(req, res)

      expect(NotFound).toHaveBeenCalledTimes(1)

      expect(NotFound.mock.calls[0]?.[0]).toEqual({
        success: false,
        message: 'Verification ID is required',
      })

      expect(OK).not.toHaveBeenCalled()
      expect(json).not.toHaveBeenCalled()
      expect(validateSpy).not.toHaveBeenCalled()
      expect(service.update).not.toHaveBeenCalled()
    })
  }

  test('responds 422 with the validation errors and skips the service when the body is invalid', async () => {
    validateSpy.mockReturnValueOnce(invalidResult)

    const { req } = createReq({
      params: { verificationId: 'verification-1' },
      body: { status: 'HACKED', rejectionReason: null },
    })

    const { res, UnprocessableContent, OK } = createRes()

    await controller.update(req, res)

    expect(UnprocessableContent).toHaveBeenCalledTimes(1)

    expect(UnprocessableContent.mock.calls[0]?.[0]).toEqual({
      success: false,
      message: 'Validation failed',
      errors: invalidErrors,
    })

    expect(service.update).not.toHaveBeenCalled()
    expect(OK).not.toHaveBeenCalled()
  })

  test('does not validate or call the service when the body cannot be parsed', async () => {
    const { req } = createReq({
      params: { verificationId: 'verification-1' },
      jsonError: new Error('bad json'),
    })
    const { res, OK } = createRes()

    await expect(controller.update(req, res)).rejects.toThrow('bad json')

    expect(validateSpy).not.toHaveBeenCalled()
    expect(service.update).not.toHaveBeenCalled()
    expect(OK).not.toHaveBeenCalled()
  })

  test('lets not-found errors from the service propagate', async () => {
    service.update.mockRejectedValueOnce(
      new NotFoundException({
        success: false,
        message: 'No verification request was found for this user.',
      }),
    )
    const { req } = createReq({ params: { verificationId: 'ghost' }, body: approveBody })
    const { res, OK } = createRes()

    await expect(controller.update(req, res)).rejects.toBeInstanceOf(NotFoundException)
    expect(OK).not.toHaveBeenCalled()
  })

  test('lets bad-request errors from the service propagate', async () => {
    service.update.mockRejectedValueOnce(
      new BadRequestException({
        success: false,
        message: 'This verification request is not pending review.',
      }),
    )
    const { req } = createReq({ params: { verificationId: 'verification-1' }, body: approveBody })
    const { res, OK } = createRes()

    await expect(controller.update(req, res)).rejects.toBeInstanceOf(BadRequestException)
    expect(OK).not.toHaveBeenCalled()
  })

  test('never calls the service when there is no authenticated user', async () => {
    const { req } = createReq({
      user: null,
      params: { verificationId: 'verification-1' },
      body: approveBody,
    })

    const { res, OK } = createRes()

    await expect(controller.update(req, res)).rejects.toThrow()

    expect(service.update).not.toHaveBeenCalled()
    expect(OK).not.toHaveBeenCalled()
  })
  // HARDENING — fails today: the whole parsed body (including unknown keys) is handed to the service.
  // The service currently ignores extra keys, but the controller should forward only the whitelisted fields.
  test('forwards only status and rejectionReason to the service', async () => {
    const { req } = createReq({
      params: { verificationId: 'verification-1' },
      body: { ...approveBody, reviewedBy: 'attacker', userId: 'attacker' },
    })
    const { res } = createRes()

    await controller.update(req, res)

    expect(service.update.mock.calls[0]?.[2]).toEqual(approveBody)
  })
})
