import { defineSchema, rules, type ValidationSchema } from 'riser-bob'
import { VisibilityStatus } from '../schemas/enums/visibility-status'

export const UpdatePostRule = defineSchema({
  content: rules(['nullable', 'string', 'maxLength:300']),
  visibility: rules(['nullable', `enum:${Object.values(VisibilityStatus).join(',')}`]),
  isPin: rules(['nullable', 'boolean']),
  mentions: rules(['nullable', 'array', 'maxItems:10']),
  hashtags: rules(['nullable', 'array', 'maxItems:10']),
})
