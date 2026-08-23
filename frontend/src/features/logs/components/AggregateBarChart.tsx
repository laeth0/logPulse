import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

import { buildChartData, niceMax } from '../utils/chart.utils'
import { formatBucketLabel } from '../utils/datetime.utils'
import type { AggregateBarChartProps } from '../types/logs-components.types'

const CHART_HEIGHT = 200
const BAR_MAX_WIDTH = 20
const BAR_GAP = 3
const GRID_STEPS = [0, 0.25, 0.5, 0.75, 1]
const LABEL_STEP_TARGET = 12

export function AggregateBarChart({ buckets, groupBy, bucketSize }: AggregateBarChartProps) {
  if (buckets.length === 0) {
    return (
      <Box sx={{ py: 6, textAlign: 'center' }}>
        <Typography color="text.secondary">Run an aggregation to see results here.</Typography>
      </Box>
    )
  }

  const { series, columns, maxValue } = buildChartData(buckets, groupBy)
  const scaleMax = niceMax(maxValue)
  const labelStep = Math.max(1, Math.ceil(columns.length / LABEL_STEP_TARGET))

  return (
    <Stack spacing={1.5}>
      {series.length > 1 ? (
        <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          {series.map((entry) => (
            <Stack key={entry.key} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: entry.color }} />
              <Typography variant="caption" color="text.secondary">
                {entry.label}
              </Typography>
            </Stack>
          ))}
        </Stack>
      ) : null}

      <Box sx={{ display: 'flex' }}>
        <Stack
          sx={{
            height: CHART_HEIGHT,
            pr: 1,
            textAlign: 'right',
            flexShrink: 0,
            justifyContent: 'space-between',
          }}
        >
          {[...GRID_STEPS].reverse().map((step) => (
            <Typography
              key={step}
              variant="caption"
              color="text.disabled"
              sx={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {Math.round(scaleMax * step)}
            </Typography>
          ))}
        </Stack>

        <Box sx={{ position: 'relative', flex: 1, overflowX: 'auto' }}>
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              pointerEvents: 'none',
            }}
          >
            {GRID_STEPS.map((step) => (
              <Box key={step} sx={{ borderTop: '1px solid', borderColor: 'divider' }} />
            ))}
          </Box>

          <Stack
            direction="row"
            spacing={0}
            sx={{ alignItems: 'flex-end', height: CHART_HEIGHT, minWidth: 'fit-content' }}
          >
            {columns.map((column) => (
              <Stack
                key={column.start}
                sx={{
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  height: '100%',
                  px: 0.75,
                  minWidth: 40,
                }}
              >
                <Stack
                  direction="row"
                  spacing={`${BAR_GAP}px`}
                  sx={{ alignItems: 'flex-end', height: '100%' }}
                >
                  {series.map((seriesEntry) => {
                    const value =
                      column.values.find((entry) => entry.seriesKey === seriesEntry.key)?.count ?? 0
                    const heightPercent = scaleMax > 0 ? (value / scaleMax) * 100 : 0

                    return (
                      <Tooltip
                        key={seriesEntry.key}
                        title={`${seriesEntry.label}: ${value} at ${new Date(column.start).toLocaleString()}`}
                      >
                        <Box
                          sx={{
                            width: BAR_MAX_WIDTH,
                            height: `${heightPercent}%`,
                            minHeight: value > 0 ? 2 : 0,
                            bgcolor: seriesEntry.color,
                            borderRadius: '4px 4px 0 0',
                            transition: 'opacity 120ms ease',
                            '&:hover': { opacity: 0.75 },
                          }}
                        />
                      </Tooltip>
                    )
                  })}
                </Stack>
              </Stack>
            ))}
          </Stack>

          <Stack direction="row" sx={{ minWidth: 'fit-content' }}>
            {columns.map((column, index) => (
              <Box key={column.start} sx={{ px: 0.75, minWidth: 40, textAlign: 'center' }}>
                <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>
                  {index % labelStep === 0 ? formatBucketLabel(column.start, bucketSize) : ''}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      </Box>
    </Stack>
  )
}
