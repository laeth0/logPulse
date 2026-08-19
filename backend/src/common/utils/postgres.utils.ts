import { POSTGRES_UNIQUE_VIOLATION } from '@/common/constants/postgres.constants';

/**
 * Checks whether an unknown error object represents a PostgreSQL unique constraint violation (`23505`).
 *
 * @param error - The caught error object to inspect.
 * @returns `true` if the error code matches PostgreSQL unique violation, otherwise `false`.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === POSTGRES_UNIQUE_VIOLATION
  );
}
