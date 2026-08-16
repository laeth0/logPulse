import { Navigate } from 'react-router-dom'

import { useAuth } from '../shared/hooks/useAuth'
import { ROUTES } from './routes'

export function RootRedirect() {
  const { isAuthenticated } = useAuth()
  return <Navigate to={isAuthenticated ? ROUTES.DASHBOARD : ROUTES.LOGIN} replace />
}
