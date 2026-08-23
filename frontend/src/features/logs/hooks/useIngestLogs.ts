import { useCallback, useState } from 'react'

import { getApiErrorMessage } from '../../../shared/api/http'
import { ingestLogs } from '../api/logs.api'
import type { IngestStatus, UseIngestLogsResult } from '../types/ingest.types'
import type { IngestRequestPayload, IngestResponse } from '../types/ingest.types'

export function useIngestLogs(): UseIngestLogsResult {
  const [status, setStatus] = useState<IngestStatus>('idle')
  const [result, setResult] = useState<IngestResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ingest = useCallback(async (payload: IngestRequestPayload, apiKey: string) => {
    setStatus('submitting')
    setError(null)

    try {
      const response = await ingestLogs(payload, apiKey)
      setResult(response)
      setStatus('success')
      return response
    } catch (requestError) {
      setError(getApiErrorMessage(requestError))
      setStatus('error')
      setResult(null)
      return null
    }
  }, [])

  const reset = useCallback(() => {
    setStatus('idle')
    setResult(null)
    setError(null)
  }, [])

  return { status, result, error, ingest, reset }
}
