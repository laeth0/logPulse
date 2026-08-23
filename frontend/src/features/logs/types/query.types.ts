import type { AttributeFilterRow } from './filter.types'
import type { LogEntry, LogLevel } from './log.types'

export interface QueryFiltersState {
  service: string
  level: LogLevel | ''
  since: string
  until: string
  q: string
  limit: number
  attributes: AttributeFilterRow[]
}

export interface QueryLogsResponse {
  logs: LogEntry[]
  next_cursor: string | null
}

export type QueryStatus = 'idle' | 'loading' | 'loading-more' | 'success' | 'error'

export interface UseQueryLogsResult {
  status: QueryStatus
  logs: LogEntry[]
  nextCursor: string | null
  error: string | null
  search: (filters: QueryFiltersState, apiKey: string) => Promise<void>
  loadMore: (apiKey: string) => Promise<void>
  reset: () => void
}
