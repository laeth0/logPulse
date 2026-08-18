import { randomBytes } from 'node:crypto';

import { API_KEY_PREFIX } from '@/common/constants/tenancy.constants';

export function generate(): string {
  return `${API_KEY_PREFIX}${randomBytes(24).toString('base64url')}`;
}
