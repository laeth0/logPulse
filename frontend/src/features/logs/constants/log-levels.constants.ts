import type { LogLevel } from '../types/log.types'

export const LOG_LEVEL_OPTIONS: LogLevel[] = ['debug', 'info', 'warn', 'error']

export const LOG_LEVEL_STATUS_COLORS: Record<LogLevel, string> = {
  debug: '#898781',
  info: '#0ca30c',
  warn: '#fab219',
  error: '#d03b3b',
}
