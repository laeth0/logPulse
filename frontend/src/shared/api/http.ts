import axios from 'axios'

import type { ApiErrorResponse } from '../types/api.types'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, '')

export const http = axios.create({
  baseURL: apiBaseUrl,
  timeout: 10_000,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
})

export function getApiErrorMessage(error: unknown): string {
  if (!axios.isAxiosError<ApiErrorResponse>(error)) {
    return 'Something unexpected happened. Please try again.'
  }

  if (!error.response) {
    return 'The LogPulse API is unavailable. Check that the backend is running and try again.'
  }

  return error.response.data?.error ?? 'We could not create your account. Please try again.'
}
