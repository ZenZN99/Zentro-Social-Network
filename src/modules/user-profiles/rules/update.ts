import { defineSchema, rules } from 'riser-bob'

export const UpdateUserProfileRule = defineSchema({
  bio: rules(['nullable', 'string', 'maxLength:300']),
  website: rules(['nullable', 'url']),
})
