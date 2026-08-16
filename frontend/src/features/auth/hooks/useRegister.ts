import { useCallback, useState } from 'react'

import { getApiErrorMessage } from '../../../shared/api/http'
import { register as registerRequest } from '../api/auth.api'
import type { RegisterPayload, Tenant } from '../types/auth.types'

type RegisterStatus = 'idle' | 'submitting' | 'success' | 'error'

interface UseRegisterResult {
  status: RegisterStatus
  tenant: Tenant | null
  error: string | null
  register: (payload: RegisterPayload) => Promise<Tenant | null>
  reset: () => void
}

export function useRegister(): UseRegisterResult {
  const [status, setStatus] = useState<RegisterStatus>('idle')
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [error, setError] = useState<string | null>(null)

  const register = useCallback(async (payload: RegisterPayload) => {
    setStatus('submitting')
    setError(null)

    try {
      const createdTenant = await registerRequest(payload)
      setTenant(createdTenant)
      setStatus('success')
      return createdTenant
    } catch (requestError) {
      setError(getApiErrorMessage(requestError))
      setStatus('error')
      return null
    }
  }, [])

  const reset = useCallback(() => {
    setStatus('idle')
    setTenant(null)
    setError(null)
  }, [])

  return { status, tenant, error, register, reset }
}
