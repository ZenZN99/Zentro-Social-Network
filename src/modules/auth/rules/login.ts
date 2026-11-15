import { defineSchema, rules, type ValidationSchema } from 'riser-bob'

export const LoginAuthRule = defineSchema({
  email: rules(['required', 'email']),
  password: rules(['required', 'string', 'minLength:8', 'maxLength:40']),
})
