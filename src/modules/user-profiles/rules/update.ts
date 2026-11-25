import { defineSchema, Validator } from 'lykosjs'

export const UpdateUserProfileRule = defineSchema({
  bio: Validator.text().nullable(),
  website: Validator.text().url().optional(),
})
