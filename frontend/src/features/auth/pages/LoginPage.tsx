import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { ROUTES } from '../../../router/routes'
import { AuthHeader } from '../components/AuthHeader'
import { LoginForm } from '../components/LoginForm'
import { SignalStory } from '../components/SignalStory'
import { INITIAL_LOGIN_FORM } from '../constants/login.constants'
import { useLogin } from '../hooks/useLogin'
import { loginSchema } from '../schemas/login.schema'
import type { LoginFormData } from '../schemas/login.schema'
import type { LoginFieldErrors } from '../types/auth-form.types'
import '../styles/auth.css'

export function LoginPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState<LoginFormData>(INITIAL_LOGIN_FORM)
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({})
  const [showPassword, setShowPassword] = useState(false)
  const { status, error, login } = useLogin()

  const isSubmitting = status === 'submitting'

  const updateField = (field: keyof LoginFormData, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => ({ ...current, [field]: undefined }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const result = loginSchema.safeParse(form)
    if (!result.success) {
      const flattened = result.error.flatten().fieldErrors
      setFieldErrors({
        email: flattened.email?.[0],
        password: flattened.password?.[0],
      })
      return
    }

    const succeeded = await login(result.data)
    if (succeeded) {
      navigate(ROUTES.DASHBOARD, { replace: true })
    }
  }

  return (
    <Box className="auth-page">
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
        <AuthHeader />

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
            aria-labelledby="login-title"
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
            <LoginForm
              form={form}
              fieldErrors={fieldErrors}
              isSubmitting={isSubmitting}
              requestError={error}
              showPassword={showPassword}
              onFieldChange={updateField}
              onSubmit={handleSubmit}
              onTogglePassword={() => setShowPassword((visible) => !visible)}
            />
          </Paper>

          <SignalStory />
        </Box>
      </Box>
    </Box>
  )
}
