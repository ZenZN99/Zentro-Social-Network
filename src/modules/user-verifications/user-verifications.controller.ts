import { Validator, type SpongHandler } from 'riser-bob'
import { buildPagination, getPagination } from '../../utilities/pagination'
import type { UserVerificationsService } from './user-verifications.service'
import type { UserVerificationStatus } from './schemas/enums/user-verification-status'
import { UpdateUserVerificationRule } from './rules/update'

export class UserVerificationsController {
  constructor(private readonly userVerificationsService: UserVerificationsService) {}

  readonly create: SpongHandler = async (spongReq, spongRes) => {
    const userId = spongReq.user!.id

    const formData = await spongReq.formData()

    const result = await this.userVerificationsService.create(userId, formData)

    if (result.type === 'resubmitted') {
      return spongRes.SpongOK({
        success: true,
        message: 'Verification request resubmitted successfully',
        data: result.data,
      })
    }

    return spongRes.SpongCreated({
      success: true,
      message: 'Verification request submitted successfully.',
      data: result.data,
    })
  }

  readonly findPending: SpongHandler = async (spongReq, spongRes) => {
    const { page, limit, offset } = getPagination(spongReq)

    const result = await this.userVerificationsService.findPending(page, limit, offset)

    return spongRes.SpongOK({
      success: true,
      data: {
        verifications: result.verifications,
        pagination: buildPagination(result.total, page, limit),
      },
    })
  }

  readonly update: SpongHandler = async (spongReq, spongRes) => {
    const adminId = spongReq.user!.id
    const { verificationId } = spongReq.params

    if (!verificationId) {
      return spongRes.SpongNotFound({
        success: false,
        message: 'Verification ID is required',
      })
    }

    const body = await spongReq.json<{
      status: UserVerificationStatus | null
      rejectionReason: string | null
    }>()

    const validation = Validator.validate(body, UpdateUserVerificationRule)

    if (!validation.valid) {
      return spongRes.SpongUnprocessableContent({
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
    return spongRes.SpongOK({
      success: true,
      message: 'Verification request reviewed successfully.',
      data: result.data,
    })
  }
}
