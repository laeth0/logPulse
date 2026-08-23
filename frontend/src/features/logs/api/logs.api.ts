import axios from 'axios'

import { http } from '../../../shared/api/http'
import { aggregateLogsResponseSchema } from '../schemas/aggregate-logs.schema'
import { ingestResponseSchema } from '../schemas/log-entry.schema'
import { queryLogsResponseSchema } from '../schemas/query-logs.schema'
import type { AggregateLogsResponse } from '../types/aggregate.types'
import type { LogRequestParams } from '../types/filter.types'
import type { IngestRequestPayload, IngestResponse } from '../types/ingest.types'
import type { QueryLogsResponse } from '../types/query.types'

function authHeaders(apiKey: string) {
  return { Authorization: `Bearer ${apiKey}` }
}

export async function ingestLogs(
  payload: IngestRequestPayload,
  apiKey: string,
): Promise<IngestResponse> {
  try {
    const response = await http.post<unknown>('/logs', payload, { headers: authHeaders(apiKey) })
    return ingestResponseSchema.parse(response.data)
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 400) {
      const parsed = ingestResponseSchema.safeParse(error.response.data)
      if (parsed.success) {
        return parsed.data
      }
    }
    throw error
  }
}

export async function queryLogs(
  params: LogRequestParams,
  apiKey: string,
): Promise<QueryLogsResponse> {
  const response = await http.get<unknown>('/logs', { params, headers: authHeaders(apiKey) })
  return queryLogsResponseSchema.parse(response.data)
}

export async function aggregateLogs(
  params: LogRequestParams,
  apiKey: string,
): Promise<AggregateLogsResponse> {
  const response = await http.get<unknown>('/logs/aggregate', {
    params,
    headers: authHeaders(apiKey),
  })
  return aggregateLogsResponseSchema.parse(response.data)
}
