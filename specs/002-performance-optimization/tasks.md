---

description: "Task list for the Performance Optimization feature"
---

# Tasks: Performance Optimization

**Input**: Design documents from `specs/002-performance-optimization/` (`plan.md`, `spec.md`, `research.md`, `data-model.md`, `quickstart.md`)

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, quickstart.md ✅ (no `contracts/` — this feature introduces no new/changed external interface, see plan.md's Project Structure)

**Tests**: Not included. Per this project's established convention (`specs/001-multi-tenancy/plan.md`, `.wolf/cerebrum.md`), verification is via the CI smoke job (unchanged by this feature), `quickstart.md`'s scenarios, and — per spec.md FR-015/SC-008 — the external load-testing portal, which is authoritative for whether a change is retained.

**Organization**: Tasks are grouped by user story (US1–US3, matching spec.md's priority order) so each story is independently deliverable and checkpointable. Per spec.md's Assumptions, US2 and US3 are architecturally independent of US1 — this file sequences them in priority order anyway (matching the "Recommended Order" convention from `specs/001-multi-tenancy/tasks.md`), so later phases assume earlier ones are already done rather than re-deriving independent integration points.

**2026-08-13 revision**: this file was regenerated after `/speckit-analyze` surfaced three CRITICAL findings (C1: `COPY`+rollup-upsert atomicity; C2/C3: rollup-rebuild-vs-concurrent-ingestion safety) and four HIGH findings (H1: coalescing drain/re-entrancy; H2: already-migrated-database behavior; H3: unconditional tenant filtering on rollup reads) plus MEDIUM/LOW items (M1, M2, L1). All are resolved below — see the `[C#]`/`[H#]`/`[M#]`/`[L#]` tags on the affected tasks. **User Story 2's `LogRollupRebuildService` (previously T016–T017) has been removed entirely** — research.md Decisions 6 and 8 found that an atomic `COPY`+rollup-upsert transaction against a durable table eliminates the staleness problem that service existed to solve, replacing it with a one-time migration-time backfill (folded into T011) that is provably race-free rather than a background service that had to reason about concurrency at all. Every task ID after T009 shifted from the previous revision; do not reference old IDs.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: Which user story this task belongs to (US1–US3) — omitted for Setup/Foundational/Polish
- File paths are exact and relative to the repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Expose every new tuning knob as optional, documented, zero-config-safe environment variables before any code reads them.

- [ ] T001 [P] Add `DB_WRITE_POOL_MAX`, the write-coalescing debounce window, and the write-coalescing max-batch-rows env vars to `.env.example` with commented defaults (all optional — zero-config `docker compose up` behavior per FR-011/SC-007 must be unaffected by their absence)
- [ ] T002 [P] Add the same env vars to the `app.environment` block in `docker-compose.yml`, each defaulted so a plain `docker compose up` is unaffected

---

## Phase 2: Foundational (Shared Constants)

**Purpose**: Named, env-overridable defaults that US1 and US2's implementation tasks both import — small by design, since (per spec.md's Assumptions and research.md) this feature's three stories do not share a large blocking prerequisite the way `specs/001-multi-tenancy`'s tenant-scoping schema did.

**⚠️ CRITICAL**: US1 and US2's first implementation tasks depend on this phase; US3 does not.

- [ ] T003 [P] Add write-coalescing debounce-window and max-batch-rows constants (env-overridable, named defaults) to `src/common/constants/log-api.constants.ts`, matching the existing `DEFAULT_LOG_RETENTION_DAYS`-style pattern (research.md Decision 2)
- [ ] T004 [P] Add the rollup-bucket-granularity constant (one minute — research.md Decision 4) to `src/common/constants/retention.constants.ts`, reused by both the ingest-side upsert (US2) and the retention-side pruning (US2)

**Checkpoint**: Shared tuning constants exist. US1, US2, and US3 can now proceed — US3 has no dependency on this phase at all.

---

## Phase 3: User Story 1 - Ingestion throughput stays high as concurrent load increases (Priority: P1) 🎯 MVP

**Goal**: Concurrent `POST /logs` requests are merged into fewer, larger `COPY` writes, without changing the per-request response contract or weakening durability.

**Independent Test**: quickstart.md Scenario 1 — run concurrent batches at increasing concurrency and confirm throughput no longer degrades, while every batch's own `accepted`/`rejected` result stays exactly as if it had been written alone, including across tenants.

### Implementation for User Story 1

- [ ] T005 [US1] In `src/logs/repositories/log.repository.ts`, replace `insertMany()`'s immediate-COPY call with an enqueue step: push the caller's `NewLog[]` plus a deferred `Promise` (`Promise.withResolvers()`) onto an in-memory pending-batch queue, and schedule a flush via the debounce-window constant from T003 if one isn't already scheduled (research.md Decisions 1–2)
- [ ] T006 [US1] **[H1]** Implement the flush routine in `src/logs/repositories/log.repository.ts` as a **drain loop**, not a single capped batch: while the pending queue is non-empty, take one batch up to the max-batch-rows cap (T003) and flush it through `copyLogsIn()` unchanged, then immediately check again — if rows are still queued (arrival outpaced one flush's cap), take and flush the next capped batch too, without waiting for a fresh debounce timer. Guard against re-entrancy with an in-flight boolean flag: a debounce timer firing while a flush loop is already running is a no-op, since the running loop will pick up anything queued since it started (research.md Decision 1) (depends on T005)
- [ ] T007 [US1] Settle each drained caller's deferred `Promise` based on the specific flush that absorbed it — resolve every caller in a successful flush, reject every caller in a failed one — preserving `LogIngestionService`'s existing per-request `accepted`/`rejected` semantics exactly (FR-001, FR-002) (depends on T006)
- [ ] T008 [US1] Confirm no code path resolves a caller's promise (and therefore no code path lets `LogIngestionService` return HTTP `200`) before that caller's rows are part of a `COPY` call that has actually completed — re-verify FR-002/FR-003 are structurally impossible to violate by this design, not just believed to hold (depends on T007)
- [ ] T009 [US1] Run quickstart.md Scenario 1 against a locally built stack: concurrent mixed valid/invalid batches return identical per-request responses to today's, data is queryable immediately after each `200` and well within the 20-second budget (SC-005), and concurrent multi-tenant batches that share a flush still land under their own correct tenants (FR-004) (depends on T005-T008)

**Checkpoint**: MVP-critical — ingestion no longer serializes one `COPY` per request under concurrency; `POST /logs`'s external contract is verified unchanged.

---

## Phase 4: User Story 2 - Aggregation queries stay fast while ingestion is active (Priority: P2)

**Goal**: `GET /logs/aggregate` answers common (unfiltered-by-message/attribute) requests from a tenant-scoped, minute-granularity `log_rollups` table instead of scanning raw `logs` rows, kept correct across concurrent ingestion and retention by construction — not by a runtime rebuild mechanism.

**Independent Test**: quickstart.md Scenario 2 (aggregation stays fast and numerically correct under concurrent ingestion, tenant-isolated) and Scenario 3 (rollup consistency survives an unclean restart with no readiness delay, and the one-time historical backfill is correct against an already-populated database).

### Implementation for User Story 2

- [ ] T010 [P] [US2] Create the `LogRollup` TypeORM entity in `src/logs/entities/log-rollup.entity.ts` per data-model.md: `bucket` (timestamptz), `tenant_id` (uuid), `service` (text), `level` (existing `log_level` enum), `count` (bigint, default 0), composite PK `(bucket, tenant_id, service, level)`, no FK, **a normal `LOGGED` table — do not mark it `UNLOGGED`** (data-model.md's "Table durability" note; this is load-bearing for T013's atomicity guarantee, not a style choice) (depends on T004)
- [ ] T011 [P] [US2] **[C2/C3]** Create migration `<next-timestamp>-CreateLogRollupsTable.ts` for the `log_rollups` table (matching the entity's columns/PK exactly), and **fold the one-time historical backfill into the same migration**: `INSERT INTO log_rollups (...) SELECT bucket, tenant_id, service, level, COUNT(*) FROM logs GROUP BY 1,2,3,4 ON CONFLICT (bucket, tenant_id, service, level) DO UPDATE SET count = log_rollups.count + EXCLUDED.count`, computed with the same bucket-truncation origin as T004's granularity constant. This runs once, as part of `migrationsRun: true`, before `app.listen()` — no application-level rebuild service, no readiness flag, no runtime "is it safe to trust rollups" check anywhere (research.md Decision 8's full rationale for why this is provably race-free: there is no concurrent writer during a migration). On a fresh/empty database (the actual zero-config grading scenario) this `INSERT ... SELECT` touches zero rows (depends on T004)
- [ ] T012 [US2] Register `LogRollup` in `TypeOrmModule.forFeature([...])` within `src/logs/logs.module.ts` so it's injectable (depends on T010)
- [ ] T013 [US2] **[C1]** Implement the post-flush rollup upsert in `src/logs/repositories/log.repository.ts`, running **in the same explicit transaction, on the same connection, as the `COPY` it corresponds to** (`BEGIN` before `COPY`, `COMMIT` only after the rollup `INSERT` also succeeds — any failure in either statement rolls back both): group the just-written batch (already held in memory — no extra query) by `(tenant_id, service, level, minute-bucket)` using T004's granularity constant, and issue one `INSERT INTO log_rollups (...) VALUES (...) ON CONFLICT (bucket, tenant_id, service, level) DO UPDATE SET count = log_rollups.count + EXCLUDED.count` covering every distinct group in that flush (research.md Decision 6; FR-004, FR-005, FR-007, FR-009). This atomicity is what makes T011's migration-only backfill sufficient — without it, `log_rollups` could still drift after this task's own code ships (depends on T006, T012)
- [ ] T014 [US2] **[H3]** Implement the rollup-first query path in `src/logs/query-builders/aggregation-query.builder.ts`: for requests with no `q`/`attr.*` filter, read `log_rollups` for the minute-aligned bulk of `[since, until)` and fall back to a direct `logs` scan only for the partial-minute edges, unioning and re-summing the two result sets so the output is numerically identical to a full raw scan. **The rollup read MUST apply `WHERE tenant_id = :tenantId` unconditionally** — reuse or mirror `applyLogFilters()`'s tenant-scoping discipline exactly; a correct rollup schema (Decision 5) does not by itself guarantee a correct query against it (research.md Decision 7; FR-005, FR-007) (depends on T010)
- [ ] T015 [US2] Ensure any request carrying `q` or `attr.<key>` bypasses the rollup-first path entirely and is served exactly as today — full raw scan, `log_rollups` never consulted (FR-006) (depends on T014)
- [ ] T016 [US2] **[M2]** Extend `RetentionService.runMaintenance()` in `src/retention/retention.service.ts` with a rollup-pruning step, running under the *same* advisory lock the method already acquires (no new lock, no new scheduled job): (a) bulk-delete `log_rollups` rows whose `bucket` is strictly before the retention cutoff's minute (`DELETE FROM log_rollups WHERE bucket < :cutoffMinute`), and (b) adjust the *one* boundary bucket with a **relative delta computed in the same atomic statement as the deletion it corresponds to** — a CTE chaining `DELETE FROM logs ... RETURNING tenant_id, service, level` into a grouped count into `UPDATE log_rollups SET count = log_rollups.count - deltas.removed FROM deltas WHERE ...` — never an independent `SELECT COUNT(*)` followed by a replace, which can race with and silently overwrite a concurrent live upsert for a late-arriving log in that same bucket (research.md Decision 9; FR-008, FR-014) (depends on T010)
- [ ] T017 [US2] Update `projectSchema.dbml` with the `log_rollups` table (a `LOGGED` table, no `unlogged` note), per CLAUDE.md's Schema Updates rule — keep it, the `LogRollup` entity, and the migration describing the exact same columns (depends on T010, T011)
- [ ] T018 [US2] Run quickstart.md Scenario 2 (aggregation p95 under concurrent ingestion, rollup-sum-vs-raw-scan exact-match correctness, cross-tenant rollup isolation via T014's tenant filter) and the rewritten Scenario 3 (kill -9 mid-flush, confirm `GET /health` reports ready with no rollup-related delay at all, confirm rollup-derived and raw-scan aggregates agree exactly post-restart, and confirm the migration backfill is correct when run against an already-populated database as well as a no-op on a fresh one) against a locally built stack (depends on T012-T017)

**Checkpoint**: Aggregation no longer scales with total stored row count for the common case; rollups stay correct across concurrent writes, retention, and restarts — by construction, not by a runtime mechanism that has to detect and recover from staleness.

---

## Phase 5: User Story 3 - Query and ingestion paths avoid unnecessary internal overhead (Priority: P3)

**Goal**: Explicit write-pool sizing, raw-row reads on `GET /logs` instead of full entity hydration, and dropping the redundant `attributes_text` column/GIN index — none of it changing any response's content.

**Independent Test**: quickstart.md Scenario 4 — byte-identical `GET /logs` responses before/after, mixed-type `attr.<key>` equality behavior unchanged, write-pool size configurable.

### Implementation for User Story 3

- [ ] T019 [P] [US3] Add an explicit, env-configurable `extra.max` (`DB_WRITE_POOL_MAX`, from T001/T002) to `createDatabaseOptions()` in `src/config/database.config.ts`, mirroring `createReadDatabaseOptions()`'s existing `DB_READ_POOL_MAX` pattern exactly (research.md Decision 10; FR-018)
- [ ] T020 [P] [US3] Fold the removal of `attributes_text` and its GIN index into the original migrations that created them — `src/migrations/1785684350114-CreateLogsTable.ts` (column) and the migration that created `idx_logs_attributes_text_gin` (index) — per the pre-release fold convention (research.md Decision 11)
- [ ] T021 [US3] Remove the `attributes_text` column and its `@Index` decorator from `src/logs/entities/log.entity.ts` (depends on T020)
- [ ] T022 [US3] Remove `attributes_text` from `NewLog` in `src/logs/interfaces/log-repository.interface.ts` (depends on T021)
- [ ] T023 [US3] Remove `attributes_text` from the CSV row encoding in `src/logs/repositories/log-csv-encoder.ts` (depends on T022)
- [ ] T024 [US3] Remove `attributes_text` from the `COPY logs (...)` column list in `src/logs/repositories/log.repository.ts`'s `copyLogsIn()`, keeping the remaining column order in the CSV encoder and the COPY statement in sync (depends on T023)
- [ ] T025 [US3] Remove `attributes_text` population from `mapLogEntryToNewLog()` in `src/logs/mappers/log.mapper.ts` (depends on T022)
- [ ] T026 [US3] Rewrite the attribute-equality predicate in `src/logs/query-builders/log-filter.builder.ts`: replace the single string-equality containment check against `attributes_text` with a type-branched containment check against `attributes` (string match, OR numeric match if the query value parses as a canonical number, OR boolean match if it's exactly `"true"`/`"false"`), with explicit parameter type casts to avoid the prepared-statement type-inference pitfall noted in research.md — observable filter behavior (attribute equality "compared as strings," per `docs/Final_Project.md`) must be unchanged (depends on T021)
- [ ] T027 [US3] Switch `LogRepository.findPage()` in `src/logs/repositories/log.repository.ts` from TypeORM's `getMany()` to `getRawMany()` (depends on T024, since both edit the same file — sequence to avoid conflicting changes)
- [ ] T028 [US3] Update `buildLogPageQuery()` in `src/logs/query-builders/log-query.builder.ts` and `mapLogToResponse()` in `src/logs/mappers/log.mapper.ts` for the raw-row shape returned by `getRawMany()`, producing a `GET /logs` response body byte-identical to today's (depends on T027)
- [ ] T029 [P] [US3] Update `projectSchema.dbml` to remove the `attributes_text` column and its GIN index, per CLAUDE.md's Schema Updates rule (depends on T020)
- [ ] T030 [US3] **[H2]** Before running T031's quickstart validation, handle already-migrated databases: TypeORM tracks applied migrations by name in `typeorm_migrations`, not by re-diffing file content, so any database that already ran the *original* (pre-T020) `CreateLogsTable`/GIN-index migrations — including this project's own dev database used throughout prior sessions — will silently retain `attributes_text` even after T020's edit, since that migration will not re-run. Either fully reset the target database (acceptable for local/dev, per this project's established pre-release convention) or manually run `ALTER TABLE logs DROP COLUMN attributes_text; DROP INDEX idx_logs_attributes_text_gin;` against it before validating (research.md Decision 11's "Already-migrated databases" note) (depends on T020)
- [ ] T031 [US3] Run quickstart.md Scenario 4 against a locally built stack: `GET /logs` responses diff byte-identical to a captured baseline, mixed-type `attr.<key>=<value>` filtering still matches correctly, and `DB_WRITE_POOL_MAX` visibly takes effect (depends on T019, T025-T030)

**Checkpoint**: Read/write-path overhead reduced with zero observable behavior change — verified by byte-identical response comparison, not just code review.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, final repo-wide checks, and the mandatory performance-validation gate.

- [ ] T032 [P] Update `README.md`'s Schema and index design, Attribute storage strategy, and Retention strategy sections to describe `log_rollups` (a durable table, atomically updated alongside ingestion, backfilled once via migration — not a rebuild service) and the `attributes_text` removal (depends on T009, T018, T031)
- [ ] T033 [P] Update `README.md`'s Configuration table with the new env vars (`DB_WRITE_POOL_MAX`, write-coalescing debounce window and max-batch-rows) and their defaults (depends on T009, T018, T031)
- [ ] T034 [L1] Run quickstart.md Scenario 5 (zero-config `docker compose up`, `AUTH_ENABLED` behavior) to confirm none of US1–US3 changed observable behavior under the default configuration (FR-011, FR-012, SC-007), and re-confirm SC-005's 20-second ingest-to-queryable target explicitly, not just assumed from the debounce window's size (depends on T009, T018, T031)
- [ ] T035 Run `npm run build` to confirm the entire feature type-checks cleanly (depends on T034)
- [ ] T036 Run `npm run format` and `npm run lint` immediately before opening the PR, per CLAUDE.md's workflow rule — not run earlier during implementation (depends on T035)
- [ ] T037 **[mandatory gate]** Benchmark User Stories 1, 2, and 3 against the pre-optimization baseline, independently, using the project's external load-testing portal (spec.md FR-015/SC-008; research.md's "measured, not assumed" principle carried through from `specs/001-multi-tenancy`'s T061 precedent). At minimum compare, per story: US1 — ingestion throughput at multiple concurrency levels (confirm the ~20,400→~13,900 logs/sec degradation no longer occurs); US2 — aggregation p95 under concurrent ingestion, and latency vs. stored-row-count trend; US3 — application/PostgreSQL container CPU and memory at a fixed load level. **Any change that does not demonstrate a measurable improvement, or that regresses another required metric, MUST NOT be retained** (FR-015). This feature is not considered complete until this task passes. (depends on T036)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup. Blocks US1 (T003) and US2 (T004) only — US3 has no dependency on this phase (research.md's decisions for US3 introduce no new tunable constant beyond the pool-size env var already covered in Setup).
- **User Story 1 (Phase 3)**: Depends on Foundational (T003). Architecturally independent of US2/US3. MVP-critical.
- **User Story 2 (Phase 4)**: Depends on Foundational (T004). Per spec.md's Assumptions, architecturally independent of US1 — but this file's task ordering assumes US1 (specifically T006's flush routine) is already in place, since that's the recommended, sequential execution order; T013 hooks the rollup upsert into that flush point and wraps both in one transaction.
- **User Story 3 (Phase 5)**: Depends on Foundational only for T019's env var (already available from Setup) — otherwise fully independent of US1 and US2. Can be implemented and shipped in any order relative to them.
- **Polish (Phase 6)**: Depends on all three user stories being complete. T037 (performance validation) is the final gate and depends on T036 (build/format/lint) succeeding first.

### Recommended Order

Setup → Foundational → US1 → US2 → US3 → Polish — matching spec.md's priority order (P1 → P2 → P3) and this plan's Summary. US3 could technically run in parallel with US1/US2 given its independence, but sequencing it last keeps the "highest-impact first" ordering the user explicitly requested for this plan.

### Parallel Opportunities

- Setup: T001, T002 in parallel.
- Foundational: T003, T004 in parallel (different files).
- US2: T010, T011 (entity and migration+backfill) in parallel — both describe the same table but are independent artifacts to write, then cross-checked in T017.
- US3: T019 and T020 in parallel at the start (different files, no shared dependency); T029 can run in parallel with T021–T028 once T020 (the migration decision) is settled.
- Polish: T032, T033 in parallel.

---

## Parallel Example: Foundational Phase

```bash
Task: "Add write-coalescing constants to src/common/constants/log-api.constants.ts"
Task: "Add rollup-bucket-granularity constant to src/common/constants/retention.constants.ts"
```

## Parallel Example: User Story 2 (entity + migration/backfill)

```bash
Task: "Create LogRollup entity in src/logs/entities/log-rollup.entity.ts"
Task: "Create CreateLogRollupsTable migration (with folded-in backfill) in src/migrations/"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (T003 — US2's T004 isn't needed yet)
3. Complete Phase 3: User Story 1 — **STOP and VALIDATE** with quickstart.md Scenario 1
4. This is the MVP: ingestion throughput no longer degrades under concurrency, with zero change to any external contract. Deployable/gradable at this point even if User Stories 2–3 aren't started — **except** T037's performance validation, which should still run before treating any milestone as final, per FR-015.

### Incremental Delivery Beyond MVP

5. Add User Story 2 → aggregation answers from rollups under load, correct by construction across crashes and retention → validate with Scenario 2 (correctness + tenant isolation) and the rewritten Scenario 3 (crash consistency + backfill)
6. Add User Story 3 → read/write-path overhead reduced, verified byte-identical → validate with Scenario 4 (after T030's already-migrated-database check)
7. Polish: README updates, zero-config regression check (Scenario 5), build/format/lint, **mandatory performance benchmark (T037) — do not skip**

---

## Notes

- No test files are created in any phase — see the **Tests** note at the top of this document.
- `[P]` tasks touch different files and have no incomplete same-phase dependency.
- Commit after each task or logical group, per the repository's existing incremental-commit-history convention.
- Every task traces to a specific spec.md FR/SC or research.md decision, called out inline — this feature adds no work not already justified by measured evidence (`docs/performance_comparison_with_LogIngestion-majed.md`, `docs/suggestions_to_increase_the_performance.md`) or by a spec.md requirement.
- Tags like `[C1]`, `[C2/C3]`, `[H1]`, `[H2]`, `[H3]`, `[M2]`, `[L1]` on specific tasks trace directly to `/speckit-analyze`'s 2026-08-13 findings — kept visible so their resolution is traceable, not just folded silently into descriptions. (M1 has no dedicated task tag since it's a `quickstart.md`-only change, already reflected in T009's and T018's descriptions above.)
