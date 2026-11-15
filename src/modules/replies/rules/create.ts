import { defineSchema, rules } from 'riser-bob'

export const CreateReplyRule = defineSchema({
  content: rules(['required', 'string', 'maxLength:300']),
  parentReplyId: rules(['nullable', 'string']),
})
