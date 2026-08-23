import { createLocalId } from './id.utils'
import type { DraftLogEntry } from '../types/ingest.types'

export function createSampleBatch(): DraftLogEntry[] {
  const now = Date.now()

  return [
    {
      id: createLocalId(),
      timestamp: new Date(now).toISOString(),
      level: 'error',
      service: 'checkout',
      message: 'payment declined',
      attributes: [
        { id: createLocalId(), key: 'user_id', value: '42', type: 'string' },
        { id: createLocalId(), key: 'region', value: 'eu-west', type: 'string' },
        { id: createLocalId(), key: 'retries', value: '3', type: 'number' },
      ],
    },
    {
      id: createLocalId(),
      timestamp: new Date(now - 15_000).toISOString(),
      level: 'info',
      service: 'auth',
      message: 'login succeeded',
      attributes: [{ id: createLocalId(), key: 'user_id', value: '42', type: 'number' }],
    },
    {
      id: createLocalId(),
      timestamp: new Date(now - 30_000).toISOString(),
      level: 'warn',
      service: 'inventory',
      message: 'stock running low',
      attributes: [{ id: createLocalId(), key: 'sku', value: 'SKU-1029', type: 'string' }],
    },
  ]
}

export function createSampleRawBatchJson(): string {
  const now = new Date().toISOString()

  return JSON.stringify(
    {
      logs: [
        {
          timestamp: now,
          level: 'info',
          service: 'auth',
          message: 'login succeeded',
          attributes: { user_id: 42 },
        },
        {
          timestamp: 'not-a-timestamp',
          level: 'critical',
          service: 'auth',
          message: 'invalid entry',
        },
      ],
    },
    null,
    2,
  )
}
