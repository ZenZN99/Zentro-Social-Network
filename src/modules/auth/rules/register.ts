import { defineSchema, Validator } from 'lykosjs'

export const RegisterAuthRule = defineSchema({
  firstName: Validator.string(3, 50).required(),
  lastName: Validator.string(3, 50).required(),
  email: Validator.text().required().email(),
  password: Validator.string(8, 40).required(),
})
