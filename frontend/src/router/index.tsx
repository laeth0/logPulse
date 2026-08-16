import { createBrowserRouter } from 'react-router-dom'

import { DashboardPage } from '../features/dashboard/pages/DashboardPage'
import { LoginPage } from '../features/auth/pages/LoginPage'
import { RegisterPage } from '../features/auth/pages/RegisterPage'
import { ProtectedRoute } from './ProtectedRoute'
import { RootRedirect } from './RootRedirect'
import { ROUTES } from './routes'

export const router = createBrowserRouter([
  { path: ROUTES.LOGIN, element: <LoginPage /> },
  { path: ROUTES.REGISTER, element: <RegisterPage /> },
  {
    element: <ProtectedRoute />,
    children: [{ path: ROUTES.DASHBOARD, element: <DashboardPage /> }],
  },
  { path: '/', element: <RootRedirect /> },
  { path: '*', element: <RootRedirect /> },
])
