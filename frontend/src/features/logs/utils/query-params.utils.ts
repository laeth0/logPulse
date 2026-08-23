import { filterRowsToParams } from './attribute-rows.utils'
import { fromDateTimeLocalInputValue } from './datetime.utils'
import type { AggregateFiltersState } from '../types/aggregate.types'
import type { LogRequestParams } from '../types/filter.types'
import type { QueryFiltersState } from '../types/query.types'

export function buildQueryParams(
  filters: QueryFiltersState,
  cursor?: string | null,
): LogRequestParams {
  const params: LogRequestParams = { limit: filters.limit }

  if (filters.service.trim()) params.service = filters.service.trim()
  if (filters.level) params.level = filters.level
  if (filters.since) params.since = fromDateTimeLocalInputValue(filters.since)
  if (filters.until) params.until = fromDateTimeLocalInputValue(filters.until)
  if (filters.q.trim()) params.q = filters.q.trim()
  if (cursor) params.cursor = cursor

  return { ...params, ...filterRowsToParams(filters.attributes) }
}

export function buildAggregateParams(filters: AggregateFiltersState): LogRequestParams {
  const params: LogRequestParams = {
    since: fromDateTimeLocalInputValue(filters.since),
    until: fromDateTimeLocalInputValue(filters.until),
    bucket: filters.bucket,
  }

  if (filters.service.trim()) params.service = filters.service.trim()
  if (filters.level) params.level = filters.level
  if (filters.q.trim()) params.q = filters.q.trim()
  if (filters.groupBy) params.group_by = filters.groupBy

  return { ...params, ...filterRowsToParams(filters.attributes) }
}
