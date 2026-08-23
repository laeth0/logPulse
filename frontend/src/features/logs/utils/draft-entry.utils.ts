import { createLocalId } from './id.utils'
import type { AttributeFilterRow } from '../types/filter.types'
import type { DraftAttributeRow, DraftLogEntry } from '../types/ingest.types'

export function createDraftAttributeRow(): DraftAttributeRow {
  return { id: createLocalId(), key: '', value: '', type: 'string' }
}

export function createDraftLogEntry(): DraftLogEntry {
  return {
    id: createLocalId(),
    timestamp: new Date().toISOString(),
    level: 'info',
    service: '',
    message: '',
    attributes: [],
  }
}

export function createFilterRow(): AttributeFilterRow {
  return { id: createLocalId(), key: '', value: '' }
}
