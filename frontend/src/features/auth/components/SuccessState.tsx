import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'

import { ROUTES } from '../../../router/routes'
import type { SuccessStateProps } from '../types/auth-components.types'

export function SuccessState({ tenantId, email, onReset }: SuccessStateProps) {
  return (
    <Stack spacing={2.5} sx={{ alignItems: 'flex-start', py: { xs: 1, sm: 3 } }}>
      <Box
        sx={{
          width: 58,
          height: 58,
          display: 'grid',
          placeItems: 'center',
          borderRadius: '18px',
          color: '#087078',
          bgcolor: '#d9f4f1',
        }}
      >
        <CheckCircleRounded sx={{ fontSize: 34 }} />
      </Box>
      <Box>
        <Typography variant="overline" color="primary.dark">
          Signal established
        </Typography>
        <Typography id="register-title" variant="h1" sx={{ mt: 0.75, fontSize: '2.25rem' }}>
          Your workspace is ready.
        </Typography>
      </Box>
      <Typography color="text.secondary" sx={{ lineHeight: 1.7 }}>
        Account created for <strong>{email}</strong>. You can now sign in and start routing logs
        into your workspace.
      </Typography>
      <Box
        sx={{
          width: '100%',
          p: 2,
          borderRadius: 2,
          bgcolor: '#e9efed',
          border: '1px solid #d7e1de',
        }}
      >
        <Typography variant="overline" color="text.secondary">
          Tenant ID
        </Typography>
        <Typography
          sx={{
            mt: 0.5,
            overflowWrap: 'anywhere',
            fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
            fontSize: '0.82rem',
          }}
        >
          {tenantId}
        </Typography>
      </Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ width: '100%' }}>
        <Button fullWidth variant="contained" component={RouterLink} to={ROUTES.LOGIN}>
          Sign in now
        </Button>
        <Button fullWidth variant="outlined" onClick={onReset}>
          Create another account
        </Button>
      </Stack>
    </Stack>
  )
}
