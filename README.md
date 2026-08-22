# logPulse

A high-throughput log ingestion and query service, a simplified version of Datadog / Grafana Loki. Applications send structured logs to the API; the service validates, stores, and makes them searchable and analyzable, including time-bucketed aggregation, under sustained high-volume ingestion.

Backend: NestJS 11, TypeScript, TypeORM, PostgreSQL 16. Frontend (optional dashboard): React 19, Vite, Material UI. Everything runs via `docker compose up`.

## Table of contents

- [Quick start](#quick-start)
- [CI](#ci)
- [API documentation](#api-documentation)
- [Schema and index design](#schema-and-index-design)
- [Attribute storage strategy](#attribute-storage-strategy)
- [Retention strategy](#retention-strategy)
- [Optional features](#optional-features)
- [Performance](#performance)
- [Known limitations](#known-limitations)
- [Project structure](#project-structure)

## Quick start

Requirements: Docker and Docker Compose. Nothing else: no `.env` file, no manual database setup.

```bash
docker compose up
```

This builds the application image, starts PostgreSQL, waits for it to become healthy, applies all database migrations automatically, and starts the API on **`http://localhost:8080`**. `GET /health` returns `200` once the database is connected, migrations are applied, and the service is ready to accept logs. This is the same readiness gate an external load generator polls before sending traffic.

Every environment variable has a built-in default, so this zero-configuration command produces the same unauthenticated, unrestricted core service described by the project spec. Nothing in this README is required to get a request through.

`docker compose up` also starts a `frontend` service: an optional dashboard at **`http://localhost:5173`** (see [Dashboard](#dashboard)). It's a separate container that only talks to the public API; it never changes backend behavior.

Interactive API docs (Swagger UI) are always available at `http://localhost:8080/api/docs`.

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every pull request and push to `main`:

1. **Code Quality**: `npm run format:check` and `npm run lint` (backend only, zero warnings allowed).
2. **Build**: `npm run build` (production Nest build), gated on Quality passing.

## API documentation

### `GET /health`

Returns `200` with a JSON status body (`status`, `database`, `migrations`, `uptime`, `timestamp`) once the database connection is established, migrations are applied, and the service is ready to accept logs. Returns `503` otherwise. Always unauthenticated. Used by orchestrators/load generators to know when to start sending traffic.

### `POST /logs`: ingest a batch

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

An invalid entry never fails the whole batch: each entry is accepted or rejected independently, and rejections carry the original array index and a reason:

```json
{ "accepted": 9, "rejected": [{ "index": 3, "reason": "invalid level: 'critical'" }] }
```

`200` when at least one entry is accepted; `400` when every entry is rejected, the JSON is malformed, or the body doesn't match `{ "logs": [...] }`.

### `GET /logs`: query with combinable filters

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

`next_cursor` is `null` when there are no more results. The cursor is opaque to clients (unpadded Base64URL-encoded JSON internally); pass it back unchanged to page forward.

`400` with `{ "error": "<description>" }` for invalid timestamps, `until` earlier than `since`, unsupported levels, non-numeric/out-of-range limits, unsupported query parameters, or a malformed cursor.

### `GET /logs/aggregate`: time-bucketed counts

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
├── id          bigint       GENERATED ALWAYS AS IDENTITY
├── tenant_id   uuid         NOT NULL   -- see Multi-tenancy
├── timestamp   timestamptz  NOT NULL
├── level       log_level (enum: debug | info | warn | error)
├── service     text         NOT NULL
├── message     text         NOT NULL
├── attributes  jsonb        NOT NULL DEFAULT '{}'   -- see Attribute storage strategy
└── PRIMARY KEY (timestamp, id)
```

Why partition by day:

- **Retention becomes `DROP TABLE`, not `DELETE`.** Dropping a whole expired partition is instant and produces zero dead-tuple bloat, versus deleting rows out of a monolithic table, which competes with ingestion for I/O and leaves bloat for autovacuum to clean up.
- **Indexes stay small.** Each partition carries its own copy of every index, so a query that touches one or two days of data touches one or two days' worth of index, not the whole month.
- Matches the assumption in the spec that ~1M rows represents ~1 month of data.

The primary key is `(timestamp, id)`, not just `id`, because PostgreSQL requires the partition key to be part of every unique constraint on a partitioned table. `id` is a `bigint` identity column, so uniqueness is still effectively per-row; `timestamp` in the key is a side effect of partitioning, not a design choice for query purposes.

Indexes (all per-partition; PostgreSQL propagates them automatically to new partitions):

| Index | Type | Supports |
| --- | --- | --- |
| `pk_logs (timestamp, id)` | B-tree | Range scans + the `(timestamp, id)` cursor tie-break |
| `idx_logs_tenant_timestamp_id (tenant_id, timestamp DESC, id DESC)` | B-tree | Tenant-scoped pagination with no `service`/`level` filter |
| `idx_logs_tenant_service_timestamp_id (tenant_id, service, timestamp DESC, id DESC)` | B-tree | `service=` filter, pre-sorted for pagination |
| `idx_logs_tenant_level_timestamp_id (tenant_id, level, timestamp DESC, id DESC)` | B-tree | `level=` filter, pre-sorted for pagination |

Every index leads with `tenant_id` because every query against `logs` carries an unconditional `tenant_id = $1` predicate (see [Multi-tenancy](#multi-tenancy)). `tenant_id` has **no foreign key** to `tenants.id`: the schema has zero foreign keys anywhere, and tenant existence is guaranteed by construction (the value only ever comes from a resolved API key or a fixed internal constant, never request input), so an FK would tax the hot `COPY` ingestion path for no correctness benefit.

Two indexes that existed earlier did **not** survive to the current schema, both removed after being measured as net negative. See [Bottlenecks discovered](#bottlenecks-discovered) and [Attribute storage strategy](#attribute-storage-strategy):

- A GIN trigram index on `message` (for `q=` substring search): it wrote roughly one index entry per character of every message and capped ingestion at ~2,457 logs/sec.
- A GIN index on a stringified mirror column, `attributes_text`, which was replaced by a query-time containment predicate evaluated directly against `attributes`.

Both filters now rely on the same partition-pruned sequential scan within whatever range the B-tree indexes above have already narrowed the query to.

### Rollup table

```
log_rollups
├── bucket      timestamptz  NOT NULL   -- minute-aligned start of the summarized window
├── tenant_id   uuid         NOT NULL
├── service     text         NOT NULL
├── level       log_level    NOT NULL
├── count       integer      NOT NULL DEFAULT 0
└── PRIMARY KEY (bucket, tenant_id, service, level)
```

See [Rollup tables](#rollup-tables-pre-aggregation) under Optional features for how it's kept in sync and used.

Unlike every index on `logs`, this primary key leads with `bucket`, not `tenant_id`. This is deliberate: retention's bulk prune (`DELETE FROM log_rollups WHERE bucket < $1`) sweeps every tenant's expired buckets in one statement with no `tenant_id` predicate at all, so `bucket` has to lead for that scan to use the index. `tenant_id` still narrows every *read* query; it's simply the second column in the key instead of the first.

### Tenant tables

Three additional, unpartitioned tables support self-service multi-tenancy. None have foreign keys, for the same reason as `logs.tenant_id` above.

```
tenants
├── id             uuid  PRIMARY KEY DEFAULT gen_random_uuid()
├── email          text  NOT NULL UNIQUE
└── password_hash  text  NOT NULL

api_keys
├── id          uuid  PRIMARY KEY DEFAULT gen_random_uuid()
├── tenant_id   uuid  NOT NULL                          -- indexed
├── key_value   text  NOT NULL UNIQUE                   -- full cleartext secret; see Multi-tenancy
├── status      text  NOT NULL DEFAULT 'active'          -- 'active' | 'revoked', CHECK-constrained
├── created_at  timestamptz  DEFAULT now()
└── revoked_at  timestamptz

tenant_refresh_tokens
├── id          uuid  PRIMARY KEY DEFAULT gen_random_uuid()
├── tenant_id   uuid  NOT NULL                          -- indexed
├── token_hash  text  NOT NULL UNIQUE                   -- bcryptjs hash, unlike api_keys.key_value
├── expires_at  timestamptz  NOT NULL
├── created_at  timestamptz  DEFAULT now()
└── revoked_at  timestamptz
```

Full DBML source: [`backend/projectSchema.dbml`](backend/projectSchema.dbml).

## Attribute storage strategy

Each log's `attributes` are stored **once**, as submitted (string, number, or boolean per key), in a single JSONB column returned verbatim in `GET /logs` responses.

The spec requires `attr.<key>` filtering to compare values **as strings** (`attr.retries=3` should match a stored numeric `3`), satisfied at query time by a type-branched containment check evaluated directly against `attributes`:

```
attributes @> {"key": "value"}                    -- string match, always attempted
OR attributes @> {"key": value::numeric}           -- only if value parses as a canonical number
OR attributes @> {"key": value::boolean}           -- only if value is exactly "true"/"false"
```

Every `jsonb_build_object(...)` argument gets an explicit `::text`/`::numeric`/`::boolean` cast. Without one, PostgreSQL can't infer a type for a prepared-statement parameter to this variadic function, which fails at bind time. The numeric/boolean branches are only emitted into the query at all when the filter value would actually parse as that type: binding a non-numeric string with a `::numeric` cast errors regardless of any surrounding `OR`, since the cast applies to the parameter value itself, not conditionally to a branch.

This replaced an earlier design that stored a second column, `attributes_text`, with every value pre-stringified at ingest time and backed by its own GIN index, so filtering could stay a single string-equality containment check against an all-string mirror. That traded a JSONB column and a GIN index of write cost, on *every* ingested row, for a query-time win the read path doesn't need often enough to justify: `attr.<key>` filtering isn't the hot path (`POST /logs` ingestion is), and no index backs the current predicate either; it relies on the same partition-pruned sequential scan `q=` substring search already uses, scoped by whatever `tenant_id`/`service`/`level`/time-range predicates the request already carries.

This was chosen over:

- **A separate EAV (key/value) table**: normalizes attributes into rows, but a 1M+ row `logs` table would need a join against a much larger attributes table for every filtered query, which is expensive exactly where the spec demands sub-second aggregation.
- **Keeping the `attributes_text` mirror column**: this was the original design, removed once it was clear the write cost it pays on every row wasn't buying a query-time win worth keeping, since `attr.<key>` filtering is not itself the throughput-critical path.

## Retention strategy

Retention is partition-based, not row-based, for the reasons in [Schema and index design](#schema-and-index-design): dropping a partition is instant and bloat-free, while deleting millions of rows is neither.

- `LOG_RETENTION_DAYS` (default `30`): logs older than this are eligible for deletion.
- `LOG_PARTITION_DAYS_AHEAD` (default `7`): daily partitions are kept pre-created this many days into the future, so ingestion never has to fall back to the `logs_default` catch-all partition under normal operation.
- Maintenance (`RetentionService`) runs once at application startup and once daily at midnight UTC (`@nestjs/schedule`), and:
  1. Drops any daily partition that has fully aged out of the retention window (`DROP TABLE`).
  2. Deletes any residual expired rows still sitting in `logs_default` (the only place row-level deletes happen, and only for the rare rows that landed outside a pre-created partition).
  3. Creates any missing daily partitions from the retention boundary through `LOG_PARTITION_DAYS_AHEAD` days ahead.
- **Rollup pruning rides along in the same maintenance run**, under the same advisory lock: no second lock, no second scheduled job. Fully-expired minute buckets in `log_rollups` are bulk-deleted outright; the *one* bucket straddling the retention cutoff is adjusted by a relative delta computed in the same atomic statement (a data-modifying CTE) as the `logs` rows it deletes for that bucket, never a recomputed absolute value, so a rollup adjustment racing a concurrent live ingestion upsert for the same bucket can never be silently overwritten regardless of which one commits first.
- A **PostgreSQL advisory lock** (`pg_try_advisory_lock`) guards the whole maintenance run, so if the app ever scales to multiple instances, only one performs retention maintenance at a time; the rest skip the run instead of racing.
- Creating a new daily partition briefly takes an `ACCESS EXCLUSIVE` lock on the parent `logs` table while handing off any rows that landed in `logs_default` for that day. In steady state this is a near-instant no-op (there are normally zero such rows, since partitions are created 7 days ahead of when they're needed); it only becomes meaningful if partition creation has fallen behind, which the 7-day lead time is designed to prevent.
- **Retention is tenant-aware where it has to be, and deliberately not where it doesn't.** The retention *policy* (what's expired, on what schedule) stays system-wide across all tenants; there's no per-tenant retention configuration. But the `logs_default` to new-partition row hand-off is a raw SQL `INSERT ... SELECT` that must explicitly carry every column, including `tenant_id`, or it fails outright against `logs.tenant_id`'s `NOT NULL` constraint.

## Optional features

`docker compose up` with no environment file, no arguments, and no manual setup produces exactly the plain, unauthenticated core service described by the spec on all four required endpoints. All three features below are additive: none of them can change a required response shape, add a required parameter, or make a request fail that would otherwise succeed.

### Multi-tenancy

Implemented, **off by default**.

| Variable | Default | Meaning |
| --- | --- | --- |
| `AUTH_ENABLED` | `false` | Master switch. `false`/unset means all four required endpoints behave exactly as the unauthenticated core service; an `Authorization` header, if sent anyway, is silently ignored, never rejected. |
| `LOADGEN_API_KEY` | *(unset)* | When `AUTH_ENABLED=true`, this key is idempotently seeded at startup, before the service reports healthy, and scoped to one fixed tenant with ingest+query permission. Restarting with the same value never duplicates the tenant or the key. Left unset, the service still starts and stays healthy; it just has no seeded key. |
| `LOADGEN_TENANT_PASSWORD` | `please-change-me-in-production` | Login password for that same seeded tenant account. Only takes effect on the tenant's first seed. |
| `JWT_SECRET` / `JWT_ACCESS_TOKEN_TTL_SECONDS` / `JWT_REFRESH_TOKEN_TTL_DAYS` | Defaults: `please-change-me-in-production`, `900`, `7` | Sign/verify Tenant account tokens. `JWT_SECRET`'s zero-config default is intentionally insecure, mirroring `DB_PASS`'s existing convention; override it for anything beyond local development or grading. |

**Two separate credential types with two separate purposes, never interchangeable:**

- **API keys** (`Authorization: Bearer lp_...` or `x-api-key: lp_...`): machine credentials for the log data-plane: `POST /logs`, `GET /logs`, `GET /logs/aggregate`. Every valid key resolves to exactly one tenant; tenant identity is derived only from the credential, never accepted as a request field. When `AUTH_ENABLED=false`, these three endpoints ignore credentials entirely and every request lands in one shared, fixed internal tenant; an issued key simply has no enforcement effect until `AUTH_ENABLED=true`.
- **Tenant access tokens** (JWTs, `Authorization: Bearer eyJ...`): human/account-plane credentials for managing a Tenant's own account and API keys. **Always required, regardless of `AUTH_ENABLED`.** Presenting an API key to an account-management endpoint (or an access token to a log endpoint) returns `403`, not success.

A credential presented on the wrong surface, or missing where required, gets `401` for missing/invalid/expired and `403` for the wrong credential type, both as `{"error": "<description>"}`.

**Self-service account flow** (no administrator role exists; a Tenant is a single customer account, not an organization):

| Endpoint | Guard | Purpose |
| --- | --- | --- |
| `POST /tenants/register` | none | Create a Tenant account (email + password) |
| `POST /tenants/login` | none | Exchange credentials for an access token (15 min) + refresh token (7 days) |
| `POST /tenants/refresh` | none | Rotate a refresh token for a new pair (single-use; the presented token is invalidated) |
| `POST /tenants/api-keys` | Tenant access token | Create a new API key for the caller's own account |
| `GET /tenants/api-keys` | Tenant access token | List the caller's own keys, **including each key's full secret** (retrievable anytime, not just shown once, by design) |
| `DELETE /tenants/api-keys/:id` | Tenant access token | Revoke one of the caller's own keys, rejected on the very next request with no grace period |

Notable design decisions:

- Passwords (and refresh tokens) are hashed with `bcryptjs`, a pure-JS bcrypt implementation chosen over native `bcrypt`/`argon2` specifically to avoid a native-binding dependency that would break the Alpine Docker build. The input is SHA-256-prehashed first since bcrypt only uses the first 72 bytes of its input, and refresh tokens (long JWTs) would otherwise lose most of their entropy to silent truncation.
- API keys store their **full value in cleartext**, not hashed, a deliberate consequence of requiring keys to be retrievable again later via the list endpoint rather than the industry-default "show once" pattern. Refresh tokens, which are never redisplayed, are hashed as usual.
- Guards are applied directly per-controller (`@UseGuards(...)`), not via a single global default-deny guard. This makes the failure mode of "a controller silently exposed because it forgot to opt out of auth" structurally impossible.

### Dashboard

Implemented as a separate `frontend` service (React 19, MUI) at `http://localhost:5173`, started automatically by `docker compose up`. It is purely additive: it only calls the same public API surface documented above, over CORS, and can never affect the required contract on `:8080`; the load generator never touches port 5173.

To disable it, don't start the service: `docker compose up app database`, or `docker compose stop frontend` after startup. No environment variable gates it, since it has no effect on the graded surface either way.

Pages:

- `/register`, `/login`: self-service Tenant account creation and sign-in, wired to the multi-tenancy endpoints above.
- `/dashboard`: a tabbed workbench once signed in:
  - **Ingest**: a guided multi-entry batch builder (add/remove entries and attribute rows, load a sample batch, see per-entry rejection reasons by index) plus a raw-JSON batch mode.
  - **Query**: the full `GET /logs` filter set (service/level/since/until/q/attr.\*/limit) with cursor-based "Load more" and a results table.
  - **Aggregate**: the full `GET /logs/aggregate` parameter set with a chart/table toggle and grouping.

On login, the dashboard bootstraps a data-plane API key for the signed-in tenant (list-then-create) and uses it, never the login JWT, for all `/logs*` calls, matching the two-credential-type rule above.

**Caveat:** with the zero-config default (`AUTH_ENABLED=false`), the dashboard still fully works, but tenant isolation has no effect: every request, including ones sent with a bootstrapped API key, lands in the one shared default tenant, since API-key credentials are ignored entirely while auth is off. Set `AUTH_ENABLED=true` to see real per-tenant isolation in the dashboard.

### Rollup tables (pre-aggregation)

Implemented, **always on**. There is no toggle, because it doesn't need one: `GET /logs/aggregate` returns numerically identical results with or without it, so it satisfies "additive, never subtractive" by construction rather than by a flag.

`log_rollups` is a derived, minute-granularity pre-aggregation of `logs`, never a second source of truth, that exists purely so `GET /logs/aggregate` scales independently of total row count for the common (unfiltered) case. It's kept in sync **atomically**: the same explicit database transaction that streams a batch into `logs` via `COPY` also upserts that batch's per-`(tenant_id, service, level, minute)` counts here (`count = count + EXCLUDED.count`), so the two tables can never drift apart after a crash. There is no separate rebuild step, and `GET /health` gains no new readiness dependency. Any `logs` rows that predate this table were backfilled once, folded into the migration that creates it.

`GET /logs/aggregate` reads `log_rollups` for the minute-aligned bulk of a requested range and falls back to a direct `logs` scan only for the (at most two) partial-minute edges, summing the two results in application code; the output is numerically identical to a full raw scan. A request with a `q=` or `attr.<key>=` filter always bypasses `log_rollups` entirely, since no rollup carries per-message or per-attribute detail. Retention prunes `log_rollups` alongside `logs` (see [Retention strategy](#retention-strategy)).

## Performance

### Target environment

Matches the graded constraints exactly, enforced via Docker Compose resource limits:

| Container | CPU | Memory |
| --- | --- | --- |
| `app` | 0.5 | 256 MB |
| `database` (PostgreSQL 16) | 1.0 | 1 GB |

### Load-test methodology

Results below come from the official grading tool, run against the real constrained `docker compose` stack (not a synthetic/mocked environment):

```bash
npx --yes github:Ahmad-Abbas-Foothill/logs-benchmark-cli \
  --compose ./docker-compose.yml --full --seed 6122026 \
  --runner docker --json benchmark-report.json --generator-cpus 8
```

It seeds 1,000,000 fixture rows, runs a correctness catalog, then four k6 load scenarios (`load`, `stress`, `spike`, `breakpoint`) against `POST /logs`, `GET /logs`, and `GET /logs/aggregate` concurrently, and writes a scored JSON report ([`benchmark-report.json`](benchmark-report.json)) checked into this repo.

**Batch size** is controlled internally by the tool's own k6 script and isn't exposed in its output. This repo's benchmark run used the tool as a black box, per the grading contract, rather than a hand-tuned harness.

The run reported a **machine speed factor of 0.39x the reference machine** ("much slower than the reference; treat performance points as directional only") and flagged all four scenarios as **generator-limited, not service-limited**: the k6 generator's own CPU budget on this development machine couldn't dispatch every scheduled iteration (`droppedIterations` below), so the throughput figures understate what the service could actually sustain. Quote these numbers only alongside that context, and only compare against other runs on the same machine.

### Measured results

| Metric | Value |
| --- | --- |
| Engine (Docker Desktop) | 20 CPUs, 8 GiB |
| Generator (k6, isolated container) | 8 CPUs, 1 GB |
| Machine speed factor | 0.39x reference |
| Resource limits enforced | `app` 0.5 CPU / 256 MB · `database` 1.0 CPU / 1 GB |
| Dataset seeded | 1,000,000 rows |

Correctness catalog: **15 / 15 checks passed**, covering health, ingestion (single/batch/partial-invalid/empty/malformed-json), query (unfiltered/filters/invalid-parameters), pagination (stable order/cursor/invalid cursor), and aggregation (buckets/grouping/invalid options).

| Scenario | Offered logs/s | Accepted logs/s | Error rate | Ingest p95 | Aggregate p95 | Accepted records | Dropped generator iterations |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `load` | 15,000 | 10,927 | 0.04% | 1,882 ms | 1,517 ms | 1,311,200 | 4,882 |
| `stress` | 21,000 | 12,484 | 0% | 4,172 ms | 11,170 ms | 1,872,600 | 12,773 |
| `spike` | 15,375 | 10,270 | 0% | 7,682 ms | 20,681 ms | 1,027,000 | 5,104 |
| `breakpoint` | 24,375 | 12,251 | 0% | 6,993 ms | 6,717 ms | 1,470,100 | 14,549 |

All four scenarios completed (`4/4`) with no crashes, and every accepted record in every scenario became visible (`visibleRecords == acceptedRecords` exactly, in all four rows), demonstrating full durability and eventual visibility with zero records lost. The tool's separate, much stricter *immediate* read-after-write probe (reading back a record milliseconds after writing it, distinct from eventual visibility) succeeded only 0.5%–8% of the time; the score breakdown treats this as its own metric, independent of the "eventual consistency" check above, which passed all four scenarios.

| Score component | Points | Max | Notes |
| --- | --- | --- | --- |
| Correctness | 15.0 | 15 | 15/15 checks |
| Performance | 29.6 | 50 | throughput 10,927/s · errors 0.0% · p95 1,882 ms |
| Queries | 6.0 | 15 | aggregate p95 1,517 ms · eventual consistency 4/4 |
| Reliability | 20.0 | 20 | 4/4 scenarios completed, crash-free |
| **Total** | **70.6** | **100** | |

### Bottlenecks discovered

- **A GIN trigram index on `message`** (for `q=` substring search) wrote roughly one index entry per character of every ingested message and dominated per-row database CPU cost, capping ingestion at ~2,457 logs/sec against the 15,000 logs/sec target. Dropped; `q=` search now relies on the same partition-pruned sequential scan the other filters already narrow first.
- **TypeORM's `Repository.insert()`** on the original ingestion path paid per-row entity instantiation, ORM metadata overhead, and an implicit `RETURNING` of `id` that nothing consumed, adding meaningful overhead under the 0.5 CPU application limit. Replaced with `COPY FROM STDIN`.
- **`npm prune --omit=dev` in the Docker build** took 170+ seconds on its own in the original multi-stage `Dockerfile` (install everything, then strip dev dependencies back out), long enough to be a plausible cause of a build timeout against infrastructure without BuildKit layer caching. Replaced with a fresh `npm ci --omit=dev` directly from the lockfile in the production stage.
- **Aggregate query p95 latency exceeds the 1-second target under concurrent load** in the official run above (1.5s–20.7s across scenarios), which is the largest remaining scoring gap (`aggregateLatency` contributed 0 of the Queries points). The single connection pool serves both the hot `COPY` ingestion path and concurrent `GET /logs/aggregate` reads under a 1 CPU / 1 GB Postgres container, and this hasn't yet been root-caused with `EXPLAIN ANALYZE` against the exact contended workload. It's the top open performance item.

### Optimizations applied

- **`COPY FROM STDIN` ingestion.** `LogRepository` streams validated batches straight into PostgreSQL via `COPY logs (...) FROM STDIN WITH (FORMAT csv)` (`pg-copy-streams`), bypassing TypeORM's per-row insert path entirely, in the same transaction as the rollup upsert.
- **Production-only Docker install instead of prune.** The final image stage runs a fresh `npm ci --omit=dev` directly from the lockfile instead of installing everything and pruning it back down.
- **Partitioned retention** keeps both index size and per-query working set bounded as the dataset grows toward and past 1M rows, rather than degrading linearly with total table size.
- **Aggregation rollups.** `log_rollups` pre-aggregates `logs` at minute granularity, updated atomically alongside every `COPY` so it can never drift out of sync after a crash. See [Rollup tables](#rollup-tables-pre-aggregation).
- **Explicit connection-pool sizing** (`DB_WRITE_POOL_MAX`): the single connection pool no longer silently falls back to node-postgres's built-in default size.
- **`attributes_text` mirror column removed** in favor of a type-branched containment predicate evaluated at query time, resulting in one fewer JSONB column and one fewer GIN index maintained on every ingested row. See [Attribute storage strategy](#attribute-storage-strategy).

## Known limitations

- **Aggregate query p95 latency exceeds the 1-second target under concurrent load** in the official benchmark run; see [Bottlenecks discovered](#bottlenecks-discovered). This is the top open item.
- **CI runs formatting, linting, and a production build only** (see [CI](#ci)). It does not run the integration test suite (9 passing tests locally across app/health/logs/tenancy) or the spec-required smoke test in both `AUTH_ENABLED` configurations.
- **No unit tests**, only integration tests (Jest, against a real dedicated PostgreSQL database), and only for four modules (`app`, `health`, `logs`, `tenancy`). Validators, query builders, and retention/partition logic have no dedicated test file.
- **The frontend has no automated tests.** Browser-driven visual verification (Playwright) is blocked in the current development sandbox (missing Linux system libraries); frontend behavior was verified manually and at the API/CORS level instead.
- **Multi-tenant isolation is verified manually**, not by an automated test.
- **`tenant_refresh_tokens` rows are never purged** after `expires_at` passes or `revoked_at` is set. At the tenant scale this project targets, the table's growth rate is immaterial; a cleanup job is straightforward to add later without a schema change.
- **No rate limiting or backpressure shedding.** The service accepts load until PostgreSQL or the application container itself becomes the bottleneck, with no `429`/`503` shedding in between. An admission-control feature was built and deliberately removed rather than kept half-finished; see git history if reviving it.
- **CORS is hardcoded to allow every origin** (`origin: '*'`, credentials disabled), convenient for local development and grading, not production-appropriate, and not environment-configurable today.
- **The dashboard provides no real tenant isolation under the zero-config default.** See the caveat under [Dashboard](#dashboard).

## Project structure

```
logPulse/
├── docker-compose.yml       # app + frontend + database
├── docs/Final_Project.md    # original project specification this README is written against
├── backend/                 # NestJS API: src/, projectSchema.dbml, migrations
└── frontend/                # React dashboard: src/features/{auth,dashboard,logs}
```

See [`backend/projectSchema.dbml`](backend/projectSchema.dbml) for the full database schema in DBML.
