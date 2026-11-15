import { defineSchema, rules } from 'riser-bob'
import { VisibilityStatus } from '../schemas/enums/visibility-status'

export const CreatePostRule = defineSchema({
  content: rules(['required', 'string', 'maxLength:300']),
  visibility: rules(['required', `enum:${Object.values(VisibilityStatus).join(',')}`]),
  isPin: rules(['required', 'boolean']),
  mentions: rules(['nullable', 'array', 'maxItems:10']),
  hashtags: rules(['nullable', 'array', 'maxItems:10']),
  quotedPostId: ['nullable', 'string'],
})
