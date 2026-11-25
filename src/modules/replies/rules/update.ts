import { defineSchema, Validator } from 'lykosjs'

export const UpdateReplyRule = defineSchema({
  content: Validator.string(3, 300).required(),
})
