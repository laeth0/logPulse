import { randomBytes } from 'node:crypto';

import { API_KEY_PREFIX } from '@/common/constants/tenancy.constants';

/**
 * Generates a secure, prefixed API key using cryptographically strong pseudo-random bytes.
 *
 * @returns The formatted API key string (e.g., `lp_...`).
 */
export function generate(): string {
  return `${API_KEY_PREFIX}${randomBytes(24).toString('base64url')}`;
}
