import { defineSchema, passwordRules, rules, type ValidationSchema } from 'riser-bob'

export const RegisterAuthRule = defineSchema({
  firstName: rules(['required', 'string', 'minLength:3', 'maxLength:50']),
  lastName: rules(['required', 'string', 'minLength:3', 'maxLength:50']),
  email: rules(['required', 'email']),
  password: passwordRules(['required', 'string', 'minLength:8', 'maxLength:40']),
})
