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
      </Box>
    </Stack>
  )
}
