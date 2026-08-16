import axios from 'axios'

import { DEFAULT_API_BASE_URL } from '../constants/api.constants'
import type { ApiErrorResponse } from '../types/api.types'

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
const apiBaseUrl = (configuredApiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, '')

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

  return error.response.data?.error ?? 'The request could not be completed. Please try again.'
}
