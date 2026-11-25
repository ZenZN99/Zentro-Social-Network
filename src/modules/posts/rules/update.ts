import { defineSchema, Validator } from 'lykosjs'
import { VisibilityStatus } from '../schemas/enums/visibility-status'

export const UpdatePostRule = defineSchema({
  content: Validator.string(3, 300).optional(),
  visibility: Validator.enum(VisibilityStatus).optional(),
  isPin: Validator.boolean().optional(),
  mentions: Validator.array(1, 10).optional(),
  hashtags: Validator.array(1, 10).optional(),
})
