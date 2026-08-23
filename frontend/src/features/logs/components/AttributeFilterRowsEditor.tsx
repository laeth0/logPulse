import AddRounded from '@mui/icons-material/AddRounded'
import CloseRounded from '@mui/icons-material/CloseRounded'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'

import { createFilterRow } from '../utils/draft-entry.utils'
import type { AttributeFilterRowsEditorProps } from '../types/logs-components.types'

export function AttributeFilterRowsEditor({
  rows,
  disabled,
  onChange,
}: AttributeFilterRowsEditorProps) {
  const updateRow = (id: string, patch: Partial<{ key: string; value: string }>) => {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  const removeRow = (id: string) => {
    onChange(rows.filter((row) => row.id !== id))
  }

  return (
    <Stack spacing={1}>
      {rows.map((row) => (
        <Stack key={row.id} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <TextField
            size="small"
            label="attr.key"
            placeholder="user_id"
            value={row.key}
            disabled={disabled}
            onChange={(event) => updateRow(row.id, { key: event.target.value })}
            sx={{ flex: 1 }}
          />
          <TextField
            size="small"
            label="value"
            placeholder="42"
            value={row.value}
            disabled={disabled}
            onChange={(event) => updateRow(row.id, { value: event.target.value })}
            sx={{ flex: 1 }}
          />
          <IconButton
            size="small"
            aria-label="Remove attribute filter"
            disabled={disabled}
            onClick={() => removeRow(row.id)}
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
        onClick={() => onChange([...rows, createFilterRow()])}
        sx={{ alignSelf: 'flex-start' }}
      >
        Add attribute filter
      </Button>
    </Stack>
  )
}
