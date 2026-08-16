import type { FormEventHandler } from 'react'

import type { RegisterFormData } from '../schemas/register.schema'

export interface RegisterPayload {
  email: string
  password: string
}

export interface Tenant {
  id: string
  email: string
}

export type RegisterFieldErrors = Partial<Record<keyof RegisterFormData, string>>

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

export interface SuccessStateProps {
  tenantId: string
  email: string
  onReset: () => void
}

export interface PasswordFieldProps {
  autoFocus?: boolean
  color?: 'primary' | 'success'
  disabled: boolean
  hasError: boolean
  helperText: string
  label: string
  showPassword: boolean
  showVisibilityToggle?: boolean
  value: string
  onChange: (value: string) => void
  onToggleVisibility?: () => void
}
