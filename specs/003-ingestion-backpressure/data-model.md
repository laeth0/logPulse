# Data Model: Optional Backpressure Support

This feature introduces **no new persisted (database) entities** — `projectSchema.dbml` is unchanged. Its state is entirely in-memory, process-scoped, and lives on the existing `LogRepository` (research.md Decisions 1–2). This document describes that runtime state model instead.

## `IngestionCapacityState` (in-memory, on `LogRepository`)

Not a class of its own — two private mutable fields alongside the existing `pendingInserts`/`flushTimer`/`isFlushing` state:

| Field | Type | Meaning |
|---|---|---|
| `pendingRowCount` | `number` (starts at `0`) | Sum of `logs.length` across every currently admitted-but-not-completed `PendingInsert` (queued *or* in-flight). |
| `pendingByteCount` | `number` (starts at `0`) | Sum of estimated byte size across the same set. |

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

## `BackpressureException` (new exception type)

Not a persisted entity — a plain error class:

```ts
class BackpressureException extends ServiceUnavailableException {
  constructor(public readonly retryAfterSeconds: number) { ... }
}
```

| Field | Type | Meaning |
|---|---|---|
| `retryAfterSeconds` | `number` | Copied from `BackpressureConfig.retryAfterSeconds` at throw time; read structurally by `GlobalExceptionFilter` (research.md Decision 4) to set the `Retry-After` header. |

`PayloadTooLargeException` (the `413` case) needs no new subclass — NestJS's built-in one is used directly, with a descriptive message; it carries no extra state.

## State transitions (admission decision)

For one `insertMany(logs)` call, with `backpressureEnabled === true`:

```
rowCount = logs.length
byteSize = estimateByteSize(logs)        // Σ Buffer.byteLength(JSON.stringify(entry))

if rowCount > maxPendingRows OR byteSize > maxPendingBytes:
    throw PayloadTooLargeException        # 413 — can never fit, at any pending level
elif pendingRowCount + rowCount > maxPendingRows
  OR pendingByteCount + byteSize > maxPendingBytes:
    throw BackpressureException(retryAfterSeconds)   # 503 + Retry-After — temporarily full
else:
    pendingRowCount += rowCount
    pendingByteCount += byteSize
    # ... proceed exactly as today: push onto pendingInserts, scheduleFlush()
```

When `backpressureEnabled === false`, none of the above runs — `insertMany()` is textually identical to its pre-feature form for every request (FR-002).
