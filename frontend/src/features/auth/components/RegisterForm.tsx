import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded'
import EmailRounded from '@mui/icons-material/EmailRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import InputAdornment from '@mui/material/InputAdornment'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import type { RegisterFormProps } from '../types/auth.types'
import { PasswordField } from './PasswordField'

export function RegisterForm({
  form,
  fieldErrors,
  isSubmitting,
  passwordsMatch,
  requestError,
  showPassword,
  onFieldChange,
  onSubmit,
  onTogglePassword,
}: RegisterFormProps) {
  return (
    <>
      <Box sx={{ mb: 3.25 }}>
        <Typography variant="overline" color="primary.dark">
          Create your workspace
        </Typography>
        <Typography
          id="register-title"
          component="h1"
          variant="h1"
          sx={{ mt: 0.75, fontSize: { xs: '2rem', sm: '2.45rem' } }}
        >
          See every signal.
          <br />
          Miss nothing.
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1.5, lineHeight: 1.65 }}>
          Set up a focused home for your logs in under a minute.
        </Typography>
      </Box>

      {requestError ? (
        <Alert severity="error" sx={{ mb: 2.5, borderRadius: 2 }}>
          {requestError}
        </Alert>
      ) : null}

      <Box component="form" noValidate onSubmit={onSubmit}>
        <Stack spacing={2.25}>
          <TextField
            fullWidth
            required
            autoFocus
            autoComplete="email"
            label="Work email"
            placeholder="you@company.com"
            value={form.email}
            error={Boolean(fieldErrors.email)}
            helperText={fieldErrors.email}
            disabled={isSubmitting}
            onChange={(event) => onFieldChange('email', event.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <EmailRounded fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
          />

          <PasswordField
            label="Password"
            value={form.password}
            hasError={Boolean(fieldErrors.password)}
            helperText={fieldErrors.password ?? 'At least 8 characters'}
            disabled={isSubmitting}
            showPassword={showPassword}
            showVisibilityToggle
            onChange={(value) => onFieldChange('password', value)}
            onToggleVisibility={onTogglePassword}
          />

          <PasswordField
            label="Confirm password"
            value={form.confirmPassword}
            hasError={Boolean(fieldErrors.confirmPassword)}
            helperText={
              fieldErrors.confirmPassword ??
              (passwordsMatch ? 'Passwords match' : 'Enter the same password again')
            }
            color={passwordsMatch ? 'success' : 'primary'}
            disabled={isSubmitting}
            showPassword={showPassword}
            onChange={(value) => onFieldChange('confirmPassword', value)}
          />

          <Button
            fullWidth
            type="submit"
            variant="contained"
            disabled={isSubmitting}
            endIcon={isSubmitting ? undefined : <ArrowForwardRounded />}
            sx={{ mt: 0.5 }}
          >
            {isSubmitting ? <CircularProgress size={24} color="inherit" /> : 'Create workspace'}
          </Button>
        </Stack>
      </Box>

      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ mt: 2.5, textAlign: 'center', lineHeight: 1.6 }}
      >
        By creating an account, you agree to keep your workspace credentials secure.
      </Typography>
    </>
  )
}
