import { useSyncExternalStore } from 'react'

import { getAuthSession, subscribeAuthSession } from '../../store/auth.store'
import type { AuthSession } from '../../store/auth.store'

interface UseAuthResult {
  session: AuthSession | null
  isAuthenticated: boolean
}

export function useAuth(): UseAuthResult {
  const session = useSyncExternalStore(subscribeAuthSession, getAuthSession, getAuthSession)

  return { session, isAuthenticated: session !== null }
}
