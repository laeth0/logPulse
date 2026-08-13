---

description: "Task list for the Multi-Tenancy feature"
---

# Tasks: Multi-Tenancy

**Input**: Design documents from `specs/001-multi-tenancy/` (`plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`)

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Not included. Per spec.md's Assumptions ("No `.test.`/`.spec.` files will be introduced as part of implementing this feature") and `.wolf/cerebrum.md`'s recorded user preference, this feature is verified via the CI smoke job, the manual/scripted scenarios in `quickstart.md`, and (mandatorily, per T061) the external load-testing portal — not via automated test files.

**Organization**: Tasks are grouped by user story (US1–US5, matching spec.md's priority order) so each story is independently deliverable and checkpointable.

**2026-08-13 revision**: this file was regenerated after `/speckit-analyze` surfaced two CRITICAL coverage gaps (E1: retention/partition management was never updated for the new `tenant_id NOT NULL` column; E2: the `Log` TypeORM entity itself was never updated) plus HIGH/MEDIUM findings (E3: no performance-validation task existed for SC-007; F1: `TenantJwtAuthGuard`'s independence from `AUTH_ENABLED` was undocumented; C1: `LOADGEN_API_KEY` seeding's idempotency target was unspecified). All are resolved below — see the `[E#]`/`[F#]`/`[C#]` tags on the affected tasks. Every task ID after T009 shifted from the previous revision; do not reference old IDs.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: Which user story this task belongs to (US1–US5) — omitted for Setup/Foundational/Polish
- File paths are exact and relative to the repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the one new dependency and the environment/config surface every later task needs.

- [X] T001 Add `@nestjs/jwt` to `dependencies` in `package.json` (research.md Decision 2)
- [X] T002 [P] Add `AUTH_ENABLED`, `LOADGEN_API_KEY`, `JWT_SECRET`, `JWT_ACCESS_TOKEN_TTL_SECONDS`, `JWT_REFRESH_TOKEN_TTL_DAYS` to `.env.example` with commented defaults (`AUTH_ENABLED=false`, others empty/900/7). Also resolves `/speckit-analyze` finding C2: `JWT_SECRET` gets a real placeholder default (`your_jwt_secret_here`), not left silently empty.
- [X] T003 [P] Add the same env vars to the `app.environment` block in `docker-compose.yml`, defaulted so a plain `docker compose up` stays the unauthenticated core service (`AUTH_ENABLED: ${AUTH_ENABLED:-false}`, `LOADGEN_API_KEY: ${LOADGEN_API_KEY:-}`, etc.). `JWT_SECRET` defaults to `please-change-me-in-production`, mirroring `DB_PASS`'s existing insecure-but-functional zero-config convention (C2).
- [X] T004 [P] Create `src/common/constants/tenancy.constants.ts` with `DEFAULT_TENANT_ID` (nil UUID, no DB row — research.md Decision 6), `LOADGEN_TENANT_ID` (**[C1]** a second, distinct fixed/reserved UUID literal that **does** get a real seeded `tenants` row — research.md Decision 9), `API_KEY_PREFIX` (`'lp_'`), and the `X-API-Key` header name constant. (`LOADGEN_TENANT_EMAIL` deferred to T031, where it's actually consumed.)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database schema, entity/ORM mappings, and retention compatibility every user story builds on. **This phase is where the multi-tenant schema becomes complete** — it must include the entity and retention fixes below, not just the raw migrations.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T005 [P] Create `Tenant` TypeORM entity in `src/tenancy/entities/tenant.entity.ts` per data-model.md (`id` uuid PK, `email` unique text, `password_hash` text, `created_at`)
- [X] T006 [P] Create `ApiKey` TypeORM entity in `src/tenancy/entities/api-key.entity.ts` per data-model.md (`id` uuid PK, `tenant_id` uuid indexed, `key_value` unique text, `status` check-constrained text, `created_at`, `revoked_at`)
- [X] T007 [P] Create `TenantRefreshToken` TypeORM entity in `src/tenancy/entities/refresh-token.entity.ts` per data-model.md (`id` uuid PK, `tenant_id` uuid indexed, `token_hash` unique text, `expires_at`, `created_at`, `revoked_at`)
- [X] T008 [P] Fold a `tenant_id UUID NOT NULL` column into the `CREATE TABLE "logs"` statement in `src/migrations/1785684350114-CreateLogsTable.ts`, per research.md Decision 11 (no default, no FK — app-supplied on every insert)
- [X] T009 [P] Replace the two indexes in `src/migrations/1785684350115-CreateLogsTableBtreeIndexes.ts` with the tenant-led versions from data-model.md: `idx_logs_tenant_timestamp_id (tenant_id, timestamp DESC, id DESC)` (new), `idx_logs_tenant_service_timestamp_id (tenant_id, service, timestamp DESC, id DESC)`, `idx_logs_tenant_level_timestamp_id (tenant_id, level, timestamp DESC, id DESC)` (both replacing their non-tenant-led predecessors), updating `down()` to match
- [X] T010 **[E2 — CRITICAL]** Update the `Log` TypeORM entity in `src/logs/entities/log.entity.ts`: add `@Column({ type: 'uuid' }) tenant_id: string;`, and replace the existing `@Index('idx_logs_service_timestamp_id', [...])` / `@Index('idx_logs_level_timestamp_id', [...])` decorators with the tenant-led triplet from data-model.md/T009 (`idx_logs_tenant_timestamp_id`, `idx_logs_tenant_service_timestamp_id`, `idx_logs_tenant_level_timestamp_id`). This must land **before** any query-builder code references `log.tenant_id` (T018) — TypeORM's query builder resolves `alias.property` string references against the entity's mapped columns, the same way `log.service`/`log.level` already work. (depends on T008, T009 for exact column/index names)
- [X] T011 **[E1 — CRITICAL]** Update `PartitionService.ensureDailyPartition()` in `src/retention/partition.service.ts`: add `"tenant_id"` to both the `INSERT INTO "logs" (...)` column list and the `SELECT ...` column list in the temp-table re-insertion step (research.md Decision 13). The preceding `CREATE TEMP TABLE ... AS SELECT * FROM "logs_default"` step needs no change. Without this, the first partition-creation attempt after `tenant_id` becomes `NOT NULL` throws a constraint violation and **every subsequent scheduled retention run repeats the same failure**, permanently defeating partition pruning and expired-data cleanup. This is retention becoming explicitly tenant-aware at the SQL level — `retention.service.ts`'s deletion *policy* stays correctly tenant-agnostic and needs no change. (depends on T008 — the column must exist) — **Verified live against real Postgres 16** (not just code review, closing `/speckit-analyze` finding E5): inserted a row into `logs_default`, manually ran the exact fixed re-insertion SQL to migrate it into a newly created named partition, confirmed zero `NOT NULL` violations and `tenant_id` correctly preserved on the migrated row.
- [X] T012 Create a new migration `src/migrations/<next-timestamp>-CreateTenancyTables.ts` creating `tenants`, `api_keys` (with the `status` check constraint), and `tenant_refresh_tokens`, matching data-model.md's column/constraint/index definitions exactly (depends on T005-T007 for exact column shapes) — created as `1785684350118-CreateTenancyTables.ts`
- [X] T013 Update `projectSchema.dbml` with the `tenants`, `api_keys`, `tenant_refresh_tokens` tables and the `logs.tenant_id` column + its three new indexes, per CLAUDE.md's Schema Updates rule — keep this, the `Log`/`Tenant`/`ApiKey`/`TenantRefreshToken` entity classes, and the migrations in T008-T012 describing the exact same columns (depends on T008-T012)
- [X] T014 [P] Create the `@CurrentTenantId()` param decorator in `src/tenancy/decorators/current-tenant-id.decorator.ts`, reading `request.tenantId`
- [X] T015 Create `src/tenancy/tenancy.module.ts` registering `TypeOrmModule.forFeature([Tenant, ApiKey, TenantRefreshToken])`, and import `TenancyModule` into `src/app.module.ts` (depends on T005-T007, T012)

**Checkpoint**: Schema, entity mappings, and retention compatibility are all complete and consistent — this is the point at which "the multi-tenant schema" (data-model.md's phrase) is actually done, not just the raw `CREATE TABLE` statements. No request-handling behavior changed yet.

---

## Phase 3: User Story 1 - Zero-configuration core service is untouched (Priority: P1) 🎯 MVP

**Goal**: With `tenant_id` now part of the schema, `GET /health`, `POST /logs`, `GET /logs`, and `GET /logs/aggregate` behave exactly as they did before this feature, when `AUTH_ENABLED` is unset or `false`.

**Independent Test**: quickstart.md Scenario 1 — no env config, run ingest/query against a fresh stack, confirm response shapes are unchanged.

### Implementation for User Story 1

- [X] T016 [US1] Add a required `tenantId: string` field to `LogFilters` (and therefore `FindLogsQuery`/`AggregateLogsQuery`) in `src/logs/interfaces/log-query.interface.ts`
- [X] T017 [US1] Add a required `tenant_id: string` field to `NewLog` in `src/logs/interfaces/log-repository.interface.ts`
- [X] T018 [US1] In `src/logs/query-builders/log-filter.builder.ts`, apply `log.tenant_id = :tenantId` as an unconditional (always-applied) `andWhere`, ahead of the optional filters (depends on T010 — the entity must map `tenant_id` — and T016)
- [X] T019 [US1] Add `tenant_id` to the CSV row encoding in `src/logs/repositories/log-csv-encoder.ts` (depends on T017)
- [X] T020 [US1] Add `tenant_id` to the `COPY logs (...)` column list in `src/logs/repositories/log.repository.ts`'s `copyLogsIn` (depends on T017, T019)
- [X] T021 [US1] Update `mapLogEntryToNewLog` in `src/logs/mappers/log.mapper.ts` to accept a `tenantId` parameter and set it on the returned `NewLog` (depends on T017)
- [X] T022 [US1] Update `LogIngestionService.ingest()` in `src/logs/services/log-ingestion.service.ts` to accept `tenantId` and pass it through to the mapper for every entry in the batch (depends on T021)
- [X] T023 [US1] Update `LogQueryService.query()` in `src/logs/services/log-query.service.ts` to accept and thread `tenantId` into `findPage()` (depends on T016, T018)
- [X] T024 [US1] Update `LogAggregationService.aggregate()` in `src/logs/services/log-aggregation.service.ts` to accept and thread `tenantId` into `aggregate()` (depends on T016, T018)
- [X] T025 [US1] Create `ApiKeyAuthGuard` in `src/tenancy/guards/api-key-auth.guard.ts` implementing only the `AUTH_ENABLED=false` path: no header parsing at all, unconditionally sets `request.tenantId = DEFAULT_TENANT_ID`, returns `true` (depends on T004, T014). The `AUTH_ENABLED=true` branch throws an explicit "not yet supported" 500 as a placeholder for T030, rather than silently granting access.
- [X] T026 [US1] Apply `@UseGuards(ApiKeyAuthGuard)` to `LogsController` in `src/logs/logs.controller.ts` and use `@CurrentTenantId()` to supply `tenantId` to the `ingest`/`query`/`aggregate` calls (depends on T022-T025)
- [X] T027 [US1] Import `TenancyModule` into `src/logs/logs.module.ts` so `ApiKeyAuthGuard` resolves via DI (depends on T015, T025). Also registered `ApiKeyAuthGuard` as a provider/export of `TenancyModule` itself — required for the DI resolution this task's own goal depends on.
- [X] T028 [US1] Run quickstart.md Scenario 1 against a locally built stack (`docker compose up --build`) and confirm every response is byte-for-byte identical to the pre-feature contract (depends on T010, T011, T016-T027 — this also exercises the T010/T011 fixes indirectly, since the stack cannot even ingest a row without both being correct) — **Verified live**: `docker compose up --build` was unavailable (Docker build sandbox has no registry access in this environment), so validated by running the built app in a throwaway container on the same Docker network as the database instead. `GET /health` → 200; retention maintenance ran automatically at boot and created 38 partitions with zero errors (further live confirmation of T011, beyond T011's own manual test); `POST /logs` → `{"accepted":1,"rejected":[]}`; `GET /logs` → exact required shape, no `tenant` field anywhere; `GET /logs/aggregate` → exact required shape; a bogus `Authorization` header was silently ignored (FR-005), request still succeeded.

**Checkpoint**: MVP-critical — the required contract is fully intact with `tenant_id` wired through ingestion, query, and aggregation, defaulting to the single implicit tenant.

---

## Phase 4: User Story 2 - Authentication can be turned on and the load generator keeps working (Priority: P1)

**Goal**: `AUTH_ENABLED=true` + `LOADGEN_API_KEY` seeds a working, tenant-scoped key before the service reports healthy, and CI verifies both configurations.

**Independent Test**: quickstart.md Scenario 2.

### Implementation for User Story 2

- [X] T029 [US2] Create `ApiKeyService.resolveActiveKey(value)` in `src/tenancy/services/api-key.service.ts` — single indexed `WHERE key_value = $1 AND status = 'active'` lookup returning the owning `tenant_id` or `undefined` (depends on T006, T015)
- [X] T030 [US2] Extend `ApiKeyAuthGuard` in `src/tenancy/guards/api-key-auth.guard.ts` with the `AUTH_ENABLED=true` path: read `Authorization: Bearer`/`X-API-Key`, `401` if missing/malformed, `403` if the credential is JWT-shaped (contains `.`), `401` if `ApiKeyService.resolveActiveKey()` finds nothing, else set `request.tenantId` from the resolved tenant (depends on T025, T029)
- [X] T031 [US2] **[C1]** Create `LoadgenKeySeeder` implementing `OnApplicationBootstrap` in `src/tenancy/services/loadgen-key-seeder.service.ts`: when `AUTH_ENABLED=true` and `LOADGEN_API_KEY` is set, idempotently upsert (a) a `tenants` row with `id = LOADGEN_TENANT_ID` via `INSERT ... ON CONFLICT (id) DO NOTHING`, then (b) an `api_keys` row with `key_value = LOADGEN_API_KEY`, `tenant_id = LOADGEN_TENANT_ID` via `INSERT ... ON CONFLICT (key_value) DO NOTHING` — per research.md Decision 9's exact conflict-target strategy (depends on T004, T005, T006, T015). `password_hash` for the seeded row is a random 32-byte hex value, never used for authentication, purely to satisfy the `NOT NULL` constraint (closes `/speckit-analyze` finding C3, using a new `LOADGEN_TENANT_EMAIL` constant added to `tenancy.constants.ts`).
- [X] T032 [US2] Register `LoadgenKeySeeder` as a provider in `src/tenancy/tenancy.module.ts` (depends on T015, T031)
- [X] T033 [US2] Extend `.github/workflows/ci.yml`'s `smoke` job with a second pass using `AUTH_ENABLED=true` and a generated `LOADGEN_API_KEY`, asserting all three data endpoints succeed with the bearer token and return `401` without it, per research.md Decision 12 / FR-027 (depends on T030-T032) — added as a new sibling job `smoke-auth`; also corrected the original `smoke` job's comment, which had (correctly, at the time) said no optional auth feature existed.
- [X] T034 [US2] Run quickstart.md Scenario 2 end-to-end, including the restart-idempotency check, against a locally built stack (depends on T030-T032) — **Verified live** (throwaway container, `docker compose up --build` unavailable in this environment as in prior phases). This run **caught and fixed a real bug**: `ApiKeyAuthGuard`'s `@UseGuards()` usage from `LogsModule` threw `UnknownDependenciesException` for `ApiKeyService` at boot, because NestJS resolves a cross-module guard's own constructor dependencies against the *consuming* module's visibility, not the guard's home module — `ApiKeyService` had to be exported from `TenancyModule` too, not just `ApiKeyAuthGuard` (see the exports comment added to `tenancy.module.ts`). This is exactly the class of bug a `nest build` type-check cannot catch (it's a runtime DI-graph concern), which is why this live-verification step matters. After the fix, confirmed: `401`/`403`/`401`/`200` for missing/JWT-shaped/invalid/valid credentials respectively, both `Authorization: Bearer` and `X-API-Key` accepted, `LoadgenKeySeeder` logged successfully on both boots, and a `docker restart` with the same `LOADGEN_API_KEY` left the DB at exactly 1 tenant row / 1 key row (no duplication) with the key still working immediately after restart.

**Checkpoint**: Both P1 (non-negotiable) stories complete — the two hard grading constraints are satisfied.

---

## Phase 5: User Story 3 - A customer registers and logs in as a Tenant (Priority: P2)

**Goal**: Self-service Tenant registration and login, issuing an access token (account/API-key management only) and a refresh token.

**Independent Test**: quickstart.md Scenario 3's register/login portion.

### Implementation for User Story 3

- [X] T035 [P] [US3] Create `src/tenancy/utils/password-hasher.util.ts` wrapping `crypto.scrypt` — `hash(password)` and `verify(password, storedHash)` functions, per research.md Decision 1. Used a manual `Promise` wrapper around the callback form of `scrypt` rather than `promisify(scrypt)` — `promisify` collapses Node's multiple `scrypt` overloads and TypeScript rejects the options-object call. Sanity-checked in isolation (not just via the app): random salting confirmed (two hashes of the same password differ), correct/wrong password verify as `true`/`false`, and a malformed stored hash fails closed (`false`, no throw) rather than crashing.
- [X] T036 [P] [US3] Create `TokenService` in `src/tenancy/services/token.service.ts` wrapping `@nestjs/jwt`: `signAccessToken(tenantId)`, `verifyAccessToken(token)`, `signRefreshToken(tenantId)`, `verifyRefreshToken(token)` (depends on T001). Also added `src/tenancy/interfaces/jwt-payload.interface.ts` (`TenantJwtPayload = { sub, type: 'access' | 'refresh' }`) — the `type` claim is what stops a refresh token from ever being accepted as an access token or vice versa, confirmed live in T043.
- [X] T037 [P] [US3] Create zod schemas for register/login/refresh request bodies in `src/tenancy/validators/tenant-auth.schema.ts`, mirroring `src/logs/validators/log-entry.schema.ts`'s style (email format, minimum password length)
- [X] T038 [P] [US3] Create request DTOs (`register-tenant.dto.ts`, `login-tenant.dto.ts`, `refresh-token.dto.ts`) in `src/tenancy/dto/requests/` and response DTOs (`tenant.dto.ts`, `auth-tokens.dto.ts`) in `src/tenancy/dto/responses/`, matching contracts/tenant-accounts-api.md's shapes exactly
- [X] T039 [US3] Create `TenantAuthService` in `src/tenancy/services/tenant-auth.service.ts`: `register()` (lowercase-fold email, hash password via T035, catch unique-violation → 409), `login()` (verify password, issue tokens via T036, store the refresh token's hash in `tenant_refresh_tokens`), `refresh()` (verify + rotate: issue a new pair, mark the presented token row `revoked_at`) — this rotation design is deliberate (research.md Decision 3's confirmed status; F3) and must not be simplified to a non-rotating token (depends on T005, T007, T035, T036). `register()` relies on catching the Postgres `23505` unique-violation error code from the insert itself (not a separate `findOne`-then-insert check), avoiding a TOCTOU race under concurrent registrations of the same email. `refresh()` looks up all of a tenant's non-revoked, unexpired refresh-token rows and verifies the provided token against each via `password-hasher.verify()` (a hashed value can't be looked up by re-hashing, since each hash uses a fresh random salt) — cheap at "tens of tenants" scale where a tenant realistically has 0-1 active sessions.
- [X] T040 [US3] Create `TenantAuthController` in `src/tenancy/controllers/tenant-auth.controller.ts` exposing `POST /tenants/register`, `POST /tenants/login`, `POST /tenants/refresh` — no guards on any of the three — using `parseWithSchema` with the T037 schemas (depends on T037-T039). `register` keeps Nest's default `201`; `login`/`refresh` get explicit `@HttpCode(HttpStatus.OK)` since they're actions, not resource creation (matching the project's existing `POST /logs` convention).
- [X] T041 [US3] Register `TenantAuthController` and `TenantAuthService` in `src/tenancy/tenancy.module.ts` (depends on T015, T039, T040). Also added `JwtModule.register({ secret: process.env.JWT_SECRET })` to `TenancyModule`'s imports — `TokenService` needs an injectable `JwtService`, which only `JwtModule` provides.
- [X] T042 [P] [US3] Create `requests/tenancy/tenancy.register.rest`, `requests/tenancy/tenancy.login.rest`, `requests/tenancy/tenancy.refresh.rest` per CLAUDE.md's HTTP Request Files rule, each with a descriptive comment and happy-path + error examples (depends on T040)
- [X] T043 [US3] Run quickstart.md Scenario 3's register/login portion, including the "access token rejected on `GET /logs`" check (depends on T026, T030, T040) — **Verified live** (throwaway container, as prior phases). Confirmed: `POST /tenants/register` → `201` with the exact shape, no tokens issued; duplicate email → `409`; `POST /tenants/login` → `200` with `access_token`/`refresh_token`/`token_type`/`expires_in`; wrong password and unknown email both → `401` with the **identical** error message (no disclosure); decoded the JWT payload and confirmed `sub`/`type: "access"` claims; **both `GET /logs` and `POST /logs` with the access token → `403`**, never `401` or `200` (FR-018/FR-024, the core guarantee this story exists to deliver). Also verified the refresh flow beyond what quickstart.md scripts: `POST /tenants/refresh` with a valid token issues a new pair (`200`); replaying the same now-rotated-away token → `401`; a garbage token → `401`.

**Checkpoint**: Tenants can self-register and authenticate independently of any administrator — a second real tenant now exists in the system.

---

## Phase 6: User Story 4 - A Tenant manages its own API keys (Priority: P2)

**Goal**: An authenticated Tenant creates, lists, and revokes its own API keys using its access token; API keys and access tokens are never interchangeable, and key-management access never depends on `AUTH_ENABLED`.

**Independent Test**: quickstart.md Scenario 3's key-management portion + Scenario 5 (revocation).

**Depends on User Story 3** (a Tenant must be able to log in before it can manage keys — matches spec.md's own stated priority reasoning for this story).

### Implementation for User Story 4

- [X] T044 [P] [US4] Create `src/tenancy/utils/api-key-generator.util.ts` — `generate()` returning `lp_<32 base64url chars>` via `crypto.randomBytes(24)`, per research.md Decision 5
- [X] T045 [US4] Extend `ApiKeyService` in `src/tenancy/services/api-key.service.ts` with `create(tenantId)` (using T044's generator), `listForTenant(tenantId)`, and `revoke(tenantId, keyId)` (404 if the key doesn't exist or belongs to a different tenant; idempotent no-op if already revoked) (depends on T029, T039, T044)
- [X] T046 [US4] **[F1 — HIGH]** Create `TenantJwtAuthGuard` in `src/tenancy/guards/tenant-jwt-auth.guard.ts`: `401` if the `Authorization` header is missing or the JWT is invalid/expired, `403` if the credential is API-key-shaped instead, else set `request.tenantId` from the verified JWT's `sub` claim via T036's `TokenService`. **This guard MUST NOT read `process.env.AUTH_ENABLED` or branch on it anywhere** — it always validates the Tenant JWT, in every configuration, including `AUTH_ENABLED=false`. `AUTH_ENABLED` only gates `ApiKeyAuthGuard` (T025/T030) on the log data-plane endpoints; copying that guard's `AUTH_ENABLED=false` short-circuit into this guard would silently expose every tenant's key-management endpoints — including reading back full key secrets — with no credential whenever `AUTH_ENABLED=false`, the default. See research.md Decision 7's "Hard rule" and contracts/api-keys-api.md. (depends on T036) — grep-verified: the guard body contains no reference to `AUTH_ENABLED` anywhere; live-confirmed in T051.
- [X] T047 [P] [US4] Create the zod schema (empty-body validation) and response DTOs (`api-key.dto.ts`, `api-key-list.dto.ts`) for the API-key endpoints in `src/tenancy/validators/api-key.schema.ts` / `src/tenancy/dto/responses/`, matching contracts/api-keys-api.md
- [X] T048 [US4] Create `ApiKeysController` in `src/tenancy/controllers/api-keys.controller.ts` exposing `POST /tenants/api-keys`, `GET /tenants/api-keys`, `DELETE /tenants/api-keys/:id`, guarded by `@UseGuards(TenantJwtAuthGuard)`, using `@CurrentTenantId()`. Keep this as a separate controller from `TenantAuthController` (F2 — confirmed intentional: different authentication surfaces, one guarded and one not, per research.md Decision 7) — do not merge them. (depends on T045-T047). The `DELETE` response (`{id, status}`) is intentionally a narrower plain object, not the full `ApiKeyDto` — no `key`/`created_at` needed on a revoke confirmation.
- [X] T049 [US4] Register `ApiKeysController` and `TenantJwtAuthGuard` in `src/tenancy/tenancy.module.ts` (depends on T015, T046, T048)
- [X] T050 [P] [US4] Create `requests/tenancy/tenancy.api-keys.create.rest`, `requests/tenancy/tenancy.api-keys.list.rest`, `requests/tenancy/tenancy.api-keys.revoke.rest` per CLAUDE.md's HTTP Request Files rule (depends on T048)
- [X] T051 [US4] Run quickstart.md Scenario 3's key-management portion and Scenario 5 (confirm revocation takes effect on the very next request, per SC-005; also manually confirm `GET /tenants/api-keys` still returns `401` with no `Authorization` header when the stack is running with `AUTH_ENABLED=false`, proving T046's independence rule holds in practice) (depends on T048, T030) — **Verified live** across two runs (`AUTH_ENABLED=true` and `AUTH_ENABLED=false`, throwaway containers as prior phases). Full lifecycle on the `true` run: create → `201` with the exact `{id, key, status, created_at}` shape; list → `200` including the full secret (FR-021); the created key ingests/queries successfully; revoke → `200 {id, status:"revoked"}`; **the revoked key is rejected with `401` on the very next request, zero grace period (SC-005)**; re-revoking the same key → idempotent `200`, not an error; revoking an unknown id → `404`; an API key presented to `POST /tenants/api-keys` → `403`. On the `false` run — the critical F1 check: `GET /logs` with no credential succeeds (`200`), but `GET`/`POST /tenants/api-keys` with no credential **still returns `401`**, proving key-management authentication is genuinely independent of `AUTH_ENABLED`. Went one step further than scripted: logged in, created a key, and ingested one log with that key and one with no credential at all while `AUTH_ENABLED=false` — both landed in the same `DEFAULT_TENANT_ID` bucket and were returned together by an unauthenticated `GET /logs`, directly confirming spec's "any issued API key simply has no enforcement effect until authentication is turned on" assumption.

**Checkpoint**: The full self-service loop — register → login → create key → ingest/query with it → revoke it — works end-to-end, and account/key management is confirmed always-authenticated regardless of `AUTH_ENABLED`.

---

## Phase 7: User Story 5 - Tenant data is isolated (Priority: P2)

**Goal**: Confirm, with two real self-service tenants now provisionable, that isolation holds across filters, aggregation, and cursor pagination — the mechanism itself (the unconditional `tenant_id` predicate from US1, backed by T010's entity mapping) is already in place; this story validates it under realistic multi-tenant conditions.

**Independent Test**: quickstart.md Scenario 4.

**Depends on User Stories 2, 3, and 4** (needs the load-generator tenant plus at least one more self-registered tenant with its own key, to have two genuinely distinct tenants to test against).

### Implementation for User Story 5

- [X] T052 [US5] Register a second Tenant end-to-end (register → login → create key) and ingest distinct, service-tagged logs under both that key and an earlier Story 3/4 tenant's key, per quickstart.md Scenario 4 (depends on T043, T051) — **Verified live** (throwaway container, as prior phases): two fresh tenants (`tenant-a@example.com`, `tenant-b@example.com`) self-registered, each with its own key; 3 logs ingested under Tenant A (`service=checkout-a`), 2 under Tenant B (`service=checkout-b`).
- [X] T053 [US5] Verify `GET /logs` (filtered and unfiltered), `GET /logs/aggregate`, and cursor-based pagination each return zero cross-tenant rows in both directions, confirming research.md Decision 8's unconditional-filter guarantee holds in practice (depends on T052) — **Verified live, all bidirectional**: unfiltered `GET /logs` — each tenant saw only its own (3 vs. 2); cross-service filter (`?service=<other tenant's service>`) — empty both ways; cross-attribute filter (Tenant B querying `attr.tenant=a`) — empty; `GET /logs/aggregate` — each tenant's bucket showed only its own count/service, no cross-contamination; **the critical cursor test** — replayed Tenant A's `next_cursor` value with Tenant B's key (and vice versa) — each response contained **only the replaying tenant's own logs**, zero of the other tenant's, confirming Decision 8's "the cursor boundary narrows an already tenant-scoped result set, it can never widen it" claim with real data rather than reasoning alone.
- [X] T054 [US5] Add a short "Tenant Isolation" note to `README.md` describing how isolation was verified (quickstart.md Scenario 4 — no automated test exists, per this project's current convention) (depends on T053) — added as a new bullet in `README.md`'s "Known limitations" section (alongside the existing "no test suite yet" bullet, which it's a specific instance of); left the rest of `README.md` (Optional features, schema docs) as Phase 8/T055-T056's scope, not this task's.

**Checkpoint**: All 5 user stories complete and independently verified.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, final repo-wide checks, and the mandatory performance-validation gate.

- [X] T055 [P] Update `README.md`'s "Optional features" section: document `AUTH_ENABLED`, `LOADGEN_API_KEY`, `JWT_SECRET` (+ TTL vars), each one's default, and confirm `docker compose up` with no configuration yields the plain core service — rewrote the section: config table, the two-credential-type model (API keys vs. Tenant access tokens, never interchangeable), the full self-service endpoint table, and the three "notable design decisions" (scrypt, cleartext keys, per-controller guards) with pointers to `research.md`/`contracts/`/`requests/tenancy/` for detail rather than duplicating it.
- [X] T056 [P] Update `README.md`'s schema/attribute-storage sections to mention `logs.tenant_id` and the three new tables (`tenants`, `api_keys`, `tenant_refresh_tokens`), and note that `PartitionService` was updated for tenant-aware partition recreation (T011) — added `tenant_id` to the `logs` ASCII diagram, replaced the index table with the tenant-led triplet, added a "Tenant tables" subsection with all three new table diagrams, and added the `PartitionService`/Decision 13 note under Retention strategy (the more topically accurate location, even though T056 names "schema" — cross-referenced from both).
- [X] T057 **[E4]** [P] Add a "Known Limitations" entry to `README.md` documenting that `tenant_refresh_tokens` rows are never purged after `expires_at`/`revoked_at` (research.md Decision 4's accepted, non-blocking limitation) — explicitly scoped as a future concern, not expanded into this iteration's implementation. Also fixed the now-stale "No optional features" bullet and added a companion bullet flagging that the tenant-aware index redesign hasn't been re-benchmarked yet (directly motivating T061).
- [X] T058 Run `npm run build` to confirm the entire feature type-checks cleanly (depends on all prior implementation tasks, T001-T054) — clean, both before and after T059's formatting pass.
- [X] T059 Run `npm run format` and `npm run lint` immediately before opening the PR, per CLAUDE.md's workflow rule — not run earlier during implementation (depends on T058) — `npm run format` reflowed ~24 files (cosmetic only); `npm run lint` passed with zero warnings on the first run, no fixes needed.
- [X] T060 Run the complete quickstart.md (all 5 scenarios, back to back) against a fresh `docker compose up --build` as a final functional sanity pass (depends on T059) — **Verified live**, all 5 scenarios in one continuous pass (two throwaway containers: one `AUTH_ENABLED` unset for Scenario 1, one `AUTH_ENABLED=true` + seeded key for Scenarios 2–5, including a mid-run restart for Scenario 2's idempotency check). Every response matched quickstart.md exactly; DB reset to empty before and after.
- [ ] T061 **[E3 — HIGH, mandatory gate]** Benchmark the feature against the pre-multi-tenancy baseline using the project's existing load-testing methodology / external load-testing portal (research.md Decision 14). At minimum compare: ingestion logs/sec, aggregation query p95, `GET /logs` query p95, application container CPU/memory, PostgreSQL container CPU/memory. **If ingestion throughput regresses meaningfully, do not accept it** — revisit the index strategy in research.md Decision 10 (starting with dropping the net-new `idx_logs_tenant_timestamp_id` index) rather than assuming the current three-index design is optimal; indexes in this codebase are justified by measurement, not kept by default (CLAUDE.md's indexing rule; precedent: `DropLogsMessageTrigramIndex`). This feature is not considered complete until this task passes. (depends on T060) — **NOT DONE, requires your action**: this needs a real submission to the external load-testing portal (`https://loadgen.foothilltech.net/`), which only you can do — I have no access to it, and no local measurement substitutes for it per this project's own established convention (`.wolf/cerebrum.md`: local runs are diagnostic only). Everything else in this feature is complete and ready for that submission.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS every user story. Now includes the entity (T010) and retention (T011) fixes, not just raw migrations — this phase is not complete without them.
- **User Story 1 (Phase 3)**: Depends on Foundational (specifically T010 for T018's `log.tenant_id` reference, T011 indirectly since a broken partition manager would eventually break ingestion). MVP-critical.
- **User Story 2 (Phase 4)**: Depends on Foundational; extends the same `ApiKeyAuthGuard` file US1 created (T025 → T030), so in practice starts after US1. MVP-critical.
- **User Story 3 (Phase 5)**: Depends on Foundational only — independent of US1/US2's guard work (different files: `TenantAuthController`/`TenantAuthService` vs. `LogsController`/`ApiKeyAuthGuard`).
- **User Story 4 (Phase 6)**: Depends on User Story 3 (needs a working login to obtain an access token) and on US2's `ApiKeyService` foundation (T029).
- **User Story 5 (Phase 7)**: Depends on User Stories 2, 3, and 4 (needs two real, independently provisioned tenants to test isolation against).
- **Polish (Phase 8)**: Depends on all desired user stories being complete. T061 (performance validation) is the final gate and depends on T060 (full functional pass) succeeding first.

### Recommended Order

Given the dependency shape above (US4 needs US3; US5 needs US2+US3+US4), the practical execution order is: **Setup → Foundational → US1 → US2 → US3 → US4 → US5 → Polish** — i.e., mostly sequential rather than the "all stories parallel after Foundational" ideal, because this feature's stories build on each other more than a typical CRUD feature's would (self-service auth is inherently layered: you can't manage keys before you can log in, and you can't test isolation before two tenants exist).

### Parallel Opportunities

- Setup: T002, T003, T004 in parallel (T001 is a one-line dependency add, sequence-independent but trivial).
- Foundational: T005, T006, T007 (three entities) in parallel; T008, T009 (migration edits) in parallel with each other and with the entity tasks; T014 in parallel with everything else in this phase. T010 and T011 are each single-file, sequential-dependency tasks (on T008/T009) but independent of each other — they can run in parallel with each other once T008/T009 land.
- US3: T035, T036, T037, T038 all touch different new files and can run in parallel before T039 integrates them.
- US4: T044 and T047 can run in parallel with each other and ahead of T045/T046.
- Each story's `.rest` file task (T042, T050) can run in parallel with that story's other late-stage tasks once its controller exists.
- Polish: T055, T056, T057 in parallel.

---

## Parallel Example: Foundational Phase

```bash
Task: "Create Tenant TypeORM entity in src/tenancy/entities/tenant.entity.ts"
Task: "Create ApiKey TypeORM entity in src/tenancy/entities/api-key.entity.ts"
Task: "Create TenantRefreshToken TypeORM entity in src/tenancy/entities/refresh-token.entity.ts"
Task: "Fold tenant_id column into src/migrations/1785684350114-CreateLogsTable.ts"
Task: "Replace indexes in src/migrations/1785684350115-CreateLogsTableBtreeIndexes.ts"
# Then, once the two migration tasks above land:
Task: "Update Log entity's tenant_id column + indexes in src/logs/entities/log.entity.ts"
Task: "Update PartitionService's INSERT/SELECT column lists in src/retention/partition.service.ts"
```

## Parallel Example: User Story 3

```bash
Task: "Create password-hasher.util.ts wrapping crypto.scrypt"
Task: "Create TokenService wrapping @nestjs/jwt"
Task: "Create zod schemas for register/login/refresh in tenant-auth.schema.ts"
Task: "Create request/response DTOs for tenant-accounts-api.md's shapes"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 — both P1)

Unlike a typical single-P1-story MVP, this feature has **two** P1 stories because the project brief treats them as equally non-negotiable (zero-config default behavior, and the seeded-key path both being hard grading constraints):

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (blocks everything — includes the entity and retention fixes, T010/T011)
3. Complete Phase 3: User Story 1 — **STOP and VALIDATE** with quickstart.md Scenario 1
4. Complete Phase 4: User Story 2 — **STOP and VALIDATE** with quickstart.md Scenario 2 and the extended CI job
5. This is the MVP: the required contract works identically whether `AUTH_ENABLED` is off (default) or on with the seeded load-generator key. Deployable/gradable at this point even if Stories 3–5 aren't started yet — **except** T061's performance validation, which should still run before treating any milestone as final, per Decision 14.

### Incremental Delivery Beyond MVP

6. Add User Story 3 → self-registration/login works → validate with Scenario 3 (register/login half)
7. Add User Story 4 → self-service key management works, always-authenticated regardless of `AUTH_ENABLED` (T046/F1) → validate with Scenario 3 (key half) + Scenario 5
8. Add User Story 5 → isolation confirmed with two real tenants → validate with Scenario 4
9. Polish: README (including the E4 known-limitation note), build/format/lint, full quickstart pass, **mandatory performance benchmark (T061) — do not skip**

---

## Notes

- No test files are created in any phase — see the **Tests** note at the top of this document.
- `[P]` tasks touch different files and have no incomplete same-phase dependency.
- Commit after each task or logical group, per the repository's existing incremental-commit-history convention.
- Tags like `[E1]`, `[E2]`, `[E3]`, `[F1]`, `[C1]` on specific tasks trace directly to `/speckit-analyze`'s 2026-08-13 findings — kept visible so their resolution is traceable, not just folded silently into descriptions.

---

## Phase 9: Convergence

**Purpose**: Remaining work surfaced by `/speckit-converge`'s assessment of the implemented code against spec.md/plan.md/tasks.md, run after all of Phase 1-8's tasks were implemented.

- [X] T062 Add `.addTag('tenancy', '<description>')` to the `DocumentBuilder` chain in `src/main.ts`, matching the existing `.addTag('logs', ...)` / `.addTag('health', ...)` pattern, per plan.md (partial)
