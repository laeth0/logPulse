import { createHash } from 'node:crypto';

import * as bcrypt from 'bcryptjs';

const BCRYPT_SALT_ROUNDS = 10;

export function hash(value: string): Promise<string> {
  return bcrypt.hash(sha256Hex(value), BCRYPT_SALT_ROUNDS);
}

export function verify(value: string, storedHash: string): Promise<boolean> {
  return bcrypt.compare(sha256Hex(value), storedHash);
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
