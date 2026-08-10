# Functional Requirements — As Built

This document tracks what logPulse actually does today, traced to the source files that implement it. It is not a copy of the project brief ([Final_Project.md](Final_Project.md)) — it's a status report against it. Every item below has been verified against the running system (not just read from source) as of 2026-08-10.

Status legend: ✅ Implemented and verified · ⚠️ Partially implemented · ❌ Not implemented

## FR-1 — Health & readiness

| ID | Requirement | Status | Implementation |
| --- | --- | --- | --- |
| FR-1.1 | `GET /health` returns `200` only once the database connection is established | ✅ | [`src/health/health.service.ts`](../src/health/health.service.ts) — `checkDatabase()` |
| FR-1.2 | `GET /health` returns `200` only once migrations are applied | ✅ | `health.service.ts` — `checkMigrations()` via `dataSource.showMigrations()` |
| FR-1.3 | `GET /health` returns non-`200` (`503`) while any dependency isn't ready | ✅ | [`src/health/health.controller.ts`](../src/health/health.controller.ts) — throws `ServiceUnavailableException` |
| FR-1.4 | `GET /health` is always reachable unauthenticated | ✅ | No auth guard exists anywhere in the application |
| FR-1.5 | Migrations run automatically on startup, no manual step | ✅ | [`src/config/database.config.ts`](../src/config/database.config.ts) — `migrationsRun: true` |

## FR-2 — Log ingestion (`POST /logs`)

| ID | Requirement | Status | Implementation |
| --- | --- | --- | --- |
| FR-2.1 | Accepts a batch of one or more log entries | ✅ | [`src/logs/validators/log-entry.schema.ts`](../src/logs/validators/log-entry.schema.ts) — `logBatchSchema` (`min(1)`) |
| FR-2.2 | Validates `timestamp`: required, valid ISO 8601, not >5 min in the future | ✅ | `log-entry.schema.ts` — `timestampSchema` |
| FR-2.3 | Validates `level`: required, one of `debug`/`info`/`warn`/`error` | ✅ | `log-entry.schema.ts`, [`src/logs/enums/log-level.enum.ts`](../src/logs/enums/log-level.enum.ts) |
| FR-2.4 | Validates `service` and `message`: required, non-empty strings | ✅ | `log-entry.schema.ts` |
| FR-2.5 | Validates `attributes`: optional, flat object, string/number/boolean values only, nesting rejected | ✅ | `log-entry.schema.ts` — `attributeValueSchema` |
| FR-2.6 | An invalid entry does not fail the whole batch | ✅ | [`src/logs/services/log-ingestion.service.ts`](../src/logs/services/log-ingestion.service.ts) — per-entry accept/reject loop |
| FR-2.7 | Rejected entries report their original array index and a reason | ✅ | [`src/logs/validators/log-entry.validator.ts`](../src/logs/validators/log-entry.validator.ts) — `formatRejectionReason()` |
| FR-2.8 | `200` when ≥1 entry accepted | ✅ | [`src/logs/logs.controller.ts`](../src/logs/logs.controller.ts) |
| FR-2.9 | `400` when all entries rejected, JSON malformed, or top-level shape wrong | ✅ | `logs.controller.ts` (accepted-count check) + [`src/common/filters/global-exception.filter.ts`](../src/common/filters/global-exception.filter.ts) (malformed JSON / body-parser errors) |
| FR-2.10 | Response shape is exactly `{ accepted, rejected: [{ index, reason }] }` | ✅ | [`src/logs/dto/responses/ingest-logs-response.dto.ts`](../src/logs/dto/responses/ingest-logs-response.dto.ts) |
| FR-2.11 | Accepted logs are durably stored before responding `200` | ✅ | [`src/logs/repositories/log.repository.ts`](../src/logs/repositories/log.repository.ts) — synchronous `COPY ... FROM STDIN`, awaited before the response is built |
| FR-2.12 | Configurable request body size ceiling (bounds batch size) | ✅ | `JSON_BODY_LIMIT` env var, applied in [`src/main.ts`](../src/main.ts) |

## FR-3 — Log querying (`GET /logs`)

| ID | Requirement | Status | Implementation |
| --- | --- | --- | --- |
| FR-3.1 | Filter by exact `service` | ✅ | [`src/logs/query-builders/log-filter.builder.ts`](../src/logs/query-builders/log-filter.builder.ts) |
| FR-3.2 | Filter by exact `level` | ✅ | `log-filter.builder.ts` |
| FR-3.3 | Filter by `since` (inclusive) / `until` (exclusive) time range | ✅ | `log-filter.builder.ts` |
| FR-3.4 | Filter by `attr.<key>` equality, compared as strings | ✅ | `log-filter.builder.ts` (JSONB containment on `attributes_text`) + [`src/logs/validators/log-query.validator.ts`](../src/logs/validators/log-query.validator.ts) (`attr.` prefix parsing) |
| FR-3.5 | Filter by `q`, case-insensitive substring match on `message` | ✅ | `log-filter.builder.ts` (`ILIKE`, pattern-escaped) |
| FR-3.6 | All filters freely combinable | ✅ | `log-filter.builder.ts` composes independently via `andWhere` |
| FR-3.7 | `limit`: default 100, max 1000, validated | ✅ | [`src/logs/validators/log-query.schema.ts`](../src/logs/validators/log-query.schema.ts) — `logQueryLimitSchema` |
| FR-3.8 | Results sorted by `timestamp DESC`, deterministic tie-break | ✅ | [`src/logs/query-builders/log-query.builder.ts`](../src/logs/query-builders/log-query.builder.ts) — `ORDER BY timestamp DESC, id DESC` |
| FR-3.9 | Cursor-based pagination, opaque cursor | ✅ | [`src/logs/cursor/cursor.service.ts`](../src/logs/cursor/cursor.service.ts) (Base64URL-encoded JSON) + `log-query.builder.ts` (`(timestamp, id) < (cursor)` predicate) |
| FR-3.10 | `next_cursor` is `null` when no more results | ✅ | [`src/logs/services/log-query.service.ts`](../src/logs/services/log-query.service.ts) — `createNextCursor()` |
| FR-3.11 | `400` + `{ "error": "..." }` for invalid timestamps, `until < since`, bad level, non-numeric/out-of-range limit, malformed cursor | ✅ | `log-query.schema.ts` (parameter validation) + `global-exception.filter.ts` (error envelope) |
| FR-3.12 | Unsupported query parameters rejected | ✅ | `log-query.schema.ts` — `createParametersSchema()` allow-list |

## FR-4 — Log aggregation (`GET /logs/aggregate`)

| ID | Requirement | Status | Implementation |
| --- | --- | --- | --- |
| FR-4.1 | Same filters as `GET /logs` (`service`, `level`, `attr.<key>`, `q`) | ✅ | Shared [`log-filter.builder.ts`](../src/logs/query-builders/log-filter.builder.ts) |
| FR-4.2 | `since` / `until` required | ✅ | [`src/logs/validators/log-query.validator.ts`](../src/logs/validators/log-query.validator.ts) — `validateAggregation()` |
| FR-4.3 | `bucket` required: `1m`, `5m`, `1h`, or `1d` | ✅ | [`src/logs/enums/aggregation-bucket.enum.ts`](../src/logs/enums/aggregation-bucket.enum.ts), [`src/common/constants/log-query.constants.ts`](../src/common/constants/log-query.constants.ts) |
| FR-4.4 | Optional `group_by`: `service` or `level` | ✅ | [`src/logs/enums/aggregation-group.enum.ts`](../src/logs/enums/aggregation-group.enum.ts) |
| FR-4.5 | One row per bucket × group, ordered by bucket start ascending | ✅ | [`src/logs/query-builders/aggregation-query.builder.ts`](../src/logs/query-builders/aggregation-query.builder.ts) — `date_bin(...)`, `ORDER BY ... ASC` |
| FR-4.6 | Empty buckets omitted | ✅ | `GROUP BY` only emits buckets with ≥1 matching row |
| FR-4.7 | `group` is `null` when `group_by` not provided | ✅ | `aggregation-query.builder.ts` — `createGroupExpression()` returns literal `NULL` |
| FR-4.8 | Same `400` error contract as `GET /logs` | ✅ | Shared validators + `global-exception.filter.ts` |

## FR-5 — Retention

| ID | Requirement | Status | Implementation |
| --- | --- | --- | --- |
| FR-5.1 | Configurable retention window | ✅ | `LOG_RETENTION_DAYS` env var, [`src/retention/retention.service.ts`](../src/retention/retention.service.ts) |
| FR-5.2 | Expired data is deleted without long-running locks or major ingestion disruption | ✅ | Partition-drop strategy — see [`src/retention/partition.service.ts`](../src/retention/partition.service.ts) |
| FR-5.3 | Runs automatically without manual intervention | ✅ | [`src/retention/retention.scheduler.ts`](../src/retention/retention.scheduler.ts) — startup + daily midnight UTC via `@nestjs/schedule` |
| FR-5.4 | Safe under multiple application instances | ✅ | `retention.service.ts` — PostgreSQL advisory lock (`pg_try_advisory_lock`) |

## Infrastructure & delivery

| ID | Requirement | Status | Implementation |
| --- | --- | --- | --- |
| FR-6.1 | Entire system starts with `docker compose up`, zero configuration | ✅ | [`docker-compose.yml`](../docker-compose.yml), [`Dockerfile`](../Dockerfile) |
| FR-6.2 | Application listens on `8080` inside the container, exposed as `localhost:8080` | ✅ | `docker-compose.yml` — `ports: ['8080:8080']` |
| FR-6.3 | CI builds, lints, and validates the required contract | ✅ | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) — `quality` (format/lint) → `build` (compile) → `smoke` (real `docker compose up` + all four endpoints) |
| FR-6.4 | Parameterized queries / no SQL injection surface | ✅ | All query builders bind user input as parameters ([`log-filter.builder.ts`](../src/logs/query-builders/log-filter.builder.ts)); dynamic SQL fragments (bucket interval, group column) come only from enum-backed constant maps, never from raw user input |

## Not implemented (by design)

These are explicitly optional in the spec and were not built — see [README.md § Optional features](../README.md#optional-features):

- Authentication / API keys (`AUTH_ENABLED`, `LOADGEN_API_KEY`)
- Multi-tenancy
- Rate limiting / backpressure shedding (`429`/`503` + `Retry-After`)
- All stretch goals (dashboard, live-tail, custom query language, rollup tables, alerting, etc.)

## Not yet implemented (gaps)

- Automated unit/integration test suite (only a black-box CI smoke test exists today)
- A repeatable, checked-in load-testing harness producing the formal performance evidence described in the spec
