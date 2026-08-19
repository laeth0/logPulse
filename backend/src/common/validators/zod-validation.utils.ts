import { BadRequestException } from '@nestjs/common';
import type { ZodError, ZodType } from 'zod';

/**
 * Parses and validates an unknown value against a Zod schema.
 * Throws a NestJS `BadRequestException` with the first validation issue message on failure.
 *
 * @param schema - The Zod schema to validate against.
 * @param value - The input data to parse and validate.
 * @throws {BadRequestException} When validation fails.
 * @returns The validated and typed data.
 */
export function parseWithSchema<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new BadRequestException(getFirstIssueMessage(result.error));
  }

  return result.data;
}

/**
 * Extracts the first error message from a ZodError instance.
 *
 * @param error - The Zod validation error.
 * @param fallback - Fallback message if no issues are present.
 * @returns The first error message string or fallback.
 */
export function getFirstIssueMessage(
  error: ZodError,
  fallback = 'Invalid request',
): string {
  return error.issues[0]?.message ?? fallback;
}
