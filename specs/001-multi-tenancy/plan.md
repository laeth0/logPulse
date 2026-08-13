# Implementation Plan: Multi-Tenancy

**Branch**: `001-multi-tenancy` | **Date**: 2026-08-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-multi-tenancy/spec.md`

## Summary

Add self-service, API-key-based multi-tenancy to the existing logPulse ingestion/query service without changing the required API contract in any way. A `Tenant` is a single customer account that self-registers (email + password), logs in to receive a short-lived JWT access token plus a refresh token, and uses that access token only to create/list/revoke its own API keys. Applications (including the graded load generator) then use those API keys — never the JWT — as `Authorization: Bearer <key>` on `POST /logs`, `GET /logs`, and `GET /logs/aggregate`.

Technically, this is a single new column (`logs.tenant_id`) threaded through the existing, already-tuned filter pipeline (`applyLogFilters`, used by both the paginated query and the aggregation query), plus three new tables (`tenants`, `api_keys`, `tenant_refresh_tokens`) and a small `tenancy` module. When `AUTH_ENABLED=false` (the default), every request resolves to one fixed, unenforced tenant constant and the system behaves exactly as it does today — response shapes, request shapes, and the ingestion hot path (`COPY ... FROM STDIN`) are unchanged except for one extra CSV column carrying the resolved tenant id.

## Technical Context

**Language/Version**: TypeScript 5.7 on Node.js 24 (existing — see `Dockerfile`, `tsconfig.json`)

**Primary Dependencies**: NestJS 11 (`@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`), TypeORM + `@nestjs/typeorm`, `zod` (existing request validation pattern), `pg` / `pg-copy-streams` (existing COPY-based ingestion). **New**: `@nestjs/jwt` for Tenant access/refresh token signing — see [research.md](./research.md) Decision 2. No other new runtime dependencies (password hashing and API-key generation use Node's built-in `crypto` module — Decisions 1 and 5).

**Storage**: PostgreSQL 16 (existing single source of truth, existing `postgres:16-alpine` container). No new datastore. Three new tables (`tenants`, `api_keys`, `tenant_refresh_tokens`); one new column (`logs.tenant_id`).

**Testing**: Jest is configured project-wide, but per explicit project decision (see spec Assumptions and `.wolf/cerebrum.md` user preference) **no `.test.ts`/`.spec.ts` files are authored for this feature at this time**. Verification is via: the CI smoke job (extended — Decision 12), the `quickstart.md` manual/scripted validation scenarios, and `.rest` files under `requests/tenancy/`.

**Target Platform**: Linux containers via `docker compose` (existing — app container + `postgres:16-alpine`, no infrastructure changes).

**Project Type**: Single NestJS web-service (monolith) — existing structure, extended with one new feature module (`src/tenancy/`, currently an empty skeleton directory).

**Performance Goals**: Preserve all existing targets from `docs/Final_Project.md` with multi-tenancy enabled: ≥15,000 logs/sec sustained ingestion, aggregate query <1s p95, ~1,000,000 stored rows (~1 month of data), newly ingested data queryable within 20s, one aggregation request/sec sustained during ingestion load. Per spec SC-007, enabling auth/multi-tenancy must not measurably regress any of these versus the same load profile without them. **This feature is not done until that comparison has actually been run** — see research.md Decision 14 and tasks.md's final Polish-phase task: benchmark against the pre-multi-tenancy baseline via the project's external load-testing portal (ingestion logs/sec, aggregation p95, query latency, app CPU/mem, PostgreSQL CPU/mem), and revisit the index design in Decision 10 if it regresses rather than assuming the current three-index design is optimal.

**Constraints**: App container 0.5 CPU / 256 MB RAM; PostgreSQL container 1 CPU / 1 GB RAM (existing, unchanged — see `docker-compose.yml`). The tenant-scoping predicate must not add a second query plan branch to the hot ingestion path (COPY) or the read path (`applyLogFilters`); API-key/JWT resolution must be a single indexed point lookup, not a table scan or N+1. No caching layer for credential resolution (Decision 7's guard design plus SC-005's "revoked on the very next request" together rule that out — see research.md Decision 7).

**Scale/Scope**: ~1,000,000 log rows across ~1 month of daily partitions (existing). Per spec Clarifications, tens of tenants (not hundreds/thousands) — a single shared `logs` table scoped by an indexed `tenant_id` column is sufficient; no per-tenant partitioning or schema-per-tenant scheme.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template (`[PROJECT_NAME] Constitution` with all placeholder principles) — no project constitution has been ratified, so there are no formal gates to evaluate here. In its place, this plan is held to the engineering principles explicitly documented in `CLAUDE.md` / `AGENTS.md` ("Engineering Quality and Performance Principles"): keep code simple and cohesive, follow established project conventions, apply patterns only where they genuinely simplify the design, treat performance as a first-class requirement, justify indexes by actual query patterns, and preserve the existing architecture/API contracts unless a requirement explicitly requires a change.

**Result**: PASS (no constitution defined; CLAUDE.md principles are addressed throughout this plan and research.md).

*Post-Phase-1 re-check*: PASS — see [research.md](./research.md) §"Constitution re-check notes" for how each design decision was weighed against these principles (no new indexes without a query-pattern justification — and a mandatory post-implementation benchmark gate, not just reasoning, per Decision 14; no new dependencies beyond one well-vetted JWT wrapper; no global-guard complexity; migrations folded per the pre-release rule instead of layered; retention/partition management corrected to be explicitly tenant-aware per Decision 13, after `/speckit-analyze` caught that the original plan mischaracterized `retention/` as unchanged).

## Project Structure

### Documentation (this feature)

```text
specs/001-multi-tenancy/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/            # Phase 1 output (/speckit-plan command)
│   ├── tenant-accounts-api.md   # POST /tenants/register, /login, /refresh
│   ├── api-keys-api.md          # POST/GET /tenants/api-keys, DELETE /tenants/api-keys/:id
│   └── logs-endpoints-auth.md   # additive auth behavior on the 4 required endpoints
├── checklists/
│   └── requirements.md  # already produced by /speckit-specify + /speckit-clarify
└── tasks.md              # Phase 2 output (/speckit-tasks command — NOT created by /speckit-plan)
```

### Source Code (repository root)

Single NestJS project (existing layout — no frontend/mobile split). New/changed paths only; everything else in `src/` is unchanged:

```text
src/
├── app.module.ts                              # CHANGED: import TenancyModule
├── common/
│   └── constants/
│       └── tenancy.constants.ts                # NEW: DEFAULT_TENANT_ID (no DB row), LOADGEN_TENANT_ID (real seeded row — research.md Decision 9), header/prefix constants
├── logs/                                        # existing module — CHANGED, not restructured
│   ├── entities/log.entity.ts                   # CHANGED: + tenant_id column, updated indexes
│   ├── interfaces/
│   │   ├── log-query.interface.ts                # CHANGED: + tenantId on LogFilters
│   │   └── log-repository.interface.ts           # CHANGED: + tenant_id on NewLog
│   ├── mappers/log.mapper.ts                     # CHANGED: mapLogEntryToNewLog(entry, tenantId)
│   ├── query-builders/log-filter.builder.ts       # CHANGED: unconditional tenant_id predicate
│   ├── repositories/
│   │   ├── log-csv-encoder.ts                    # CHANGED: + tenant_id CSV column
│   │   └── log.repository.ts                     # CHANGED: + tenant_id in COPY column list
│   ├── services/
│   │   ├── log-ingestion.service.ts               # CHANGED: ingest(body, tenantId)
│   │   ├── log-query.service.ts                   # CHANGED: query(value, tenantId)
│   │   └── log-aggregation.service.ts             # CHANGED: aggregate(value, tenantId)
│   ├── logs.controller.ts                        # CHANGED: @UseGuards(ApiKeyAuthGuard) + @CurrentTenantId()
│   └── logs.module.ts                            # CHANGED: imports TenancyModule (for the guard/service)
├── tenancy/                                       # currently an empty skeleton — filled in by this feature
│   ├── entities/
│   │   ├── tenant.entity.ts
│   │   ├── api-key.entity.ts
│   │   └── refresh-token.entity.ts
│   ├── interfaces/
│   │   └── jwt-payload.interface.ts
│   ├── dto/
│   │   ├── requests/        # register, login, refresh, create-api-key
│   │   └── responses/       # auth-tokens, api-key, api-key-list
│   ├── validators/          # zod schemas, mirroring src/logs/validators/*
│   ├── utils/
│   │   ├── password-hasher.util.ts   # wraps crypto.scrypt
│   │   └── api-key-generator.util.ts # wraps crypto.randomBytes
│   ├── services/
│   │   ├── tenant-auth.service.ts     # register/login/refresh
│   │   ├── api-key.service.ts         # create/list/revoke/resolveActive
│   │   └── loadgen-key-seeder.service.ts  # OnApplicationBootstrap, idempotent seed
│   ├── guards/
│   │   ├── api-key-auth.guard.ts       # used on LogsController
│   │   └── tenant-jwt-auth.guard.ts    # used on ApiKeysController
│   ├── decorators/
│   │   └── current-tenant-id.decorator.ts
│   ├── controllers/
│   │   ├── tenant-auth.controller.ts   # /tenants/register, /login, /refresh
│   │   └── api-keys.controller.ts      # /tenants/api-keys
│   └── tenancy.module.ts
├── migrations/
│   ├── 1785684350114-CreateLogsTable.ts            # CHANGED (folded in — see research.md Decision 11): + tenant_id column
│   ├── 1785684350115-CreateLogsTableBtreeIndexes.ts # CHANGED (folded in): tenant_id-led indexes
│   └── <new-timestamp>-CreateTenancyTables.ts       # NEW: tenants, api_keys, tenant_refresh_tokens
├── health/                                        # unchanged
└── retention/
    ├── partition.service.ts                        # CHANGED (research.md Decision 13): ensureDailyPartition()'s re-insertion INSERT/SELECT column lists must include tenant_id, or partition creation fails NOT NULL once tenant_id exists
    └── retention.service.ts                         # unchanged — deletion policy stays system-wide/tenant-agnostic (spec Assumptions); only partition.service.ts's SQL needed a fix

requests/
└── tenancy/                                       # NEW subfolder, per CLAUDE.md's HTTP Request Files rule
    ├── tenancy.register.rest
    ├── tenancy.login.rest
    ├── tenancy.refresh.rest
    ├── tenancy.api-keys.create.rest
    ├── tenancy.api-keys.list.rest
    └── tenancy.api-keys.revoke.rest

projectSchema.dbml                                  # CHANGED: + tenants, api_keys, tenant_refresh_tokens tables, logs.tenant_id column
docker-compose.yml                                  # CHANGED: + AUTH_ENABLED, LOADGEN_API_KEY, JWT_SECRET env vars (all optional, safe defaults)
.env.example                                         # CHANGED: same additions, documented
.github/workflows/ci.yml                             # CHANGED: + second smoke pass with AUTH_ENABLED=true (Decision 12)
```

**Structure Decision**: Extend the existing single-project NestJS layout. Multi-tenancy is delivered as one new feature module (`src/tenancy/`) alongside the existing `logs`, `health`, and `retention` modules, plus surgical, additive changes to the `logs` module's filter/mapper/repository layer to thread a resolved `tenantId` through the existing query-builder pipeline. No new services, no new datastore, no restructuring of existing modules.

## Complexity Tracking

*No entries — no constitution violations to justify. The design deliberately avoids added complexity: no global guard (avoids the `@AllowAnonymous()` bug class encountered previously in this project), no caching layer for credential resolution (a plain indexed lookup is fast enough at the target scale and avoids stale-revocation bugs), no per-tenant partitioning (tens of tenants doesn't warrant it), and no refresh-token-family theft detection (simple rotation is sufficient and documented as a known limitation in research.md).*
