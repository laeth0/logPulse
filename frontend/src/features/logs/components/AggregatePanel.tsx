import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import { useState } from 'react'

import { useAggregateLogs } from '../hooks/useAggregateLogs'
import { createInitialAggregateFilters } from '../utils/initial-filters.utils'
import { AggregateBarChart } from './AggregateBarChart'
import { AggregateFiltersForm } from './AggregateFiltersForm'
import { AggregateResultsTable } from './AggregateResultsTable'
import type { AggregateFiltersState } from '../types/aggregate.types'
import type { AggregatePanelProps } from '../types/logs-components.types'

export function AggregatePanel({ apiKey }: AggregatePanelProps) {
  const [filters, setFilters] = useState<AggregateFiltersState>(createInitialAggregateFilters)
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const { status, buckets, error, aggregate } = useAggregateLogs()

  const isLoading = status === 'loading'

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Aggregate logs
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 0.5 }}>
          Time-bucketed counts, optionally grouped by service or level.
        </Typography>
      </Box>

      <AggregateFiltersForm
        filters={filters}
        disabled={isLoading}
        onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
        onSubmit={() => void aggregate(filters, apiKey)}
      />

      {error ? (
        <Alert severity="error" sx={{ borderRadius: 2 }}>
          {error}
        </Alert>
      ) : null}

      {status !== 'idle' ? (
        <Paper
          elevation={0}
          sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}
        >
          <Tabs
            value={view}
            onChange={(_event, next: 'chart' | 'table') => setView(next)}
            sx={{ mb: 2, minHeight: 36 }}
          >
            <Tab value="chart" label="Chart" sx={{ minHeight: 36 }} />
            <Tab value="table" label="Table" sx={{ minHeight: 36 }} />
          </Tabs>
          {view === 'chart' ? (
            <AggregateBarChart
              buckets={buckets}
              groupBy={filters.groupBy}
              bucketSize={filters.bucket}
            />
          ) : (
            <AggregateResultsTable buckets={buckets} />
          )}
        </Paper>
      ) : null}
    </Stack>
  )
}
