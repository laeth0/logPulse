# Cerebrum

> OpenWolf's learning memory. Updated automatically as the AI learns from interactions.
> Do not edit manually unless correcting an error.
> Last updated: 2026-08-13

## User Preferences

<!-- How the user likes things done. Code style, tools, patterns, communication. -->

- Use OpenWolf integrations for Claude and Codex only; do not generate Cursor, OpenCode, or Gemini adapters.
- Treat performance as a first-class requirement while preserving simple, maintainable code, existing architecture and API contracts, correctness, security, and tenant isolation; justify index changes with actual query patterns or measurements.

## Key Learnings

- **Project:** log-pulse
- **Description:** A high-throughput log ingestion and query service — a simplified version of Datadog / Grafana Loki. Applications send structured logs to the API; the service validates, stores, and makes them searchab
- `LogIngestion-majed` uses PostgreSQL/Prisma with three current tables (`Log`, `LogRollup`, `LogSecondRollup`) and no foreign-key constraints. The two rollup tables are unlogged, derived aggregates of `Log` keyed by `(bucket, service, level)` at minute and second granularity.
- A published Docker port can accept a connection and still yield `socket hang up` when the Nest app container is restarting before `app.listen()`. On 2026-08-13 the cause was an outdated `logpulse-app` image containing obsolete compiled tenancy migrations; compare the image's `/app/dist/migrations` with current `src/migrations` and rebuild the app image without deleting the PostgreSQL volume.
- `tsconfig.json` targets `ES2023` with no explicit `lib` override, so `Promise.withResolvers()` fails to type-check (`TS2550`) even though it runs fine on the project's Node runtime — the same pitfall observed in `LogIngestion-majed`. Use a manual `new Promise((resolve, reject) => { ... })` deferred pattern instead of `Promise.withResolvers()` wherever a deferred promise is needed.
- Recreating the app container against an existing `postgres_data` volume that predates a migration (e.g. one created via a since-removed manual/synchronize path) fails startup with `relation "X" already exists` — TypeORM tracks migrations by name in its own table, not by inspecting actual schema state. Fix for local/disposable dev volumes: `docker compose down -v` then `docker compose up -d --build` for a clean migration run.
- Installed TypeORM (`1.1.0`) has no `UNION`/`UNION ALL` support on `SelectQueryBuilder` — merging two differently-shaped result sets (e.g. rollup-derived + raw-scan aggregation rows) has to happen in application code (a JS `Map` keyed by the shared group columns), not a single SQL query via the builder.
- A data-modifying CTE (`UPDATE`/`DELETE ... RETURNING` inside a `WITH`) always executes exactly once as part of the statement, even if no outer clause selects from it — confirmed working as expected in `retention.service.ts`'s boundary-bucket rollup adjustment (`WITH deleted AS (DELETE ...), deltas AS (...), rollup_update AS (UPDATE ...) SELECT COUNT(*) FROM deleted`), where `rollup_update`'s UPDATE is never referenced by the final SELECT but still ran.
- Removing a column referenced by a *hardcoded* SQL column list elsewhere (not just the entity/migration) is easy to miss — `attributes_text`'s removal (Phase 5) also required fixing `PartitionService.ensureDailyPartition()`'s explicit `INSERT INTO logs (...) SELECT ... FROM temp` column list, which wasn't in tasks.md's file list at all. Grep the whole `src/` tree for the literal column name before considering a column removal complete, not just the files a task list names.
- A bound SQL parameter's type cast (`:param::numeric`, `:param::boolean`) is evaluated when the value binds, unconditionally — wrapping it in `(:flag AND ...)` does NOT prevent a cast error on a non-castable value. To make a cast conditional, omit that branch's SQL text entirely (build the query string in JS) rather than trying to guard it at runtime.
- [2026-08-13] `QueryRunner.query()` has no generic overload (always `Promise<any>`), so `const x: SomeType = await queryRunner.query(...)` trips `@typescript-eslint/no-unsafe-assignment` under `npm run lint`. Use `this.dataSource.query<SomeType>(sql, params, queryRunner)` instead — it IS generic and, per `partition.service.ts`'s established use of this exact pattern, still executes on the given `queryRunner`'s connection/transaction (verified: retention's advisory-lock-held maintenance run still worked correctly after switching). Caught only by running lint, which this project's workflow rule defers to just-before-PR — worth a `npm run build` *and* a mental lint pass on any new raw `queryRunner.query()` call in the meantime.
- [2026-08-14] This project already has a precedent for "single request can never succeed" vs. "temporary, retry-later" errors: `src/main.ts`'s `JSON_BODY_LIMIT` (body-parser request-size cap) surfaces as HTTP `413` via `GlobalExceptionFilter`'s existing external-client-error passthrough (`getExternalClientError()`, which preserves any thrown error's own `statusCode` in the 4xx range), not as a retryable `5xx`. Reuse this 413-vs-5xx distinction for any future "this specific request is fundamentally too big/invalid to ever succeed" case — e.g. `003-ingestion-backpressure`'s spec uses it to separate a batch that can never fit within configured capacity (`413`) from temporary capacity exhaustion (`503`+Retry-After).

## Do-Not-Repeat

<!-- Mistakes made and corrected. Each entry prevents the same mistake recurring. -->
<!-- Format: [YYYY-MM-DD] Description of what went wrong and what to do instead. -->

- [2026-08-13] After removing a numbered section, check and correct the numbering of all subsequent sibling sections.
- [2026-08-13] When asked to revert a previous prompt, reverse only that prompt's assistant-authored delta and preserve all earlier or unrelated worktree changes.
- [2026-08-13] Do not put Markdown backticks inside double-quoted shell command strings; use a simpler pattern or single-quoted shell syntax to avoid command-parsing failures.

## Decision Log

<!-- Significant technical decisions with rationale. Why X was chosen over Y. -->

- **2026-08-13:** Removed performance suggestion §1a (dropping the duplicate `attributes_text` column) from the recommendations document at the user's request.
- **2026-08-13:** Reverted the implementation of performance suggestion §1a at the user's request; `idx_logs_level_timestamp_id` and the pending three-index multi-tenancy design remain in place.
