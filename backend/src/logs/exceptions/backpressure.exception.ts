import { ServiceUnavailableException } from '@nestjs/common';

/**
 * HTTP-layer counterpart of `IngestionCapacityExceededError` — constructed
 * only by `LogIngestionService`'s translation step, never by `LogRepository`
 * (research.md Decision 8). `retryAfterSeconds` is read structurally by
 * `GlobalExceptionFilter`, but only within its `instanceof HttpException`
 * branch, so a domain error carrying the same property name can never
 * trigger the header (research.md Decision 4).
 */
export class BackpressureException extends ServiceUnavailableException {
  constructor(public readonly retryAfterSeconds: number) {
    super('the service is temporarily at ingestion capacity; retry shortly');
  }
}
