import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';

// Standard scrypt cost parameters (CLI/OpenSSL defaults). N must stay a
// power of 2. See specs/001-multi-tenancy/research.md Decision 1: chosen
// specifically to avoid a native-binding dependency (bcrypt/argon2) that
// would slow/complicate the multi-stage Alpine Docker build.
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * Hashes a password (or any secret — also reused for refresh-token hashing,
 * research.md Decision 4) as `scrypt$N$r$p$saltHex$hashHex`.
 */
export async function hash(value: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = await scryptDerive(value, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });

  return [
    'scrypt',
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('hex'),
    derivedKey.toString('hex'),
  ].join('$');
}

/** Constant-time comparison against a hash produced by {@link hash}. */
export async function verify(
  value: string,
  storedHash: string,
): Promise<boolean> {
  const parts = storedHash.split('$');

  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }

  const [, nText, rText, pText, saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');

  const derivedKey = await scryptDerive(value, salt, expected.length, {
    N: Number(nText),
    r: Number(rText),
    p: Number(pText),
  });

  return (
    derivedKey.length === expected.length &&
    timingSafeEqual(derivedKey, expected)
  );
}

function scryptDerive(
  value: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(value, salt, keyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}
