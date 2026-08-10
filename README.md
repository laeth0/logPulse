# logPulse

A high-throughput log ingestion and query service — a simplified version of Datadog / Grafana Loki. Applications send structured logs to the API; the service validates, stores, and makes them searchable and analyzable, including time-bucketed aggregation, under sustained high-volume ingestion.

Built with NestJS 11, TypeScript, TypeORM, and PostgreSQL 16. Runs entirely via `docker compose up`.

## Table of contents

- [Requirements documents](#requirements-documents)
- [Quick start](#quick-start)
- [Local development (without Docker)](#local-development-without-docker)
- [Configuration](#configuration)
- [API documentation](#api-documentation)
- [Schema and index design](#schema-and-index-design)
- [Attribute storage strategy](#attribute-storage-strategy)
- [Retention strategy](#retention-strategy)
- [Optional features](#optional-features)
- [Performance](#performance)
- [Known limitations](#known-limitations)
- [Project structure](#project-structure)

## Requirements documents

- [docs/FunctionalRequirements.md](docs/FunctionalRequirements.md) — what the system does today, traced to source files.
- [docs/NonFunctionalRequirements.md](docs/NonFunctionalRequirements.md) — performance, resource, reliability, and security constraints the system must satisfy.
- [docs/Final_Project.md](docs/Final_Project.md) — the original project specification this README is written against.

## Quick start

Requirements: Docker and Docker Compose. Nothing else — no `.env` file, no manual database setup.

```bash
docker compose up
```

This builds the application image, starts PostgreSQL, waits for it to become healthy, applies all database migrations automatically, and starts the API on **`http://localhost:8080`**. `GET /health` returns `200` once the database is connected, migrations are applied, and the service is ready to accept logs — the same readiness gate an external load generator polls before sending traffic.

Every environment variable has a built-in default (see [Configuration](#configuration)), so the zero-configuration `docker compose up` above produces the same unauthenticated, unrestricted core service described by the project spec — nothing to read in this README is required to get a request through.

Interactive API docs (Swagger UI) are available at `http://localhost:8080/api/docs` when `NODE_ENV` is not `production` (disabled in the default Compose posture to avoid leaking the spec in production; see [Configuration](#configuration) to enable it).

## Local development (without Docker)

```bash
npm install
cp .env.example .env   # edit DB_* to point at a local PostgreSQL 16 instance
npm run db:create      # optional: creates the database if it doesn't exist
npm run migration:run  # applies migrations (also happens automatically on app startup)
npm run start:dev      # watch mode
```

Useful scripts:

| Script | Purpose |
| --- | --- |
| `npm run build` | Compile with the Nest CLI |
| `npm run lint` / `npm run lint:fix` | ESLint (strict, zero warnings) |
| `npm run format` / `npm run format:check` | Prettier |
| `npm run test` | Unit tests (Jest, co-located `*.spec.ts`) |
| `npm run test:e2e` | End-to-end tests (`test/*.e2e-spec.ts`) |
| `npm run migration:generate` / `migration:run` / `migration:revert` / `migration:show` | TypeORM migrations |
| `npm run db:create` / `db:drop` / `db:recreate` | Local database lifecycle helpers |

## Configuration

All variables have defaults — none are required. `docker-compose.yml` supplies production-safe defaults directly (`${VAR:-default}`), independent of any `.env` file, so the service behaves identically for a fresh clone with no local configuration.

| Variable | Default | Meaning |
| --- | --- | --- |
| `NODE_ENV` | `production` | `production` disables Swagger UI at `/api/docs` |
| `PORT` | `8080` | Port the API listens on inside the container |
| `JSON_BODY_LIMIT` | `10mb` | Max JSON request body size (bounds ingestion batch size) |
| `LOG_RETENTION_DAYS` | `30` | How many days of logs to keep (see [Retention strategy](#retention-strategy)) |
| `LOG_PARTITION_DAYS_AHEAD` | `7` | How many days of future daily partitions to keep pre-created |
| `DB_HOST` | `database` (Compose service name) | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_USER` | `postgres` | PostgreSQL user |
| `DB_PASS` | `postgres` | PostgreSQL password |
| `DB_NAME` | `log_pulse` | PostgreSQL database name |
| `DB_SSL` | `false` | Enable TLS to PostgreSQL |

No authentication, API key, rate limiting, or multi-tenancy variables exist because none of those optional features are implemented — see [Optional features](#optional-features).

## API documentation

Full runnable examples for every endpoint (happy path + filters) live in [`requests/`](requests/) as REST Client `.rest` files: [`health.check.rest`](requests/health.check.rest), [`logs.ingest.rest`](requests/logs.ingest.rest), [`logs.list.rest`](requests/logs.list.rest), [`logs.aggregate.rest`](requests/logs.aggregate.rest). Interactive Swagger UI is at `/api/docs` outside production.

### `GET /health`

Returns `200` with a JSON status body once the database connection is established, migrations are applied, and the service is ready to accept logs. Returns `503` otherwise. Always unauthenticated. Used by orchestrators/load generators to know when to start sending traffic.

### `POST /logs` — ingest a batch

Accepts one or more log entries in a single request; a batch of one is valid.

```json
{
  "logs": [
    {
      "timestamp": "2026-07-20T14:32:01.123Z",
      "level": "error",
      "service": "checkout",
      "message": "payment declined",
      "attributes": { "user_id": "42", "region": "eu-west", "retries": 3 }
    }
  ]
}
```

Per-entry validation: `timestamp` must be a valid ISO 8601 timestamp no more than 5 minutes in the future; `level` must be one of `debug`/`info`/`warn`/`error`; `service` and `message` must be non-empty strings; `attributes` is optional but must be a flat object of strings, numbers, or booleans only (no nesting).

An invalid entry never fails the whole batch — each entry is accepted or rejected independently, and rejections carry the original array index and a reason:

```json
{ "accepted": 9, "rejected": [{ "index": 3, "reason": "invalid level: 'critical'" }] }
```

`200` when at least one entry is accepted; `400` when every entry is rejected, the JSON is malformed, or the body doesn't match `{ "logs": [...] }`.

### `GET /logs` — query with combinable filters

| Parameter | Meaning |
| --- | --- |
| `service` | Exact service-name match |
| `level` | Exact level match |
| `since` / `until` | Inclusive start / exclusive end of the time range |
| `attr.<key>` | Attribute equality, compared as strings (e.g. `attr.user_id=42`) |
| `q` | Case-insensitive substring match on `message` |
| `limit` | Max results, default `100`, max `1000` |
| `cursor` | Opaque cursor from a previous response |

All parameters are optional and freely combinable. Results are sorted by `timestamp DESC`, with `id DESC` as a deterministic tie-breaker for identical timestamps.

```json
{
  "logs": [
    {
      "id": "959793",
      "timestamp": "2026-07-20T14:32:01.123Z",
      "level": "error",
      "service": "checkout",
      "message": "payment declined",
      "attributes": { "user_id": "42" }
    }
  ],
  "next_cursor": "eyJ0aW1lc3RhbXAiOiIyMDI2LTA3LTIwVDE0OjMyOjAxLjEyM1oiLCJpZCI6Ijk1OTc5MyJ9"
}
```

`next_cursor` is `null` when there are no more results. The cursor is opaque to clients (unpadded Base64URL-encoded JSON internally) — pass it back unchanged to page forward.

`400` with `{ "error": "<description>" }` for invalid timestamps, `until` earlier than `since`, unsupported levels, non-numeric/out-of-range limits, unsupported query parameters, or a malformed cursor.

### `GET /logs/aggregate` — time-bucketed counts

Supports the same `service`, `level`, `attr.<key>`, and `q` filters as `GET /logs`, plus:

| Parameter | Required | Meaning |
| --- | --- | --- |
| `since` / `until` | Yes | Inclusive/exclusive aggregation range |
| `bucket` | Yes | `1m`, `5m`, `1h`, or `1d` |
| `group_by` | No | `service` or `level` |

```json
{
  "buckets": [
    { "start": "2026-07-20T14:00:00.000Z", "group": "checkout", "count": 118 },
    { "start": "2026-07-20T14:00:00.000Z", "group": "auth", "count": 42 }
  ]
}
```

One row per bucket × group combination, ordered by bucket start ascending. Empty buckets are omitted. `group` is `null` when `group_by` is not provided. Same `400` error contract as `GET /logs`.

## Schema and index design

`logs` is a single PostgreSQL table, **range-partitioned by `timestamp` into daily partitions** (`logs_2026_07_20`, etc.), with a `logs_default` catch-all partition as a safety net for any timestamp outside a pre-created daily range.

```
logs (parent, PARTITION BY RANGE (timestamp))
├── id               bigint  GENERATED ALWAYS AS IDENTITY
├── timestamp         timestamptz  NOT NULL
├── level              log_level (enum: debug | info | warn | error)
├── service            text
├── message            text
├── attributes         jsonb   -- typed values, as submitted (see below)
├── attributes_text    jsonb   -- all values coerced to text, for filtering
├── ingested_at        timestamptz  DEFAULT now()
└── PRIMARY KEY (timestamp, id)
```

Why partition by day:

- **Retention becomes `DROP TABLE`, not `DELETE`.** Dropping a whole expired partition is instant and produces zero dead-tuple bloat, versus deleting ~33k rows/day out of a monolithic table, which would compete with ingestion for I/O and leave bloat behind for autovacuum to clean up.
- **Indexes stay small.** Each partition carries its own copy of every index, so a query that touches one or two days of data touches one or two days' worth of index, not the whole month.
- Matches the assumption in the spec that ~1M rows represents ~1 month of data.

The primary key is `(timestamp, id)` — not just `id` — because PostgreSQL requires the partition key to be part of every unique constraint on a partitioned table. `id` is a `bigint` identity column, so uniqueness is still effectively per-row; `timestamp` in the key is a side effect of partitioning, not a design choice for query purposes.

Indexes (all per-partition, PostgreSQL propagates them automatically to new partitions created for `logs`):

| Index | Type | Supports |
| --- | --- | --- |
| `pk_logs (timestamp, id)` | B-tree | Range scans + the `(timestamp, id)` cursor tie-break |
| `idx_logs_service_timestamp_id (service, timestamp DESC, id DESC)` | B-tree | `service=` filter, pre-sorted for pagination |
| `idx_logs_level_timestamp_id (level, timestamp DESC, id DESC)` | B-tree | `level=` filter, pre-sorted for pagination |
| `idx_logs_attributes_text_gin (attributes_text, jsonb_path_ops)` | GIN | `attr.<key>=` containment lookups |
| `idx_logs_message_trigram (message, gin_trgm_ops)` | GIN (`pg_trgm`) | Case-insensitive `q=` substring search |

`jsonb_path_ops` is used instead of the default `jsonb_ops` GIN operator class because the API only ever needs `@>` containment equality on attributes, never JSON path queries — `jsonb_path_ops` produces a smaller, faster index for exactly that case.

## Attribute storage strategy

Each log's `attributes` are stored **twice**, in two JSONB columns with different jobs:

- **`attributes`** — the values exactly as submitted (string, number, or boolean), returned verbatim in `GET /logs` responses.
- **`attributes_text`** — every value coerced to its string representation, used *only* for filtering.

The spec requires `attr.<key>` filtering to compare values **as strings** (`attr.retries=3` should match a stored numeric `3`), which needs a stable string representation to index and query against. Rather than `CAST`-ing `attributes` to text at query time on every request (which can't use an index efficiently against a mixed-type column), `attributes_text` is precomputed once at ingestion time and backed by a GIN index, so `attr.<key>=value` becomes a fast index containment lookup (`attributes_text @> '{"key":"value"}'`) instead of a per-row scan-and-cast.

This was chosen over two other designs:

- **A separate EAV (key/value) table** — normalizes attributes into rows, but a 1M+ row `logs` table would need a join against a much larger attributes table for every filtered query, which is expensive exactly where the spec demands sub-second aggregation.
- **Casting `attributes` to text inline in the query** — no schema duplication, but can't be indexed the same way and pushes CPU work onto every read instead of once at write time; wrong trade-off for a system whose hardest constraint is ingestion throughput on a 0.5 CPU container.

The extra JSONB column costs some disk space (attributes are typically small — a handful of short key/value pairs) in exchange for O(1) indexed filtering instead of O(n) scanning; given the row-count and hardware constraints in this project, that trade was the right one.

## Retention strategy

Retention is partition-based, not row-based, for the reasons in [Schema and index design](#schema-and-index-design) — dropping a partition is instant and bloat-free, deleting millions of rows is neither.

- `LOG_RETENTION_DAYS` (default `30`) — logs older than this are eligible for deletion.
- `LOG_PARTITION_DAYS_AHEAD` (default `7`) — daily partitions are kept pre-created this many days into the future, so ingestion never has to fall back to the `logs_default` catch-all partition under normal operation.
- Maintenance (`RetentionService`) runs once at application startup and once daily at midnight UTC (`@nestjs/schedule`), and:
  1. Drops any daily partition that has fully aged out of the retention window (`DROP TABLE`).
  2. Deletes any residual expired rows still sitting in `logs_default` (the only place row-level deletes happen, and only for the rare rows that landed outside a pre-created partition).
  3. Creates any missing daily partitions from the retention boundary through `LOG_PARTITION_DAYS_AHEAD` days ahead.
- A **PostgreSQL advisory lock** (`pg_try_advisory_lock`) guards the whole maintenance run, so if the app ever scales to multiple instances, only one performs retention maintenance at a time — the rest skip the run instead of racing.
- Creating a new daily partition briefly takes an `ACCESS EXCLUSIVE` lock on the parent `logs` table while handing off any rows that landed in `logs_default` for that day. In steady state this is a near-instant no-op (there are normally zero such rows, since partitions are created 7 days ahead of when they're needed) — it only becomes meaningful if partition creation has fallen behind, which the 7-day lead time is designed to prevent.

## Optional features

**None are implemented.** No authentication, API keys, multi-tenancy, or rate limiting. `docker compose up` with no environment file, no arguments, and no manual setup produces exactly the plain, unauthenticated core service described by the spec, on all four required endpoints — verified by tearing down the stack, removing any local `.env`, and rebuilding from a clean checkout.

## Performance

### Target environment

Matches the graded constraints exactly, enforced via Docker Compose resource limits and confirmed with `docker inspect` (not just declared in YAML — `deploy.resources.limits` was verified to actually apply under plain `docker compose up`, not only Swarm mode):

| Container | CPU | Memory |
| --- | --- | --- |
| `app` | 0.5 | 256 MB |
| `database` (PostgreSQL 16) | 1.0 | 1 GB |

### Preliminary measurements

The numbers below come from ad hoc verification runs against the real constrained `docker compose` stack on the development machine (not a synthetic/mocked environment) — used to validate the ingestion path after a design change, not a formal benchmark. See [Known limitations](#known-limitations) for what's still missing before these can be reported as final target evidence.

- **Dataset size:** ~1.1M rows in `logs` at the time of measurement.
- **Batch size:** 2,000 log entries per `POST /logs` request.
- **Ingestion rate:** 80,000 logs accepted in 3.92s at concurrency 8 → **~20,400 logs/sec**, 0 rejected, 0 failed requests.
- **Ingestion under higher concurrency:** at concurrency 16, throughput was ~13,900 logs/sec — the `database` container's CPU hit ~99.9% of its 1.0 CPU limit, identifying PostgreSQL, not the application, as the bottleneck at that concurrency.
- **Aggregation query latency:** 5 sequential samples of a 1-day range / 5-minute buckets / grouped-by-service query over ~1.1M rows: 27–38ms each (well under the 1s p95 target — not yet measured concurrently with sustained ingestion, which is the actual target scenario).
- **Resource usage during the concurrency-8 run:** app ~10.7% CPU / ~52 MB RAM; database ~0% CPU / ~61 MB RAM (idle between requests, consistent with the run completing quickly).

### Bottlenecks discovered

The original ingestion path used TypeORM's `Repository.insert()` — per-row entity instantiation, ORM metadata overhead, and an implicit `RETURNING` of the generated `id` column that nothing consumed. Under the 0.5 CPU application container limit, this overhead mattered.

The Docker build itself was also a hidden risk: the original multi-stage `Dockerfile` ran `npm ci` (installing dev + prod dependencies) then `npm prune --omit=dev` to strip dev dependencies back out. Pruning an already-installed ~740-package tree took **170+ seconds** on its own — long enough to be a plausible cause of a real build timeout encountered against the external load-testing portal's build infrastructure (which logs indicated was not using the `buildx` plugin, i.e. no BuildKit layer caching or stage parallelism).

### Optimizations applied

- **`COPY FROM STDIN` ingestion.** `LogRepository.insertMany()` now streams validated batches straight into PostgreSQL via `COPY logs (...) FROM STDIN WITH (FORMAT csv)` (`pg-copy-streams`), bypassing TypeORM's per-row insert path entirely. This is PostgreSQL's fastest bulk-load mechanism and was the change that took ingestion from ORM-bound to the ~20k logs/sec figure above.
- **Production-only Docker install instead of prune.** The final image stage now runs a fresh `npm ci --omit=dev` directly from the lockfile instead of installing everything and pruning it back down. A clean rebuild went from 170+ seconds (that one step alone) to **~30 seconds total**.
- **Partitioned retention** (see above) keeps both index size and per-query working set bounded as the dataset grows toward and past 1M rows, rather than degrading linearly with total table size.

## Known limitations

- **No formal, repeatable load-testing harness is currently in this repository.** The numbers in [Performance](#performance) are real measurements against the real constrained stack, but they come from ad hoc scripts, not a checked-in, reproducible suite. The full target scenario from the spec — sustained 15,000+ logs/sec, 1M rows, concurrent aggregation at 1 request/sec, p95 latency, and 20-second ingest-to-queryable visibility, all measured together — has not yet been formally executed and recorded. Rebuilding this harness is the top open item.
- **No unit or integration test suite yet.** CI runs a black-box HTTP smoke test (`docker compose up` + curl against all four endpoints) but there is no unit coverage for validators, cursor handling, or query builders, and no integration suite exercising edge cases (empty ranges, every rejection reason, full cursor pagination walks) against a real database.
- **GIN indexes trade ingestion cost for query cost.** `idx_logs_attributes_text_gin` and `idx_logs_message_trigram` make `attr.<key>` and `q` filtering fast but add write amplification on every insert. This hasn't been benchmarked against a configuration without them, so the exact cost isn't quantified — only that the measured ingestion rate above already includes it.
- **No optional features.** No authentication, rate limiting, multi-tenancy, or backpressure shedding — the service will accept load until PostgreSQL or the application container itself becomes the bottleneck, with no graceful `429`/`503` shedding in between.
- **Swagger UI is unavailable in the default (production) Compose posture** by design (`NODE_ENV=production` disables it) — use `requests/*.rest` for runnable examples instead, or set `NODE_ENV` to a non-production value to enable it.

## Project structure

See [docs/folderStructure.md](docs/folderStructure.md) for the full source layout and [projectSchema.dbml](projectSchema.dbml) for the database schema in DBML.
