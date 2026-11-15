import { defineSchema, rules } from 'riser-bob'
import { UserVerificationStatus } from '../schemas/enums/user-verification-status'

export const UpdateUserVerificationRule = defineSchema({
  status: rules(['required', `enum:${Object.values(UserVerificationStatus).join(',')}`]),
  rejectionReason: rules(['nullable', 'string', 'maxLength:500']),
})