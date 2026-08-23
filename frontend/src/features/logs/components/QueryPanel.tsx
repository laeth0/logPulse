import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'

import { useQueryLogs } from '../hooks/useQueryLogs'
import { createInitialQueryFilters } from '../utils/initial-filters.utils'
import { LogsResultsTable } from './LogsResultsTable'
import { QueryFiltersForm } from './QueryFiltersForm'
import type { QueryFiltersState } from '../types/query.types'
import type { QueryPanelProps } from '../types/logs-components.types'

export function QueryPanel({ apiKey }: QueryPanelProps) {
  const [filters, setFilters] = useState<QueryFiltersState>(createInitialQueryFilters)
  const { status, logs, nextCursor, error, search, loadMore } = useQueryLogs()

  const isLoading = status === 'loading'
  const isLoadingMore = status === 'loading-more'

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Query logs
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 0.5 }}>
          Combine any filters below — they scope this tenant&apos;s data only.
        </Typography>
      </Box>

      <QueryFiltersForm
        filters={filters}
        disabled={isLoading}
        onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
        onSubmit={() => void search(filters, apiKey)}
      />

      {error ? (
        <Alert severity="error" sx={{ borderRadius: 2 }}>
          {error}
        </Alert>
      ) : null}

      {status !== 'idle' ? (
        <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
          <LogsResultsTable logs={logs} isLoading={isLoading} />
          {status === 'success' ? (
            <Stack
              direction="row"
              sx={{ alignItems: 'center', justifyContent: 'space-between', p: 2 }}
            >
              <Typography variant="caption" color="text.secondary">
                {logs.length} result{logs.length === 1 ? '' : 's'} loaded
              </Typography>
              {nextCursor ? (
                <Button
                  size="small"
                  variant="outlined"
                  disabled={isLoadingMore}
                  startIcon={isLoadingMore ? undefined : <ArrowDownwardRounded fontSize="small" />}
                  onClick={() => void loadMore(apiKey)}
                >
                  {isLoadingMore ? <CircularProgress size={18} /> : 'Load more'}
                </Button>
              ) : null}
            </Stack>
          ) : null}
        </Paper>
      ) : null}
    </Stack>
  )
}
