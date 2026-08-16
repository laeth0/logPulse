import type { LoginFormData } from '../schemas/login.schema'

export const INITIAL_LOGIN_FORM = {
  email: '',
  password: '',
} satisfies LoginFormData
