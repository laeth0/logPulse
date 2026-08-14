/**
 * Thrown by `LogRepository.checkAdmission()` when a batch's valid entries alone
 * exceed the configured capacity — a permanent property of the request, never
 * retryable regardless of load. Translated to `PayloadTooLargeException` (413)
 * by `LogIngestionService` (research.md Decision 8). Deliberately a plain
 * `Error`, not a NestJS `HttpException` — `LogRepository` stays HTTP-agnostic.
 */
export class IngestionBatchTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IngestionBatchTooLargeError';
  }
}

/**
 * Thrown by `LogRepository.checkAdmission()` when a batch would fit on its own
 * but other admitted-but-not-completed work is temporarily occupying the
 * remaining capacity. Translated to `BackpressureException` (503 + Retry-After)
 * by `LogIngestionService` (research.md Decision 8).
 */
export class IngestionCapacityExceededError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super('ingestion capacity temporarily exceeded');
    this.name = 'IngestionCapacityExceededError';
  }
}
