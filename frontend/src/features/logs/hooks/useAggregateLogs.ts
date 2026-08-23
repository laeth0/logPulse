import { useCallback, useState } from 'react'

import { getApiErrorMessage } from '../../../shared/api/http'
import { aggregateLogs } from '../api/logs.api'
import { buildAggregateParams } from '../utils/query-params.utils'
import type {
  AggregateBucketPoint,
  AggregateFiltersState,
  AggregateStatus,
  UseAggregateLogsResult,
} from '../types/aggregate.types'

export function useAggregateLogs(): UseAggregateLogsResult {
  const [status, setStatus] = useState<AggregateStatus>('idle')
  const [buckets, setBuckets] = useState<AggregateBucketPoint[]>([])
  const [error, setError] = useState<string | null>(null)

  const aggregate = useCallback(async (filters: AggregateFiltersState, apiKey: string) => {
    setStatus('loading')
    setError(null)

    try {
      const response = await aggregateLogs(buildAggregateParams(filters), apiKey)
      setBuckets(response.buckets)
      setStatus('success')
    } catch (requestError) {
      setError(getApiErrorMessage(requestError))
      setStatus('error')
    }
  }, [])

  const reset = useCallback(() => {
    setStatus('idle')
    setBuckets([])
    setError(null)
  }, [])

  return { status, buckets, error, aggregate, reset }
}
