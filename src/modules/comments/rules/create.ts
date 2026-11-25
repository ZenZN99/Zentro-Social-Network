import { Validator, defineSchema } from 'lykosjs'

export const CreateCommentRule = defineSchema({
  content: Validator.string(3, 300).required(),
})
