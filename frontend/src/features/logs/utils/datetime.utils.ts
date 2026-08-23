export function toDateTimeLocalInputValue(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''

  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function fromDateTimeLocalInputValue(value: string): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

export function nowAsDateTimeLocalInputValue(): string {
  return toDateTimeLocalInputValue(new Date().toISOString())
}

export function defaultAggregationRange(rangeMs: number): { since: string; until: string } {
  const until = new Date()
  const since = new Date(until.getTime() - rangeMs)
  return {
    since: toDateTimeLocalInputValue(since.toISOString()),
    until: toDateTimeLocalInputValue(until.toISOString()),
  }
}

export function formatBucketLabel(iso: string, bucketSize: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso

  if (bucketSize === '1d') {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
  if (bucketSize === '1h') {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
