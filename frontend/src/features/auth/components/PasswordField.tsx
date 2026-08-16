import LockOutlineRounded from '@mui/icons-material/LockOutlineRounded'
import VisibilityOffRounded from '@mui/icons-material/VisibilityOffRounded'
import VisibilityRounded from '@mui/icons-material/VisibilityRounded'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import TextField from '@mui/material/TextField'

import type { PasswordFieldProps } from '../types/auth.types'

export function PasswordField({
  autoFocus,
  color = 'primary',
  disabled,
  hasError,
  helperText,
  label,
  showPassword,
  showVisibilityToggle = false,
  value,
  onChange,
  onToggleVisibility,
}: PasswordFieldProps) {
  return (
    <TextField
      fullWidth
      required
      autoFocus={autoFocus}
      autoComplete="new-password"
      type={showPassword ? 'text' : 'password'}
      label={label}
      value={value}
      error={hasError}
      helperText={helperText}
      color={color}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <LockOutlineRounded fontSize="small" />
            </InputAdornment>
          ),
          endAdornment:
            showVisibilityToggle && onToggleVisibility ? (
              <InputAdornment position="end">
                <IconButton
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  edge="end"
                  onClick={onToggleVisibility}
                >
                  {showPassword ? <VisibilityOffRounded /> : <VisibilityRounded />}
                </IconButton>
              </InputAdornment>
            ) : undefined,
        },
      }}
    />
  )
}
