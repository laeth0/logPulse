# Implementation Plan: Performance Optimization

**Branch**: `002-performance-optimization` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-performance-optimization/spec.md`

## Summary

Reduce ingestion and aggregation cost under load without changing any externally-visible behavior. Three independently-shippable pieces, matching spec.md's priority order:

1. **US1 (P1) — Coalesce concurrent writes.** `LogRepository.insertMany()` currently issues one `COPY FROM STDIN` per HTTP request. Under concurrency this saturates PostgreSQL's single CPU core — this project's own measurements show throughput dropping from ~20,400 to ~13,900 logs/sec as concurrency doubles (8→16). A short in-memory debounce window merges concurrent requests' rows into fewer, larger `COPY` calls, preserving `COPY` as the write mechanism (still Postgres's fastest bulk-load path) while cutting the number of transactions competing for the CPU.
2. **US2 (P2) — Pre-aggregate for `GET /logs/aggregate`.** A new, tenant-scoped `log_rollups` table (one row per `bucket, tenant_id, service, level`, minute granularity, a durable/`LOGGED` table) is updated incrementally as part of every ingestion flush, **in the same transaction as the `COPY` that writes the underlying rows** — so it can never drift out of sync with `logs` due to a crash. Historical rows from before this feature existed are backfilled once via migration (no runtime rebuild service). Aggregation queries that don't need message/attribute filtering answer from `log_rollups` for the bulk of a time range, falling back to a raw scan only for the sub-minute edges — so aggregation cost stops scaling with total stored row count.
3. **US3 (P3) — Trim avoidable overhead.** Explicit write-pool sizing (currently unset, silently defaulting to node-postgres's 10), raw-row reads on `GET /logs` instead of full TypeORM entity hydration, and dropping the `attributes_text` mirror column/GIN index in favor of type-branched containment queries against the existing typed `attributes` column.

Every change is additive/internal — no request or response shape changes on any of the four required endpoints, no change to `AUTH_ENABLED`/`LOADGEN_API_KEY` behavior, no change to tenant isolation, no reduction in write durability, and retention gains one new responsibility (pruning rollups in sync with expired log deletion, via relative deltas rather than snapshot-and-replace, so it composes safely with concurrent ingestion) using its existing advisory-lock-guarded maintenance job.

**Revision note (post-`/speckit-analyze`)**: the original version of this plan gave `log_rollups` a non-blocking, `OnApplicationBootstrap`-driven rebuild service to cope with staleness after an unclean restart. Closer analysis (see research.md Decisions 6, 8, 9) found that pairing an atomic COPY+upsert transaction with a durable (not `UNLOGGED`) rollup table eliminates that staleness scenario *by construction* — `log_rollups` simply cannot fall behind `logs` after a crash, so no rebuild-vs-concurrent-ingestion race needs solving at runtime. The only remaining gap (historical backfill for pre-existing rows) is instead a one-time migration, which is provably race-free because migrations run before any traffic is accepted — simpler than, and strictly safer than, a background service racing live writes.

## Technical Context

**Language/Version**: TypeScript 5.7 on Node.js 24 (existing — unchanged)

**Primary Dependencies**: NestJS 11, TypeORM + `@nestjs/typeorm`, `pg` / `pg-copy-streams` (all existing). **No new runtime dependency is needed** — write coalescing is plain application-level `Promise`/timer logic (Node 24 has native `Promise.withResolvers()`), and rollups are plain SQL reachable through the existing TypeORM/raw-`pg` infrastructure already used for ingestion and reads.

**Storage**: PostgreSQL 16 (existing, unchanged version). One new, durable (`LOGGED`) table: `log_rollups` (tenant-scoped, minute-granularity pre-aggregation, written atomically alongside `logs` — see research.md Decision 6). One existing column removed: `logs.attributes_text` (and its GIN index), superseded by type-branched containment queries against the already-existing `logs.attributes` column.

**Testing**: No `.test.ts`/`.spec.ts` files, consistent with this project's established convention (see `specs/001-multi-tenancy/plan.md` and `.wolf/cerebrum.md`). Verification is via: the CI smoke job (unchanged — this feature adds no new required behavior for it to cover), `quickstart.md`'s runnable validation scenarios, and — per spec.md FR-015/SC-008 — the project's external load-testing portal, which is authoritative for whether a change is retained (local runs are diagnostic only, matching established project convention).

**Target Platform**: Linux containers via `docker compose` (existing, unchanged).

**Project Type**: Single NestJS web-service (monolith) — existing structure. This feature modifies the existing `logs`, `retention`, and `config` areas; it does not add a new top-level feature module the way multi-tenancy added `src/tenancy/`.

**Performance Goals**: Per spec.md's Success Criteria — no ingestion-throughput degradation as concurrency rises (SC-001), ≥15,000 logs/sec sustained with measured improvement over the current baseline (SC-002), aggregation p95 <1s while ingestion is active (SC-003), aggregation latency flat as stored rows grow toward ~1M (SC-004), 20-second ingest-to-queryable unchanged (SC-005).

**Constraints**: Same fixed container limits as the base project (app: 0.5 CPU / 256 MB; PostgreSQL: 1 CPU / 1 GB — unchanged). The write-coalescing debounce window must stay small enough that it cannot meaningfully threaten the 20-second queryable budget (milliseconds, not seconds); the flush mechanism must drain the pending queue in a loop bounded by the row cap, not one capped batch per debounce timer, so a sustained arrival rate exceeding one flush's capacity cannot grow the queue unboundedly (research.md Decision 1). The `COPY` that writes `logs` and the upsert that updates `log_rollups` must run in one transaction on one connection — never as two independently-committable statements (research.md Decision 6). Rollup pruning during retention must not introduce a new long-running lock or lock a different resource than `RetentionService.runMaintenance()` already guards with its existing PostgreSQL advisory lock (`LOG_RETENTION_LOCK_NAMESPACE`/`LOG_RETENTION_LOCK_ID`), and must adjust the boundary bucket by a relative delta computed in the same statement as the deletion it corresponds to — never an independent snapshot-and-replace (research.md Decision 9). `GET /health`'s readiness conditions are unchanged from today (database connectivity, applied migrations) — this feature adds no new readiness concern for it to gate on; the one-time historical rollup backfill is folded into "migrations applied," the same existing condition `LoadgenKeySeeder` and every schema migration already rely on, not a new bespoke non-blocking mechanism (research.md Decision 8).

**Scale/Scope**: ~1,000,000 log rows across ~1 month of daily partitions, tens of tenants (existing, unchanged from `specs/001-multi-tenancy`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template — no ratified project constitution exists. As with `specs/001-multi-tenancy/plan.md`, this plan is held instead to `CLAUDE.md`'s "Engineering Quality and Performance Principles": keep code simple and cohesive, apply patterns only where they genuinely simplify the design, treat performance as a first-class requirement, justify indexes/schema changes by actual query patterns and measurement rather than assumption, and preserve the existing architecture and API contracts unless a requirement explicitly requires a change.

**Result**: PASS. Every optimization in scope traces to a spec.md FR and to measured evidence already gathered in `docs/performance_comparison_with_LogIngestion-majed.md` / `docs/suggestions_to_increase_the_performance.md`, not to assumption. No optimization that would violate an existing hard requirement (durability, tenant isolation, `AUTH_ENABLED`/`LOADGEN_API_KEY` behavior, retention, zero-config, the required API contract) is in scope — see Assumptions in spec.md and the "rejected" findings carried into research.md Decision 12.

*Post-Phase-1 re-check*: PASS — see [research.md](./research.md)'s per-decision rationale; each decision that touches an existing hard requirement (rollup tenant-scoping, rollup/retention sync, atomic write durability, migration-time backfill) states explicitly how it's preserved, not just asserts it. This re-check followed a `/speckit-analyze` pass that found three CRITICAL gaps in the original design (COPY/rollup atomicity, rebuild-vs-concurrent-ingestion safety) — Decisions 6, 8, and 9 were revised in response; see each decision's "remediates finding" note.

## Project Structure

### Documentation (this feature)

```text
specs/002-performance-optimization/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── checklists/
│   └── requirements.md  # already produced by /speckit-specify + /speckit-clarify
└── tasks.md              # Phase 2 output (/speckit-tasks command — NOT created by /speckit-plan)
```

**No `contracts/` directory**: this feature intentionally introduces no new or changed external interface. FR-010 requires every response shape on the four required endpoints to remain exactly as specified today — the "contract" this feature must satisfy is the *existing* one in `docs/Final_Project.md`, which stays the authoritative reference unchanged. `quickstart.md`'s validation scenarios confirm this by comparison against today's documented responses rather than by documenting a new contract.

### Source Code (repository root)

Existing NestJS layout — no new top-level module. New/changed paths only; everything else in `src/` is unchanged:

```text
src/
├── common/
│   └── constants/
│       ├── log-api.constants.ts               # CHANGED: + write-coalescing tuning defaults (debounce window, max batch rows)
│       └── retention.constants.ts              # CHANGED: + rollup-bucket-granularity constant, reused by both the ingest-side upsert and the retention-side pruning
├── config/
│   └── database.config.ts                      # CHANGED: createDatabaseOptions() gains an explicit, env-configurable extra.max (write pool), matching createReadDatabaseOptions()'s existing DB_READ_POOL_MAX pattern
├── logs/                                        # existing module — CHANGED, not restructured
│   ├── entities/
│   │   ├── log.entity.ts                        # CHANGED: attributes_text column + its @Index removed
│   │   └── log-rollup.entity.ts                 # NEW: LogRollup entity (bucket, tenant_id, service, level, count)
│   ├── interfaces/
│   │   └── log-repository.interface.ts          # CHANGED if NewLog's shape needs adjusting for the coalescer; contract of insertMany() itself is unchanged (still Promise<void> per caller)
│   ├── mappers/
│   │   └── log.mapper.ts                        # CHANGED: mapLogToResponse() reads from a raw row shape instead of a hydrated Log entity (US3); attribute mapping updated for the dropped attributes_text column
│   ├── query-builders/
│   │   ├── log-filter.builder.ts                 # CHANGED: attribute-equality predicate becomes type-branched containment against `attributes` (replacing the single string-equality check against attributes_text)
│   │   ├── log-query.builder.ts                  # CHANGED: supports the getRawMany() read path (US3)
│   │   └── aggregation-query.builder.ts           # CHANGED: rollup-first query path (reads log_rollups for the bulk of a range) with raw-table fallback for sub-minute edges and any q/attr.*-filtered request
│   └── repositories/
│       ├── log-csv-encoder.ts                    # CHANGED: attributes_text column removed from the CSV row
│       └── log.repository.ts                     # CHANGED: insertMany() gains the coalescing queue (with a bounded drain loop, research.md Decision 1) in front of copyLogsIn(); COPY + the rollup upsert now run in one explicit transaction on one connection (research.md Decision 6); findPage() switches to getRawMany()
├── migrations/
│   ├── 1785684350114-CreateLogsTable.ts          # CHANGED (folded in, pre-release convention — see research.md Decision 11): attributes_text column removed. Already-migrated databases need a manual reset/ALTER — this edit alone does not retroactively affect them.
│   ├── <existing attributes_text GIN index migration>  # CHANGED: index-creation statement removed
│   └── <new-timestamp>-CreateLogRollupsTable.ts   # NEW: log_rollups table (LOGGED, not UNLOGGED) + its PK, plus a one-time backfill INSERT ... SELECT ... GROUP BY ... ON CONFLICT for any pre-existing logs rows (research.md Decision 8) — no separate rebuild service
└── retention/
    └── retention.service.ts                       # CHANGED: runMaintenance() gains a rollup-pruning step, reusing the existing advisory lock — bulk-delete for fully-expired buckets, a same-statement relative-delta UPDATE for the one boundary bucket (research.md Decision 9), never an independent snapshot-and-replace

projectSchema.dbml                                  # CHANGED: + log_rollups table; logs.attributes_text column + its GIN index removed
docker-compose.yml / .env.example                   # CHANGED: + write-pool-size and coalescing-tuning env vars, all optional with safe defaults
README.md                                            # CHANGED: Schema/index/attribute-storage/retention/performance sections updated to describe the new design and (once measured) new numbers
```

**Structure Decision**: Extend the existing `logs`/`retention`/`config` areas in place — no new feature module. Rollup logic lives inside `logs/` (it's fundamentally about serving `GET /logs/aggregate`, the same responsibility `aggregation-query.builder.ts` already owns), not inside `retention/`; retention only gains a small, additive pruning step that calls into the same area, mirroring how `partition.service.ts` and `retention.service.ts` already divide "schema/partition management" from "deletion policy" today.

## Complexity Tracking

*No entries — no constitution violations to justify.* The one piece of genuinely new machinery (`log_rollups` and its backfill/pruning logic) is directly required by spec.md FR-005/007/008/009 (traceable to measured evidence that raw-table aggregation cannot meet SC-003/SC-004 under load) — not introduced speculatively, and — after the `/speckit-analyze` remediation — deliberately simplified to the smallest design that's provably correct under concurrent ingestion (a migration-time backfill instead of a runtime rebuild service; relative deltas instead of snapshot-and-replace) rather than the most feature-complete one. Every other change (write coalescing, raw-row reads, dropping a redundant column, explicit pool sizing) reduces existing complexity/overhead rather than adding new abstraction.
