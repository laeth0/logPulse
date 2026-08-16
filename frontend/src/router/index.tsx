import { Navigate, createBrowserRouter } from 'react-router-dom'

import { RegisterPage } from '../features/auth/pages/RegisterPage'
import { ROUTES } from './routes'

export const router = createBrowserRouter([
  { path: ROUTES.REGISTER, element: <RegisterPage /> },
  { path: '/', element: <Navigate to={ROUTES.REGISTER} replace /> },
  { path: '*', element: <Navigate to={ROUTES.REGISTER} replace /> },
])
