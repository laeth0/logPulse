# Phase 1 Data Model: Performance Optimization

Derived from spec.md's Key Entities, refined with the storage decisions from research.md. Field names use the project's existing `snake_case` DB / camelCase TypeScript convention (see `log.entity.ts`).

## LogRollup (new)

Maps to spec's **Log Rollup (pre-computed aggregation summary)** entity — a derived, tenant-scoped, minute-granularity count, never a second source of truth.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `bucket` | `timestamptz` | `NOT NULL` | Start of the one-minute window this row summarizes (research.md Decision 4) — must be computed with the same origin/truncation the existing `date_bin(...)` aggregation expression uses (`aggregation-query.builder.ts`'s `LOG_AGGREGATION_ORIGIN`), so summed rollup rows and a raw scan of the same range agree bit-for-bit. |
| `tenant_id` | `uuid` | `NOT NULL` | No FK, consistent with `logs.tenant_id` (`specs/001-multi-tenancy/research.md` Decision 6) — same no-FK-on-hot-path rationale applies equally to the rollup upsert path. |
| `service` | `text` | `NOT NULL` | Matches `logs.service`. |
| `level` | `log_level` (existing enum) | `NOT NULL` | Matches `logs.level`'s type exactly. |
| `count` | `bigint` | `NOT NULL DEFAULT 0` | Incrementally accumulated via `ON CONFLICT ... DO UPDATE SET count = log_rollups.count + EXCLUDED.count` (research.md Decision 6) — never overwritten, only added to, except during the retention-boundary recompute (Decision 9), which fully replaces the one affected boundary row per tenant/service/level rather than incrementing it. |

**Primary key**: `(bucket, tenant_id, service, level)` — the exact tuple every ingestion-flush upsert and every retention-boundary recompute conflicts on (research.md Decisions 5, 6, 9). This four-column composite key is also sufficient as the table's only index: every read path (aggregation's rollup-first query, retention's pruning delete, the rebuild service's existence check) filters by a prefix of this same tuple (`bucket` range, optionally `tenant_id`/`service`/`level`), so a second index is not justified by any query pattern identified in this feature — consistent with `CLAUDE.md`'s "do not add indexes blindly."

**Relationships**: A `LogRollup` row summarizes zero or more `Log` rows sharing its `(bucket, tenant_id, service, level)` values. No DB-level FK to `logs` (rows are frequently deleted out from under a rollup by retention — Decision 9 — which is the whole point of "derived, reconstructable summary," not a referential-integrity relationship).

**Lifecycle**:
```
created/incremented  — on every ingestion flush that includes a matching row (research.md Decision 6)
rebuilt from scratch  — at startup, only if missing/stale, non-blocking (research.md Decision 8)
pruned/recomputed     — at each retention maintenance run, for buckets at/before the cutoff (research.md Decision 9)
```

**Validation rules**: None at the application-input layer — `LogRollup` rows are never user-submitted; every field is derived server-side from already-validated `Log` data.

## Log (existing entity, changed)

| Field | Change |
|---|---|
| `attributes_text` | **REMOVED**. Was a write-time-stringified mirror of `attributes`, existing solely so attribute-equality filters (`attr.<key>=<value>`, "compared as strings" per `docs/Final_Project.md`) could stay a single string-equality containment check. Superseded by a type-branched containment predicate evaluated at query time directly against `attributes` (research.md, carried from `docs/performance_comparison_with_LogIngestion-majed.md` Recommendation 5) — same observable filter behavior, one fewer column and one fewer GIN index to maintain per row on the hot ingestion path. |
| `idx_logs_attributes_text_gin` | **REMOVED** (the index on the removed column). |

All other `Log` columns (`id`, `tenant_id`, `timestamp`, `level`, `service`, `message`, `attributes`, `ingested_at`) are unchanged. Partitioning (`PARTITION BY RANGE (timestamp)`) is unchanged.

**Attribute-equality query behavior, unchanged externally**: `attr.<key>=<value>` must still match a value compared as a string, whether the stored JSONB value is itself a string, number, or boolean — this is an *observable contract requirement* (`docs/Final_Project.md` line 188), not an implementation detail, and User Story 3's Acceptance Scenario 2 makes it an explicit test point. The new predicate achieves this via containment checks branched on the query value's apparent type (string match, OR numeric match if the value parses as a canonical number, OR boolean match if the value is exactly `"true"`/`"false"`) against the native `attributes` column — functionally equivalent output to today's pre-stringified check, computed at read time instead of write time.

## Entity-relationship summary

```
Tenant (1) ──owns──> (0..N) Log            [unchanged, from specs/001-multi-tenancy]
Tenant (1) ──owns──> (0..N) LogRollup      [NEW — via tenant_id, no DB FK, same rationale as Log]
LogRollup   ──summarizes──> (0..N) Log     [derived/reconstructable, not a referential relationship]
```

No new foreign keys — consistent with the existing schema's convention (zero FKs anywhere) and `specs/001-multi-tenancy/research.md` Decision 6's rationale, which applies equally to `log_rollups.tenant_id`.
