import { Navigate, Outlet } from 'react-router-dom'

import { useAuth } from '../shared/hooks/useAuth'
import { ROUTES } from './routes'

export function ProtectedRoute() {
  const { isAuthenticated } = useAuth()

  return isAuthenticated ? <Outlet /> : <Navigate to={ROUTES.LOGIN} replace />
}
