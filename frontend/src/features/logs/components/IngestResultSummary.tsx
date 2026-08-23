import Alert from '@mui/material/Alert'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import type { IngestResultSummaryProps } from '../types/logs-components.types'

export function IngestResultSummary({ result }: IngestResultSummaryProps) {
  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1.5}>
        <Chip
          label={`${result.accepted} accepted`}
          sx={{ fontWeight: 700, color: '#0ca30c', bgcolor: 'rgba(12, 163, 12, 0.1)' }}
        />
        <Chip
          label={`${result.rejected.length} rejected`}
          sx={{
            fontWeight: 700,
            color: result.rejected.length > 0 ? '#d03b3b' : 'text.secondary',
            bgcolor: result.rejected.length > 0 ? 'rgba(208, 59, 59, 0.1)' : 'action.hover',
          }}
        />
      </Stack>

      {result.rejected.length > 0 ? (
        <Stack spacing={0.75}>
          {result.rejected.map((rejection) => (
            <Alert key={rejection.index} severity="error" sx={{ borderRadius: 2 }}>
              <Typography variant="body2">
                Entry #{rejection.index + 1}: {rejection.reason}
              </Typography>
            </Alert>
          ))}
        </Stack>
      ) : null}
    </Stack>
  )
}
