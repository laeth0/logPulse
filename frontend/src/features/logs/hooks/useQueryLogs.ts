import { useCallback, useRef, useState } from 'react'

import { getApiErrorMessage } from '../../../shared/api/http'
import { queryLogs } from '../api/logs.api'
import { buildQueryParams } from '../utils/query-params.utils'
import type { LogEntry } from '../types/log.types'
import type { QueryFiltersState, QueryStatus, UseQueryLogsResult } from '../types/query.types'

export function useQueryLogs(): UseQueryLogsResult {
  const [status, setStatus] = useState<QueryStatus>('idle')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const lastFiltersRef = useRef<QueryFiltersState | null>(null)

  const search = useCallback(async (filters: QueryFiltersState, apiKey: string) => {
    setStatus('loading')
    setError(null)
    lastFiltersRef.current = filters

    try {
      const response = await queryLogs(buildQueryParams(filters), apiKey)
      setLogs(response.logs)
      setNextCursor(response.next_cursor)
      setStatus('success')
    } catch (requestError) {
      setError(getApiErrorMessage(requestError))
      setStatus('error')
    }
  }, [])

  const loadMore = useCallback(
    async (apiKey: string) => {
      if (!nextCursor || !lastFiltersRef.current) return

      setStatus('loading-more')
      setError(null)

      try {
        const response = await queryLogs(
          buildQueryParams(lastFiltersRef.current, nextCursor),
          apiKey,
        )
        setLogs((current) => [...current, ...response.logs])
        setNextCursor(response.next_cursor)
        setStatus('success')
      } catch (requestError) {
        setError(getApiErrorMessage(requestError))
        setStatus('error')
      }
    },
    [nextCursor],
  )

  const reset = useCallback(() => {
    setStatus('idle')
    setLogs([])
    setNextCursor(null)
    setError(null)
    lastFiltersRef.current = null
  }, [])

  return { status, logs, nextCursor, error, search, loadMore, reset }
}
