# Memory

> Chronological action log. Hooks and AI append to this file automatically.
> Old sessions are consolidated by the daemon weekly.

| 22:59 | Restricted OpenWolf to Claude and Codex; removed Cursor, OpenCode, and Gemini adapters; refreshed anatomy | `.wolf/config.json`, `.cursor/`, `.opencode/`, `GEMINI.md`, `.wolf/anatomy.md` | verified only Claude and Codex remain configured | ~900 |
| 23:23 | Added engineering quality and performance guidance to both agent instruction files and synchronized OpenWolf context. | AGENTS.md, CLAUDE.md, .wolf/cerebrum.md, .wolf/STATUS.md | Completed | ~900 |
| 09:02 | Removed performance suggestion §1a while preserving the remaining section numbering. | docs/suggestions_to_increase_the_performance.md | Completed | ~250 |
| 09:04 | Corrected subsection numbering after removing the original §1a. | docs/suggestions_to_increase_the_performance.md | Completed | ~150 |
| 09:24 | Reverted only the immediately preceding §1a implementation and its documentation/planning changes, preserving all earlier and unrelated worktree edits. | src/migrations/1785684350115-CreateLogsTableBtreeIndexes.ts, src/logs/entities/log.entity.ts, projectSchema.dbml, README.md, docs/suggestions_to_increase_the_performance.md, specs/001-multi-tenancy/{plan,research,data-model,tasks}.md | Completed | ~1200 |

## Session: 2026-08-13 13:54

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 19:16 | Reproduced the health-check socket reset and traced it to a stale app image whose obsolete TypeORM migration crashes the container against the current database schema. | `requests/health.check.rest`, Docker app/database state, `.wolf/buglog.json`, `.wolf/cerebrum.md` | Root cause confirmed; runtime left unchanged | ~1200 |
| 16:15 | Inspected the complete Prisma schema and migration chain in LogIngestion-majed and reconstructed its current tables, indexes, and logical rollup relationships as DBML. | `LogIngestion-majed/prisma/schema.prisma`, `LogIngestion-majed/prisma/migrations/*/migration.sql` | Completed; no source schema files changed | ~900 |

## Session: 2026-08-13 14:52

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-08-13 19:10

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 19:56 | Implemented `/speckit-implement Phase 3` (US1 write coalescing, T005-T009) | `src/logs/repositories/log.repository.ts`, `specs/002-performance-optimization/tasks.md` | Build passed; live-validated concurrency, oversized-batch, multi-tenant scenarios against fresh Docker stack | ~35k |
| 20:10 | Implemented `/speckit-implement Phase 4` (US2 rollup pre-aggregation, T010-T018) | `src/logs/entities/log-rollup.entity.ts`, `src/migrations/1785684350119-CreateLogRollupsTable.ts`, `src/logs/logs.module.ts`, `src/logs/repositories/log.repository.ts`, `src/logs/query-builders/aggregation-query.builder.ts`, `src/retention/retention.service.ts`, `src/common/utils/rollup-bucket.utils.ts`, `projectSchema.dbml` | Build passed; live-validated migration backfill against pre-populated data (exact match), rollup-vs-raw-scan exact match incl. jagged edges, cross-tenant isolation, and SIGKILL crash-consistency (2598=2598, no new health dependency) | ~55k |
| 20:21 | Implemented `/speckit-implement Phase 5` (US3 query/write overhead reduction, T019-T031) | `src/config/database.config.ts`, `src/migrations/1785684350114-CreateLogsTable.ts`, `src/migrations/1785684350116-CreateLogsTableGinIndexes.ts`, `src/logs/entities/log.entity.ts`, `src/logs/interfaces/log-repository.interface.ts`, `src/logs/interfaces/log-query.interface.ts`, `src/logs/repositories/log-csv-encoder.ts`, `src/logs/repositories/log.repository.ts`, `src/logs/mappers/log.mapper.ts`, `src/logs/query-builders/log-filter.builder.ts`, `src/logs/query-builders/log-query.builder.ts`, `src/logs/services/log-query.service.ts`, `src/retention/partition.service.ts`, `projectSchema.dbml` | Build passed; `attributes_text` fully removed (folded into original migrations); live-validated mixed-type attr equality (string/number/bool/non-canonical-numeric all correctly disambiguated), byte-shape response unchanged, `DB_WRITE_POOL_MAX` wiring confirmed; caught and fixed an unlisted breakage in `PartitionService`'s hardcoded INSERT column list | ~60k |
| 22:14 | Implemented `/speckit-implement Phase 6` (Polish, T032-T036); T037 left for the user (external benchmark portal) | `README.md`, `src/retention/retention.service.ts` | build+format+lint all pass; lint caught and fixed a real `no-unsafe-assignment` error (`queryRunner.query()` has no generic overload — switched to `dataSource.query<T>(sql, params, queryRunner)`); re-verified zero-config behavior and measured SC-005 at 163ms against a stack with the session's own `.env` genuinely absent, then restored it | ~40k |

## Session: 2026-08-14 10:40

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-08-14 11:20

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 06:40 | Read log_src (friend's "John Log" project), wrote comparison doc vs. its writeBuffer.ts and schema | `docs/performance_comparison_with_log_src.md` (new) | Verdict: write-buffer concept already matched by existing coalescing; message_lower (q= filter) is the clear adoptable win; synchronous_commit=off rejected (FR-003); single-flight flushing choice corroborated independently | ~45k |
| 07:35 | Drafted unit-test plan (user chose test/unit/ mirrored layout over co-located src/), then ran it through /nestjs-expert for review | `docs/unit_testing_implementation_plan.md` (new) | Confirmed plain instantiation for services/guards/repository; added new Phase 6 (Test.createTestingModule + overrideProvider DI-wiring smoke tests) since no other phase exercises Nest's injector; flagged jest.advanceTimersByTimeAsync requirement for log.repository.ts's coalescing timer and the dataSource.query(sql,params,queryRunner) mocking gotcha in retention.service.ts | ~50k |
