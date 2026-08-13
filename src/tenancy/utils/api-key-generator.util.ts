import { randomBytes } from 'node:crypto';

import { API_KEY_PREFIX } from '@/common/constants/tenancy.constants';

/**
 * Generates an opaque, dot-free API key (`lp_<32 base64url chars>`),
 * per research.md Decision 5. 24 random bytes = 192 bits of entropy.
 */
export function generate(): string {
  return `${API_KEY_PREFIX}${randomBytes(24).toString('base64url')}`;
}
