import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded'
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded'
import DataObjectRounded from '@mui/icons-material/DataObjectRounded'
import EmailRounded from '@mui/icons-material/EmailRounded'
import LockOutlineRounded from '@mui/icons-material/LockOutlineRounded'
import ShieldRounded from '@mui/icons-material/ShieldRounded'
import SpeedRounded from '@mui/icons-material/SpeedRounded'
import VisibilityOffRounded from '@mui/icons-material/VisibilityOffRounded'
import VisibilityRounded from '@mui/icons-material/VisibilityRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import type { FormEvent } from 'react'

import { useRegister } from '../hooks/useRegister'
import { registerSchema } from '../schemas/register.schema'
import type { RegisterFormData } from '../schemas/register.schema'
import './RegisterPage.css'

const INITIAL_FORM: RegisterFormData = {
  email: '',
  password: '',
  confirmPassword: '',
}

const SIGNAL_BARS = [
  16, 26, 34, 22, 44, 72, 38, 28, 62, 96, 52, 34, 76, 48, 32, 66, 40, 22, 30, 18,
] as const

type FieldErrors = Partial<Record<keyof RegisterFormData, string>>

export function RegisterPage() {
  const [form, setForm] = useState<RegisterFormData>(INITIAL_FORM)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [showPassword, setShowPassword] = useState(false)
  const { status, tenant, error, register, reset } = useRegister()

  const isSubmitting = status === 'submitting'
  const passwordsMatch = form.confirmPassword.length > 0 && form.password === form.confirmPassword

  const updateField = (field: keyof RegisterFormData, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => ({ ...current, [field]: undefined }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const result = registerSchema.safeParse(form)
    if (!result.success) {
      const flattened = result.error.flatten().fieldErrors
      setFieldErrors({
        email: flattened.email?.[0],
        password: flattened.password?.[0],
        confirmPassword: flattened.confirmPassword?.[0],
      })
      return
    }

    await register({ email: result.data.email, password: result.data.password })
  }

  const handleCreateAnother = () => {
    setForm(INITIAL_FORM)
    setFieldErrors({})
    setShowPassword(false)
    reset()
  }

  return (
    <Box className="register-page">
      <Box
        component="main"
        sx={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: '80rem',
          minHeight: '100svh',
          mx: 'auto',
          px: { xs: 2, sm: 3, lg: 5 },
          py: { xs: 2.5, sm: 3, lg: 4 },
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Stack
          component="header"
          direction="row"
          sx={{ alignItems: 'center', justifyContent: 'space-between', mb: { xs: 4, md: 5 } }}
        >
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
            <Box
              aria-hidden="true"
              sx={{
                width: 38,
                height: 38,
                display: 'grid',
                placeItems: 'center',
                borderRadius: '12px 12px 12px 4px',
                color: '#071518',
                bgcolor: '#75e3e3',
                boxShadow: '0 0 2rem rgba(117, 227, 227, 0.24)',
              }}
            >
              <DataObjectRounded fontSize="small" />
            </Box>
            <Typography
              sx={{
                color: '#f0ffff',
                fontWeight: 750,
                fontSize: '1.12rem',
                letterSpacing: '-0.03em',
              }}
            >
              log<span style={{ color: '#75e3e3' }}>Pulse</span>
            </Typography>
          </Stack>

          <Chip
            size="small"
            label="EU · encrypted"
            icon={<ShieldRounded />}
            sx={{
              display: { xs: 'none', sm: 'inline-flex' },
              color: '#b8d2d4',
              bgcolor: 'rgba(255,255,255,0.045)',
              border: '1px solid rgba(184, 210, 212, 0.14)',
              '& .MuiChip-icon': { color: '#75e3e3' },
            }}
          />
        </Stack>

        <Box
          sx={{
            flex: 1,
            display: 'grid',
            gridTemplateAreas: { xs: '"form" "story"', md: '"story form"' },
            gridTemplateColumns: {
              xs: 'minmax(0, 1fr)',
              md: 'minmax(0, 1fr) minmax(24rem, 0.82fr)',
            },
            alignItems: 'center',
            gap: { xs: 5, md: 7, lg: 10 },
            pb: { xs: 3, md: 5 },
          }}
        >
          <Paper
            component="section"
            elevation={0}
            aria-labelledby="register-title"
            sx={{
              gridArea: 'form',
              width: '100%',
              maxWidth: { xs: '34rem', md: '31rem' },
              justifySelf: 'center',
              p: { xs: 2.5, sm: 4, lg: 4.5 },
              borderRadius: { xs: 3, sm: 4 },
              bgcolor: 'rgba(247, 250, 248, 0.98)',
              border: '1px solid rgba(255,255,255,0.72)',
              boxShadow: '0 2rem 6rem rgba(0, 0, 0, 0.32)',
            }}
          >
            {status === 'success' && tenant ? (
              <SuccessState
                tenantId={tenant.id}
                email={tenant.email}
                onReset={handleCreateAnother}
              />
            ) : (
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

                {error ? (
                  <Alert severity="error" sx={{ mb: 2.5, borderRadius: 2 }}>
                    {error}
                  </Alert>
                ) : null}

                <Box component="form" noValidate onSubmit={handleSubmit}>
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
                      onChange={(event) => updateField('email', event.target.value)}
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

                    <TextField
                      fullWidth
                      required
                      autoComplete="new-password"
                      type={showPassword ? 'text' : 'password'}
                      label="Password"
                      value={form.password}
                      error={Boolean(fieldErrors.password)}
                      helperText={fieldErrors.password ?? 'At least 8 characters'}
                      disabled={isSubmitting}
                      onChange={(event) => updateField('password', event.target.value)}
                      slotProps={{
                        input: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <LockOutlineRounded fontSize="small" />
                            </InputAdornment>
                          ),
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                                edge="end"
                                onClick={() => setShowPassword((visible) => !visible)}
                              >
                                {showPassword ? <VisibilityOffRounded /> : <VisibilityRounded />}
                              </IconButton>
                            </InputAdornment>
                          ),
                        },
                      }}
                    />

                    <TextField
                      fullWidth
                      required
                      autoComplete="new-password"
                      type={showPassword ? 'text' : 'password'}
                      label="Confirm password"
                      value={form.confirmPassword}
                      error={Boolean(fieldErrors.confirmPassword)}
                      helperText={
                        fieldErrors.confirmPassword ??
                        (passwordsMatch ? 'Passwords match' : 'Enter the same password again')
                      }
                      color={passwordsMatch ? 'success' : 'primary'}
                      disabled={isSubmitting}
                      onChange={(event) => updateField('confirmPassword', event.target.value)}
                      slotProps={{
                        input: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <LockOutlineRounded fontSize="small" />
                            </InputAdornment>
                          ),
                        },
                      }}
                    />

                    <Button
                      fullWidth
                      type="submit"
                      variant="contained"
                      disabled={isSubmitting}
                      endIcon={isSubmitting ? undefined : <ArrowForwardRounded />}
                      sx={{ mt: 0.5 }}
                    >
                      {isSubmitting ? (
                        <CircularProgress size={24} color="inherit" />
                      ) : (
                        'Create workspace'
                      )}
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
            )}
          </Paper>

          <SignalStory />
        </Box>
      </Box>
    </Box>
  )
}

interface SuccessStateProps {
  tenantId: string
  email: string
  onReset: () => void
}

function SuccessState({ tenantId, email, onReset }: SuccessStateProps) {
  return (
    <Stack spacing={2.5} sx={{ alignItems: 'flex-start', py: { xs: 1, sm: 3 } }}>
      <Box
        sx={{
          width: 58,
          height: 58,
          display: 'grid',
          placeItems: 'center',
          borderRadius: '18px',
          color: '#087078',
          bgcolor: '#d9f4f1',
        }}
      >
        <CheckCircleRounded sx={{ fontSize: 34 }} />
      </Box>
      <Box>
        <Typography variant="overline" color="primary.dark">
          Signal established
        </Typography>
        <Typography id="register-title" variant="h1" sx={{ mt: 0.75, fontSize: '2.25rem' }}>
          Your workspace is ready.
        </Typography>
      </Box>
      <Typography color="text.secondary" sx={{ lineHeight: 1.7 }}>
        Account created for <strong>{email}</strong>. You can now sign in and start routing logs
        into your workspace.
      </Typography>
      <Box
        sx={{
          width: '100%',
          p: 2,
          borderRadius: 2,
          bgcolor: '#e9efed',
          border: '1px solid #d7e1de',
        }}
      >
        <Typography variant="overline" color="text.secondary">
          Tenant ID
        </Typography>
        <Typography
          sx={{
            mt: 0.5,
            overflowWrap: 'anywhere',
            fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
            fontSize: '0.82rem',
          }}
        >
          {tenantId}
        </Typography>
      </Box>
      <Button fullWidth variant="contained" onClick={onReset}>
        Create another account
      </Button>
    </Stack>
  )
}

function SignalStory() {
  return (
    <Stack
      component="aside"
      sx={{
        gridArea: 'story',
        color: '#eaffff',
        maxWidth: '39rem',
        justifySelf: { xs: 'center', md: 'stretch' },
        width: '100%',
      }}
      spacing={{ xs: 3, md: 4 }}
    >
      <Box>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2 }}>
          <Box
            aria-hidden="true"
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: '#75e3e3',
              boxShadow: '0 0 1rem #75e3e3',
            }}
          />
          <Typography variant="overline" sx={{ color: '#91b9bb' }}>
            Live observability layer
          </Typography>
        </Stack>
        <Typography
          component="h2"
          variant="h2"
          sx={{ fontSize: { xs: '2.1rem', sm: '2.8rem', lg: '3.65rem' }, maxWidth: '12ch' }}
        >
          Turn log noise into a clear pulse.
        </Typography>
        <Typography sx={{ mt: 2, color: '#a9c3c5', maxWidth: '54ch', lineHeight: 1.75 }}>
          Ingest, filter, and aggregate high-volume events without losing the thread. Your team gets
          one calm view of what the system is saying now.
        </Typography>
      </Box>

      <Box className="signal-field" aria-label="Live log ingestion signal visualization">
        <div className="signal-scanline" aria-hidden="true" />
        <div className="signal-bars" aria-hidden="true">
          {SIGNAL_BARS.map((height, index) => (
            <span
              className="signal-bar"
              key={`${height}-${index}`}
              style={{ height: `${height}%`, animationDelay: `${index * -90}ms` }}
            />
          ))}
        </div>
        <span className="signal-cursor">15,000 events/s · nominal</span>
      </Box>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1.5, sm: 3 }}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', flex: 1 }}>
          <SpeedRounded sx={{ color: '#75e3e3' }} />
          <Typography variant="body2" sx={{ color: '#b9d0d2' }}>
            Built for high-throughput ingestion
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', flex: 1 }}>
          <ShieldRounded sx={{ color: '#ff9a88' }} />
          <Typography variant="body2" sx={{ color: '#b9d0d2' }}>
            Tenant-isolated by design
          </Typography>
        </Stack>
      </Stack>
    </Stack>
  )
}
