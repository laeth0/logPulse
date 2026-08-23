export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogAttributeValue = string | number | boolean

export interface LogEntry {
  id: string
  timestamp: string
  level: LogLevel
  service: string
  message: string
  attributes: Record<string, LogAttributeValue>
}
