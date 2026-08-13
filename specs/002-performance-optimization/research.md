# Phase 0 Research: Performance Optimization

Each decision below resolves one technical unknown from the plan's Technical Context, grounded in the actual codebase (`src/logs/repositories/log.repository.ts`, `src/logs/query-builders/aggregation-query.builder.ts`, `src/retention/retention.service.ts`, `src/config/database.config.ts` — all re-inspected directly during planning) and in the two prior analysis documents (`docs/performance_comparison_with_LogIngestion-majed.md`, `docs/suggestions_to_increase_the_performance.md`) rather than assumption.

## Decision 1: Write coalescing — in-process debounce queue in front of the existing `COPY` path

**Decision**: `LogRepository.insertMany()` no longer issues `COPY FROM STDIN` immediately per call. Incoming batches are pushed onto an in-memory queue; a short timer (default a few milliseconds, env-configurable) schedules a flush. Any other `insertMany()` call arriving before the timer fires joins the same flush, up to a configurable row cap. Each caller gets back a `Promise` that resolves only once *its* rows have been durably written as part of whichever flush absorbed them — the external `insertMany(logs: readonly NewLog[]): Promise<void>` signature and per-request `accepted`/`rejected` semantics in `LogIngestionService` do not change.

**Rationale**: This project's own measurements (`README.md:336`) show throughput dropping from ~20,400 to ~13,900 logs/sec as concurrency doubles from 8 to 16, with PostgreSQL CPU pinned at ~99.9% — i.e., the bottleneck is the *number of write transactions*, not the cost of any single one. `LogIngestion-majed`'s own README independently names the identical root cause ("a write per HTTP request saturates the single PostgreSQL CPU") and fixes it the same way. Merging concurrent requests into fewer, larger `COPY` calls directly reduces transaction count without touching any per-row cost.

**Alternatives considered**:
- Switch to `INSERT ... SELECT FROM jsonb_to_recordset()` (the reference project's exact mechanism) — rejected as the *underlying write*. `COPY` is still Postgres's fastest bulk-load path and is already proven in this codebase; the reference project's real insight is the coalescing, not its SQL shape. Coalescing composes with `COPY` just as well.
- PostgreSQL-level `commit_delay`/`commit_siblings` group-commit tuning only (already configured — `2000`/`5`) — insufficient alone: it batches the *fsync* of transactions that already separately reached Postgres, whereas application-level coalescing reduces the number of transactions reaching Postgres in the first place. Strictly more effective; keep the existing `commit_delay` tuning as a complementary, unrelated setting, not a substitute.
- No coalescing, rely on raising the write pool size only (Decision 10) — insufficient alone: more concurrent connections against a 1-CPU-limited Postgres container increases *contention*, not throughput, once CPU is the bottleneck (this exact false lead is already documented as measured-and-rejected in `docs/suggestions_to_increase_the_performance.md`'s "Measured and rejected" table, for the closely related read-pool case).

## Decision 2: Coalescing window and batch-size defaults

**Decision**: Debounce window defaults to a low single-digit millisecond value; the maximum rows merged into one flush defaults to a value in the low thousands. Both are environment-configurable (new constants in `src/common/constants/log-api.constants.ts`, following the existing `DEFAULT_LOG_RETENTION_DAYS`-style pattern of a named default plus an env-var override), not hardcoded, since the right values are a function of real request-size/concurrency patterns that should be tuned by measurement (spec.md FR-015), not fixed at design time.

**Rationale**: A few milliseconds is negligible against the 20-second ingest-to-queryable budget (SC-005) and against typical HTTP round-trip latency, while still being long enough to catch bursts of genuinely concurrent requests under load-generator-style traffic. Making both values configurable lets the load-testing process (FR-015/SC-008) sweep them without a code change, mirroring how `docs/suggestions_to_increase_the_performance.md` already recommends sweeping the write-pool size.

**Alternatives considered**: Hardcoded constants matching the reference project's exact values (2 ms / 2,048 rows) — rejected as a starting *default* is fine, but hardcoding with no override would violate FR-015's "validated by measurement" requirement and this project's own "prefer measured optimization over assumptions" principle (`CLAUDE.md`).

## Decision 3: Tenant safety of coalesced batches

**Decision**: No special handling is needed for mixed-tenant flushes. `tenant_id` is already resolved and stamped onto each `NewLog` object by `mapLogEntryToNewLog()` *before* `insertMany()` is ever called (per-request, inside `LogIngestionService.ingest()`), so a flush containing rows from multiple concurrent requests — potentially different tenants, or a mix of `AUTH_ENABLED=false` zero-config requests (all resolving to `DEFAULT_TENANT_ID`) and authenticated ones — still writes each row under its own already-correct tenant. Coalescing only ever merges already-tenant-stamped rows; it never resolves or infers tenant identity itself.

**Rationale**: Directly satisfies FR-004 and spec.md's Edge Case on this exact scenario. Confirmed by re-reading `src/logs/mappers/log.mapper.ts` and `src/logs/services/log-ingestion.service.ts` — tenant resolution happens strictly upstream of the repository layer that this feature touches.

**Alternatives considered**: Grouping/flushing per-tenant separately — rejected as unnecessary complexity; it would reintroduce more, smaller transactions under multi-tenant concurrent load, undermining Decision 1's entire point, for a safety property (tenant correctness) `COPY`'s per-row column list already provides for free.

## Decision 4: Rollup granularity — single tier, per minute

**Decision**: `log_rollups` stores one row per `(bucket, tenant_id, service, level)` at **one-minute** granularity only — no second-level tier.

**Rationale**: `GET /logs/aggregate`'s `bucket` parameter only ever accepts `1m`, `5m`, `1h`, or `1d` (`docs/Final_Project.md` line 259) — there is no requirement finer than one minute, unlike `LogIngestion-majed`'s two-tier (minute *and* second) design, which exists there specifically to shrink the raw-scan sliver for arbitrary `since`/`until` boundaries. A single per-minute tier already lets 5m/1h/1d buckets be answered by summing whole minute-rows with no raw scan at all when the requested range's `since`/`until` align to minute boundaries, and needs only a small raw-scan sliver (at most just under two minutes' worth of rows) for the general case. Adding a second tier would be complexity with no corresponding requirement — directly against `CLAUDE.md`'s "apply patterns only where they genuinely simplify the design."

**Alternatives considered**: Two-tier minute+second rollups (copying the reference project exactly) — rejected per above; not justified by this project's actual supported bucket sizes. Per-second-only rollups — rejected: far more distinct rows per tenant/service/level combination for no benefit, since nothing ever requests sub-minute buckets.

## Decision 5: Rollup key includes `tenant_id` — the one required adaptation, not a copy

**Decision**: `log_rollups`' primary key is `(bucket, tenant_id, service, level)` — `tenant_id` included from the start, not bolted on later.

**Rationale**: `LogIngestion-majed` has no tenants, so its rollup key is `(bucket, service, level)`. Copying that key verbatim would let two tenants' counts for the same bucket/service/level collide and combine under `ON CONFLICT ... DO UPDATE SET count = count + EXCLUDED.count` — a direct violation of FR-007/SC-006 and the base project's tenant-isolation guarantee. This is the single clearest example in this feature of "adapt, don't copy": the technique (pre-aggregation) transfers; the exact schema does not, because the reference project has one fewer axis of correctness to protect.

**Alternatives considered**: A separate `log_rollups` table per tenant — rejected: unnecessary operational complexity (dynamic table creation/migration per self-registered tenant) for no benefit over a single shared table with `tenant_id` as a leading key column, which is exactly the pattern already established for `logs.tenant_id` itself (research.md Decision 6 in `specs/001-multi-tenancy`).

## Decision 6: Rollup upsert mechanism — computed in application code, not via `RETURNING`

**Decision**: After each coalesced flush's `COPY` completes, the repository computes per-`(tenant_id, service, level, minute-bucket)` counts from the in-memory batch it just wrote (a simple JS grouping pass over the same array already held in memory — no extra query), then issues one small `INSERT INTO log_rollups (...) VALUES (...), (...), ... ON CONFLICT (bucket, tenant_id, service, level) DO UPDATE SET count = log_rollups.count + EXCLUDED.count` covering however many distinct groups that flush touched (typically a handful, not thousands).

**Rationale**: `COPY` does not support `RETURNING`, so `LogIngestion-majed`'s CTE-chained `INSERT ... RETURNING ... → rollup INSERT` trick (which relies on a plain `INSERT ... SELECT`) has no direct equivalent here. Computing the group counts in application code from the batch already held in memory is strictly cheaper than an extra `SELECT ... GROUP BY` round-trip against the table just written to, and keeps `COPY` as the bulk-load mechanism (Decision 1).

**Alternatives considered**: A second `SELECT tenant_id, service, level, date_trunc('minute', timestamp), COUNT(*) ... GROUP BY ...` query against `logs` immediately after the `COPY` — rejected: strictly more expensive (a full extra query, re-reading rows the process already has in memory) for the same result.

## Decision 7: Aggregation query strategy — rollup-first with raw-scan fallback

**Decision**: `buildAggregationQuery()` (or a new sibling builder it delegates to) checks whether the request has no `q`/`attr.*` filter. If so, it reads `log_rollups` for the portion of `[since, until)` that aligns to whole minutes, and falls back to a direct scan of `logs` only for the (at most two, one on each end) partial-minute slivers — unioning and re-summing the two result sets, the same shape as `LogIngestion-majed`'s approach but two-way instead of three-way (Decision 4). Any request with a `q`/`attr.*` filter, which no rollup can answer, is served exactly as today — a full raw scan, unchanged.

**Rationale**: Satisfies FR-005/FR-006/SC-003/SC-004 directly: the common case's cost stops scaling with total row count, while the filtered case's correctness is untouched because it never consults `log_rollups` at all.

**Alternatives considered**: Materialized views refreshed on a timer — rejected: introduces staleness (violates FR-005's "numerically identical to a full scan" requirement, and directly conflicts with SC-005's 20-second-queryable target for anything not yet refreshed) that an incrementally-upserted table (Decision 6) avoids entirely.

## Decision 8: Rollup rebuild after restart — non-blocking, per FR-019

**Decision**: A new `LogRollupRebuildService` checks at startup (via `OnApplicationBootstrap`) whether `log_rollups` is empty/stale relative to `logs`, and if so, rebuilds it with a `GROUP BY` scan of the full log table. Critically, this check-and-rebuild is **fired but not awaited** inside the lifecycle hook — `onApplicationBootstrap()` returns immediately, so Nest proceeds to `app.listen()` without waiting, and `GET /health`'s existing readiness conditions (database connectivity, applied migrations — unchanged) are unaffected.

**Rationale**: Directly implements the Clarifications 2026-08-13 decision and FR-019. This is a deliberate **reversal** of the pattern `LoadgenKeySeeder` uses in `specs/001-multi-tenancy` (which *intentionally* blocks `app.listen()` until seeding completes, since an unseeded `LOADGEN_API_KEY` would otherwise cause spurious `401`s on the very first graded request). The two must not be conflated: seeding a credential is cheap and must complete before any request can rely on it; rebuilding rollups from potentially ~1M rows is comparatively expensive and has a safe, already-correct fallback (Decision 7's raw-scan path) — so blocking startup on it would trade a real risk (health-check timeout after any restart) for no correctness benefit.

**Alternatives considered**: Block startup on rebuild (mirroring `LoadgenKeySeeder`) — explicitly rejected by the Clarifications session; the risk/benefit is inverted relative to key-seeding, as above.

## Decision 9: Rollup pruning at retention time — extend the existing maintenance job, no new lock

**Decision**: `RetentionService.runMaintenance()` gains one additional step, after dropping expired partitions and deleting straggler rows (both already advisory-lock-guarded): delete `log_rollups` rows whose `bucket` is fully before the retention cutoff, then recompute the one boundary-minute rollup that straddles the cutoff from whatever `logs` rows remain in it (mirroring `LogIngestion-majed`'s `refreshRollupsAtRetentionBoundary`, adapted to also filter by `tenant_id` implicitly via `GROUP BY` — every tenant's boundary-minute row is recomputed, not just one). This runs under the *same* `pg_try_advisory_lock` call `runMaintenance()` already acquires — no second lock, no second scheduled job.

**Rationale**: Directly satisfies FR-008/FR-014. Re-reading `src/retention/retention.service.ts` confirmed `deleteExpiredRows()` already exists as a straggler-row safety net alongside `partitionService.dropExpiredDailyPartitions()` — rollup pruning must account for rows removed by *either* path, which a `bucket <= cutoff` condition against `log_rollups` naturally does regardless of which mechanism removed the underlying `logs` rows.

**Alternatives considered**: A separate scheduled job for rollup pruning — rejected: would need its own lock and its own cadence decision for no benefit over piggybacking on the maintenance job that already runs on the right cadence and already holds the right lock.

## Decision 10: Explicit write-pool sizing

**Decision**: `createDatabaseOptions()` in `src/config/database.config.ts` gains `extra.max`, sourced from a new `DB_WRITE_POOL_MAX` env var with a documented default, mirroring `createReadDatabaseOptions()`'s existing `DB_READ_POOL_MAX` pattern exactly.

**Rationale**: Directly closes the gap `docs/suggestions_to_increase_the_performance.md` §2 already identified and this plan's own re-inspection of `database.config.ts` confirmed still exists: the write/default connection has no `max` at all, silently defaulting to node-postgres's built-in 10, while the read pool is explicitly configured. Satisfies FR-018.

**Alternatives considered**: None meaningfully — this is a one-line gap with an already-established sibling pattern to follow; the only open question is the default value, deferred to measurement (sweep 10/20/30, per the existing suggestions doc) rather than fixed here.

## Decision 11: Migration strategy

**Decision**: The removal of `logs.attributes_text` and its GIN index is **folded into the original migrations that created them** (`1785684350114-CreateLogsTable.ts` and the migration that added `idx_logs_attributes_text_gin`), not layered as a new `DROP COLUMN` migration. `log_rollups` gets a **new** migration, since there is no existing migration about rollups to fold into.

**Rationale**: Consistent with the pre-release fold convention already established and used repeatedly in this project (`specs/001-multi-tenancy/research.md` Decision 11; this session's own `created_at` removal from the `tenants` table followed the identical pattern) — nothing has shipped to a real deployment yet, so there is no upgrade path to preserve by layering a reversible migration on top.

**Alternatives considered**: A new `DROP COLUMN attributes_text` migration — rejected per the established convention; would leave the original `CreateLogsTable` migration permanently describing a column that no longer exists, misleading anyone reading migration history as the current schema definition.

## Decision 12: Explicitly rejected / out-of-scope techniques (carried forward from the comparison report)

**Decision**: The following, already evaluated in `docs/performance_comparison_with_LogIngestion-majed.md`, remain out of scope for this feature and MUST NOT be introduced:

- **`synchronous_commit=off`** — violates FR-002/FR-003 and `docs/Final_Project.md`'s "never respond 200 to a batch you have not durably accepted."
- **Batched-`DELETE`-based retention** (replacing partition-drop) — would be a regression; `partition.service.ts`'s `DROP TABLE` approach is already architecturally superior (O(1) vs. O(n), no bloat) to the reference project's own retention design. Not touched by this feature at all beyond the rollup-pruning addition in Decision 9.
- **Swapping NestJS/TypeORM for Fastify/Prisma, or Zod for hand-rolled validation** — disproportionate, high-risk rewrites for marginal gains secondary to Decision 1's actual bottleneck; conflicts with `CLAUDE.md`'s "preserve the existing architecture... unless a requirement explicitly requires a change."
- **PostgreSQL version bump (16→17) and the `q=` planner-hint technique** — genuinely plausible per the comparison report, but not named in this feature's spec.md FRs or in the user's stated priorities for this plan (write coalescing, rollups, query/write overhead reduction). Left as unscoped future work rather than folded in here, to keep every task in `tasks.md` traceable to a specific FR.
