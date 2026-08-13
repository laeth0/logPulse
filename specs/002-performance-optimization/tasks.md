---

description: "Task list for the Performance Optimization feature"
---

# Tasks: Performance Optimization

**Input**: Design documents from `specs/002-performance-optimization/` (`plan.md`, `spec.md`, `research.md`, `data-model.md`, `quickstart.md`)

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, quickstart.md ✅ (no `contracts/` — this feature introduces no new/changed external interface, see plan.md's Project Structure)

**Tests**: Not included. Per this project's established convention (`specs/001-multi-tenancy/plan.md`, `.wolf/cerebrum.md`), verification is via the CI smoke job (unchanged by this feature), `quickstart.md`'s scenarios, and — per spec.md FR-015/SC-008 — the external load-testing portal, which is authoritative for whether a change is retained.

**Organization**: Tasks are grouped by user story (US1–US3, matching spec.md's priority order) so each story is independently deliverable and checkpointable. Per spec.md's Assumptions, US2 and US3 are architecturally independent of US1 — this file sequences them in priority order anyway (matching the "Recommended Order" convention from `specs/001-multi-tenancy/tasks.md`), so later phases assume earlier ones are already done rather than re-deriving independent integration points.

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

**Independent Test**: quickstart.md Scenario 1 — run concurrent batches at increasing concurrency and confirm throughput no longer degrades, while every batch's own `accepted`/`rejected` result stays exactly as if it had been written alone.

### Implementation for User Story 1

- [ ] T005 [US1] In `src/logs/repositories/log.repository.ts`, replace `insertMany()`'s immediate-COPY call with an enqueue step: push the caller's `NewLog[]` plus a deferred `Promise` (`Promise.withResolvers()`) onto an in-memory pending-batch queue, and schedule a flush via the debounce-window constant from T003 if one isn't already scheduled (research.md Decisions 1–2)
- [ ] T006 [US1] Implement the flush routine in `src/logs/repositories/log.repository.ts`: drain the pending-batch queue up to the max-batch-rows cap (T003), concatenate the drained callers' rows into one array, and pass that merged array through the existing `copyLogsIn()` unchanged (still one `COPY FROM STDIN` per flush, just now potentially covering multiple callers) (depends on T005)
- [ ] T007 [US1] Settle each drained caller's deferred `Promise` based on the shared flush's outcome — resolve every caller in a successful flush, reject every caller in a failed one — preserving `LogIngestionService`'s existing per-request `accepted`/`rejected` semantics exactly (FR-001, FR-002) (depends on T006)
- [ ] T008 [US1] Confirm no code path resolves a caller's promise (and therefore no code path lets `LogIngestionService` return HTTP `200`) before that caller's rows are part of a `COPY` call that has actually completed — re-verify FR-002/FR-003 are structurally impossible to violate by this design, not just believed to hold (depends on T007)
- [ ] T009 [US1] Run quickstart.md Scenario 1 against a locally built stack: concurrent mixed valid/invalid batches return identical per-request responses to today's, and data is queryable immediately after each `200` (depends on T005-T008)

**Checkpoint**: MVP-critical — ingestion no longer serializes one `COPY` per request under concurrency; `POST /logs`'s external contract is verified unchanged.

---

## Phase 4: User Story 2 - Aggregation queries stay fast while ingestion is active (Priority: P2)

**Goal**: `GET /logs/aggregate` answers common (unfiltered-by-message/attribute) requests from a tenant-scoped, minute-granularity `log_rollups` table instead of scanning raw `logs` rows, kept in sync with ingestion and retention, and rebuildable without blocking startup.

**Independent Test**: quickstart.md Scenario 2 (aggregation stays fast and numerically correct under concurrent ingestion, tenant-isolated) and Scenario 3 (rebuild after an unclean restart never blocks `GET /health`).

### Implementation for User Story 2

- [ ] T010 [P] [US2] Create the `LogRollup` TypeORM entity in `src/logs/entities/log-rollup.entity.ts` per data-model.md: `bucket` (timestamptz), `tenant_id` (uuid), `service` (text), `level` (existing `log_level` enum), `count` (bigint, default 0), composite PK `(bucket, tenant_id, service, level)`, no FK (depends on T004)
- [ ] T011 [P] [US2] Create migration `<next-timestamp>-CreateLogRollupsTable.ts` for the `log_rollups` table, matching the entity's columns/PK exactly (depends on T004)
- [ ] T012 [US2] Register `LogRollup` in `TypeOrmModule.forFeature([...])` within `src/logs/logs.module.ts` so it's injectable (depends on T010)
- [ ] T013 [US2] Implement the post-flush rollup upsert in `src/logs/repositories/log.repository.ts`: after a `COPY` flush completes, group the just-written batch (already held in memory — no extra query) by `(tenant_id, service, level, minute-bucket)` using T004's granularity constant, and issue one `INSERT INTO log_rollups (...) VALUES (...) ON CONFLICT (bucket, tenant_id, service, level) DO UPDATE SET count = log_rollups.count + EXCLUDED.count` covering every distinct group in that flush (research.md Decisions 5, 6; FR-004, FR-007) (depends on T006, T012)
- [ ] T014 [US2] Implement the rollup-first query path in `src/logs/query-builders/aggregation-query.builder.ts`: for requests with no `q`/`attr.*` filter, read `log_rollups` for the minute-aligned bulk of `[since, until)` and fall back to a direct `logs` scan only for the partial-minute edges, unioning and re-summing the two result sets so the output is numerically identical to a full raw scan (research.md Decision 7; FR-005) (depends on T010)
- [ ] T015 [US2] Ensure any request carrying `q` or `attr.<key>` bypasses the rollup-first path entirely and is served exactly as today — full raw scan, `log_rollups` never consulted (FR-006) (depends on T014)
- [ ] T016 [US2] Create `LogRollupRebuildService` in `src/logs/services/log-rollup-rebuild.service.ts`: an `OnApplicationBootstrap` hook that checks whether `log_rollups` is empty/stale relative to `logs` and, if so, rebuilds it via a full `GROUP BY` scan — the rebuild MUST be fired without being awaited by the hook, so `app.listen()`/`GET /health`'s existing readiness conditions are never delayed by it (research.md Decision 8; FR-019 — this is a deliberate reversal of `LoadgenKeySeeder`'s blocking pattern from `specs/001-multi-tenancy`; do not copy that pattern here) (depends on T010)
- [ ] T017 [US2] Register `LogRollupRebuildService` as a provider in `src/logs/logs.module.ts` (depends on T016)
- [ ] T018 [US2] Extend `RetentionService.runMaintenance()` in `src/retention/retention.service.ts` with a rollup-pruning step, running under the *same* advisory lock the method already acquires (no new lock, no new scheduled job): delete `log_rollups` rows whose `bucket` is at/before the retention cutoff, then recompute the one boundary-minute row per `(tenant_id, service, level)` from whatever `logs` rows remain in it, covering rows removed by either `dropExpiredDailyPartitions()` or the existing `deleteExpiredRows()` straggler-delete (research.md Decision 9; FR-008, FR-014) (depends on T010)
- [ ] T019 [US2] Update `projectSchema.dbml` with the `log_rollups` table, per CLAUDE.md's Schema Updates rule — keep it, the `LogRollup` entity, and the migration describing the exact same columns (depends on T010, T011)
- [ ] T020 [US2] Run quickstart.md Scenario 2 (aggregation p95 under concurrent ingestion, rollup-sum-vs-raw-scan exact-match correctness, cross-tenant rollup isolation) and Scenario 3 (kill -9 restart, confirm `GET /health` reports ready without waiting on rollup rebuild, confirm aggregation stays correct via fallback during the rebuild window) against a locally built stack (depends on T012-T019)

**Checkpoint**: Aggregation no longer scales with total stored row count for the common case; rollups stay correct across concurrent writes, retention, and restarts; startup readiness is unaffected by rebuild cost.

---

## Phase 5: User Story 3 - Query and ingestion paths avoid unnecessary internal overhead (Priority: P3)

**Goal**: Explicit write-pool sizing, raw-row reads on `GET /logs` instead of full entity hydration, and dropping the redundant `attributes_text` column/GIN index — none of it changing any response's content.

**Independent Test**: quickstart.md Scenario 4 — byte-identical `GET /logs` responses before/after, mixed-type `attr.<key>` equality behavior unchanged, write-pool size configurable.

### Implementation for User Story 3

- [ ] T021 [P] [US3] Add an explicit, env-configurable `extra.max` (`DB_WRITE_POOL_MAX`, from T001/T002) to `createDatabaseOptions()` in `src/config/database.config.ts`, mirroring `createReadDatabaseOptions()`'s existing `DB_READ_POOL_MAX` pattern exactly (research.md Decision 10; FR-018)
- [ ] T022 [P] [US3] Fold the removal of `attributes_text` and its GIN index into the original migrations that created them — `src/migrations/1785684350114-CreateLogsTable.ts` (column) and the migration that created `idx_logs_attributes_text_gin` (index) — per the pre-release fold convention (research.md Decision 11)
- [ ] T023 [US3] Remove the `attributes_text` column and its `@Index` decorator from `src/logs/entities/log.entity.ts` (depends on T022)
- [ ] T024 [US3] Remove `attributes_text` from `NewLog` in `src/logs/interfaces/log-repository.interface.ts` (depends on T023)
- [ ] T025 [US3] Remove `attributes_text` from the CSV row encoding in `src/logs/repositories/log-csv-encoder.ts` (depends on T024)
- [ ] T026 [US3] Remove `attributes_text` from the `COPY logs (...)` column list in `src/logs/repositories/log.repository.ts`'s `copyLogsIn()`, keeping the remaining column order in the CSV encoder and the COPY statement in sync (depends on T025)
- [ ] T027 [US3] Remove `attributes_text` population from `mapLogEntryToNewLog()` in `src/logs/mappers/log.mapper.ts` (depends on T024)
- [ ] T028 [US3] Rewrite the attribute-equality predicate in `src/logs/query-builders/log-filter.builder.ts`: replace the single string-equality containment check against `attributes_text` with a type-branched containment check against `attributes` (string match, OR numeric match if the query value parses as a canonical number, OR boolean match if it's exactly `"true"`/`"false"`), with explicit parameter type casts to avoid the prepared-statement type-inference pitfall noted in research.md — observable filter behavior (attribute equality "compared as strings," per `docs/Final_Project.md`) must be unchanged (depends on T023)
- [ ] T029 [US3] Switch `LogRepository.findPage()` in `src/logs/repositories/log.repository.ts` from TypeORM's `getMany()` to `getRawMany()` (depends on T026, since both edit the same file — sequence to avoid conflicting changes)
- [ ] T030 [US3] Update `buildLogPageQuery()` in `src/logs/query-builders/log-query.builder.ts` and `mapLogToResponse()` in `src/logs/mappers/log.mapper.ts` for the raw-row shape returned by `getRawMany()`, producing a `GET /logs` response body byte-identical to today's (depends on T029)
- [ ] T031 [P] [US3] Update `projectSchema.dbml` to remove the `attributes_text` column and its GIN index, per CLAUDE.md's Schema Updates rule (depends on T022)
- [ ] T032 [US3] Run quickstart.md Scenario 4 against a locally built stack: `GET /logs` responses diff byte-identical to a captured baseline, mixed-type `attr.<key>=<value>` filtering still matches correctly, and `DB_WRITE_POOL_MAX` visibly takes effect (depends on T021, T027-T031)

**Checkpoint**: Read/write-path overhead reduced with zero observable behavior change — verified by byte-identical response comparison, not just code review.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, final repo-wide checks, and the mandatory performance-validation gate.

- [ ] T033 [P] Update `README.md`'s Schema and index design, Attribute storage strategy, and Retention strategy sections to describe `log_rollups` and the `attributes_text` removal (depends on T009, T020, T032)
- [ ] T034 [P] Update `README.md`'s Configuration table with the new env vars (`DB_WRITE_POOL_MAX`, write-coalescing debounce window and max-batch-rows) and their defaults (depends on T009, T020, T032)
- [ ] T035 Run quickstart.md Scenario 5 (zero-config `docker compose up`, `AUTH_ENABLED` behavior) to confirm none of US1–US3 changed observable behavior under the default configuration (FR-011, FR-012, SC-007) (depends on T009, T020, T032)
- [ ] T036 Run `npm run build` to confirm the entire feature type-checks cleanly (depends on T035)
- [ ] T037 Run `npm run format` and `npm run lint` immediately before opening the PR, per CLAUDE.md's workflow rule — not run earlier during implementation (depends on T036)
- [ ] T038 **[mandatory gate]** Benchmark User Stories 1, 2, and 3 against the pre-optimization baseline, independently, using the project's external load-testing portal (spec.md FR-015/SC-008; research.md's "measured, not assumed" principle carried through from `specs/001-multi-tenancy`'s T061 precedent). At minimum compare, per story: US1 — ingestion throughput at multiple concurrency levels (confirm the ~20,400→~13,900 logs/sec degradation no longer occurs); US2 — aggregation p95 under concurrent ingestion, and latency vs. stored-row-count trend; US3 — application/PostgreSQL container CPU and memory at a fixed load level. **Any change that does not demonstrate a measurable improvement, or that regresses another required metric, MUST NOT be retained** (FR-015). This feature is not considered complete until this task passes. (depends on T037)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup. Blocks US1 (T003) and US2 (T004) only — US3 has no dependency on this phase (research.md's decisions for US3 introduce no new tunable constant beyond the pool-size env var already covered in Setup).
- **User Story 1 (Phase 3)**: Depends on Foundational (T003). Architecturally independent of US2/US3. MVP-critical.
- **User Story 2 (Phase 4)**: Depends on Foundational (T004). Per spec.md's Assumptions, architecturally independent of US1 — but this file's task ordering assumes US1 (specifically T006's flush routine) is already in place, since that's the recommended, sequential execution order; T013 hooks the rollup upsert into that flush point.
- **User Story 3 (Phase 5)**: Depends on Foundational only for T021's env var (already available from Setup) — otherwise fully independent of US1 and US2. Can be implemented and shipped in any order relative to them.
- **Polish (Phase 6)**: Depends on all three user stories being complete. T038 (performance validation) is the final gate and depends on T037 (build/format/lint) succeeding first.

### Recommended Order

Setup → Foundational → US1 → US2 → US3 → Polish — matching spec.md's priority order (P1 → P2 → P3) and this plan's Summary. US3 could technically run in parallel with US1/US2 given its independence, but sequencing it last keeps the "highest-impact first" ordering the user explicitly requested for this plan.

### Parallel Opportunities

- Setup: T001, T002 in parallel.
- Foundational: T003, T004 in parallel (different files).
- US2: T010, T011 (entity and migration) in parallel — both describe the same table but are independent artifacts to write, then cross-checked in T019.
- US3: T021 and T022 in parallel at the start (different files, no shared dependency); T031 can run in parallel with T023–T030 once T022 (the migration decision) is settled.
- Polish: T033, T034 in parallel.

---

## Parallel Example: Foundational Phase

```bash
Task: "Add write-coalescing constants to src/common/constants/log-api.constants.ts"
Task: "Add rollup-bucket-granularity constant to src/common/constants/retention.constants.ts"
```

## Parallel Example: User Story 2 (entity + migration)

```bash
Task: "Create LogRollup entity in src/logs/entities/log-rollup.entity.ts"
Task: "Create CreateLogRollupsTable migration in src/migrations/"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (T003 — US2's T004 isn't needed yet)
3. Complete Phase 3: User Story 1 — **STOP and VALIDATE** with quickstart.md Scenario 1
4. This is the MVP: ingestion throughput no longer degrades under concurrency, with zero change to any external contract. Deployable/gradable at this point even if User Stories 2–3 aren't started — **except** T038's performance validation, which should still run before treating any milestone as final, per FR-015.

### Incremental Delivery Beyond MVP

5. Add User Story 2 → aggregation answers from rollups under load → validate with Scenario 2 (correctness + tenant isolation) and Scenario 3 (non-blocking rebuild)
6. Add User Story 3 → read/write-path overhead reduced, verified byte-identical → validate with Scenario 4
7. Polish: README updates, zero-config regression check (Scenario 5), build/format/lint, **mandatory performance benchmark (T038) — do not skip**

---

## Notes

- No test files are created in any phase — see the **Tests** note at the top of this document.
- `[P]` tasks touch different files and have no incomplete same-phase dependency.
- Commit after each task or logical group, per the repository's existing incremental-commit-history convention.
- Every task traces to a specific spec.md FR/SC or research.md decision, called out inline — this feature adds no work not already justified by measured evidence (`docs/performance_comparison_with_LogIngestion-majed.md`, `docs/suggestions_to_increase_the_performance.md`) or by a spec.md requirement.
