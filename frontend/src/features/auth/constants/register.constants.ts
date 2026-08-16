import type { RegisterFormData } from '../schemas/register.schema'

export const INITIAL_REGISTER_FORM = {
  email: '',
  password: '',
  confirmPassword: '',
} satisfies RegisterFormData

export const SIGNAL_BARS = [
  16, 26, 34, 22, 44, 72, 38, 28, 62, 96, 52, 34, 76, 48, 32, 66, 40, 22, 30, 18,
] as const
