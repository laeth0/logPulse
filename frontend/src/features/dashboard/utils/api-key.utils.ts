import { MASK_VISIBLE_PREFIX, MASK_VISIBLE_SUFFIX } from '../constants/dashboard.constants'

export function maskApiKey(apiKey: string): string {
  const hiddenLength = Math.max(apiKey.length - MASK_VISIBLE_PREFIX - MASK_VISIBLE_SUFFIX, 8)
  return `${apiKey.slice(0, MASK_VISIBLE_PREFIX)}${'•'.repeat(hiddenLength)}${apiKey.slice(-MASK_VISIBLE_SUFFIX)}`
}
