# Data Model: Optional Backpressure Support

This feature introduces **no new persisted (database) entities** — `projectSchema.dbml` is unchanged. Its state is entirely in-memory, process-scoped, and lives on the existing `LogRepository` (research.md Decisions 1–2). This document describes that runtime state model instead.

## `IngestionCapacityState` (in-memory, on `LogRepository`)

Not a class of its own — two private mutable fields alongside the existing `pendingInserts`/`flushTimer`/`isFlushing` state:

| Field | Type | Meaning |
|---|---|---|
| `pendingRowCount` | `number` (starts at `0`) | Sum of `logs.length` across every currently admitted-but-not-completed `PendingInsert` (queued *or* in-flight). |
| `pendingByteCount` | `number` (starts at `0`) | Sum of estimated byte size across the same set — a cheap field-length estimate, not an exact serialized size; see "Byte-size estimation" below. |

**Lifecycle** (only active when `backpressureEnabled`):

1. **Admission** (`insertMany()`, synchronous, before push): both fields incremented by the incoming batch's `rowCount`/`byteSize` — but only after `checkAdmission()` has confirmed the batch is actually being admitted (see `IngestionCapacityState` invariant below).
2. **Settlement** (`flushBatch()`'s existing per-entry `resolve()`/`reject()` loops): both fields decremented by that entry's own `rowCount`/`byteSize`, regardless of whether the flush succeeded or failed — a failed flush still frees the capacity it was occupying.

**Invariant**: at any point in time, `pendingRowCount` equals the sum of `logs.length` over every `PendingInsert` currently in `pendingInserts` *plus* every `PendingInsert` currently being processed inside an in-progress `flushBatch()` call that hasn't resolved/rejected its entries yet. This is what "admitted-but-not-completed, including queued and in-flight" (spec.md Clarifications) means concretely. No entry is ever double-counted or dropped from the count, because increment and decrement are each performed exactly once per `PendingInsert`, at its two lifecycle boundaries (push, settle), on the same single-threaded event loop (research.md Decision 5).

**Reset**: never explicitly reset — it is self-balancing by construction (every increment has exactly one matching decrement). At process start, both fields are `0`. There is no persistence across restarts, and none is needed: a fresh process has no pending work.

## `PendingInsert` (existing interface — extended)

```ts
interface PendingInsert {
  logs: readonly NewLog[];
  resolve: () => void;
  reject: (error: unknown) => void;
  byteSize: number;   // NEW — this entry's own contribution to pendingByteCount; 0 when backpressure is disabled (never computed)
}
```

`logs.length` already serves as the entry's row-count contribution — no new field needed for that dimension.

## `BackpressureConfig` (env-driven, read once at construction — conceptual grouping, not a class)

| Field | Source | Default |
|---|---|---|
| `backpressureEnabled` | `BACKPRESSURE_ENABLED` | `false` |
| `maxPendingRows` | `BACKPRESSURE_MAX_PENDING_ROWS` | `20000` |
| `maxPendingBytes` | `BACKPRESSURE_MAX_PENDING_BYTES` (parsed via `bytes`) | `25mb` |
| `retryAfterSeconds` | `BACKPRESSURE_RETRY_AFTER_SECONDS` | `1` |

Read into `private readonly` fields on `LogRepository`, exactly mirroring `coalesceWindowMs`/`coalesceMaxRows`'s existing pattern (`log.repository.ts` lines 56–62 today).

## Domain errors (in `LogRepository`, HTTP-agnostic — research.md Decision 8)

Not persisted entities — two plain error classes in `src/logs/errors/ingestion-capacity.errors.ts`, **neither importing anything from `@nestjs/common`**:

```ts
class IngestionBatchTooLargeError extends Error {
  constructor(message: string) { super(message); }
}

class IngestionCapacityExceededError extends Error {
  constructor(public readonly retryAfterSeconds: number) { super('ingestion capacity temporarily exceeded'); }
}
```

This is the vocabulary `checkAdmission()` uses to communicate *why* a batch was refused, without any awareness of HTTP status codes — that mapping happens one layer up.

## `BackpressureException` (HTTP exception, constructed in `LogIngestionService` — never in `LogRepository`)

```ts
class BackpressureException extends ServiceUnavailableException {
  constructor(public readonly retryAfterSeconds: number) { ... }
}
```

| Field | Type | Meaning |
|---|---|---|
| `retryAfterSeconds` | `number` | Copied from the caught `IngestionCapacityExceededError`'s own `retryAfterSeconds` at translation time; read structurally by `GlobalExceptionFilter`, but only within its `instanceof HttpException` branch (research.md Decision 4) — so a *domain* error carrying the same property name can never trigger the header. |

`PayloadTooLargeException` (the `413` case) needs no new subclass — NestJS's built-in one is used directly by the translation step, with `IngestionBatchTooLargeError`'s own message; it carries no extra state.

## Byte-size estimation

`estimateByteSize(logs)` sums, per entry, `message.length + service.length + tenant_id.length` plus each attribute's key/value lengths plus a small fixed per-entry overhead constant (timestamp + JSON structural punctuation) — **not** `JSON.stringify` + `Buffer.byteLength`. This avoids allocating and serializing a full string per entry on the ingestion hot path; see research.md Decision 2 for the cost comparison. It is computed exactly once per batch (in `LogRepository`, at admission time) and the single result is reused for both the admission check and the `PendingInsert.byteSize` field consumed at settlement — never recomputed.

## State transitions (admission decision)

For one `insertMany(logs)` call on `LogRepository`, with `backpressureEnabled === true` — this method never throws an HTTP exception, only the plain domain errors above:

```
rowCount = logs.length
byteSize = estimateByteSize(logs)        // field-length sum, not JSON.stringify

if rowCount > maxPendingRows OR byteSize > maxPendingBytes:
    throw IngestionBatchTooLargeError(...)                    # can never fit, at any pending level
elif pendingRowCount + rowCount > maxPendingRows
  OR pendingByteCount + byteSize > maxPendingBytes:
    throw IngestionCapacityExceededError(retryAfterSeconds)   # temporarily full
else:
    pendingRowCount += rowCount
    pendingByteCount += byteSize
    # ... proceed exactly as today: push onto pendingInserts, scheduleFlush()
```

When `backpressureEnabled === false`, none of the above runs — `insertMany()` is textually identical to its pre-feature form for every request (FR-002).

## Translation step (in `LogIngestionService.ingest()`, not `LogRepository`)

The one place either domain error becomes an actual HTTP response:

```
try:
    await logRepository.insertMany(validatedLogs)
catch (error):
    if error instanceof IngestionCapacityExceededError:
        throw new BackpressureException(error.retryAfterSeconds)   # 503 + Retry-After
    if error instanceof IngestionBatchTooLargeError:
        throw new PayloadTooLargeException(error.message)          # 413
    throw error   # anything else (e.g. a genuine DB failure) propagates unchanged
```
