import { defineSchema, Validator } from 'lykosjs'

export const LoginAuthRule = defineSchema({
  email: Validator.text().required().email(),
  password: Validator.string(8, 40).required(),
})
