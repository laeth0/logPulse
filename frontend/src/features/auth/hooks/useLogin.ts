import { useCallback, useState } from 'react'

import { getApiErrorMessage } from '../../../shared/api/http'
import { setAuthSession } from '../../../store/auth.store'
import { ensureApiKey, login as loginRequest } from '../api/auth.api'
import type { LoginStatus, UseLoginResult } from '../types/auth-hooks.types'
import type { LoginPayload } from '../types/auth.types'

export function useLogin(): UseLoginResult {
  const [status, setStatus] = useState<LoginStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const login = useCallback(async (payload: LoginPayload) => {
    setStatus('submitting')
    setError(null)

    try {
      const tokens = await loginRequest(payload)
      const apiKey = await ensureApiKey(tokens.access_token)

      setAuthSession({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenType: tokens.token_type,
        expiresIn: tokens.expires_in,
        apiKey,
        email: payload.email,
      })

      setStatus('success')
      return true
    } catch (requestError) {
      setError(getApiErrorMessage(requestError))
      setStatus('error')
      return false
    }
  }, [])

  return { status, error, login }
}
