import type { AttributeFilterRow } from './filter.types'
import type {
  AggregateFiltersState,
  AggregateBucketPoint,
  AggregationBucketSize,
  AggregationGroupBy,
} from './aggregate.types'
import type { DraftLogEntry, RejectedLogEntry, IngestResponse } from './ingest.types'
import type { LogEntry, LogLevel } from './log.types'
import type { QueryFiltersState } from './query.types'

export interface LevelChipProps {
  level: LogLevel
  size?: 'small' | 'medium'
}

export interface AttributeFilterRowsEditorProps {
  rows: AttributeFilterRow[]
  disabled: boolean
  onChange: (rows: AttributeFilterRow[]) => void
}

export interface IngestEntryCardProps {
  entry: DraftLogEntry
  index: number
  disabled: boolean
  rejection?: RejectedLogEntry
  canRemove: boolean
  onChange: (patch: Partial<DraftLogEntry>) => void
  onRemove: () => void
}

export interface IngestResultSummaryProps {
  result: IngestResponse
}

export interface QueryFiltersFormProps {
  filters: QueryFiltersState
  disabled: boolean
  onChange: (patch: Partial<QueryFiltersState>) => void
  onSubmit: () => void
}

export interface LogsResultsTableProps {
  logs: LogEntry[]
  isLoading: boolean
}

export interface AggregateFiltersFormProps {
  filters: AggregateFiltersState
  disabled: boolean
  onChange: (patch: Partial<AggregateFiltersState>) => void
  onSubmit: () => void
}

export interface AggregateBarChartProps {
  buckets: AggregateBucketPoint[]
  groupBy: AggregationGroupBy
  bucketSize: AggregationBucketSize
}

export interface AggregateResultsTableProps {
  buckets: AggregateBucketPoint[]
}

export interface IngestPanelProps {
  apiKey: string
}

export interface QueryPanelProps {
  apiKey: string
}

export interface AggregatePanelProps {
  apiKey: string
}
