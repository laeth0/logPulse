import { createHash } from 'node:crypto';

import * as bcrypt from 'bcryptjs';

const BCRYPT_SALT_ROUNDS = 10;

/**
 * Hashes a plaintext secret (such as a password or refresh token) using SHA-256 pre-hashing and bcrypt.
 * Pre-hashing with SHA-256 prevents bcrypt's 72-byte truncation limitation.
 *
 * @param value - The plaintext string to hash.
 * @returns A promise that resolves to the bcrypt hash.
 */
export function hash(value: string): Promise<string> {
  return bcrypt.hash(sha256Hex(value), BCRYPT_SALT_ROUNDS);
}

/**
 * Verifies a plaintext secret against a stored bcrypt hash.
 *
 * @param value - The plaintext string to verify.
 * @param storedHash - The bcrypt hash to compare against.
 * @returns A promise resolving to `true` if the value matches, otherwise `false`.
 */
export function verify(value: string, storedHash: string): Promise<boolean> {
  return bcrypt.compare(sha256Hex(value), storedHash);
}

/**
 * Computes a SHA-256 digest in hexadecimal format for a given input string.
 *
 * @param value - The input string to digest.
 * @returns The 64-character hexadecimal SHA-256 string.
 */
function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
