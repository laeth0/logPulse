import { createHash } from 'node:crypto';

import * as bcrypt from 'bcryptjs';

// bcrypt only uses the first 72 bytes of its input, and this hash()/verify()
// pair is reused for refresh-token hashing too (research.md Decision 4) —
// refresh tokens are ~200+ character JWTs, well past that limit. Pre-hashing
// with SHA-256 first (fixed 64-char hex output, always under 72 bytes) keeps
// the full input's entropy instead of silently truncating it.
const BCRYPT_SALT_ROUNDS = 10;

/**
 * Hashes a password (or any secret — also reused for refresh-token hashing,
 * research.md Decision 4) with bcrypt.
 */
export function hash(value: string): Promise<string> {
  return bcrypt.hash(sha256Hex(value), BCRYPT_SALT_ROUNDS);
}

/** Constant-time comparison against a hash produced by {@link hash}. */
export function verify(value: string, storedHash: string): Promise<boolean> {
  return bcrypt.compare(sha256Hex(value), storedHash);
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
