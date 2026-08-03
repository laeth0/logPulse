import { BadRequestException } from '@nestjs/common';
import type { ZodError, ZodType } from 'zod';

export function parseWithSchema<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new BadRequestException(getFirstIssueMessage(result.error));
  }

  return result.data;
}

export function getFirstIssueMessage(
  error: ZodError,
  fallback = 'Invalid request',
): string {
  return error.issues[0]?.message ?? fallback;
}
