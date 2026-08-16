import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded'
import LogoutRounded from '@mui/icons-material/LogoutRounded'
import VisibilityOffRounded from '@mui/icons-material/VisibilityOffRounded'
import VisibilityRounded from '@mui/icons-material/VisibilityRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { AggregatePanel, IngestPanel, QueryPanel } from '../../logs'
import { ROUTES } from '../../../router/routes'
import { useAuth } from '../../../shared/hooks/useAuth'
import { clearAuthSession } from '../../../store/auth.store'
import { maskApiKey } from '../utils/api-key.utils'

type WorkbenchTab = 'ingest' | 'query' | 'aggregate'

export function DashboardPage() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const [showApiKey, setShowApiKey] = useState(false)
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState<WorkbenchTab>('ingest')

  if (!session) {
    return null
  }

  const handleSignOut = () => {
    clearAuthSession()
    navigate(ROUTES.LOGIN, { replace: true })
  }

  const handleCopyApiKey = async () => {
    await navigator.clipboard.writeText(session.apiKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Box sx={{ minHeight: '100svh', bgcolor: 'background.paper', py: { xs: 3, md: 5 } }}>
      <Box sx={{ maxWidth: '78rem', mx: 'auto', px: { xs: 2, sm: 3 } }}>
        <Stack
          direction="row"
          sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 4 }}
        >
          <Typography sx={{ fontWeight: 750, fontSize: '1.35rem', letterSpacing: '-0.03em' }}>
            log<span style={{ color: '#0d7f87' }}>Pulse</span>
          </Typography>
          <Button variant="outlined" startIcon={<LogoutRounded />} onClick={handleSignOut}>
            Sign out
          </Button>
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2.5} sx={{ mb: 3 }}>
          <Paper
            elevation={0}
            sx={{
              flex: 1,
              p: { xs: 2.5, sm: 3 },
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Typography variant="overline" color="text.secondary">
              Signed in as
            </Typography>
            <Typography sx={{ fontSize: '1.15rem', fontWeight: 700, mt: 0.5 }}>
              {session.email}
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1, lineHeight: 1.6, fontSize: '0.9rem' }}>
              Every request below is scoped to your tenant automatically via your API key.
            </Typography>
          </Paper>

          <Paper
            elevation={0}
            sx={{
              flex: 1,
              p: { xs: 2.5, sm: 3 },
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Typography variant="overline" color="text.secondary">
              API key
            </Typography>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mt: 1 }}>
              <Typography
                sx={{
                  fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
                  fontSize: '0.95rem',
                  overflowWrap: 'anywhere',
                }}
              >
                {showApiKey ? session.apiKey : maskApiKey(session.apiKey)}
              </Typography>
              <IconButton
                size="small"
                aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                onClick={() => setShowApiKey((visible) => !visible)}
              >
                {showApiKey ? (
                  <VisibilityOffRounded fontSize="small" />
                ) : (
                  <VisibilityRounded fontSize="small" />
                )}
              </IconButton>
              <IconButton size="small" aria-label="Copy API key" onClick={handleCopyApiKey}>
                <ContentCopyRounded fontSize="small" />
              </IconButton>
            </Stack>
            {copied ? (
              <Typography variant="caption" color="success.main" sx={{ mt: 0.5, display: 'block' }}>
                Copied to clipboard
              </Typography>
            ) : (
              <Typography color="text.secondary" sx={{ mt: 1, fontSize: '0.9rem' }}>
                Sent as <code>Authorization: Bearer &lt;key&gt;</code> on every request below.
              </Typography>
            )}
          </Paper>
        </Stack>

        <Paper
          elevation={0}
          sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}
        >
          <Tabs
            value={tab}
            onChange={(_event, next: WorkbenchTab) => setTab(next)}
            sx={{ borderBottom: '1px solid', borderColor: 'divider', px: { xs: 1, sm: 2 } }}
          >
            <Tab value="ingest" label="Ingest" />
            <Tab value="query" label="Query" />
            <Tab value="aggregate" label="Aggregate" />
          </Tabs>

          <Box sx={{ p: { xs: 2, sm: 3, md: 4 } }}>
            {tab === 'ingest' ? <IngestPanel apiKey={session.apiKey} /> : null}
            {tab === 'query' ? <QueryPanel apiKey={session.apiKey} /> : null}
            {tab === 'aggregate' ? <AggregatePanel apiKey={session.apiKey} /> : null}
          </Box>
        </Paper>
      </Box>
    </Box>
  )
}
