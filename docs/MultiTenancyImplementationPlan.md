# Multi-Tenancy + System Administrator — Implementation Plan

> **Status:** Plan only. No implementation code has been written.
> **Audience:** Claude Sonnet, executing phase by phase.
> **Authoritative spec:** [`docs/Final_Project.md`](Final_Project.md) — *Optional Features and the Load Generator Contract*, *Authentication and API Keys*, *Multi-Tenancy*, *CI Requirement*, *Performance Targets*.
> **Date:** 2026-08-12

---

## 0. Executive summary

Evolve logPulse from a single-tenant log service into a multi-tenant one where **tenant identity is derived from an API key and never appears in the required API contract**, and add a **System Administrator** identity with JWT access/refresh authentication that owns tenant and API-key management.

Four decisions drive the entire design:

| # | Decision | Why |
| --- | --- | --- |
| **D1** | **Tenant context always exists; only *authentication* is optional.** With `AUTH_ENABLED=false` every request resolves to a seeded **default tenant** (`id = 1`). There is no "tenancy off" code path. | Removes `if (multiTenancyEnabled)` from controllers, services, repositories, and the ingestion path. One write path, always. |
| **D2** | **Read scoping is a typed value, not a boolean flag.** `TenantScope` is a discriminated union: `{ kind: 'unscoped' }` (auth off) or `{ kind: 'tenant', tenantId }` (auth on). It is a **required field** on `FindLogsQuery` / `AggregateLogsQuery`. | The compiler makes it impossible to build a log query without deciding the isolation scope. With auth off the emitted SQL is **byte-identical to today's**, protecting the graded performance posture. |
| **D3** | **Authentication is a strategy object chosen once at startup**, not a branch evaluated per request. `DisabledAuthenticationStrategy` vs `ApiKeyAuthenticationStrategy`. | The hot path (`POST /logs`, ~450 req/s at target) makes one polymorphic call. No header parsing at all when auth is off — which is also exactly what the spec demands ("an unrecognised `Authorization` header must be **ignored, not rejected**"). |
| **D4** | **API keys resolve from an in-process cache, never from PostgreSQL per request.** SHA-256 hash → `Map` lookup, refreshed on admin mutation and on a background TTL. | PostgreSQL is measured pinned at ~100% CPU and is the sole bottleneck (see `suggestions_to_increase_the_performance.md`). One extra DB round trip per ingest request would be catastrophic. |

Tenant API-key auth and System Administrator JWT auth are **completely separate subsystems** that share nothing but the config master switch. The required log endpoints never accept a JWT; the admin endpoints never accept an API key.

---

## 1. Hard constraints — verify against these before every commit

### 1.1 Load-generator contract (non-negotiable)

The external portal at `https://loadgen.foothilltech.net/` runs one generator against every submission. The following must remain **exactly** as they are today:

- Endpoint paths: `GET /health`, `POST /logs`, `GET /logs`, `GET /logs/aggregate`. No renames, no prefixes, no versioning.
- `POST /logs` request body: `{ "logs": [...] }`. **No tenant field.**
- `GET /logs` / `GET /logs/aggregate` query parameters: `service`, `level`, `since`, `until`, `attr.<key>`, `q`, `limit`, `cursor`, `bucket`, `group_by`. **No tenant parameter.**
  - ⚠️ `LOG_QUERY_PARAMETER_NAMES` / `LOG_AGGREGATION_PARAMETER_NAMES` in [src/common/constants/log-api.constants.ts](../src/common/constants/log-api.constants.ts) form an **allow-list** — any unknown parameter is a `400`. Do **not** add a tenant parameter to these arrays.
- Response shapes: `{accepted, rejected[]}`, `{logs[], next_cursor}`, `{buckets[]}`. Field names and types unchanged. **`tenant_id` must not appear in any response.**
- No new required header on any required endpoint.
- `GET /health` is always unauthenticated, in every configuration.

### 1.2 Default posture (this is the configuration that gets graded)

`docker compose up` with no `.env`, no arguments, no manual setup must yield:

- `AUTH_ENABLED` defaults to `false`.
- All four endpoints accept unauthenticated requests.
- An unrecognised `Authorization: Bearer <anything>` header is **silently ignored**, never rejected.
- No rate limit, quota, or tenancy restriction the generator can hit.
- **No `/admin/*` routes registered** (see §4.3) — nothing extra exposed in the graded build.

### 1.3 Auth-enabled contract

- `AUTH_ENABLED=true` + `LOADGEN_API_KEY` set → the key is **idempotently seeded at startup, before `/health` reports 200**, with ingest + query permission on exactly one tenant. Restarting must not invalidate it.
- `AUTH_ENABLED=true` + `LOADGEN_API_KEY` unset → service still starts and reports healthy, with no seeded key.
- Credential transport: `Authorization: Bearer <key>` must always work. `X-API-Key: <key>` additionally accepted. Never in query string or body.
- Status codes: `401` missing/malformed credential, `403` valid credential + insufficient scope. Both as `{"error": "<description>"}`. **Never `500`. Never `200` with an empty result set.**

### 1.4 CI requirement

The pipeline must run the required-contract smoke test in **both** configurations:

1. `AUTH_ENABLED=false` — all four endpoints reachable with no credentials.
2. `AUTH_ENABLED=true` + `LOADGEN_API_KEY` — all four reachable with the seeded bearer token, and rejected with `401` without it.

[.github/workflows/ci.yml](../.github/workflows/ci.yml) currently covers only (1) and states in a comment that no optional feature exists. Both the comment and the job matrix must change.

### 1.5 Project rules (from `CLAUDE.md` / `.wolf/cerebrum.md`)

- **Every DB entity change must be mirrored into [`projectSchema.dbml`](../projectSchema.dbml).**
- **Every new API endpoint gets its own `.rest` file** in `requests/`, named `<resource>.<action>.rest`.
- **Pre-release migration rule (2026-08-12):** changes to already-existing tables are **folded into the original creating migration**, not layered as a new `ALTER` migration. This applies to `logs.tenant_id`. Brand-new tables get brand-new migration files.
- Any `.env.example` change must be mirrored into `.env` in the same task, preserving existing secrets.
- Constants → `src/common/constants`, DTOs → `<feature>/dto`, interfaces → `<feature>/interfaces`, SQL construction → `<feature>/query-builders`, validation → `<feature>/validators` using **Zod**, repositories do persistence only.
- **No `.spec` / `.test` files.** Verification in this plan is manual (curl / REST Client) and via CI smoke jobs.

---

## 2. Architecture

### 2.1 Conceptual layering

```
┌──────────────────────────────────────────────────────────────────────┐
│ Transport                                                            │
│   LogsController          HealthController                           │
│   AdminAuthController     AdminTenantsController                     │
│                           AdminApiKeysController                     │
├──────────────────────────────────────────────────────────────────────┤
│ Access control (two independent subsystems, no shared code)          │
│   TenantAuthenticationGuard ──> AuthenticationStrategy               │
│        ├── DisabledAuthenticationStrategy   (AUTH_ENABLED=false)     │
│        └── ApiKeyAuthenticationStrategy     (AUTH_ENABLED=true)      │
│   AdminJwtGuard  ──> AdminTokenService (JWT verify)                  │
├──────────────────────────────────────────────────────────────────────┤
│ Tenant context (pure value objects, no framework, no I/O)            │
│   TenantContext { tenantId, scope, permissions }                     │
│   TenantScope   = { kind:'unscoped' } | { kind:'tenant', tenantId }  │
├──────────────────────────────────────────────────────────────────────┤
│ Application services                                                 │
│   LogIngestionService  LogQueryService  LogAggregationService        │
│   TenantService  ApiKeyService  AdminAuthService                     │
├──────────────────────────────────────────────────────────────────────┤
│ Persistence                                                          │
│   LogRepository (COPY + read pool)  TenantRepository                 │
│   ApiKeyRepository  AdminUserRepository  AdminRefreshTokenRepository │
├──────────────────────────────────────────────────────────────────────┤
│ Cross-cutting                                                        │
│   ApiKeyCacheService (hot-path resolution)                           │
│   AuthSeedService (default tenant + LOADGEN_API_KEY + readiness gate)│
│   AdminSeedService (initial System Administrator)                    │
│   RetentionService / PartitionService (tenant-agnostic, by design)   │
└──────────────────────────────────────────────────────────────────────┘
```

### 2.2 Why tenant context is passed explicitly, not via AsyncLocalStorage

`TenantContext` travels as an **explicit function argument**: controller → service → repository. A `@CurrentTenant()` param decorator reads it off the request object (where the guard placed it); everything below the controller receives it as a normal parameter.

Rejected: `AsyncLocalStorage` / `nestjs-cls`. Reasons: (a) it hides the isolation boundary that the whole feature exists to enforce — the opposite of what you want to defend in a demo; (b) it adds per-request async-context overhead on a path that is already CPU-constrained; (c) explicit parameters let the type system enforce isolation (§2.3), which ALS cannot.

### 2.3 Compile-time isolation enforcement

`FindLogsQuery` and `AggregateLogsQuery` gain a **required** `tenant: TenantScope` field. It is therefore impossible to construct a log query object without stating the scope — a forgotten scope is a build error, not a data leak.

```ts
export type TenantScope =
  | { readonly kind: 'unscoped' }
  | { readonly kind: 'tenant'; readonly tenantId: number };
```

A single function, `applyTenantScope()` in a dedicated query builder, translates the scope into SQL. It is the **only** place in the codebase that branches on tenancy:

```ts
export function applyTenantScope(qb, scope) {
  if (scope.kind === 'tenant') {
    qb.andWhere('log.tenant_id = :tenantId', { tenantId: scope.tenantId });
  }
  return qb;
}
```

`unscoped` emits nothing. With `AUTH_ENABLED=false` the generated SQL for `GET /logs` and `GET /logs/aggregate` is **identical to today's**, so the graded read path carries zero new predicate cost.

> **Trade-off, state it in the README:** `unscoped` reads mean that with auth disabled a query returns rows from *all* tenants. That is correct and required — with auth disabled the spec mandates the service behave exactly as the plain single-tenant core, and there is no credential from which to derive a tenant. If you prefer absolute purity over the graded posture, changing `DisabledAuthenticationStrategy` to return `{ kind: 'tenant', tenantId: DEFAULT_TENANT_ID }` is a one-line change — at the cost of one extra predicate on every graded read.

### 2.4 Writes are always tenant-attributed

Regardless of `AUTH_ENABLED`, `insertMany()` writes a concrete `tenant_id` on every row (the default tenant when auth is off). No nullable column, no NULL handling, no backfill later. Enabling auth on an existing database is therefore safe: pre-existing rows already belong to tenant 1.

---

## 3. Data model

### 3.1 `logs` — one new column

| Column | Type | Notes |
| --- | --- | --- |
| `tenant_id` | `INTEGER NOT NULL DEFAULT 1` | Placed **immediately after `level`** in the `CREATE TABLE` |

Decisions and their justifications (all demo-defensible):

- **`INTEGER` (4 bytes), not `UUID` (16 bytes) and not `BIGINT` (8).** At ~440 bytes/row measured, 4 bytes is ≈ +0.9% row width; a UUID would be ≈ +3.6%. This project is write-bound, and row width is being actively reduced right now (`suggestions_to_increase_the_performance.md` §1). Tenant counts here are in the tens, not billions. Placing it adjacent to the 4-byte `level` enum OID also gives the packer the best chance of absorbing it into existing alignment padding.
- **No foreign key to `tenants`.** An FK from a partitioned table installs a per-row RI trigger that does an index lookup into `tenants` on **every inserted row** — directly on the `COPY` hot path that is the measured bottleneck. Referential integrity is instead guaranteed structurally: a `tenant_id` can only enter the system from an authenticated `TenantContext`, which by construction came from a row in `tenants`. Document this explicitly as a deliberate trade-off.
- **No new index on `tenant_id` in phase 1.** Measured evidence: `idx_logs_level_timestamp_id` is 29% of total index size for a 4-value column and is being dropped for exactly this reason. The graded configuration has one tenant, where a `tenant_id` index is pure write cost with zero read benefit. Document the exact SQL to add later (§9.3) and the conditions under which it pays off.
- **`DEFAULT 1`** keeps ad-hoc SQL, the partition handoff `INSERT`, and any future migration safe without touching the app.

### 3.2 New tables

```sql
-- ─── enums ────────────────────────────────────────────────────────────
CREATE TYPE "tenant_status"   AS ENUM ('active', 'suspended', 'deleted');
CREATE TYPE "api_key_scope"   AS ENUM ('ingest', 'query');
CREATE TYPE "api_key_status"  AS ENUM ('active', 'revoked');
CREATE TYPE "admin_status"    AS ENUM ('active', 'disabled');

-- ─── tenants ──────────────────────────────────────────────────────────
CREATE TABLE "tenants" (
  "id"          INTEGER GENERATED BY DEFAULT AS IDENTITY,
  "name"        TEXT           NOT NULL,
  "slug"        TEXT           NOT NULL,
  "status"      "tenant_status" NOT NULL DEFAULT 'active',
  "created_at"  TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pk_tenants"        PRIMARY KEY ("id"),
  CONSTRAINT "uq_tenants_slug"   UNIQUE ("slug"),
  CONSTRAINT "chk_tenants_name_non_empty" CHECK (char_length("name") > 0),
  CONSTRAINT "chk_tenants_slug_format"    CHECK ("slug" ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$')
);

-- Reserved default tenant. GENERATED BY DEFAULT (not ALWAYS) so this
-- explicit insert needs no OVERRIDING clause.
INSERT INTO "tenants" ("id", "name", "slug")
VALUES (1, 'Default', 'default');
ALTER TABLE "tenants" ALTER COLUMN "id" RESTART WITH 2;

-- ─── api_keys ─────────────────────────────────────────────────────────
CREATE TABLE "api_keys" (
  "id"          INTEGER GENERATED BY DEFAULT AS IDENTITY,
  "tenant_id"   INTEGER          NOT NULL,
  "name"        TEXT             NOT NULL,
  "key_prefix"  TEXT             NOT NULL,          -- display only, e.g. 'lp_a1b2c3d4'
  "key_hash"    CHAR(64)         NOT NULL,          -- lowercase SHA-256 hex
  "scopes"      "api_key_scope"[] NOT NULL DEFAULT ARRAY['ingest','query']::"api_key_scope"[],
  "status"      "api_key_status" NOT NULL DEFAULT 'active',
  "expires_at"  TIMESTAMPTZ,
  "revoked_at"  TIMESTAMPTZ,
  "created_at"  TIMESTAMPTZ      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pk_api_keys"          PRIMARY KEY ("id"),
  CONSTRAINT "uq_api_keys_key_hash" UNIQUE ("key_hash"),
  CONSTRAINT "fk_api_keys_tenant"   FOREIGN KEY ("tenant_id")
    REFERENCES "tenants" ("id") ON DELETE CASCADE,
  CONSTRAINT "chk_api_keys_scopes_non_empty" CHECK (cardinality("scopes") > 0)
);
CREATE INDEX "idx_api_keys_tenant_id" ON "api_keys" ("tenant_id");

-- ─── admin_users ──────────────────────────────────────────────────────
CREATE TABLE "admin_users" (
  "id"            INTEGER GENERATED BY DEFAULT AS IDENTITY,
  "email"         TEXT           NOT NULL,   -- stored lowercased by the app
  "password_hash" TEXT           NOT NULL,   -- scrypt$N$r$p$<salt_b64>$<hash_b64>
  "status"        "admin_status" NOT NULL DEFAULT 'active',
  "created_at"    TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pk_admin_users"       PRIMARY KEY ("id"),
  CONSTRAINT "uq_admin_users_email" UNIQUE ("email")
);

-- ─── admin_refresh_tokens ─────────────────────────────────────────────
CREATE TABLE "admin_refresh_tokens" (
  "id"            BIGINT GENERATED BY DEFAULT AS IDENTITY,
  "admin_user_id" INTEGER     NOT NULL,
  "token_hash"    CHAR(64)    NOT NULL,   -- SHA-256 of the opaque refresh token
  "family_id"     UUID        NOT NULL,   -- rotation family, for reuse detection
  "expires_at"    TIMESTAMPTZ NOT NULL,
  "revoked_at"    TIMESTAMPTZ,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pk_admin_refresh_tokens"         PRIMARY KEY ("id"),
  CONSTRAINT "uq_admin_refresh_tokens_hash"    UNIQUE ("token_hash"),
  CONSTRAINT "fk_admin_refresh_tokens_admin"   FOREIGN KEY ("admin_user_id")
    REFERENCES "admin_users" ("id") ON DELETE CASCADE
);
CREATE INDEX "idx_admin_refresh_tokens_family" ON "admin_refresh_tokens" ("family_id");
```

**Deliberately omitted:** `api_keys.last_used_at`. Updating it would mean one `UPDATE` per authenticated request against the database that is already the bottleneck. Note the omission in the README as a conscious trade-off.

### 3.3 Migration files

Per the pre-release rule:

| Action | File |
| --- | --- |
| **Edit in place** | [src/migrations/1785684350114-CreateLogsTable.ts](../src/migrations/1785684350114-CreateLogsTable.ts) — add `"tenant_id" INTEGER NOT NULL DEFAULT 1` directly after `"level"` in the `CREATE TABLE` |
| **New** | `src/migrations/1785684350120-CreateTenancyEnums.ts` |
| **New** | `src/migrations/1785684350121-CreateTenantsTable.ts` (includes the default-tenant seed + sequence restart) |
| **New** | `src/migrations/1785684350122-CreateApiKeysTable.ts` |
| **New** | `src/migrations/1785684350123-CreateAdminTables.ts` |

Timestamps must sort **after** `1785684350117-DropLogsMessageTrigramIndex`. Numbering leaves 118/119 free for the in-flight perf work.

Because `1785684350114` is edited in place, the dev database must be reset so migrations rerun from the edited source:

```sql
DROP SCHEMA public CASCADE; CREATE SCHEMA public;
```

(Same procedure used for the `attributes_text` removal on 2026-08-12.) Then `docker compose up -d --build`.

### 3.4 `projectSchema.dbml`

Mandatory per `CLAUDE.md`. Add `tenant_id` to `logs`, add the four new tables, the four new enums, and `Ref` lines for `api_keys.tenant_id > tenants.id` and `admin_refresh_tokens.admin_user_id > admin_users.id`. Add a note on `logs.tenant_id` recording that the FK is intentionally absent.

---

## 4. Configuration

### 4.1 Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `AUTH_ENABLED` | `false` | Master switch for tenant API-key auth **and** the admin subsystem |
| `LOADGEN_API_KEY` | unset | Key seeded at startup with `ingest` + `query` on the load-generator tenant |
| `LOADGEN_TENANT_SLUG` | `loadgen` | Slug of the tenant the seeded key resolves to |
| `ADMIN_EMAIL` | `admin@logpulse.local` | Initial System Administrator |
| `ADMIN_PASSWORD` | unset | If unset, a random one is generated and printed **once** at startup |
| `ADMIN_JWT_SECRET` | unset | If unset, a random secret is generated at startup (tokens then die on restart — warn loudly) |
| `ADMIN_ACCESS_TOKEN_TTL` | `15m` | Access-token lifetime |
| `ADMIN_REFRESH_TOKEN_TTL` | `7d` | Refresh-token lifetime |
| `API_KEY_CACHE_REFRESH_MS` | `30000` | Background reconciliation interval for the key cache |

Rules:

- An **empty string** for `LOADGEN_API_KEY`, `ADMIN_PASSWORD`, or `ADMIN_JWT_SECRET` must be treated as **unset** (Compose interpolation yields `""`, not absence).
- `AUTH_ENABLED` is true **only** for the exact string `'true'` (case-insensitive). Anything else, including unset, is false.
- Mirror every addition into both [.env.example](../.env.example) **and** `.env`.

### 4.2 New config module

`src/config/auth.config.ts`, matching the plain-function style of [src/config/database.config.ts](../src/config/database.config.ts):

```ts
export interface AuthConfiguration {
  readonly enabled: boolean;
  readonly loadgenApiKey?: string;
  readonly loadgenTenantSlug: string;
  readonly admin: {
    readonly email: string;
    readonly password?: string;
    readonly jwtSecret: string;      // resolved: env value or generated
    readonly accessTokenTtl: string;
    readonly refreshTokenTtl: string;
  };
  readonly apiKeyCacheRefreshMs: number;
}

export function createAuthConfiguration(): AuthConfiguration;
```

Provided once via a Nest provider token (`AUTH_CONFIGURATION`) so nothing below reads `process.env` directly. Constants (defaults, the `lp_` key prefix, header names, cache TTL default) go in `src/common/constants/auth.constants.ts`.

### 4.3 Module registration gating

```ts
// app.module.ts
const authConfiguration = createAuthConfiguration();

imports: [
  ...,
  TenancyModule.forRoot(authConfiguration),
  ...(authConfiguration.enabled ? [AdminModule.forRoot(authConfiguration)] : []),
]
```

- `TenancyModule` is **always** registered — the default tenant and the global guard exist in both configurations (the guard short-circuits when disabled).
- `AdminModule` is registered **only when `AUTH_ENABLED=true`**. In the graded build, `/admin/*` routes simply do not exist (404), no admin password is seeded, and no JWT secret is generated. Smallest possible attack surface in the default posture, and it matches the spec's description of `AUTH_ENABLED` as the master switch for all authentication and authorization.
- If a future admin frontend needs to run without tenant auth, add `ADMIN_ENABLED` defaulting to the value of `AUTH_ENABLED`. Do not add it now.

### 4.4 `docker-compose.yml`

Add to the `app` service `environment:` block (defaults preserve the zero-config posture exactly):

```yaml
AUTH_ENABLED: ${AUTH_ENABLED:-false}
LOADGEN_API_KEY: ${LOADGEN_API_KEY:-}
LOADGEN_TENANT_SLUG: ${LOADGEN_TENANT_SLUG:-loadgen}
ADMIN_EMAIL: ${ADMIN_EMAIL:-admin@logpulse.local}
ADMIN_PASSWORD: ${ADMIN_PASSWORD:-}
ADMIN_JWT_SECRET: ${ADMIN_JWT_SECRET:-}
ADMIN_ACCESS_TOKEN_TTL: ${ADMIN_ACCESS_TOKEN_TTL:-15m}
ADMIN_REFRESH_TOKEN_TTL: ${ADMIN_REFRESH_TOKEN_TTL:-7d}
```

No change to ports, resource limits, or the PostgreSQL `command:` tuning block.

---

## 5. Target folder structure

```
src/
├── common/constants/
│   └── auth.constants.ts                          NEW
├── config/
│   └── auth.config.ts                             NEW
│
├── tenancy/                                       NEW MODULE
│   ├── tenancy.module.ts                          (forRoot, registers APP_GUARD)
│   ├── entities/
│   │   ├── tenant.entity.ts
│   │   └── api-key.entity.ts
│   ├── enums/
│   │   ├── tenant-status.enum.ts
│   │   ├── api-key-scope.enum.ts
│   │   └── api-key-status.enum.ts
│   ├── interfaces/
│   │   ├── tenant-context.interface.ts            TenantContext, TenantScope
│   │   ├── api-key-record.interface.ts            cached shape
│   │   └── authentication-strategy.interface.ts
│   ├── strategies/
│   │   ├── disabled-authentication.strategy.ts
│   │   └── api-key-authentication.strategy.ts
│   ├── guards/
│   │   └── tenant-authentication.guard.ts
│   ├── decorators/
│   │   ├── allow-anonymous.decorator.ts
│   │   ├── current-tenant.decorator.ts
│   │   └── requires-scope.decorator.ts
│   ├── repositories/
│   │   ├── tenant.repository.ts
│   │   └── api-key.repository.ts
│   ├── services/
│   │   ├── tenant.service.ts
│   │   ├── api-key.service.ts
│   │   ├── api-key-cache.service.ts
│   │   └── auth-seed.service.ts
│   ├── validators/
│   │   ├── tenant.schema.ts
│   │   └── api-key.schema.ts
│   ├── dto/requests/  { create-tenant.dto.ts, update-tenant.dto.ts,
│   │                    list-tenants.dto.ts, create-api-key.dto.ts }
│   ├── dto/responses/ { tenant-response.dto.ts, tenant-list-response.dto.ts,
│   │                    api-key-response.dto.ts, created-api-key-response.dto.ts }
│   └── utils/
│       └── api-key.utils.ts                       generate / hash / prefix
│
├── admin/                                         NEW MODULE (auth-enabled only)
│   ├── admin.module.ts
│   ├── entities/
│   │   ├── admin-user.entity.ts
│   │   └── admin-refresh-token.entity.ts
│   ├── enums/admin-status.enum.ts
│   ├── interfaces/ { admin-token.interface.ts, admin-principal.interface.ts }
│   ├── auth/
│   │   ├── admin-auth.controller.ts               POST login / refresh / logout
│   │   ├── admin-auth.service.ts
│   │   ├── admin-token.service.ts                 JWT sign/verify + rotation
│   │   ├── admin-jwt.guard.ts
│   │   ├── admin-seed.service.ts
│   │   └── password.utils.ts                      node:crypto scrypt
│   ├── controllers/
│   │   ├── admin-tenants.controller.ts            /admin/tenants
│   │   └── admin-api-keys.controller.ts           /admin/tenants/:id/api-keys
│   ├── repositories/
│   │   ├── admin-user.repository.ts
│   │   └── admin-refresh-token.repository.ts
│   ├── validators/ { admin-auth.schema.ts }
│   ├── decorators/current-admin.decorator.ts
│   └── dto/requests|responses/…
│
└── logs/                                          MODIFIED
    ├── logs.controller.ts                         + @CurrentTenant(), @RequiresScope()
    ├── interfaces/log-query.interface.ts          + tenant: TenantScope (required)
    ├── interfaces/log-repository.interface.ts     + tenantId on NewLog
    ├── entities/log.entity.ts                     + tenant_id column
    ├── mappers/log.mapper.ts                      + tenantId param
    ├── repositories/log-csv-encoder.ts            + tenant_id field
    ├── repositories/log.repository.ts             + tenant_id in COPY column list
    ├── query-builders/tenant-scope.builder.ts     NEW — the only tenancy branch
    ├── query-builders/log-query.builder.ts        calls applyTenantScope
    ├── query-builders/aggregation-query.builder.ts calls applyTenantScope
    └── services/*.service.ts                      accept TenantContext
```

Update [docs/folderStructure.md](folderStructure.md) to match (it is currently stale relative to the real tree anyway).

---

## 6. Phased implementation

Each phase ends in a compiling, runnable state. Run `npm run format`, `npm run lint`, `npm run build` at the end of every phase.

---

### Phase 1 — Schema and migrations

**Goal:** database has tenancy columns and tables; nothing uses them yet.

1. Edit `src/migrations/1785684350114-CreateLogsTable.ts`: add `"tenant_id" INTEGER NOT NULL DEFAULT 1` immediately after the `"level"` column.
2. Add `tenant_id: number` to [src/logs/entities/log.entity.ts](../src/logs/entities/log.entity.ts) as `@Column({ type: 'int', default: 1 })`, declared after `level`.
3. Create the four new migration files from the SQL in §3.2. Each with a working `down()`.
4. Create the entities: `Tenant`, `ApiKey`, `AdminUser`, `AdminRefreshToken`, plus the four enums. Entity globs (`**/*.entity{.ts,.js}`) pick them up automatically in both [database.config.ts](../src/config/database.config.ts) and [data-source.ts](../src/config/data-source.ts) — no registration change needed.
5. Update `PartitionService.ensureDailyPartition()` in [src/retention/partition.service.ts](../src/retention/partition.service.ts): the handoff `INSERT INTO "logs" (...) SELECT ...` lists columns explicitly — **add `"tenant_id"` to both lists** (lines ~122-140). Missing this silently resets rows to the default tenant during a partition handoff.
6. Update `projectSchema.dbml`.
7. Reset the dev database (`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`), rebuild, confirm `/health` → 200 and `\d logs` shows `tenant_id`.

**Exit check:** `POST /logs` still works end to end (rows land with `tenant_id = 1` via the column default), `GET /logs` and `GET /logs/aggregate` unchanged.

---

### Phase 2 — Tenant context core

**Goal:** the domain types and the strategy indirection exist; still no behavior change.

1. `src/tenancy/interfaces/tenant-context.interface.ts`:
   ```ts
   export type TenantScope =
     | { readonly kind: 'unscoped' }
     | { readonly kind: 'tenant'; readonly tenantId: number };

   export interface TenantContext {
     readonly tenantId: number;        // always concrete — writes need it
     readonly scope: TenantScope;      // how reads are filtered
     readonly scopes: readonly ApiKeyScope[];
   }
   ```
2. `src/common/constants/auth.constants.ts`: `DEFAULT_TENANT_ID = 1`, `DEFAULT_TENANT_SLUG = 'default'`, `API_KEY_PREFIX = 'lp_'`, `API_KEY_BYTES = 32`, `API_KEY_DISPLAY_PREFIX_LENGTH = 8`, `AUTHORIZATION_HEADER`, `BEARER_SCHEME`, `API_KEY_HEADER = 'x-api-key'`, `DEFAULT_API_KEY_CACHE_REFRESH_MS = 30_000`.
3. `src/config/auth.config.ts` per §4.2.
4. `src/tenancy/interfaces/authentication-strategy.interface.ts`:
   ```ts
   export interface AuthenticationStrategy {
     authenticate(request: Request): TenantContext;  // throws Unauthorized
   }
   export const AUTHENTICATION_STRATEGY = Symbol('AUTHENTICATION_STRATEGY');
   ```
5. `DisabledAuthenticationStrategy` — returns a frozen singleton `{ tenantId: 1, scope: { kind: 'unscoped' }, scopes: ['ingest','query'] }`. **Never inspects the request.** This is what makes an unrecognised `Authorization` header a no-op rather than a rejection.
6. `src/tenancy/tenancy.module.ts` with `forRoot(config)`, binding `AUTHENTICATION_STRATEGY` to the disabled or API-key strategy based on `config.enabled`.

---

### Phase 3 — Thread tenancy through the log domain

**Goal:** every read and write is tenant-attributed. With auth off, behavior and SQL are unchanged.

1. `src/logs/query-builders/tenant-scope.builder.ts` — `applyTenantScope()` per §2.3.
2. [log-query.interface.ts](../src/logs/interfaces/log-query.interface.ts): add `tenant: TenantScope` as a **required** field on `FindLogsQuery` and `AggregateLogsQuery`. Do **not** put it on `LogFilters` — tenancy is an isolation boundary, not a user-supplied filter.
3. [log-repository.interface.ts](../src/logs/interfaces/log-repository.interface.ts): add `tenantId: number` to `NewLog`.
4. [log-query.builder.ts](../src/logs/query-builders/log-query.builder.ts) and [aggregation-query.builder.ts](../src/logs/query-builders/aggregation-query.builder.ts): call `applyTenantScope(qb, query.tenant)` alongside `applyLogFilters`.
5. [log-csv-encoder.ts](../src/logs/repositories/log-csv-encoder.ts): emit `tenant_id` as the field matching its position in the COPY column list. It is a number — emit it unquoted (or quoted for consistency; both parse correctly in CSV, but keep the existing all-quoted style for uniformity).
6. [log.repository.ts](../src/logs/repositories/log.repository.ts): add `tenant_id` to the `COPY logs (...)` column list, in the **same order** as the encoder. Order mismatch here is the single most likely bug in this whole plan — verify with one round-trip insert before moving on.
7. [log.mapper.ts](../src/logs/mappers/log.mapper.ts): `mapLogEntryToNewLog(entry, tenantId)`. `mapLogToResponse()` is **unchanged** — `tenant_id` must never appear in a response.
8. Services take `TenantContext` as a parameter:
   - `LogIngestionService.ingest(value, context)` → `mapLogEntryToNewLog(entry, context.tenantId)`
   - `LogQueryService.query(value, context)` → `{ ...filters, tenant: context.scope }`
   - `LogAggregationService.aggregate(value, context)` → same
9. [logs.controller.ts](../src/logs/logs.controller.ts): add `@CurrentTenant() tenant: TenantContext` to all three handlers. **Do not touch DTOs, query-parameter allow-lists, or response shapes.**
10. `@CurrentTenant()` param decorator reads `request.tenantContext`, falling back to the disabled-strategy singleton if absent (defensive — the guard always sets it).

**Exit check:** with no auth configured, `POST /logs` → `{"accepted":1,"rejected":[]}`; `GET /logs` returns rows; `EXPLAIN` on the query shows **no `tenant_id` predicate**.

---

### Phase 4 — API-key authentication

**Goal:** `AUTH_ENABLED=true` enforces per-tenant isolation on all three data endpoints.

1. **`api-key.utils.ts`**
   - `generateApiKey()` → `lp_` + `randomBytes(32).toString('base64url')`.
   - `hashApiKey(key)` → `createHash('sha256').update(key).digest('hex')`.
   - `getDisplayPrefix(key)` → first 8 characters after `lp_`.
   - **Why SHA-256 and not bcrypt/argon2:** API keys are 256 bits of CSPRNG output, so there is no dictionary to slow down — the reason for a memory-hard KDF does not apply. A slow KDF here would put ~100 ms of CPU on every ingest request on a 0.5-CPU container. Document this reasoning; a reviewer *will* ask.
2. **`ApiKeyCacheService`**
   - Holds `Map<string /* key_hash */, CachedApiKey>` where `CachedApiKey = { tenantId, scopes, status, tenantStatus, expiresAt }`.
   - `load()` on module init: one `SELECT` joining `api_keys` → `tenants`.
   - `resolve(hash)`: pure in-memory lookup, no I/O.
   - `invalidate()` / `upsert()` / `remove()` called synchronously by `ApiKeyService` and `TenantService` on every mutation, so a single-instance deployment is immediately consistent.
   - `@Interval(API_KEY_CACHE_REFRESH_MS)` background reload so multi-instance deployments converge within one interval. Document the window as a known limitation.
3. **`ApiKeyAuthenticationStrategy`**
   - Extract credential: `Authorization: Bearer <key>` first; fall back to `X-API-Key: <key>`. Never read query string or body.
   - Missing / malformed / unknown / revoked / expired → `UnauthorizedException('...')` → **401**.
   - Key valid but tenant `suspended` or `deleted` → `ForbiddenException` → **403**.
   - Returns `{ tenantId, scope: { kind: 'tenant', tenantId }, scopes }`.
4. **`TenantAuthenticationGuard`** (global via `APP_GUARD` in `TenancyModule`)
   - Skips when `@AllowAnonymous()` is present on the handler or class.
   - Calls `strategy.authenticate(request)`, assigns `request.tenantContext`.
   - Reads `@RequiresScope(...)` metadata; if the required scope is missing from `context.scopes` → `ForbiddenException` → **403**.
   - Ordering note: `DisabledAuthenticationStrategy` ignores scope requirements entirely (it grants both), so the graded path never fails a scope check.
5. **Decorators:** `@AllowAnonymous()` on `HealthController` and on every admin controller (admin routes are protected by their own JWT guard, not by an API key). `@RequiresScope(ApiKeyScope.Ingest)` on `POST /logs`; `@RequiresScope(ApiKeyScope.Query)` on both `GET` handlers.
6. **`AuthSeedService`** (`OnModuleInit`, runs in both configurations)
   - Ensure the default tenant exists (idempotent — the migration already inserts it; this is belt and braces).
   - When `enabled && loadgenApiKey`: upsert the load-generator tenant by slug, then upsert the key by `key_hash` with `scopes = ['ingest','query']` — `ON CONFLICT (key_hash) DO UPDATE` so restarts never invalidate it.
   - When `enabled && !loadgenApiKey`: log an info line, do nothing else, stay healthy.
   - Set a `ready` flag when finished. **Wire this into `HealthService.check()`**: when auth is enabled, `/health` returns 200 only after seeding completes. This is what satisfies "idempotently seed that key at startup, **before reporting healthy**".
7. **`HealthService`** gains an injected readiness source and one extra condition. `GET /health` itself stays `@AllowAnonymous()` in every configuration.

**Exit checks (manual, `AUTH_ENABLED=true`, `LOADGEN_API_KEY=test-key-123`):**

| Request | Expected |
| --- | --- |
| `GET /health` (no credential) | `200` |
| `POST /logs` (no credential) | `401` + `{"error": ...}` |
| `POST /logs` `Authorization: Bearer test-key-123` | `200` + `{"accepted":N,...}` |
| `POST /logs` `X-API-Key: test-key-123` | `200` |
| `GET /logs?limit=5` with the key | `200`, only that tenant's rows |
| `GET /logs` with a query-only key | `200`; `POST /logs` with the same key → `403` |
| restart the stack, reuse the same key | still `200` (idempotent seeding) |
| Two tenants, key A, query for data ingested under key B | `200` with **zero** rows from B |

---

### Phase 5 — System Administrator authentication

**Goal:** admin login, access token, refresh rotation. Registered only when `AUTH_ENABLED=true`.

1. **Dependency:** add `@nestjs/jwt` to `dependencies`. **No password-hashing dependency** — use `node:crypto`'s `scrypt`, which is memory-hard, built in, and needs no native build on Alpine (`bcrypt`/`argon2` prebuild issues under musl are a real deployment risk on `node:24-alpine`).
2. **`password.utils.ts`**
   - `hashPassword(plain)` → `scrypt` with `N=16384, r=8, p=1`, 16-byte random salt, 64-byte output; encoded `scrypt$16384$8$1$<salt_b64>$<hash_b64>`.
   - `verifyPassword(plain, encoded)` → re-derive with the stored parameters, compare with `timingSafeEqual`.
   - Unlike API keys, a human password **is** low-entropy, so the slow KDF is correct here. Login is rare, so its cost is irrelevant to throughput. State both halves of this reasoning in the README — the asymmetry with §Phase 4.1 is the interesting design point.
3. **`AdminTokenService`**
   - Access token: JWT, HS256, `{ sub: adminId, email, type: 'access' }`, TTL `ADMIN_ACCESS_TOKEN_TTL`.
   - Refresh token: **opaque random string**, not a JWT. SHA-256 hashed into `admin_refresh_tokens` with a `family_id`. Opaque + server-stored is what makes revocation and reuse detection possible at all.
   - `rotate(refreshToken)`: verify hash exists, is unrevoked and unexpired → revoke it, issue a new pair in the **same family**. If a token that is already revoked is presented, revoke the **entire family** (reuse detection — a stolen token was replayed) and return `401`.
   - Secret resolution: `ADMIN_JWT_SECRET` if set; otherwise `randomBytes(48).toString('base64url')` generated at startup with a `Logger.warn` that tokens will not survive a restart.
4. **Endpoints** (all `@AllowAnonymous()` w.r.t. the tenant guard):
   - `POST /admin/auth/login` — `{ email, password }` → `{ access_token, refresh_token, expires_in, token_type: 'Bearer' }`. Wrong email and wrong password return the **same** `401` message and take a comparable amount of time (always run `verifyPassword` against a dummy hash when the user is not found) — no user enumeration.
   - `POST /admin/auth/refresh` — `{ refresh_token }` → new pair.
   - `POST /admin/auth/logout` — `{ refresh_token }` → revokes the family. `204`.
5. **`AdminJwtGuard`** — validates `Authorization: Bearer <jwt>`, rejects `type !== 'access'`, loads/attaches the admin principal, `401` on any failure. Applied to every controller under `/admin` **except** the auth controller's login/refresh/logout.
6. **`AdminSeedService`** (`OnModuleInit`)
   - Idempotent by email: if an admin with `ADMIN_EMAIL` exists, do nothing (never overwrite an existing password).
   - If `ADMIN_PASSWORD` is set, use it. If unset, generate `randomBytes(18).toString('base64url')` and print it **once**, clearly banner-marked, at `Logger.warn` level.
   - **Never** ship a hardcoded default password.
7. Validation via **Zod** schemas in `src/admin/validators/`, consistent with `src/logs/validators/` (`parseWithSchema` + the existing `GlobalExceptionFilter` envelope).
8. Swagger: add `.addBearerAuth()` to the `DocumentBuilder` in [main.ts](../src/main.ts) and tag `admin`.

---

### Phase 6 — Tenant and API-key management API

All endpoints require a valid System Administrator access token. All live under `/admin`, none touch the required contract.

| Method | Path | Purpose | Success |
| --- | --- | --- | --- |
| `GET` | `/admin/tenants` | List tenants (`?status=`, `?limit=`, `?offset=`) | `200 {tenants[], total}` |
| `GET` | `/admin/tenants/:id` | Fetch one | `200` / `404` |
| `POST` | `/admin/tenants` | Create `{name, slug?}` (slug auto-derived from name if omitted) | `201` |
| `PATCH` | `/admin/tenants/:id` | Update `{name?, status?}` | `200` |
| `DELETE` | `/admin/tenants/:id` | Soft-delete (see below) | `204` |
| `GET` | `/admin/tenants/:id/api-keys` | List keys (metadata only — never the secret) | `200` |
| `POST` | `/admin/tenants/:id/api-keys` | Create `{name, scopes[], expires_at?}` | `201` — **the only response that ever contains the raw key** |
| `DELETE` | `/admin/tenants/:tenantId/api-keys/:keyId` | Revoke | `204` |

Design notes:

- **`PATCH`, not `PUT`** — partial update; `slug` is immutable after creation (it is the stable external handle).
- **Raw keys are shown exactly once**, at creation. Only `key_hash` is stored; `key_prefix` is returned thereafter for identification. There is no "reveal key" endpoint, by design.
- **Every mutation that can affect authentication must synchronously update `ApiKeyCacheService`**: tenant status change, tenant deletion, key creation, key revocation. Missing one means a revoked key keeps working for up to `API_KEY_CACHE_REFRESH_MS`.
- **`DELETE /admin/tenants/:id` is a soft delete.** It sets `status = 'deleted'`, revokes all of the tenant's API keys, and evicts them from the cache — so the tenant immediately loses all access. Its log rows are **not** deleted synchronously.

  **Why:** a tenant can own millions of rows spread across every daily partition. A synchronous `DELETE FROM logs WHERE tenant_id = $1` would hold locks and generate WAL across ~30 partitions while ingestion is running — precisely the "long-running locks, excessive table bloat, or major ingestion disruption" the spec's Retention criterion penalises. The rows instead age out through the existing time-based partition drop within `LOG_RETENTION_DAYS`. Document this explicitly.

  Optionally add `DELETE /admin/tenants/:id?purge=true`, which enqueues a **chunked background purge** (`DELETE FROM logs WHERE ctid = ANY(ARRAY(SELECT ctid FROM logs WHERE tenant_id = $1 LIMIT 5000))` in a loop with a short sleep between batches, guarded by the same `pg_try_advisory_lock` pattern `RetentionService` already uses). Treat this as a stretch item — soft delete alone satisfies the requirement.

- The default tenant (`id = 1`) and the load-generator tenant cannot be deleted — return `409` with a clear message. Deleting them would break the zero-config posture.
- `TenantService` and `ApiKeyService` live in **`src/tenancy/services/`** (domain), while the controllers live in **`src/admin/controllers/`** (transport). `AdminModule` imports `TenancyModule`. This keeps "tenant management" and "admin authentication" as separate concerns that happen to meet at the controller.

**`.rest` files** — one per endpoint, per `CLAUDE.md`:

```
requests/admin.auth.login.rest
requests/admin.auth.refresh.rest
requests/admin.auth.logout.rest
requests/admin.tenants.list.rest
requests/admin.tenants.get.rest
requests/admin.tenants.create.rest
requests/admin.tenants.update.rest
requests/admin.tenants.delete.rest
requests/admin.api-keys.list.rest
requests/admin.api-keys.create.rest
requests/admin.api-keys.revoke.rest
```

Also add an auth-enabled variant block to the three existing log `.rest` files showing the `Authorization: Bearer` header (as an **additional** example — keep the existing unauthenticated ones).

---

### Phase 7 — Infrastructure and CI

1. **`docker-compose.yml`** — env block from §4.4.
2. **`.env.example` and `.env`** — all nine new variables, mirrored (cerebrum rule).
3. **`.github/workflows/ci.yml`** — restructure the `smoke` job into a matrix over two configurations:

   ```yaml
   smoke:
     name: Required-Contract Smoke Test (${{ matrix.mode }})
     needs: build
     strategy:
       fail-fast: false
       matrix:
         include:
           - mode: auth-disabled
             auth_enabled: 'false'
             loadgen_api_key: ''
           - mode: auth-enabled
             auth_enabled: 'true'
             loadgen_api_key: 'ci-loadgen-key-please-change'
   ```

   - Export `AUTH_ENABLED` / `LOADGEN_API_KEY` before `docker compose up -d --build` so Compose interpolation picks them up.
   - **`auth-disabled` steps stay exactly as they are today**, plus one new assertion: a request carrying a bogus `Authorization: Bearer nonsense` header must still return `200` — this is the spec's "ignored, not rejected" rule and is the single most likely regression to break the load generator.
   - **`auth-enabled` steps:** `GET /health` unauthenticated → `200`; each of the three data endpoints with the bearer token → `200`; each of the three **without** a token → `401`; and one restart-idempotency check (`docker compose restart app`, wait for health, re-authenticate with the same key → `200`).
   - Update the stale comment block at lines 75-81 that asserts no optional feature exists.
4. **`Dockerfile`** — no change required (`@nestjs/jwt` is a normal dependency; nothing native is added — this is the payoff for choosing `scrypt`).

---

### Phase 8 — Documentation

| File | Required changes |
| --- | --- |
| [README.md](../README.md) | See breakdown below |
| [projectSchema.dbml](../projectSchema.dbml) | New tables/enums/refs + `logs.tenant_id` (already in Phase 1) |
| [docs/entities.md](entities.md) | New entity documentation for `Tenant`, `ApiKey`, `AdminUser`, `AdminRefreshToken`; `tenant_id` on `Log` |
| [docs/FunctionalRequirements.md](FunctionalRequirements.md) | New sections: tenant isolation, API-key auth, admin auth, tenant management |
| [docs/NonFunctionalRequirements.md](NonFunctionalRequirements.md) | Security requirements (hashing, token handling), plus the measured performance delta |
| [docs/folderStructure.md](folderStructure.md) | Regenerate to match the real tree including `tenancy/` and `admin/` |
| `.wolf/anatomy.md`, `.wolf/STATUS.md`, `.wolf/cerebrum.md` | Per the OpenWolf protocol |

**README sections to add or rewrite:**

1. **Optional features** — currently reads *"**None are implemented.**"* (line 241). Replace with a table: feature / default state / controlling variables, and an explicit statement that `docker compose up` with no configuration yields the plain core service.
2. **Configuration** — the nine new variables; remove the line at 82 stating no auth/multi-tenancy variables exist.
3. **Authentication behaviour** — credential transport, the 401/403 table, the "ignored not rejected" rule, `GET /health` always exempt.
4. **Multi-tenancy** — the `TenantScope` model, why tenancy is transparent to the required contract, the seeded-key → single-tenant guarantee, and the "unscoped reads with auth off" trade-off.
5. **System Administrator** — what it is, why it is separate from tenant auth, login/refresh flow, token lifetimes, refresh rotation with reuse detection, seeding and the generated-password behaviour.
6. **Tenant-management API** — endpoint table, the show-key-once rule, the soft-delete rationale.
7. **Schema and index design** — `tenant_id` sizing rationale; **why there is no FK** and **why there is no tenant index**, both tied to the measured write-bound bottleneck.
8. **Retention strategy** — retention remains global and time-based; tenant deletion is a soft delete whose rows age out through partition drops; no per-tenant retention (see §9.2).
9. **Performance impact** — before/after portal scores with `AUTH_ENABLED=false` (§9.1).
10. **Known limitations** — §10.
11. **Load-generator compatibility** — an explicit paragraph confirming no required endpoint, parameter, header, or response shape changed, and that the default posture is unauthenticated.

---

### Phase 9 — Verification (manual; no test files)

Run in this order, `AUTH_ENABLED` unset first.

**A. Default posture (this is the graded configuration — get it exactly right)**

1. `docker compose down -v`, remove `.env`, `docker compose up -d --build`.
2. `GET /health` → `200`.
3. All three data endpoints, no credential → work exactly as before.
4. All three with `Authorization: Bearer garbage` → **still `200`**, header ignored.
5. `GET /admin/tenants` → `404` (module not registered).
6. `EXPLAIN ANALYZE` a `GET /logs`-shaped query → confirm **no `tenant_id` predicate** appears and the same plan as before the change is chosen.
7. Confirm no response body anywhere contains `tenant_id`.

**B. Auth-enabled posture**

8. `AUTH_ENABLED=true LOADGEN_API_KEY=... docker compose up -d --build`.
9. Full matrix from Phase 4's exit checks.
10. Cross-tenant isolation: create tenant B via the admin API, issue key B, ingest under both keys, verify each `GET /logs` and `GET /logs/aggregate` returns only its own tenant's rows — including with `attr.` filters, `q`, and a full cursor-pagination walk.
11. Cursor check: take a `next_cursor` from tenant A and replay it with key B. It must return **B's** rows from that position, never A's (the cursor carries only `timestamp`/`id`; isolation comes from the tenant predicate, not the cursor).
12. Admin flow: login → access + refresh; call `/admin/tenants` with the access token; refresh; confirm the **old refresh token is now rejected**; replay it again and confirm the whole family is revoked.
13. Revoke a key → the very next request with it returns `401` (cache invalidated synchronously, not after the TTL).
14. Suspend a tenant → its key returns `403`.
15. Restart the stack → seeded loadgen key still valid; admin password unchanged.

**C. Retention**

16. Trigger retention maintenance; confirm partition creation/drop still succeeds with the new column, and that handed-off rows retain their original `tenant_id` (this is the Phase 1 step 5 check — verify it with real data, not by inspection).

**D. Performance**

17. §9.1 measurement protocol.

---

## 7. Request lifecycle walkthroughs

**`POST /logs`, `AUTH_ENABLED=false`**

```
Express → TenantAuthenticationGuard
        → DisabledAuthenticationStrategy.authenticate()   // returns a frozen singleton; never reads the request
        → request.tenantContext = { tenantId: 1, scope: {kind:'unscoped'}, scopes:[ingest,query] }
        → LogsController.ingest(body, @CurrentTenant() ctx)
        → LogIngestionService.ingest(body, ctx)           // Zod per-entry validation, unchanged
        → mapLogEntryToNewLog(entry, ctx.tenantId)
        → LogRepository.insertMany()                      // COPY … (tenant_id, timestamp, level, service, message, attributes)
```

Added cost vs today: one object property read and 4 bytes per row on the COPY stream. No branch, no I/O, no allocation per request.

**`GET /logs`, `AUTH_ENABLED=true`**

```
Express → TenantAuthenticationGuard
        → ApiKeyAuthenticationStrategy.authenticate()
             extract Bearer → sha256 → ApiKeyCacheService.resolve()   // in-memory Map, no DB
             key active? tenant active? → yes
        → guard checks @RequiresScope(query) against ctx.scopes
        → request.tenantContext = { tenantId: 7, scope: {kind:'tenant',tenantId:7}, scopes:[query] }
        → LogQueryService.query(params, ctx)
        → buildLogPageQuery(readRepo, { ...filters, tenant: ctx.scope })
        → applyTenantScope() adds  AND log.tenant_id = $n
```

Added cost vs today: one SHA-256 over ~48 bytes (~1 µs), one `Map.get`, one extra SQL predicate. Zero extra database round trips.

---

## 8. Security

- **API keys:** 256 bits of CSPRNG entropy; only SHA-256 hashes stored; `UNIQUE` on the hash; raw value returned exactly once at creation; revocation is immediate via synchronous cache eviction.
- **Admin passwords:** `scrypt` (memory-hard) with per-user random salt and `timingSafeEqual` comparison. Login is constant-work whether or not the user exists — no enumeration.
- **Refresh tokens:** opaque (not JWT), stored hashed, single-use with rotation, family-wide revocation on replay.
- **Access tokens:** short-lived HS256 JWTs, `type` claim checked so a refresh token can never be presented as an access token.
- **SQL injection:** all new predicates are parameterised. `applyTenantScope()` binds `:tenantId` — never interpolates. The existing rule holds: dynamic SQL fragments come only from enum-backed maps.
- **Error hygiene:** authentication failures return `401`/`403` through `HttpException`, which [GlobalExceptionFilter](../src/common/filters/global-exception.filter.ts) already renders as `{"error": "..."}`. Verify no auth path can produce a `500` (spec-forbidden) or a `200` with an empty result set (also spec-forbidden).
- **Least exposure by default:** no admin routes, no seeded admin, and no JWT secret in the graded build.
- **Logging:** never log raw API keys, passwords, refresh tokens, or JWTs. The one exception is the deliberately generated initial admin password, printed once with a warning.

---

## 9. Performance

### 9.1 Expected impact and measurement protocol

Current authoritative baseline (external portal, 2026-08-11, step 4 config): **60.07/100, 3,055.83 logs/sec, aggregate p95 4.40 s**.

| Path | Expected delta |
| --- | --- |
| Ingestion, auth off | +4 bytes/row on the COPY stream and in the heap (≈ +0.9% row width) |
| Ingestion, auth on | + one SHA-256 (~1 µs) and one `Map` lookup per request |
| Query/aggregate, auth off | **zero** — no predicate is emitted, SQL is byte-identical |
| Query/aggregate, auth on | one indexed-column equality predicate; no extra round trip |
| Startup | one extra `SELECT` to warm the key cache; a few seeding upserts |
| Memory | ~100 bytes per cached key; negligible against the 256 MB app limit |

**Protocol** (this project's established discipline — a change is kept only if it measurably helps, and never judged on one sub-metric):

1. Submit to the portal **with `AUTH_ENABLED=false`**, since that is what is graded.
2. Compare **all four scenarios** and the **full score breakdown** — Performance, Reliability, Correctness, Queries, Load logs/sec, Aggregate p95, and breakpoint consistency. A throughput number alone is not a verdict (Do-Not-Repeat, 2026-08-11).
3. Acceptance bar: score within noise of 60.07 and Reliability/Correctness still 20/20 and 15/15. Multi-tenancy is a feature, not an optimisation — it must not cost measurable throughput. If it does, the `tenant_id` column type or placement is the first thing to re-examine.

### 9.2 Sequencing against the in-flight performance work

`suggestions_to_increase_the_performance.md` §1 ("slim the row") is **in progress**: §1a (drop `attributes_text`) is done but unbenchmarked; §1b (drop `idx_logs_level_timestamp_id`) and §1c (drop `ingested_at`) are pending. Both are edits to `CreateLogsTable` / `CreateLogsTableBtreeIndexes`, and both require a dev database reset — exactly like this plan's Phase 1.

**Recommendation: land §1b and §1c first, then Phase 1.** Rationale:

- One database reset instead of two.
- One portal submission that cleanly attributes the −33% row-slimming gain, before a feature change muddies it. Mixing them makes both results uninterpretable.
- `tenant_id` (+4 bytes) partially offsets `ingested_at`'s removal (−8 bytes); measuring them together hides both effects.

If Phase 1 must go first, submit to the portal **before** starting it, so there is a clean pre-tenancy datapoint.

### 9.3 The tenant index, deferred deliberately

Not created in phase 1. Add it only when a real multi-tenant workload exists and measurement justifies it:

```sql
CREATE INDEX CONCURRENTLY "idx_logs_tenant_timestamp_id"
  ON "logs" ("tenant_id", "timestamp" DESC, "id" DESC);
```

Note for the README/demo: on a partitioned table this must be created per partition (or on the parent, which builds it on every child), and `PartitionService.ensureDailyPartition()` would need a matching line — the same two-part rule already established for per-partition storage parameters (see `.wolf/cerebrum.md`, 2026-08-11).

Trigger condition: more than a handful of tenants **and** any single tenant holding a small fraction of total rows, where a PK backward scan would have to skip many other tenants' rows to fill a page.

---

## 10. Known limitations (to document in the README)

1. **With `AUTH_ENABLED=false`, reads are unscoped** — a query returns every tenant's rows. Required by the spec's zero-config posture; there is no credential to derive a tenant from.
2. **No index on `logs.tenant_id`** — see §9.3. Tenant-scoped queries currently rely on existing indexes plus a filter.
3. **No foreign key from `logs.tenant_id` to `tenants.id`** — deliberate, to keep the RI trigger off the ingestion hot path. Integrity is enforced by construction in the application.
4. **Key-cache convergence window** — with multiple app instances, a revocation made on instance A takes up to `API_KEY_CACHE_REFRESH_MS` (default 30 s) to reach instance B. Single-instance deployments (including Compose) are immediately consistent.
5. **Tenant deletion is a soft delete** — log rows are removed by time-based partition retention, not immediately.
6. **No per-tenant retention** — retention is global and time-based, because partition dropping is O(1) and inherently tenant-agnostic; per-tenant retention would require either per-tenant partitioning (unbounded partition count) or row-level deletes that fight ingestion.
7. **No rate limiting or per-tenant quotas** — deliberately out of scope, so there is no `429` path the load generator could ever hit.
8. **`api_keys.last_used_at` is not tracked** — it would add a database write per authenticated request on the bottlenecked resource.
9. **`ADMIN_JWT_SECRET` unset means tokens do not survive a restart** — acceptable for local/demo use, warned about at startup, must be set for anything real.
10. **No admin UI** — backend only, as scoped.

---

## 11. Explicitly out of scope

Rate limiting / quotas; per-tenant retention policies; tenant self-service signup; admin roles beyond a single System Administrator level; SSO/OAuth; audit logging of admin actions; the admin frontend; any automated test files (`.spec` / `.test`) — per the standing instruction.

---

## 12. Execution checklist

- [ ] **Phase 1** Schema, entities, migrations (fold `tenant_id` into `CreateLogsTable`), `PartitionService` handoff columns, `projectSchema.dbml`, DB reset
- [ ] **Phase 2** `TenantContext` / `TenantScope`, auth constants, `auth.config.ts`, strategy interface, `DisabledAuthenticationStrategy`, `TenancyModule.forRoot()`
- [ ] **Phase 3** `applyTenantScope`, required `tenant` on query interfaces, `NewLog.tenantId`, CSV encoder + COPY column list, mapper, three services, controller decorators
- [ ] **Phase 4** API-key utils, cache service, `ApiKeyAuthenticationStrategy`, global guard, `@AllowAnonymous` / `@RequiresScope` / `@CurrentTenant`, `AuthSeedService`, health readiness gate
- [ ] **Phase 5** `@nestjs/jwt`, scrypt password utils, `AdminTokenService` with rotation + reuse detection, login/refresh/logout, `AdminJwtGuard`, `AdminSeedService`, Swagger bearer auth
- [ ] **Phase 6** `TenantService` / `ApiKeyService`, admin tenant + API-key controllers, Zod validators, DTOs, 11 new `.rest` files, cache invalidation on every mutation
- [ ] **Phase 7** Compose env, `.env.example` + `.env`, CI smoke matrix over both configurations (including the "bogus bearer is ignored" assertion)
- [ ] **Phase 8** README (11 sections), `entities.md`, `FunctionalRequirements.md`, `NonFunctionalRequirements.md`, `folderStructure.md`, OpenWolf files
- [ ] **Phase 9** Manual verification A–D, then portal re-submission with `AUTH_ENABLED=false`
