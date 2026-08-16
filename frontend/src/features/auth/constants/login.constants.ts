import type { LoginFormData } from '../schemas/login.schema'

export const INITIAL_LOGIN_FORM = {
  email: 'loadgen@internal.logpulse',
  password: 'please-change-me-in-production',
} satisfies LoginFormData
