import type { LoginPayload, RegisterPayload, Tenant } from './auth.types'

export type RegisterStatus = 'idle' | 'submitting' | 'success' | 'error'

export interface UseRegisterResult {
  status: RegisterStatus
  tenant: Tenant | null
  error: string | null
  register: (payload: RegisterPayload) => Promise<Tenant | null>
  reset: () => void
}

export type LoginStatus = 'idle' | 'submitting' | 'success' | 'error'

export interface UseLoginResult {
  status: LoginStatus
  error: string | null
  login: (payload: LoginPayload) => Promise<boolean>
}
