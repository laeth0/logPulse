import DataObjectRounded from '@mui/icons-material/DataObjectRounded'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

export function AuthHeader() {
  return (
    <Stack
      component="header"
      direction="row"
      sx={{ alignItems: 'center', justifyContent: 'space-between', mb: { xs: 4, md: 5 } }}
    >
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
        <Box
          aria-hidden="true"
          sx={{
            width: 38,
            height: 38,
            display: 'grid',
            placeItems: 'center',
            borderRadius: '12px 12px 12px 4px',
            color: '#071518',
            bgcolor: '#75e3e3',
            boxShadow: '0 0 2rem rgba(117, 227, 227, 0.24)',
          }}
        >
          <DataObjectRounded fontSize="small" />
        </Box>
        <Typography
          sx={{
            color: '#f0ffff',
            fontWeight: 750,
            fontSize: '1.12rem',
            letterSpacing: '-0.03em',
          }}
        >
          log<span style={{ color: '#75e3e3' }}>Pulse</span>
        </Typography>
      </Stack>
    </Stack>
  )
}
