import ShieldRounded from '@mui/icons-material/ShieldRounded'
import SpeedRounded from '@mui/icons-material/SpeedRounded'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { SIGNAL_BARS } from '../constants/register.constants'

export function SignalStory() {
  return (
    <Stack
      component="aside"
      sx={{
        gridArea: 'story',
        color: '#eaffff',
        maxWidth: '39rem',
        justifySelf: { xs: 'center', md: 'stretch' },
        width: '100%',
      }}
      spacing={{ xs: 3, md: 4 }}
    >
      <Box>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2 }}>
          <Box
            aria-hidden="true"
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: '#75e3e3',
              boxShadow: '0 0 1rem #75e3e3',
            }}
          />
          <Typography variant="overline" sx={{ color: '#91b9bb' }}>
            Live observability layer
          </Typography>
        </Stack>
        <Typography
          component="h2"
          variant="h2"
          sx={{ fontSize: { xs: '2.1rem', sm: '2.8rem', lg: '3.65rem' }, maxWidth: '12ch' }}
        >
          Turn log noise into a clear pulse.
        </Typography>
        <Typography sx={{ mt: 2, color: '#a9c3c5', maxWidth: '54ch', lineHeight: 1.75 }}>
          Ingest, filter, and aggregate high-volume events without losing the thread. Your team gets
          one calm view of what the system is saying now.
        </Typography>
      </Box>

      <Box className="signal-field" aria-label="Live log ingestion signal visualization">
        <div className="signal-scanline" aria-hidden="true" />
        <div className="signal-bars" aria-hidden="true">
          {SIGNAL_BARS.map((height, index) => (
            <span
              className="signal-bar"
              key={`${height}-${index}`}
              style={{ height: `${height}%`, animationDelay: `${index * -90}ms` }}
            />
          ))}
        </div>
        <span className="signal-cursor">15,000 events/s · nominal</span>
      </Box>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1.5, sm: 3 }}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', flex: 1 }}>
          <SpeedRounded sx={{ color: '#75e3e3' }} />
          <Typography variant="body2" sx={{ color: '#b9d0d2' }}>
            Built for high-throughput ingestion
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', flex: 1 }}>
          <ShieldRounded sx={{ color: '#ff9a88' }} />
          <Typography variant="body2" sx={{ color: '#b9d0d2' }}>
            Tenant-isolated by design
          </Typography>
        </Stack>
      </Stack>
    </Stack>
  )
}
