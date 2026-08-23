import type { LogAttributeValue, LogLevel } from './log.types'

export type DraftAttributeValueType = 'string' | 'number' | 'boolean'

export interface DraftAttributeRow {
  id: string
  key: string
  value: string
  type: DraftAttributeValueType
}

export interface DraftLogEntry {
  id: string
  timestamp: string
  level: LogLevel
  service: string
  message: string
  attributes: DraftAttributeRow[]
}

export interface IngestLogEntryPayload {
  timestamp: string
  level: LogLevel
  service: string
  message: string
  attributes?: Record<string, LogAttributeValue>
}

export interface IngestRequestPayload {
  logs: unknown[]
}

export interface RejectedLogEntry {
  index: number
  reason: string
}

export interface IngestResponse {
  accepted: number
  rejected: RejectedLogEntry[]
}

export type IngestStatus = 'idle' | 'submitting' | 'success' | 'error'

export interface UseIngestLogsResult {
  status: IngestStatus
  result: IngestResponse | null
  error: string | null
  ingest: (payload: IngestRequestPayload, apiKey: string) => Promise<IngestResponse | null>
  reset: () => void
}
