import Box from '@mui/material/Box'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'

import type { AggregateResultsTableProps } from '../types/logs-components.types'

export function AggregateResultsTable({ buckets }: AggregateResultsTableProps) {
  if (buckets.length === 0) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">No buckets to show yet.</Typography>
      </Box>
    )
  }

  return (
    <TableContainer sx={{ maxHeight: '18rem' }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell>Bucket start</TableCell>
            <TableCell>Group</TableCell>
            <TableCell align="right">Count</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {buckets.map((bucket, index) => (
            <TableRow key={`${bucket.start}-${bucket.group ?? 'total'}-${index}`} hover>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                {new Date(bucket.start).toLocaleString()}
              </TableCell>
              <TableCell>{bucket.group ?? '—'}</TableCell>
              <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {bucket.count}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
