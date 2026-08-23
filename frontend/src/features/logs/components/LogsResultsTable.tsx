import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

import { LevelChip } from './LevelChip'
import type { LogsResultsTableProps } from '../types/logs-components.types'

export function LogsResultsTable({ logs, isLoading }: LogsResultsTableProps) {
  if (!isLoading && logs.length === 0) {
    return (
      <Box sx={{ py: 6, textAlign: 'center' }}>
        <Typography color="text.secondary">No logs match these filters yet.</Typography>
      </Box>
    )
  }

  return (
    <TableContainer sx={{ maxHeight: '32rem' }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell>Timestamp</TableCell>
            <TableCell>Level</TableCell>
            <TableCell>Service</TableCell>
            <TableCell>Message</TableCell>
            <TableCell>Attributes</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id} hover>
              <TableCell sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                <Tooltip title={log.timestamp}>
                  <span>{new Date(log.timestamp).toLocaleString()}</span>
                </Tooltip>
              </TableCell>
              <TableCell>
                <LevelChip level={log.level} />
              </TableCell>
              <TableCell>{log.service}</TableCell>
              <TableCell sx={{ maxWidth: '22rem' }}>{log.message}</TableCell>
              <TableCell>
                <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                  {Object.entries(log.attributes).map(([key, value]) => (
                    <Chip
                      key={key}
                      size="small"
                      variant="outlined"
                      label={`${key}: ${String(value)}`}
                    />
                  ))}
                </Stack>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={22} />
        </Box>
      ) : null}
    </TableContainer>
  )
}
