import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import { useState } from 'react'
import type { FormEvent } from 'react'

import { AuthHeader } from '../components/AuthHeader'
import { RegisterForm } from '../components/RegisterForm'
import { SignalStory } from '../components/SignalStory'
import { SuccessState } from '../components/SuccessState'
import { INITIAL_REGISTER_FORM } from '../constants/register.constants'
import { useRegister } from '../hooks/useRegister'
import { registerSchema } from '../schemas/register.schema'
import type { RegisterFormData } from '../schemas/register.schema'
import type { RegisterFieldErrors } from '../types/auth.types'
import './RegisterPage.css'

export function RegisterPage() {
  const [form, setForm] = useState<RegisterFormData>(INITIAL_REGISTER_FORM)
  const [fieldErrors, setFieldErrors] = useState<RegisterFieldErrors>({})
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
    setForm(INITIAL_REGISTER_FORM)
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
              <RegisterForm
                form={form}
                fieldErrors={fieldErrors}
                isSubmitting={isSubmitting}
                passwordsMatch={passwordsMatch}
                requestError={error}
                showPassword={showPassword}
                onFieldChange={updateField}
                onSubmit={handleSubmit}
                onTogglePassword={() => setShowPassword((visible) => !visible)}
              />
            )}
          </Paper>

          <SignalStory />
        </Box>
      </Box>
    </Box>
  )
}
