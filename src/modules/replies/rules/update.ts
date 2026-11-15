import { defineSchema, rules } from 'riser-bob'

export const UpdateReplyRule = defineSchema({
  content: rules(['required', 'string', 'maxLength:300']),
})
