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
import { Link as RouterLink } from 'react-router-dom'

import { ROUTES } from '../../../router/routes'
import type { LoginFormProps } from '../types/auth-form.types'
import { PasswordField } from './PasswordField'

export function LoginForm({
  form,
  fieldErrors,
  isSubmitting,
  requestError,
  showPassword,
  onFieldChange,
  onSubmit,
  onTogglePassword,
}: LoginFormProps) {
  return (
    <>
      <Box sx={{ mb: 3.25 }}>
        <Typography
          id="login-title"
          component="h1"
          variant="h1"
          sx={{ fontSize: { xs: '2rem', sm: '2.45rem' } }}
        >
          Welcome back.
          <br />
          Pick up the pulse.
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1.5, lineHeight: 1.65 }}>
          Sign in to keep watching your logs in real time.
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
            helperText={fieldErrors.password ?? ''}
            disabled={isSubmitting}
            showPassword={showPassword}
            showVisibilityToggle
            onChange={(value) => onFieldChange('password', value)}
            onToggleVisibility={onTogglePassword}
          />

          <Button
            fullWidth
            type="submit"
            variant="contained"
            disabled={isSubmitting}
            endIcon={isSubmitting ? undefined : <ArrowForwardRounded />}
            sx={{ mt: 0.5 }}
          >
            {isSubmitting ? <CircularProgress size={24} color="inherit" /> : 'Sign in'}
          </Button>

          <Typography sx={{ textAlign: 'center', color: 'text.secondary', fontSize: '0.9rem' }}>
            New to logPulse?{' '}
            <Typography
              component={RouterLink}
              to={ROUTES.REGISTER}
              sx={{ color: 'primary.main', fontWeight: 600, textDecoration: 'none' }}
            >
              Create a workspace
            </Typography>
          </Typography>
        </Stack>
      </Box>
    </>
  )
}
