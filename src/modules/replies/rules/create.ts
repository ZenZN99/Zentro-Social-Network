import { defineSchema, Validator } from 'lykosjs'

export const CreateReplyRule = defineSchema({
  content: Validator.string(3, 300).required(),
  parentReplyId: Validator.text().nullable(),
})
