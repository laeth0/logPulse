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
| `DB_READ_POOL_MAX` | `5` | Max connections in the dedicated pool for `GET /logs`/`GET /logs/aggregate`, kept separate so reads never queue behind `POST /logs` ingestion |
| `DB_WRITE_POOL_MAX` | `20` | Max connections in the default pool used for ingestion, migrations, and retention maintenance |
| `INGEST_COALESCE_WINDOW_MS` | `5` | Debounce window that merges concurrent `POST /logs` writes into fewer, larger `COPY` calls (see [Optimizations applied](#optimizations-applied)) |
| `INGEST_COALESCE_MAX_ROWS` | `2000` | Row cap per coalesced flush — a single caller's own batch is never split across two flushes even if it alone exceeds this |
| `AUTH_ENABLED` | `false` | Master switch for authentication and multi-tenancy — see [Optional features](#optional-features) |
| `LOADGEN_API_KEY` | *(unset)* | API key idempotently seeded at startup, scoped to one tenant, when `AUTH_ENABLED=true` |
| `LOADGEN_TENANT_PASSWORD` | `please-change-me-in-production` | Login password for the load-generator tenant account (same account that owns `LOADGEN_API_KEY`) — lets you log in as it via `POST /tenants/login` to inspect/manage its seeded key by hand |
| `JWT_SECRET` | `please-change-me-in-production` | Signing secret for Tenant access/refresh tokens — change this for anything beyond local/grading use |
| `JWT_ACCESS_TOKEN_TTL_SECONDS` | `900` | Tenant access token lifetime (15 minutes) |
| `JWT_REFRESH_TOKEN_TTL_DAYS` | `7` | Tenant refresh token lifetime |

No rate-limiting variables exist because that optional feature isn't implemented — see [Optional features](#optional-features) for what is.

## API documentation

Full runnable examples for every required endpoint (happy path + filters) live in [`requests/`](requests/) as REST Client `.rest` files: [`health.check.rest`](requests/health.check.rest), [`logs.ingest.rest`](requests/logs.ingest.rest), [`logs.list.rest`](requests/logs.list.rest), [`logs.aggregate.rest`](requests/logs.aggregate.rest). The optional multi-tenancy endpoints have their own examples under [`requests/tenancy/`](requests/tenancy/) — see [Multi-tenancy](#multi-tenancy). Interactive Swagger UI is at `/api/docs` outside production.

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
├── tenant_id         uuid         NOT NULL  -- see Multi-tenancy under Optional features
├── timestamp         timestamptz  NOT NULL
├── level              log_level (enum: debug | info | warn | error)
├── service            text
├── message            text
├── attributes         jsonb   -- typed values, as submitted (see Attribute storage strategy)
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
| `idx_logs_tenant_timestamp_id (tenant_id, timestamp DESC, id DESC)` | B-tree | Tenant-scoped pagination with no `service`/`level` filter |
| `idx_logs_tenant_service_timestamp_id (tenant_id, service, timestamp DESC, id DESC)` | B-tree | `service=` filter, pre-sorted for pagination |
| `idx_logs_tenant_level_timestamp_id (tenant_id, level, timestamp DESC, id DESC)` | B-tree | `level=` filter, pre-sorted for pagination |

Neither GIN index this table originally had survived to the current schema: `idx_logs_message_trigram` (`q=` substring search) was dropped early on — see [Bottlenecks discovered](#bottlenecks-discovered) — and `idx_logs_attributes_text_gin` was removed along with the `attributes_text` column it indexed (see [Attribute storage strategy](#attribute-storage-strategy)). Both filters now rely on the same partition-pruned sequential scan within whatever range the B-tree indexes above narrow the query down to.

All three B-tree indexes lead with `tenant_id` because every query against `logs` now carries an unconditional `tenant_id = $1` predicate (see [Multi-tenancy](#multi-tenancy)) — the same leading-equality-column pattern the `service`/`level` indexes already used, with `tenant_id` added as the new outermost equality column. `tenant_id` has **no foreign key** to `tenants.id`: the existing schema has zero foreign keys anywhere, and tenant existence is already guaranteed by construction (the value only ever comes from a successfully-resolved API key, or a fixed internal constant — never from request input), so an FK would tax the hot `COPY` ingestion path for no correctness benefit.

### Rollup table

```
log_rollups
├── bucket      timestamptz  NOT NULL  -- minute-aligned start of the summarized window
├── tenant_id   uuid         NOT NULL
├── service     text         NOT NULL
├── level       log_level    NOT NULL
├── count       bigint       NOT NULL DEFAULT 0
└── PRIMARY KEY (bucket, tenant_id, service, level)
```

`log_rollups` is a derived, minute-granularity pre-aggregation of `logs` — never a second source of truth — that exists purely so `GET /logs/aggregate` scales independently of total row count for the common (unfiltered) case. It's kept in sync **atomically**: the same explicit database transaction that `COPY`-writes a batch into `logs` also upserts that batch's per-`(tenant_id, service, level, minute)` counts here (`count = count + EXCLUDED.count`), so the two tables can never drift apart after a crash — there is no separate rebuild step, and `GET /health` gains no new readiness dependency. Any `logs` rows that predate this table are backfilled exactly once, folded into the migration that creates it, which runs before the app ever accepts a request — so there is no concurrent writer to race against during the backfill.

`GET /logs/aggregate` reads `log_rollups` for the minute-aligned bulk of a requested range and falls back to a direct `logs` scan only for the (at most two) partial-minute edges, summing the two results — output is numerically identical to a full raw scan. A request with a `q=` or `attr.<key>=` filter always bypasses `log_rollups` entirely, since no rollup carries per-message or per-attribute detail. Retention prunes `log_rollups` alongside `logs` (see [Retention strategy](#retention-strategy)).

Unlike every index on `logs`, this primary key leads with `bucket`, not `tenant_id` — deliberately: retention's bulk prune (`DELETE FROM log_rollups WHERE bucket < $1`) sweeps every tenant's expired buckets in one statement with no `tenant_id` predicate at all, so `bucket` has to lead for that scan to use the index; `tenant_id` still narrows every *read* query (`GET /logs/aggregate`), just as the second key column instead of the first.

### Tenant tables

Three additional, unpartitioned tables support self-service multi-tenancy (see [Multi-tenancy](#multi-tenancy) for the full auth model). None have foreign keys, for the same reason as `logs.tenant_id` above.

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

## Attribute storage strategy

Each log's `attributes` are stored **once**, as submitted (string, number, or boolean per key), in a single JSONB column returned verbatim in `GET /logs` responses.

The spec requires `attr.<key>` filtering to compare values **as strings** (`attr.retries=3` should match a stored numeric `3`), satisfied at query time by a type-branched containment check evaluated directly against `attributes`:

```
attributes @> {"key": "value"}                                  -- string match, always attempted
OR attributes @> {"key": value::numeric}                        -- only if value parses as a canonical number
OR attributes @> {"key": value::boolean}                        -- only if value is exactly "true"/"false"
```

Every `jsonb_build_object(...)` argument gets an explicit `::text`/`::numeric`/`::boolean` cast — without one, PostgreSQL can't infer a type for a prepared-statement parameter to this variadic function, which fails at bind time. The numeric/boolean branches are only emitted into the query at all when the filter value would actually parse as that type: binding a non-numeric string with a `::numeric` cast errors regardless of any surrounding `OR`, since the cast applies to the parameter value itself, not conditionally to a branch.

This replaced an earlier design that stored a second column, `attributes_text` — every value pre-stringified at ingest time, backed by its own GIN index — so filtering could stay a single string-equality containment check against an all-string mirror. That traded a JSONB column and a GIN index of write cost, on *every* ingested row, for a query-time win the read path doesn't need often enough to justify: `attr.<key>` filtering isn't the hot path (`POST /logs` ingestion is), and no index backs the current predicate either — it relies on the same partition-pruned sequential scan `q=` substring search already uses, scoped by whatever `tenant_id`/`service`/`level`/time-range predicates the request already carries.

This was chosen over:

- **A separate EAV (key/value) table** — normalizes attributes into rows, but a 1M+ row `logs` table would need a join against a much larger attributes table for every filtered query, which is expensive exactly where the spec demands sub-second aggregation.
- **Keeping the `attributes_text` mirror column** — the original design; removed once it was clear the write cost it pays on every row wasn't buying a query-time win worth keeping, since `attr.<key>` filtering is not itself the throughput-critical path.

## Retention strategy

Retention is partition-based, not row-based, for the reasons in [Schema and index design](#schema-and-index-design) — dropping a partition is instant and bloat-free, deleting millions of rows is neither.

- `LOG_RETENTION_DAYS` (default `30`) — logs older than this are eligible for deletion.
- `LOG_PARTITION_DAYS_AHEAD` (default `7`) — daily partitions are kept pre-created this many days into the future, so ingestion never has to fall back to the `logs_default` catch-all partition under normal operation.
- Maintenance (`RetentionService`) runs once at application startup and once daily at midnight UTC (`@nestjs/schedule`), and:
  1. Drops any daily partition that has fully aged out of the retention window (`DROP TABLE`).
  2. Deletes any residual expired rows still sitting in `logs_default` (the only place row-level deletes happen, and only for the rare rows that landed outside a pre-created partition).
  3. Creates any missing daily partitions from the retention boundary through `LOG_PARTITION_DAYS_AHEAD` days ahead.
- **Rollup pruning rides along in the same maintenance run**, under the same advisory lock — no second lock, no second scheduled job. Fully-expired minute buckets in `log_rollups` are bulk-deleted outright (`DELETE FROM log_rollups WHERE bucket < cutoff`); the *one* bucket straddling the retention cutoff is adjusted by a relative delta computed in the same atomic statement as the `logs` rows it deletes for that bucket, never a recomputed absolute value — so a rollup adjustment racing a concurrent live ingestion upsert for the same bucket can never be silently overwritten regardless of which one commits first.
- A **PostgreSQL advisory lock** (`pg_try_advisory_lock`) guards the whole maintenance run, so if the app ever scales to multiple instances, only one performs retention maintenance at a time — the rest skip the run instead of racing.
- Creating a new daily partition briefly takes an `ACCESS EXCLUSIVE` lock on the parent `logs` table while handing off any rows that landed in `logs_default` for that day. In steady state this is a near-instant no-op (there are normally zero such rows, since partitions are created 7 days ahead of when they're needed) — it only becomes meaningful if partition creation has fallen behind, which the 7-day lead time is designed to prevent.
- **Retention is tenant-aware where it has to be, and deliberately not where it doesn't.** The retention *policy* (what's expired, on what schedule) stays system-wide across all tenants by design — there's no per-tenant retention configuration. But the row hand-off described above (moving rows from `logs_default` into a newly created named partition) is a raw SQL `INSERT ... SELECT` that must explicitly carry every column, including `tenant_id`, or it fails outright against `logs.tenant_id`'s `NOT NULL` constraint. This was caught and fixed before it could surface as a production incident — see `specs/001-multi-tenancy/research.md` Decision 13.

## Optional features

### Multi-tenancy

Implemented, **off by default**. `docker compose up` with no environment file, no arguments, and no manual setup still produces exactly the plain, unauthenticated core service described by the spec on all four required endpoints — verified end-to-end: `AUTH_ENABLED` unset, no credential on any request, and the response shapes are byte-for-byte identical to the pre-multi-tenancy contract. See `specs/001-multi-tenancy/quickstart.md` Scenario 1 for the reproducible steps.

| Variable | Default | Meaning |
| --- | --- | --- |
| `AUTH_ENABLED` | `false` | Master switch. `false`/unset → all four required endpoints behave exactly as the unauthenticated core service; an `Authorization` header, if sent anyway, is silently ignored, never rejected. |
| `LOADGEN_API_KEY` | *(unset)* | When `AUTH_ENABLED=true`, this key is idempotently seeded at startup — before the service reports healthy — scoped to one fixed internal tenant with ingest+query permission. Restarting with the same value never duplicates the tenant or the key. Left unset, the service still starts and stays healthy; it just has no seeded key. |
| `LOADGEN_TENANT_PASSWORD` | `please-change-me-in-production` | Login password for that same seeded tenant account, letting an operator `POST /tenants/login` as it to inspect/manage the seeded key by hand. Only takes effect on the tenant's first seed — like `LOADGEN_API_KEY`, changing it after the row already exists has no effect. |
| `JWT_SECRET` / `JWT_ACCESS_TOKEN_TTL_SECONDS` / `JWT_REFRESH_TOKEN_TTL_DAYS` | see [Configuration](#configuration) | Sign/verify Tenant account tokens (below). `JWT_SECRET`'s zero-config default is intentionally insecure, mirroring `DB_PASS`'s existing convention — override it for anything beyond local development or grading. |

**Two separate credential types, two separate purposes — never interchangeable:**

- **API keys** (`Authorization: Bearer lp_...`) — machine credentials for the log data-plane: `POST /logs`, `GET /logs`, `GET /logs/aggregate`. Every valid key resolves to exactly one tenant; tenant identity is derived only from the credential, never accepted as a request field. When `AUTH_ENABLED=false`, these three endpoints ignore credentials entirely and every request lands in one shared, fixed internal tenant — an issued key simply has no enforcement effect until `AUTH_ENABLED=true`.
- **Tenant access tokens** (JWTs, `Authorization: Bearer eyJ...`) — human/account-plane credentials for managing a Tenant's own account and API keys. **Always required, regardless of `AUTH_ENABLED`** — this is deliberate, not an oversight: presenting an API key to an account-management endpoint (or an access token to a log endpoint) returns `403`, not success.

A credential presented on the wrong surface, or missing where required, gets the same status codes used elsewhere in the API: `401` for missing/invalid/expired, `403` for the wrong credential type, `{"error": "<description>"}` in both cases.

**Self-service account flow** (no administrator role exists — a Tenant is a single customer account, not an organization):

| Endpoint | Guard | Purpose |
| --- | --- | --- |
| `POST /tenants/register` | none | Create a Tenant account (email + password) |
| `POST /tenants/login` | none | Exchange credentials for an access token (15 min) + refresh token (7 days) |
| `POST /tenants/refresh` | none | Rotate a refresh token for a new pair (single-use — the presented token is invalidated) |
| `POST /tenants/api-keys` | Tenant access token | Create a new API key for the caller's own account |
| `GET /tenants/api-keys` | Tenant access token | List the caller's own keys, **including each key's full secret** (retrievable anytime, not shown once — deliberate, see below) |
| `DELETE /tenants/api-keys/:id` | Tenant access token | Revoke one of the caller's own keys — rejected on the very next request, no grace period |

Runnable examples for every one of these live in [`requests/tenancy/`](requests/tenancy/); exact request/response shapes are in `specs/001-multi-tenancy/contracts/`.

**Notable design decisions** (full rationale in `specs/001-multi-tenancy/research.md`):

- Passwords (and refresh tokens) are hashed with `bcryptjs` — a pure-JS bcrypt implementation, chosen over native `bcrypt`/`argon2` specifically to avoid a native-binding dependency that would break the multi-stage Alpine Docker build (neither build stage installs a C/C++ toolchain). The input is SHA-256-prehashed first since bcrypt only uses the first 72 bytes of its input, and refresh tokens (~200+ character JWTs) would otherwise lose most of their entropy to silent truncation.
- API keys store their **full value in cleartext**, not hashed — a deliberate consequence of requiring keys to be retrievable again later via the list endpoint, not the industry-default "show once" pattern. Refresh tokens, which are never redisplayed, are hashed as usual.
- Guards are applied directly per-controller (`@UseGuards(...)`), not via a single global default-deny guard — this project previously shipped a bug from exactly that pattern (a controller meant to bypass a global guard forgot the opt-out decorator); per-controller guards make that entire bug class structurally impossible.

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
- **Write coalescing.** `LogRepository.insertMany()` no longer runs one `COPY` per `POST /logs` request; concurrent requests arriving within a short debounce window (`INGEST_COALESCE_WINDOW_MS`) are merged into a single, larger `COPY`, up to a row cap (`INGEST_COALESCE_MAX_ROWS`) — a single caller's own batch is never split across two flushes even if it alone exceeds the cap. Targets the concurrency-16 database-CPU bottleneck in [Preliminary measurements](#preliminary-measurements) above by reducing the number of separate transactions PostgreSQL has to commit under load, without changing `POST /logs`'s per-request response contract.
- **Aggregation rollups.** `log_rollups` pre-aggregates `logs` at minute granularity, updated atomically alongside every coalesced `COPY` (same transaction, same connection) so it can never drift out of sync after a crash. `GET /logs/aggregate` reads it for the bulk of an unfiltered range instead of scanning raw rows, falling back to a raw scan only for partial-minute edges and any `q=`/`attr.<key>=`-filtered request. See [Rollup table](#rollup-table).
- **Explicit write-pool sizing** (`DB_WRITE_POOL_MAX`) — the default/write connection pool no longer silently falls back to node-postgres's built-in size, mirroring the read pool's existing explicit `DB_READ_POOL_MAX`.
- **`attributes_text` mirror column removed** in favor of a type-branched containment predicate evaluated at query time (see [Attribute storage strategy](#attribute-storage-strategy)) — one fewer JSONB column and one fewer GIN index maintained on every ingested row.

## Known limitations

- **No formal, repeatable load-testing harness is currently in this repository.** The numbers in [Performance](#performance) are real measurements against the real constrained stack, but they come from ad hoc scripts, not a checked-in, reproducible suite. The full target scenario from the spec — sustained 15,000+ logs/sec, 1M rows, concurrent aggregation at 1 request/sec, p95 latency, and 20-second ingest-to-queryable visibility, all measured together — has not yet been formally executed and recorded. Rebuilding this harness is the top open item.
- **Tenant isolation has no automated test yet** (per this project's current no-`.test.`/`.spec.` convention) — it was verified manually instead, end-to-end against the real constrained stack: two tenants were self-registered, each given its own API key, and each ingested distinct, service-tagged logs. `GET /logs` (filtered and unfiltered), `GET /logs/aggregate`, and cursor-based pagination were all confirmed to return zero cross-tenant rows in both directions — including replaying one tenant's pagination cursor with the other tenant's key, which returned only that second tenant's own data, never the first's. See `specs/001-multi-tenancy/quickstart.md` Scenario 4 for the reproducible steps.
- **No unit or integration test suite yet.** CI runs a black-box HTTP smoke test (`docker compose up` + curl against all four endpoints) but there is no unit coverage for validators, cursor handling, or query builders, and no integration suite exercising edge cases (empty ranges, every rejection reason, full cursor pagination walks) against a real database.
- **The tenant-aware index redesign (above) hasn't been re-benchmarked against the external load-testing portal yet.** `idx_logs_tenant_timestamp_id` is a net-new index on the hottest write path in the system, added by reasoning about query patterns rather than by measurement. This project's own history (the GIN-trigram-index episode above) is direct evidence that assumption-based indexing decisions here can be wrong in exactly this way — the index strategy should be revisited, not defended, if a re-benchmark shows an ingestion regression.
- **Write coalescing, rollups, write-pool sizing, and the `attributes_text` removal (above) are implemented but not yet benchmarked against the external load-testing portal.** Each was verified locally for correctness (concurrent-request semantics, crash consistency, exact-match aggregation, response-shape stability — see `specs/002-performance-optimization/`), but per this project's own measured-not-assumed standard, none is considered validated until it shows a measurable improvement there; any that comes back flat or regresses another required metric must not be retained.
- **`tenant_refresh_tokens` rows are never purged** after `expires_at` passes or `revoked_at` is set. At the "tens of tenants" scale this project targets, the table's growth rate is immaterial, and a cleanup job (cron delete, or folding into `RetentionService`) is straightforward to add later without any schema change — this is an accepted, deliberately out-of-scope gap for this iteration, not an oversight.
- **No rate limiting or backpressure shedding.** Authentication and multi-tenancy are implemented (see [Optional features](#optional-features)), but the service still accepts load until PostgreSQL or the application container itself becomes the bottleneck, with no graceful `429`/`503` shedding in between.
- **Swagger UI is unavailable in the default (production) Compose posture** by design (`NODE_ENV=production` disables it) — use `requests/*.rest` for runnable examples instead, or set `NODE_ENV` to a non-production value to enable it.

## Project structure

See [docs/folderStructure.md](docs/folderStructure.md) for the full source layout and [projectSchema.dbml](projectSchema.dbml) for the database schema in DBML.
