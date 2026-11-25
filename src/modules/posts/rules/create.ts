import { defineSchema, Validator } from 'lykosjs'
import { VisibilityStatus } from '../schemas/enums/visibility-status'

export const CreatePostRule = defineSchema({
  content: Validator.string(3, 300).required(),
  visibility: Validator.enum(VisibilityStatus).required(),
  isPin: Validator.boolean().required(),
  mentions: Validator.array(1, 10).optional(),
  hashtags: Validator.array(1, 10).optional(),
  quotedPostId: Validator.text().optional(),
})
