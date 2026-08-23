import AddRounded from '@mui/icons-material/AddRounded'
import CloseRounded from '@mui/icons-material/CloseRounded'
import ScheduleRounded from '@mui/icons-material/ScheduleRounded'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import { ATTRIBUTE_VALUE_TYPES } from '../constants/ingest.constants'
import { LOG_LEVEL_OPTIONS } from '../constants/log-levels.constants'
import { createDraftAttributeRow } from '../utils/draft-entry.utils'
import { fromDateTimeLocalInputValue, toDateTimeLocalInputValue } from '../utils/datetime.utils'
import type { IngestEntryCardProps } from '../types/logs-components.types'

export function IngestEntryCard({
  entry,
  index,
  disabled,
  rejection,
  canRemove,
  onChange,
  onRemove,
}: IngestEntryCardProps) {
  const updateAttribute = (
    rowId: string,
    patch: Partial<{ key: string; value: string; type: 'string' | 'number' | 'boolean' }>,
  ) => {
    onChange({
      attributes: entry.attributes.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
    })
  }

  const removeAttribute = (rowId: string) => {
    onChange({ attributes: entry.attributes.filter((row) => row.id !== rowId) })
  }

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        borderRadius: 3,
        border: '1px solid',
        borderColor: rejection ? 'error.main' : 'divider',
        bgcolor: rejection ? 'rgba(213, 59, 59, 0.04)' : 'background.paper',
      }}
    >
      <Stack
        direction="row"
        sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}
      >
        <Typography variant="overline" color="text.secondary">
          Entry #{index + 1}
        </Typography>
        <IconButton
          size="small"
          aria-label="Remove entry"
          disabled={!canRemove || disabled}
          onClick={onRemove}
        >
          <CloseRounded fontSize="small" />
        </IconButton>
      </Stack>

      {rejection ? (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
          {rejection.reason}
        </Alert>
      ) : null}

      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            fullWidth
            size="small"
            type="datetime-local"
            label="Timestamp"
            value={toDateTimeLocalInputValue(entry.timestamp)}
            disabled={disabled}
            onChange={(event) =>
              onChange({ timestamp: fromDateTimeLocalInputValue(event.target.value) })
            }
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <Button
            size="small"
            variant="outlined"
            startIcon={<ScheduleRounded fontSize="small" />}
            disabled={disabled}
            onClick={() => onChange({ timestamp: new Date().toISOString() })}
            sx={{ flexShrink: 0 }}
          >
            Now
          </Button>
          <TextField
            select
            size="small"
            label="Level"
            value={entry.level}
            disabled={disabled}
            onChange={(event) => onChange({ level: event.target.value as typeof entry.level })}
            sx={{ minWidth: 140 }}
          >
            {LOG_LEVEL_OPTIONS.map((level) => (
              <MenuItem key={level} value={level}>
                {level}
              </MenuItem>
            ))}
          </TextField>
        </Stack>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            fullWidth
            size="small"
            label="Service"
            placeholder="checkout"
            value={entry.service}
            disabled={disabled}
            onChange={(event) => onChange({ service: event.target.value })}
          />
          <TextField
            fullWidth
            size="small"
            label="Message"
            placeholder="payment declined"
            value={entry.message}
            disabled={disabled}
            onChange={(event) => onChange({ message: event.target.value })}
          />
        </Stack>

        <Stack spacing={1}>
          <Typography variant="caption" color="text.secondary">
            Attributes
          </Typography>
          {entry.attributes.map((row) => (
            <Stack key={row.id} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <TextField
                size="small"
                label="key"
                value={row.key}
                disabled={disabled}
                onChange={(event) => updateAttribute(row.id, { key: event.target.value })}
                sx={{ flex: 1 }}
              />
              <TextField
                size="small"
                label="value"
                value={row.value}
                disabled={disabled}
                onChange={(event) => updateAttribute(row.id, { value: event.target.value })}
                sx={{ flex: 1 }}
              />
              <TextField
                select
                size="small"
                label="type"
                value={row.type}
                disabled={disabled}
                onChange={(event) =>
                  updateAttribute(row.id, { type: event.target.value as typeof row.type })
                }
                sx={{ minWidth: 110 }}
              >
                {ATTRIBUTE_VALUE_TYPES.map((type) => (
                  <MenuItem key={type} value={type}>
                    {type}
                  </MenuItem>
                ))}
              </TextField>
              <IconButton
                size="small"
                aria-label="Remove attribute"
                disabled={disabled}
                onClick={() => removeAttribute(row.id)}
              >
                <CloseRounded fontSize="small" />
              </IconButton>
            </Stack>
          ))}
          <Button
            size="small"
            variant="text"
            startIcon={<AddRounded fontSize="small" />}
            disabled={disabled}
            onClick={() =>
              onChange({ attributes: [...entry.attributes, createDraftAttributeRow()] })
            }
            sx={{ alignSelf: 'flex-start' }}
          >
            Add attribute
          </Button>
        </Stack>
      </Stack>
    </Paper>
  )
}
