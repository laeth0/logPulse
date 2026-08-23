import AddRounded from '@mui/icons-material/AddRounded'
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded'
import CodeRounded from '@mui/icons-material/CodeRounded'
import SendRounded from '@mui/icons-material/SendRounded'
import ViewAgendaRounded from '@mui/icons-material/ViewAgendaRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useState } from 'react'

import { MAX_DRAFT_ENTRIES } from '../constants/ingest.constants'
import { useIngestLogs } from '../hooks/useIngestLogs'
import { draftEntryToPayload } from '../utils/attribute-rows.utils'
import { createDraftLogEntry } from '../utils/draft-entry.utils'
import { createSampleBatch, createSampleRawBatchJson } from '../utils/sample-batch.utils'
import { IngestEntryCard } from './IngestEntryCard'
import { IngestResultSummary } from './IngestResultSummary'
import type { DraftLogEntry } from '../types/ingest.types'
import type { IngestPanelProps } from '../types/logs-components.types'

export function IngestPanel({ apiKey }: IngestPanelProps) {
  const [mode, setMode] = useState<'guided' | 'raw'>('guided')
  const [entries, setEntries] = useState<DraftLogEntry[]>(() => [createDraftLogEntry()])
  const [rawJson, setRawJson] = useState('')
  const [rawJsonError, setRawJsonError] = useState<string | null>(null)
  const { status, result, error, ingest } = useIngestLogs()

  const isSubmitting = status === 'submitting'

  const updateEntry = (id: string, patch: Partial<DraftLogEntry>) => {
    setEntries((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    )
  }

  const removeEntry = (id: string) => {
    setEntries((current) => current.filter((entry) => entry.id !== id))
  }

  const handleSwitchToRaw = () => {
    setMode('raw')
    if (!rawJson.trim()) {
      setRawJson(createSampleRawBatchJson())
    }
  }

  const handleSubmit = async () => {
    setRawJsonError(null)

    if (mode === 'guided') {
      const payload = { logs: entries.map(draftEntryToPayload) }
      await ingest(payload, apiKey)
      return
    }

    try {
      const parsed: unknown = JSON.parse(rawJson)
      await ingest(parsed as { logs: unknown[] }, apiKey)
    } catch {
      setRawJsonError('That is not valid JSON.')
    }
  }

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
        spacing={2}
      >
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Ingest logs
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            POST /logs always accepts a batch — invalid entries are rejected individually without
            failing the rest.
          </Typography>
        </Box>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={mode}
          onChange={(_event, next: 'guided' | 'raw' | null) => {
            if (next === 'raw') handleSwitchToRaw()
            else if (next === 'guided') setMode('guided')
          }}
        >
          <ToggleButton value="guided">
            <ViewAgendaRounded fontSize="small" sx={{ mr: 0.75 }} />
            Guided
          </ToggleButton>
          <ToggleButton value="raw">
            <CodeRounded fontSize="small" sx={{ mr: 0.75 }} />
            Raw JSON
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {error ? (
        <Alert severity="error" sx={{ borderRadius: 2 }}>
          {error}
        </Alert>
      ) : null}

      {mode === 'guided' ? (
        <Stack spacing={2}>
          <Stack direction="row" spacing={1.5}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<AddRounded fontSize="small" />}
              disabled={isSubmitting || entries.length >= MAX_DRAFT_ENTRIES}
              onClick={() => setEntries((current) => [...current, createDraftLogEntry()])}
            >
              Add entry
            </Button>
            <Button
              size="small"
              variant="text"
              startIcon={<AutoAwesomeRounded fontSize="small" />}
              disabled={isSubmitting}
              onClick={() => setEntries(createSampleBatch())}
            >
              Load sample batch
            </Button>
          </Stack>

          <Stack spacing={2}>
            {entries.map((entry, index) => (
              <IngestEntryCard
                key={entry.id}
                entry={entry}
                index={index}
                disabled={isSubmitting}
                canRemove={entries.length > 1}
                rejection={result?.rejected.find((rejection) => rejection.index === index)}
                onChange={(patch) => updateEntry(entry.id, patch)}
                onRemove={() => removeEntry(entry.id)}
              />
            ))}
          </Stack>
        </Stack>
      ) : (
        <Stack spacing={1.5}>
          <TextField
            multiline
            minRows={12}
            fullWidth
            value={rawJson}
            disabled={isSubmitting}
            onChange={(event) => setRawJson(event.target.value)}
            slotProps={{
              htmlInput: {
                style: {
                  fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
                  fontSize: '0.85rem',
                },
              },
            }}
          />
          {rawJsonError ? (
            <Alert severity="error" sx={{ borderRadius: 2 }}>
              {rawJsonError}
            </Alert>
          ) : null}
        </Stack>
      )}

      <Button
        variant="contained"
        disabled={isSubmitting || (mode === 'guided' && entries.length === 0)}
        endIcon={isSubmitting ? undefined : <SendRounded fontSize="small" />}
        onClick={handleSubmit}
        sx={{ alignSelf: 'flex-start', px: 3 }}
      >
        {isSubmitting ? (
          <CircularProgress size={22} color="inherit" />
        ) : (
          `Send batch (${mode === 'guided' ? entries.length : '?'})`
        )}
      </Button>

      {result ? <IngestResultSummary result={result} /> : null}
    </Stack>
  )
}
