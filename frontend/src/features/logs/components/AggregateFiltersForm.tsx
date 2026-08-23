import BarChartRounded from '@mui/icons-material/BarChartRounded'
import Button from '@mui/material/Button'
import Grid from '@mui/material/Grid'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'

import { BUCKET_SIZE_OPTIONS, GROUP_BY_OPTIONS } from '../constants/aggregate.constants'
import { LOG_LEVEL_OPTIONS } from '../constants/log-levels.constants'
import { AttributeFilterRowsEditor } from './AttributeFilterRowsEditor'
import type { AggregateFiltersFormProps } from '../types/logs-components.types'

export function AggregateFiltersForm({
  filters,
  disabled,
  onChange,
  onSubmit,
}: AggregateFiltersFormProps) {
  return (
    <Stack spacing={2}>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <TextField
            fullWidth
            required
            size="small"
            type="datetime-local"
            label="Since"
            value={filters.since}
            disabled={disabled}
            onChange={(event) => onChange({ since: event.target.value })}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <TextField
            fullWidth
            required
            size="small"
            type="datetime-local"
            label="Until"
            value={filters.until}
            disabled={disabled}
            onChange={(event) => onChange({ until: event.target.value })}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <TextField
            select
            fullWidth
            required
            size="small"
            label="Bucket size"
            value={filters.bucket}
            disabled={disabled}
            onChange={(event) => onChange({ bucket: event.target.value as typeof filters.bucket })}
          >
            {BUCKET_SIZE_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <TextField
            select
            fullWidth
            size="small"
            label="Group by"
            value={filters.groupBy}
            disabled={disabled}
            onChange={(event) =>
              onChange({ groupBy: event.target.value as typeof filters.groupBy })
            }
          >
            {GROUP_BY_OPTIONS.map((option) => (
              <MenuItem key={option.value || 'none'} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <TextField
            fullWidth
            size="small"
            label="Service"
            placeholder="checkout"
            value={filters.service}
            disabled={disabled}
            onChange={(event) => onChange({ service: event.target.value })}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <TextField
            select
            fullWidth
            size="small"
            label="Level"
            value={filters.level}
            disabled={disabled}
            onChange={(event) => onChange({ level: event.target.value as typeof filters.level })}
          >
            <MenuItem value="">Any</MenuItem>
            {LOG_LEVEL_OPTIONS.map((level) => (
              <MenuItem key={level} value={level}>
                {level}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={12}>
          <TextField
            fullWidth
            size="small"
            label="Message contains"
            placeholder="declined"
            value={filters.q}
            disabled={disabled}
            onChange={(event) => onChange({ q: event.target.value })}
          />
        </Grid>
      </Grid>

      <AttributeFilterRowsEditor
        rows={filters.attributes}
        disabled={disabled}
        onChange={(rows) => onChange({ attributes: rows })}
      />

      <Button
        variant="contained"
        disabled={disabled}
        startIcon={<BarChartRounded fontSize="small" />}
        onClick={onSubmit}
        sx={{ alignSelf: 'flex-start', px: 3 }}
      >
        Run aggregation
      </Button>
    </Stack>
  )
}
