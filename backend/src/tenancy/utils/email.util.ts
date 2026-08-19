/**
 * Normalizes an email address by trimming whitespace and converting to lowercase.
 *
 * @param email - The raw email address to normalize.
 * @returns The trimmed, lowercase email string.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
