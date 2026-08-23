import type { AttributeFilterRow } from '../types/filter.types'
import type { DraftAttributeRow, IngestLogEntryPayload } from '../types/ingest.types'
import type { LogAttributeValue } from '../types/log.types'
import type { DraftLogEntry } from '../types/ingest.types'

export function draftAttributesToRecord(
  rows: DraftAttributeRow[],
): Record<string, LogAttributeValue> {
  const record: Record<string, LogAttributeValue> = {}

  for (const row of rows) {
    const key = row.key.trim()
    if (!key) continue

    record[key] = coerceAttributeValue(row.value, row.type)
  }

  return record
}

function coerceAttributeValue(value: string, type: DraftAttributeRow['type']): LogAttributeValue {
  if (type === 'number') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (type === 'boolean') {
    return value === 'true'
  }
  return value
}

export function draftEntryToPayload(entry: DraftLogEntry): IngestLogEntryPayload {
  return {
    timestamp: entry.timestamp,
    level: entry.level,
    service: entry.service.trim(),
    message: entry.message.trim(),
    attributes: draftAttributesToRecord(entry.attributes),
  }
}

export function filterRowsToParams(rows: AttributeFilterRow[]): Record<string, string> {
  const params: Record<string, string> = {}

  for (const row of rows) {
    const key = row.key.trim()
    if (!key || !row.value) continue
    params[`attr.${key}`] = row.value
  }

  return params
}
