import { defineSchema, Validator } from 'lykosjs'
import { UserVerificationStatus } from '../schemas/enums/user-verification-status'

export const UpdateUserVerificationRule = defineSchema({
  status: Validator.enum(UserVerificationStatus).required(),
  rejectionReason: Validator.string(2, 500).nullable(),
})
