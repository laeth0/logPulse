# STATUS — log-pulse

> Single source of truth for resuming work. Read this FIRST when starting a session.
> Update this file at the end of every work phase so the next `/clear` resumes in 1 read.
> Last updated: 2026-08-13

---

## ✅ Done

<!-- Move items here from "🚀 Next phase" when finished. Group by area. -->

- OpenWolf integrations narrowed to Claude and Codex only.
- Removed generated Cursor, OpenCode, and Gemini adapters.
- Added project-wide engineering quality and performance principles to `AGENTS.md` and `CLAUDE.md`.
- Removed the original suggestion §1a from `docs/suggestions_to_increase_the_performance.md` and corrected the remaining subsection numbering.
- Reverted the attempted implementation of performance suggestion §1a at the user's request; the index and original multi-tenancy plan remain unchanged.
- Multi-tenancy feature (`specs/001-multi-tenancy/`) fully implemented and live-tested end-to-end under both `AUTH_ENABLED=false/true`.
- Feature `002-performance-optimization`: spec/clarify/plan/tasks/analyze cycle complete (research.md, data-model.md, quickstart.md, tasks.md — 37 tasks, no `contracts/`).
- **Phase 1 (Setup, T001-T002)** and **Phase 2 (Foundational, T003-T004)** implemented — coalescing/rollup constants and env wiring in `.env.example`/`docker-compose.yml`.
- **Phase 3 (User Story 1 / MVP, T005-T009) implemented** — `src/logs/repositories/log.repository.ts`'s `insertMany()` now coalesces concurrent `POST /logs` writes into a debounced, drain-loop `COPY` flush (a manual deferred-promise pattern was used instead of `Promise.withResolvers()`, since this project's `tsconfig.json` targets `ES2023` and doesn't have that API in its `lib`). A single caller's own rows are never split across flushes (F1). Verified live against a freshly built Docker stack: 20 concurrent mixed valid/invalid batches keep exact per-request accepted/rejected semantics and are queryable in <100ms; a 2500-row single request (over the 2000-row cap) lands as one complete, non-fragmented result; two tenants' interleaved concurrent batches land under their own correct tenants only. `npm run build` passes.
- **Phase 4 (User Story 2 / rollups, T010-T018) implemented** — new `LogRollup` entity + `CreateLogRollupsTable` migration (table + one-time historical backfill), `log.repository.ts`'s `flushBatch()` now wraps `COPY` and the rollup upsert in one explicit transaction (`BEGIN`/`COMMIT`/`ROLLBACK`), `aggregation-query.builder.ts` gained a rollup-first read path with unconditional `tenant_id` filtering and raw-scan fallback for partial-minute edges and `q`/`attr.*`-filtered requests, `retention.service.ts` now prunes `log_rollups` (bulk-delete expired buckets, delta-adjust the one boundary bucket via an atomic CTE — never a snapshot replace). New shared helper `src/common/utils/rollup-bucket.utils.ts` (`alignUpToRollupBucket`/`alignDownToRollupBucket`) used by all three of ingest, read, and retention so bucket-boundary math can never disagree. `projectSchema.dbml` updated. Verified live: migration backfill against an already-populated `logs` table (2560 pre-existing rows) produced an exact rollup-sum match (diff 0); rollup-path vs. raw-scan(`q`) aggregation totals matched exactly including jagged (non-minute-aligned) query edges; cross-tenant rollup isolation confirmed for a shared bucket/service; a real `docker kill -SIGKILL` mid-request followed by restart left `logs` and `log_rollups` totals exactly equal (2598 = 2598) with no new `GET /health` readiness dependency. `npm run build` passes.
- **Phase 5 (User Story 3 / overhead reduction, T019-T031) implemented** — `attributes_text` (column, GIN index, CHECK constraint) fully removed, folded into the original `CreateLogsTable`/`CreateLogsTableGinIndexes` migrations per the pre-release convention; `attr.<key>=<value>` equality is now a type-branched containment predicate evaluated at query time directly against `attributes` (`log-filter.builder.ts`'s new `buildAttributeEqualityClause()`/`parseCanonicalNumber()`), with explicit `::text`/`::numeric`/`::boolean` casts and the numeric/boolean OR-branch only emitted when the value actually parses as one (avoids a bind-time cast error on non-numeric values). `LogRepository.findPage()` switched from `getMany()` to `getRawMany()` with explicit `.select()` column aliases (new `RawLogRow` interface); `database.config.ts`'s `createDatabaseOptions()` now sizes the write pool via `DB_WRITE_POOL_MAX` (default 20), mirroring the read pool's existing pattern. Also fixed an unlisted-but-necessary consequence: `PartitionService.ensureDailyPartition()`'s explicit `INSERT ... SELECT` column list still named `attributes_text` and would have broken the next daily-partition creation — updated in the same pass. Dev DB volume reset (T030, per Decision 11's documented already-migrated-database caveat) since it had run the pre-edit migrations. Verified live on a fresh stack: `\d logs` confirms the column/index/constraint are gone; mixed-type `attr.retries=` filtering exactly distinguishes string/number/boolean/non-canonical-numeric-string values (no false positives, e.g. `"3.0"` does NOT match numeric `3`); `GET /logs` response shape unchanged (`id, timestamp, level, service, message, attributes`, no `attributes_text` leakage); `DB_WRITE_POOL_MAX` config wiring confirmed via `pg_stat_activity`. `npm run build` passes.
- **Phase 6 (Polish, T032-T036 of 37) implemented** — `README.md`'s Schema/index design, Attribute storage strategy, Retention strategy, Configuration, Optimizations applied, and Known limitations sections all brought current (new `log_rollups`/attribute-predicate/write-pool content, plus fixing pre-existing stale claims about two already-removed GIN indexes). quickstart.md Scenario 5 re-run against a genuinely zero-config stack (temporarily moved the session's own leftover local `.env` aside, then restored it byte-identical) — unchanged `{"accepted":1,"rejected":[]}` response confirmed, and SC-005's 20s ingest-to-queryable budget explicitly measured at 163ms (not just assumed from the debounce window). `npm run build`/`format`/`lint` all pass — lint caught one real `@typescript-eslint/no-unsafe-assignment` error in `retention.service.ts`'s new boundary-bucket query (fixed by switching `queryRunner.query()`, which has no generic overload, to `this.dataSource.query<T>(sql, params, queryRunner)`, the same pattern this file and `partition.service.ts` already use elsewhere — re-verified live afterward that retention maintenance still runs cleanly through the new call path).
- **T037 (mandatory external benchmark gate) intentionally NOT run** — requires pushing and the project's external load-testing portal, which only the user can trigger; per this project's established workflow, local runs are diagnostic only and cannot substitute for it. This is the one remaining task in the entire `002-performance-optimization` feature (36/37 done).

---

## 🚀 Next phase

**Goal:** User runs T037 (push + external load-testing portal) for US1/US2/US3 independently, then reports back so any change that comes back flat/ambiguous can be reverted per this project's perf-change bar. No further code work is expected on `002-performance-optimization` unless T037's results call for a revert or a follow-up fix.

### Acceptance criteria
1. External portal results collected for US1 (ingestion throughput at multiple concurrency levels — does the ~20,400→~13,900 logs/sec concurrency-16 degradation go away?), US2 (aggregation p95 under concurrent ingestion, latency vs. row-count trend), US3 (app/PostgreSQL CPU + memory at fixed load).
2. Any change without a measurable improvement, or that regresses another required metric, is reverted — not kept because it's "not clearly harmful."
3. Once T037 passes, mark it `[X]` in `specs/002-performance-optimization/tasks.md` and this feature is fully done.

### Files to create / edit
| Type | File | Content |
|---|---|---|
| — | — | None planned — next step is user-run benchmarking, not code. |

### Closed decisions
- OpenWolf supports only Claude and Codex because those are the user's active agents.
- Write coalescing uses a manual `new Promise((resolve, reject) => ...)` deferred pattern, not `Promise.withResolvers()` — this repo's `tsconfig.json` (`target: ES2023`, no explicit `lib` override) doesn't type-check that API; the same pitfall was observed in `LogIngestion-majed`'s build.
- Rollup-first aggregation merges rollup + raw-scan-edge result sets in application code (JS `Map` keyed by `(bucket,group)`), not a SQL `UNION ALL` — the installed TypeORM version's `SelectQueryBuilder` has no union support, and the app-level merge is simple enough to audit directly.
- Attribute-equality predicate emits the numeric/boolean OR-branch SQL text only when the filter value actually parses as that type — always including the branch and gating it with a boolean flag would still error at bind time, since `::numeric`/`::boolean` casts apply to the parameter value itself regardless of surrounding AND/OR logic.
- `queryRunner.query()` has no generic overload (returns `Promise<any>`); use `this.dataSource.query<T>(sql, params, queryRunner)` instead when a typed result is needed within an existing queryRunner's connection/transaction — already the established pattern in `partition.service.ts`.

### Open decisions
- None.

---

## 📁 Active architecture

- **Stack:** _<frameworks, libraries, runtime>_
- **Key tables / modules:** _<list>_
- **Patterns:** _<conventions enforced project-wide>_

---

## ⚠️ External blockers (don't block coding)

- _<env vars, secrets, external accounts, manual steps>_

---

## 🔧 Useful commands

```bash
# add the most-used commands here so the next session has them ready
```

---

## 📚 References (read IF needed)

- `.wolf/cerebrum.md` — User Preferences + Do-Not-Repeat + Decision Log
- `.wolf/anatomy.md` — token-efficient file index
- `.wolf/buglog.json` — known bugs + fixes
