import Chip from '@mui/material/Chip'

import { LOG_LEVEL_STATUS_COLORS } from '../constants/log-levels.constants'
import type { LevelChipProps } from '../types/logs-components.types'

export function LevelChip({ level, size = 'small' }: LevelChipProps) {
  const color = LOG_LEVEL_STATUS_COLORS[level]

  return (
    <Chip
      label={level.toUpperCase()}
      size={size}
      sx={{
        fontWeight: 700,
        fontSize: '0.68rem',
        letterSpacing: '0.04em',
        color,
        bgcolor: `${color}1f`,
        border: `1px solid ${color}44`,
      }}
    />
  )
}
