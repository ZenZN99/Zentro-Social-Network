import { Validator, type ContextHandler } from 'lykosjs'
import { buildPagination, getPagination } from '../../utilities/pagination'
import type { UserVerificationsService } from './user-verifications.service'
import type { UserVerificationStatus } from './schemas/enums/user-verification-status'
import { UpdateUserVerificationRule } from './rules/update'
import { verifyUser } from '../../config/token/verify-user'

export class UserVerificationsController {
  constructor(private readonly userVerificationsService: UserVerificationsService) {}

  readonly create: ContextHandler = async (ctx, reply) => {
    const userId = ctx.user!.id

    const formData = await ctx.formData()

    const result = await this.userVerificationsService.create(userId, formData)

    if (result.type === 'resubmitted') {
      return reply.OK({
        success: true,
        message: 'Verification request resubmitted successfully',
        data: result.data,
      })
    }

    return reply.Created({
      success: true,
      message: 'Verification request submitted successfully.',
      data: result.data,
    })
  }

  readonly findPending: ContextHandler = async (ctx, reply) => {
    const { page, limit, offset } = getPagination(ctx)

    const result = await this.userVerificationsService.findPending(page, limit, offset)

    return reply.OK({
      success: true,
      data: {
        verifications: result.verifications,
        pagination: buildPagination(result.total, page, limit),
      },
    })
  }

  readonly update: ContextHandler = async (ctx, reply) => {
    const adminId = ctx.user!.id
    const { verificationId } = ctx.params

    if (!verificationId) {
      return reply.NotFound({
        success: false,
        message: 'Verification ID is required',
      })
    }

    const body = await ctx.json<{
      status: UserVerificationStatus | null
      rejectionReason: string | null
    }>()

    const validation = Validator.validate(body, UpdateUserVerificationRule)

    if (!validation.valid) {
      return reply.UnprocessableContent({
        success: false,
        message: 'Validation failed',
        errors: validation.errors,
      })
    }

    const updateData = {
      status: body.status,
      rejectionReason: body.rejectionReason,
    }

    const result = await this.userVerificationsService.update(adminId, verificationId, updateData)
    return reply.OK({
      success: true,
      message: 'Verification request reviewed successfully.',
      data: result.data,
    })
  }

  verifyToken(token: string) {
    return verifyUser(token)
  }
}
