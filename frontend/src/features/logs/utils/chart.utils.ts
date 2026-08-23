import {
  CATEGORICAL_PALETTE,
  CHART_OTHER_COLOR,
  MAX_CHART_SERIES,
} from '../constants/chart-palette.constants'
import type { AggregateBucketPoint, AggregationGroupBy } from '../types/aggregate.types'

export interface ChartSeries {
  key: string
  label: string
  color: string
}

export interface ChartColumnValue {
  seriesKey: string
  count: number
}

export interface ChartColumn {
  start: string
  values: ChartColumnValue[]
}

export interface ChartData {
  series: ChartSeries[]
  columns: ChartColumn[]
  maxValue: number
}

const TOTAL_SERIES_KEY = '__total__'
const OTHER_SERIES_KEY = '__other__'

export function buildChartData(
  buckets: AggregateBucketPoint[],
  groupBy: AggregationGroupBy,
): ChartData {
  const orderedStarts: string[] = []
  for (const bucket of buckets) {
    if (!orderedStarts.includes(bucket.start)) orderedStarts.push(bucket.start)
  }

  const series = groupBy
    ? buildGroupedSeries(buckets)
    : [{ key: TOTAL_SERIES_KEY, label: 'Logs', color: CATEGORICAL_PALETTE[0] }]
  const topGroupKeys = new Set(
    series.filter((entry) => entry.key !== OTHER_SERIES_KEY).map((entry) => entry.key),
  )

  const columns: ChartColumn[] = orderedStarts.map((start) => {
    const rowsAtStart = buckets.filter((bucket) => bucket.start === start)
    const values = new Map<string, number>()

    for (const row of rowsAtStart) {
      const seriesKey = groupBy
        ? topGroupKeys.has(row.group ?? '')
          ? (row.group ?? '')
          : OTHER_SERIES_KEY
        : TOTAL_SERIES_KEY
      values.set(seriesKey, (values.get(seriesKey) ?? 0) + row.count)
    }

    return {
      start,
      values: Array.from(values, ([seriesKey, count]) => ({ seriesKey, count })),
    }
  })

  const maxValue = columns.reduce(
    (max, column) => Math.max(max, ...column.values.map((value) => value.count)),
    0,
  )

  return { series, columns, maxValue }
}

function buildGroupedSeries(buckets: AggregateBucketPoint[]): ChartSeries[] {
  const totalsByGroup = new Map<string, number>()

  for (const bucket of buckets) {
    const group = bucket.group ?? 'unknown'
    totalsByGroup.set(group, (totalsByGroup.get(group) ?? 0) + bucket.count)
  }

  const orderedGroups = Array.from(totalsByGroup.entries()).sort((a, b) => b[1] - a[1])
  const topGroups = orderedGroups.slice(0, MAX_CHART_SERIES)
  const hasOverflow = orderedGroups.length > MAX_CHART_SERIES

  const series: ChartSeries[] = topGroups.map(([group], index) => ({
    key: group,
    label: group,
    color: CATEGORICAL_PALETTE[index],
  }))

  if (hasOverflow) {
    series.push({ key: OTHER_SERIES_KEY, label: 'Other', color: CHART_OTHER_COLOR })
  }

  return series
}

export function niceMax(value: number): number {
  if (value <= 0) return 1

  const magnitude = 10 ** Math.floor(Math.log10(value))
  const normalized = value / magnitude

  let niceNormalized = 10
  if (normalized <= 1) niceNormalized = 1
  else if (normalized <= 2) niceNormalized = 2
  else if (normalized <= 5) niceNormalized = 5

  return niceNormalized * magnitude
}
