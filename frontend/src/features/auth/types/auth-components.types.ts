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
