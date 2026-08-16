import type { FormEventHandler } from 'react'

import type { LoginFormData } from '../schemas/login.schema'
import type { RegisterFormData } from '../schemas/register.schema'

export type RegisterFieldErrors = Partial<Record<keyof RegisterFormData, string>>
export type LoginFieldErrors = Partial<Record<keyof LoginFormData, string>>

export interface RegisterFormProps {
  form: RegisterFormData
  fieldErrors: RegisterFieldErrors
  isSubmitting: boolean
  passwordsMatch: boolean
  requestError: string | null
  showPassword: boolean
  onFieldChange: (field: keyof RegisterFormData, value: string) => void
  onSubmit: FormEventHandler<HTMLFormElement>
  onTogglePassword: () => void
}

export interface LoginFormProps {
  form: LoginFormData
  fieldErrors: LoginFieldErrors
  isSubmitting: boolean
  requestError: string | null
  showPassword: boolean
  onFieldChange: (field: keyof LoginFormData, value: string) => void
  onSubmit: FormEventHandler<HTMLFormElement>
  onTogglePassword: () => void
}
