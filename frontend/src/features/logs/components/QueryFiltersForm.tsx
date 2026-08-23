import SearchRounded from '@mui/icons-material/SearchRounded'
import Button from '@mui/material/Button'
import Grid from '@mui/material/Grid'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'

import { MAX_QUERY_LIMIT, MIN_QUERY_LIMIT } from '../constants/query.constants'
import { LOG_LEVEL_OPTIONS } from '../constants/log-levels.constants'
import { AttributeFilterRowsEditor } from './AttributeFilterRowsEditor'
import type { QueryFiltersFormProps } from '../types/logs-components.types'

export function QueryFiltersForm({ filters, disabled, onChange, onSubmit }: QueryFiltersFormProps) {
  return (
    <Stack spacing={2}>
      <Grid container spacing={2}>
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
        <Grid size={{ xs: 12, sm: 4 }}>
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
        <Grid size={{ xs: 12, sm: 4 }}>
          <TextField
            fullWidth
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
            fullWidth
            size="small"
            type="number"
            label="Limit"
            value={filters.limit}
            disabled={disabled}
            onChange={(event) => onChange({ limit: Number(event.target.value) })}
            slotProps={{ htmlInput: { min: MIN_QUERY_LIMIT, max: MAX_QUERY_LIMIT } }}
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
        startIcon={<SearchRounded fontSize="small" />}
        onClick={onSubmit}
        sx={{ alignSelf: 'flex-start', px: 3 }}
      >
        Search
      </Button>
    </Stack>
  )
}
