# Phase 1 Data Model: Multi-Tenancy

Derived from spec.md's Key Entities, refined with the storage decisions from research.md. Field names use the project's existing `snake_case` DB / camelCase TypeScript convention (see `log.entity.ts`).

## Tenant

Maps to spec's **Tenant** entity — a single customer account (not an organization).

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, `gen_random_uuid()` default | Postgres 16 has `gen_random_uuid()` built in (core since PG13) — no `pgcrypto` extension needed. |
| `email` | `text` | `NOT NULL`, `UNIQUE` | Login identifier (spec Clarifications: email + password). Case-folded to lowercase before storage/comparison to avoid `Foo@x.com` / `foo@x.com` duplicate registration. |
| `password_hash` | `text` | `NOT NULL` | `scrypt$...` format — Decision 1. Never selected in any response DTO. |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT CURRENT_TIMESTAMP` | |

**Relationships**: A Tenant owns zero or more `ApiKey` rows and zero or more `TenantRefreshToken` rows (both via `tenant_id`, no DB-level FK — app-enforced, consistent with `logs.tenant_id`; see research.md Decision 6 for the no-FK rationale, which applies equally here since these are also low-cardinality, always-app-resolved references). A Tenant "owns" `Log` rows transitively through `logs.tenant_id`, also FK-free.

**Reserved tenant identifiers** (not self-registered; both defined as named constants in `src/common/constants/tenancy.constants.ts`):

| Constant | Has a `tenants` row? | Used when | See |
|---|---|---|---|
| `DEFAULT_TENANT_ID` | No — pure application-level constant, never inserted | `AUTH_ENABLED=false` (every request) | research.md Decision 6 |
| `LOADGEN_TENANT_ID` | **Yes** — a real, seeded `tenants` row, upserted idempotently via `ON CONFLICT (id) DO NOTHING` | `AUTH_ENABLED=true` + `LOADGEN_API_KEY` set, at startup | research.md Decision 9 |

These two constants must never collide with each other or with a `gen_random_uuid()`-generated self-registration id — both are fixed, hardcoded UUID literals reserved for exactly this purpose, distinct from the space TypeORM's default generator draws from.

**Validation rules** (enforced at the application layer via zod, mirroring `src/logs/validators/*`):
- `email`: valid email format, required.
- `password`: required, minimum length (e.g. 8 chars) — exact policy is an implementation detail, not spec-mandated.

**Lifecycle**: Created once via `POST /tenants/register`. No update/delete/deactivation operations in this iteration (spec Assumptions — explicitly out of scope).

## ApiKey

Maps to spec's **API Key** entity.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, `gen_random_uuid()` default | Used as the path parameter for revoke (`DELETE /tenants/api-keys/:id`) — never the key value itself, so the value never needs to appear in a URL/log line. |
| `tenant_id` | `uuid` | `NOT NULL` | No FK (Decision 6's rationale applies). Indexed (see Indexes below). |
| `key_value` | `text` | `NOT NULL`, `UNIQUE` | Full cleartext key, `lp_<32 base64url chars>` — Decision 5. Retrievable via list per spec's resolved clarification. |
| `status` | `text` (`'active' \| 'revoked'`) | `NOT NULL DEFAULT 'active'` | Simple two-state enum; see State Transitions below. Modeled as a Postgres `CHECK` constraint (mirrors the existing `log_level` pattern of a small closed enum) rather than a full `pg_enum` type, since it never needs the ordering/extensibility a real enum type would buy. |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT CURRENT_TIMESTAMP` | |
| `revoked_at` | `timestamptz` | nullable | Set when `status` transitions to `revoked`; `NULL` while active. |

**State transitions**:

```
active ──(Tenant revokes via DELETE /tenants/api-keys/:id)──> revoked
```

No transition back from `revoked` to `active` (spec: revoke is a one-way action; a Tenant wanting a new key creates a new one).

**Indexes**:
- `UNIQUE (key_value)` — doubles as the lookup index for `ApiKeyAuthGuard`'s per-request resolution (`WHERE key_value = $1 AND status = 'active'`), a single indexed equality point lookup.
- `(tenant_id)` — supports `GET /tenants/api-keys`'s "list my own keys" query and FR-023's ownership enforcement.

## TenantRefreshToken

Maps to spec's **Tenant Session (Refresh Token)** entity.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, `gen_random_uuid()` default | |
| `tenant_id` | `uuid` | `NOT NULL` | No FK, same rationale as above. Indexed. |
| `token_hash` | `text` | `NOT NULL`, `UNIQUE` | `scrypt` hash of the refresh token value — Decision 4 (never stored in cleartext, unlike API keys). |
| `expires_at` | `timestamptz` | `NOT NULL` | `created_at + 7 days` (Decision 3). |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT CURRENT_TIMESTAMP` | |
| `revoked_at` | `timestamptz` | nullable | Set when the token is consumed by rotation (Decision 3) or would be set by an explicit logout, if one is added later (not in this iteration's scope — see plan.md). |

**State transitions**:

```
issued (at login or by a prior rotation)
  ──(used at POST /tenants/refresh, while unexpired and unrevoked)──> new pair issued, this row's revoked_at set
  ──(expires_at passes without use)──> implicitly invalid (checked at verification time, not proactively deleted)
```

**Indexes**:
- `UNIQUE (token_hash)` — lookup index for refresh verification.
- `(tenant_id)` — supports future session-listing/bulk-revocation needs (not required by this iteration, but a natural, low-cost index given the column already exists for ownership checks).

## Log (existing entity, extended)

| Field | Change |
|---|---|
| `tenant_id` | **NEW**: `uuid NOT NULL`. No default at the column-definition level — every insert path must supply it explicitly, sourced from the resolved credential (API key → tenant, or `DEFAULT_TENANT_ID` when `AUTH_ENABLED=false`), never from request body content (FR-010). No FK (Decision 6). |

All other `Log` columns (`id`, `timestamp`, `level`, `service`, `message`, `attributes`, `attributes_text`, `ingested_at`) are unchanged. The table remains partitioned by `timestamp` (unchanged partitioning key — `tenant_id` does not participate in partitioning, per Decision 6/research.md's tens-of-tenants scale reasoning).

**Every insert path, not just ingestion**: `tenant_id` being `NOT NULL` with no default affects **two** distinct code paths that write rows into `logs`, both of which must be updated together and kept in sync:

1. **Ingestion** — `POST /logs`'s `COPY logs (...) FROM STDIN` (`src/logs/repositories/log.repository.ts` / `log-csv-encoder.ts`), sourcing `tenant_id` from the resolved request credential.
2. **Partition management** — `PartitionService.ensureDailyPartition()`'s (`src/retention/partition.service.ts`) internal re-insertion of rows from `logs_default` into a newly created named partition, sourcing `tenant_id` by simply carrying it through from the row being migrated (its `INSERT`/`SELECT` column lists must both include `tenant_id`, alongside the other columns already listed there). See research.md Decision 13 for the full failure mode this closes and why it was missed in the original plan.

The `Log` **TypeORM entity class** (`src/logs/entities/log.entity.ts`) must also gain a mapped `tenant_id` column and updated `@Index(...)` decorators matching the Indexes table below — this is what makes `log.tenant_id` a valid reference inside `applyLogFilters`'s query-builder predicate (research.md Decision 8), the same way `log.service`/`log.level` already are. This is a distinct piece of work from the migration files (raw SQL) and from `NewLog`/`LogFilters` (plain TypeScript interfaces) — all four (entity class, migrations, interfaces, `projectSchema.dbml`) must describe the same column and stay in sync.

**Indexes** (replacing the current two, per research.md Decision 10):

| Index | Columns | Serves |
|---|---|---|
| `idx_logs_tenant_timestamp_id` | `(tenant_id, timestamp DESC, id DESC)` | **NEW** — base tenant-scoped pagination with no `service`/`level` filter. |
| `idx_logs_tenant_service_timestamp_id` | `(tenant_id, service, timestamp DESC, id DESC)` | Replaces `idx_logs_service_timestamp_id`. |
| `idx_logs_tenant_level_timestamp_id` | `(tenant_id, level, timestamp DESC, id DESC)` | Replaces `idx_logs_level_timestamp_id`. |
| `idx_logs_attributes_text_gin` | unchanged | GIN containment, unaffected by tenant scoping. |

Primary key stays `(timestamp, id)` — `tenant_id` is not part of the PK (id is already globally unique via `GENERATED ALWAYS AS IDENTITY`, and the partition key must remain `timestamp` alone; see research.md Decision 6).

## Entity-relationship summary

```
Tenant (1) ──owns──> (0..N) ApiKey
Tenant (1) ──owns──> (0..N) TenantRefreshToken
Tenant (1) ──owns──> (0..N) Log   [via tenant_id, app-enforced, no DB FK]
```

No table has a foreign key to another in this feature — every relationship is enforced at the application layer, consistent with the existing schema's convention (the pre-existing `logs` table itself has zero foreign keys) and justified in research.md Decision 6 to keep the ingestion hot path free of FK-check overhead.
