import { defineSchema, rules } from 'riser-bob'

export const CreateCommentRule = defineSchema({
  content: rules(['required', 'string', 'maxLength:300']),
})
