# Phase 0 Research: Multi-Tenancy

Each decision below resolves one technical unknown from the plan's Technical Context, grounded in the actual codebase (inspected directly — see plan.md's Technical Context for the file list) rather than assumptions.

## Decision 1: Password hashing — `bcryptjs`

**Decision** (revised): Hash Tenant passwords with `bcryptjs` (`bcrypt.hash()`/`bcrypt.compare()`, cost factor 10), storing bcrypt's own self-describing `$2b$10$...` output directly. The input is first passed through SHA-256 (`createHash('sha256').update(value).digest('hex')`, a fixed 64-char hex string) before being handed to bcrypt, because this same `hash()`/`verify()` pair is reused for refresh-token hashing (Decision 4) and bcrypt silently truncates any input past 72 bytes — a ~200+ character JWT would otherwise lose most of its entropy before hashing, weakening the single-use rotation guarantee (Decision 3) rather than just the password case.

**Original decision (superseded)**: Node's built-in `crypto.scrypt`, storing a custom `scrypt$<N>$<r>$<p>$<saltHex>$<hashHex>` format, specifically to avoid a native-binding dependency (`bcrypt`/`argon2`) that could complicate the multi-stage Alpine Docker build (`npm ci` runs fresh in both the build and production stages, neither of which installs a C/C++ toolchain — real `bcrypt`'s `node-gyp` compile step would fail there as the Dockerfile stands).

**Why revisited**: The user asked for simpler, more idiomatic code over the hand-rolled scrypt implementation (manual `Promise` wrapper around `crypto.scrypt`'s callback form, forced by a `promisify()`/TypeScript overload bug — see tasks.md T035 — plus a custom serialization format and manual `timingSafeEqual` call). `bcryptjs` is a pure-JavaScript reimplementation of bcrypt with an identical API and output format to native `bcrypt`, but zero native compilation — it satisfies the original Decision 1 rationale (no Docker build risk) while eliminating essentially all of the removed code's complexity, since `bcrypt.hash()`/`bcrypt.compare()` already handle salting, encoding, and constant-time comparison internally.

**Alternatives considered**:
- Native `bcrypt` — still rejected; same native-binding/Docker-build risk as originally noted.
- `argon2` — same native-binding concern; also heavier than needed here.
- Keeping `crypto.scrypt` — zero dependencies, but the hand-rolled Promise wrapper and custom format are meaningfully more code to maintain for no behavioral benefit at this project's scale.

## Decision 2: JWT signing — `@nestjs/jwt`

**Decision**: Add `@nestjs/jwt` (thin, DI-friendly wrapper around `jsonwebtoken`) for signing/verifying Tenant access and refresh tokens, HMAC-SHA256, secret from a new `JWT_SECRET` env var.

**Rationale**: The project has no JWT library today. `@nestjs/jwt` is the idiomatic, minimal-footprint choice in the NestJS ecosystem (used via `JwtModule.register()`/`JwtService`, no extra abstraction layers needed), well-vetted, and avoids hand-rolling token signing/verification/expiry logic — which CLAUDE.md's "follow security and framework best practices" principle argues against reinventing.

**Alternatives considered**:
- Hand-rolled HMAC signing via `crypto` — avoids a dependency, but reinvents a well-understood, easy-to-get-subtly-wrong primitive (constant-time comparison, expiry, `alg` confusion) for no real benefit given `@nestjs/jwt`'s minimal footprint.
- `passport` + `passport-jwt` — pulls in the whole Passport strategy abstraction for a single credential type; more machinery than this project's two simple guards need.

## Decision 3: Access/refresh token lifetime and rotation

**Decision**: Access token TTL 15 minutes; refresh token TTL 7 days. Refresh is single-use rotation: presenting a valid refresh token issues a new access+refresh pair and invalidates the presented refresh token. No refresh-token-family/theft-detection tracking.

**Rationale**: Spec Assumptions explicitly defer "exact lifetime, rotation behavior, and revocation mechanics" to planning. Given the small-scale (tens of tenants), self-service, no-administrator design the user chose for simplicity, family-tracking theft detection (as the prior, now-removed admin implementation had) is more machinery than this project's scope warrants. Simple rotation still satisfies the spec's only hard requirement here (an expired/invalid refresh token is rejected — Edge Cases) and keeps `tenant_refresh_tokens` a simple table with no extra "family id" concept.

**Alternatives considered**:
- Long-lived, non-rotating refresh tokens — simpler still, but weaker: a leaked refresh token stays valid for its full 7-day life with no way to detect reuse.
- Family-tracking rotation with reuse detection (revoke entire family on reuse) — the more "correct" pattern per OAuth best practice, but adds a `family_id` concept and reuse-detection logic that this project's stated simplicity goal doesn't call for. Documented here as a known, deliberate limitation rather than silently significant.

**Status (confirmed 2026-08-13, post-`/speckit-analyze`)**: this design (rotation + server-side hashed storage, no family tracking) is a deliberate, already-justified trade-off, not an oversight — keep it as specified. Do not simplify it further to a stateless/non-rotating token solely because the tenant count is small; the rotation guarantee (SC-005-adjacent session hygiene) is worth the one small table it costs. Cleanup of expired/revoked rows in that table is deferred — see Decision 4's note.

## Decision 4: Refresh tokens stored hashed, not plaintext

**Decision**: `tenant_refresh_tokens.token_hash` stores a `bcryptjs` hash of the refresh token value (same helper as Decision 1, SHA-256-prehashed to stay under bcrypt's 72-byte input limit), never the raw token.

**Rationale**: Unlike API keys, the spec never requires a refresh token to be redisplayed to the client (it's an internal session artifact — the client already holds the one it was issued). The "retrievable anytime" clarification was scoped specifically to API keys (Decision 5), not refresh tokens, so the standard hash-and-compare pattern applies here with no conflict.

**Known limitation (accepted, non-blocking)**: no task in this iteration purges `tenant_refresh_tokens` rows once `expires_at` has passed or `revoked_at` is set. At "tens of tenants" scale the table's growth rate is immaterial, and adding a cleanup job (cron-based delete, or folding into `RetentionService`) is straightforward to add later without any design change here. Tracked as a documented future concern, not expanded into this iteration's scope.

## Decision 5: API key format and storage

**Decision**: API keys are opaque random strings of the form `lp_<32-url-safe-base64-chars>` generated via `crypto.randomBytes(24).toString('base64url')`. The full value is stored in cleartext in `api_keys.key_value` (unique, indexed).

**Rationale**: The spec's clarification session explicitly resolved that a Tenant must be able to retrieve a full API key value again later via the list endpoint ("Retrievable anytime"), which rules out the standard "store a hash, show the secret once" pattern — a hash cannot be reversed to redisplay the original value. Storing the raw value is therefore not an oversight but a direct, documented consequence of that decision (also called out in spec.md's Key Entities section). The `lp_` prefix and dot-free character set let `ApiKeyAuthGuard` cheaply distinguish "this is an API key" from "this is a JWT" (JWTs always contain two `.` separators) without a database round trip, satisfying FR-024's 403-on-wrong-credential-type requirement at negligible cost.

**Alternatives considered**:
- Hash-and-show-once (industry default) — rejected because it directly contradicts the resolved clarification.
- Reversible encryption instead of cleartext storage — adds a key-management problem (where does the encryption key live, how is it rotated) for marginal benefit over a unique, indexed column in a database that's already the system's sole source of truth; not worth the complexity at this scale. Noted as a possible hardening step if the project's threat model changes later.

## Decision 6: Tenant scoping strategy on `logs`

**Decision**: Add `logs.tenant_id UUID NOT NULL` with **no foreign key** to `tenants.id`. When `AUTH_ENABLED=false`, every request resolves to a fixed application-level constant `DEFAULT_TENANT_ID` (the nil UUID, `00000000-0000-0000-0000-000000000000`) — no corresponding row is seeded in `tenants` for it, since nothing references it via FK.

**Rationale**:
- **No FK**: the existing schema has zero foreign keys anywhere (confirmed in `log.entity.ts` / `CreateLogsTable` migration — checks and a composite PK, no `REFERENCES`). Adding one here would mean every ingested row pays an FK-existence check on the hot `COPY` path for the first time in this schema, which CLAUDE.md's performance principles argue against without a correctness need — tenant existence is already guaranteed by construction, since `tenant_id` only ever comes from a successfully-resolved API key (Decision 5) or the fixed constant, never from user input (FR-010).
- **Fixed constant over a seeded default row**: avoids needing an idempotent-seed step that runs unconditionally (independent of `AUTH_ENABLED`/`LOADGEN_API_KEY`) just to satisfy a `NOT NULL` + FK — since there's no FK, no row needs to exist. This is simpler than seeding a "default" tenant and matches the spec's framing of it as "a single implicit tenant" (User Story 1) rather than a real, queryable account.

**Alternatives considered**:
- Nullable `tenant_id`, `NULL` meaning "no tenant restriction" — rejected: reintroduces a second code path in `applyLogFilters` (`tenant_id = :id` OR `tenant_id IS NULL`) that every query and the query planner would need to handle, undermining the "unconditional predicate, always index-friendly" design in Decision 8. A single non-null constant is strictly simpler.
- FK to `tenants.id` with `ON DELETE RESTRICT` — rejected per the performance rationale above; nothing in the spec requires referential integrity here (tenants are never hard-deleted in this iteration — spec Assumptions).

**Correction (2026-08-13, `/speckit-analyze` finding E1 — CRITICAL)**: `tenant_id NOT NULL` with no default has one more consequence beyond the ingestion `COPY` path this decision originally focused on: `PartitionService.ensureDailyPartition()` (`src/retention/partition.service.ts`) re-inserts rows from `logs_default` into a newly created named partition via an **explicit column-list `INSERT`**. That statement must also supply `tenant_id`, or every partition-creation attempt fails with a `NOT NULL` violation the moment any row needs migrating out of `logs_default`. This was missed during initial planning (which had incorrectly described `retention/` as "unchanged") and is corrected in full in Decision 13 below. Retention is not, and cannot be, tenant-blind at the SQL-statement level even though the *policy* (what to delete/keep) remains correctly tenant-agnostic per spec Assumptions.

## Decision 7: Guard placement — per-controller, not a global `APP_GUARD`

**Decision**: Two small guards, applied directly via `@UseGuards()`: `ApiKeyAuthGuard` on `LogsController` (all three data endpoints), `TenantJwtAuthGuard` on the new `ApiKeysController`. `HealthController` and the register/login/refresh endpoints on `TenantAuthController` carry no guard at all.

**Rationale**: This project previously built (and later lost, per the repo's own history) an admin-authentication system that used a single global `APP_GUARD` with an `@AllowAnonymous()` opt-out — and shipped a live bug where a controller meant to bypass the global guard forgot the decorator and rejected valid credentials with 401. Applying guards only to the controllers that actually need protection eliminates that entire bug class by construction: there is no default-deny behavior to opt out of, so there's no decorator to forget. It also keeps `GET /health`'s "always unauthenticated, no exceptions" requirement (FR-002) trivially true without any auth-module code path touching it at all.

**Alternatives considered**:
- Global `APP_GUARD` + `@AllowAnonymous()` on health/register/login — rejected for the reason above; strictly more moving parts for the same behavior, with a documented history of failing exactly the way it's supposed to prevent.
- Nest `CanActivate` composed via `AuthGuard('jwt')`/Passport strategies — more indirection than two straightforward guards need (see Decision 2's rejection of Passport for the same reason).

**Hard rule (confirmed 2026-08-13, `/speckit-analyze` finding F1 — HIGH)**: `ApiKeyAuthGuard` and `TenantJwtAuthGuard` look superficially similar (both live in `src/tenancy/guards/`, both resolve a `tenantId`) but differ in one critical way that must never be blurred:

- `ApiKeyAuthGuard` (on `LogsController`) **branches on `AUTH_ENABLED`** — that switch is defined by the project brief specifically to gate authentication on the four required data-plane endpoints.
- `TenantJwtAuthGuard` (on `ApiKeysController`) **MUST NEVER read or branch on `AUTH_ENABLED`**. It unconditionally validates the Tenant JWT on every request, in every deployment configuration, including `AUTH_ENABLED=false`. `AUTH_ENABLED` has no defined meaning on the tenant account/API-key-management surface — spec Assumptions state that surface is "reachable regardless of `AUTH_ENABLED`," which describes reachability of the *endpoint*, not exemption from *authentication*. Reachable-but-unauthenticated and reachable-and-always-authenticated are different things, and this guard implements the latter.

Concretely: an implementer who copies `ApiKeyAuthGuard`'s `if (!authEnabled) { return true }` short-circuit into `TenantJwtAuthGuard` would silently make every tenant's key-management endpoints (create/list/revoke API keys — including reading back full key secrets, per Decision 5) reachable with **no credential at all** whenever `AUTH_ENABLED=false`, which is the default. This is called out explicitly here, in `contracts/api-keys-api.md`, and in tasks.md's `TenantJwtAuthGuard` task specifically to prevent that mistake.

**Controller split is intentional (confirmed 2026-08-13, `/speckit-analyze` finding F2)**: `TenantAuthController` (no guard — register/login/refresh) and `ApiKeysController` (`TenantJwtAuthGuard` — create/list/revoke) stay as two separate controllers rather than one merged `TenancyController`, precisely *because* of the rule above: splitting by guard means there is no method with a guard sitting in a file alongside methods with none, so there's nothing to misconfigure at the method level either. This is a deliberate consequence of this decision's own "guard per protected surface" principle, not incidental file-count growth — do not merge them to reduce file count.

## Decision 8: No cursor format change needed for cross-tenant isolation

**Decision**: The opaque cursor's shape (`{timestamp, id}`, base64url-encoded — unchanged) does not need to carry or validate a tenant id.

**Rationale**: `applyLogFilters` (shared by both `GET /logs` and `GET /logs/aggregate`, per `log-filter.builder.ts`/`log-query.builder.ts`/`aggregation-query.builder.ts`) will apply `log.tenant_id = :tenantId` as an unconditional `andWhere`, exactly like every other filter. The cursor's `(timestamp, id) < (cursorTimestamp, cursorId)` predicate is combined with that same `tenant_id` predicate via `AND`. If tenant B presents a cursor value that was issued to tenant A, the query still only ever returns tenant B's rows — the cursor boundary further narrows an already tenant-scoped result set, it can never widen it. This satisfies spec FR-014 with zero changes to `CursorService`, `cursor-payload.interface.ts`, or the response shape — fully preserving `next_cursor`'s existing opacity contract.

**Alternatives considered**:
- Embed a tenant id (or its hash) inside the cursor payload and reject mismatches — rejected as unnecessary complexity; the unconditional filter already provides the guarantee, and adding a field to `CursorPayload` risks (a) growing the cursor and (b) coupling the cursor format to auth state, which is unwanted when `AUTH_ENABLED=false` and every cursor is implicitly the same "tenant."

## Decision 9: `LOADGEN_API_KEY` seeding — `OnApplicationBootstrap`, keyed on a fixed reserved tenant id

**Decision**: A `LoadgenKeySeeder` provider implementing Nest's `OnApplicationBootstrap` lifecycle hook runs during `app.init()` (which `app.listen()` calls internally, before the HTTP port opens). When `AUTH_ENABLED=true` and `LOADGEN_API_KEY` is set, it idempotently upserts:

1. A `tenants` row whose `id` is a **fixed, reserved constant** — `LOADGEN_TENANT_ID` (a hardcoded UUID literal, e.g. `00000000-0000-0000-0000-00000000009e`, distinct from `DEFAULT_TENANT_ID`'s all-zero value), with a reserved constant `email` (e.g. `loadgen@internal.logpulse`) that is never reachable through `POST /tenants/register` (the registration validator's email-format check doesn't special-case it — nothing stops a real customer from registering it too *in principle*, but this is a non-issue in practice since the seeder always runs first at startup and owns that row from boot). Upsert via `INSERT INTO tenants (id, email, password_hash, ...) VALUES ($LOADGEN_TENANT_ID, ...) ON CONFLICT (id) DO NOTHING`.
2. An `api_keys` row with `key_value = $LOADGEN_API_KEY`, `tenant_id = $LOADGEN_TENANT_ID`, via `INSERT INTO api_keys (...) VALUES (...) ON CONFLICT (key_value) DO NOTHING`.

Both `DEFAULT_TENANT_ID` (Decision 6 — no DB row, used only when `AUTH_ENABLED=false`) and `LOADGEN_TENANT_ID` (this decision — a real, seeded DB row, used only for the seeded load-generator key) live together as named constants in `src/common/constants/tenancy.constants.ts`.

**Rationale (why `ON CONFLICT (id)` rather than `ON CONFLICT (email)`, per `/speckit-analyze` finding C1 — MEDIUM)**: the original version of this decision said only "idempotently upserts a load-generator tenant" without naming the conflict target, which is not actually enough information to implement idempotency correctly — `tenants` only has a unique constraint on `email`, and relying on email uniqueness alone leaves the exact reserved email value unspecified and undocumented. Keying the upsert on a **fixed, hardcoded `id`** instead is strictly more robust: it needs no string-equality/case-folding assumptions (unlike `email`, which the Tenant self-service path lowercase-folds — Decision-adjacent detail in `TenantAuthService`), can never accidentally collide with a self-registered tenant's `gen_random_uuid()`-generated id (astronomically unlikely to begin with, but a fixed reserved constant makes the guarantee *structural* rather than probabilistic), and is trivially greppable/testable as "the load-generator tenant is exactly this UUID, always." FR-006/FR-007/FR-008 require the seed to happen "before reporting healthy" and to be safe across restarts. Because Nest's lifecycle hooks (`onModuleInit` → `onApplicationBootstrap`) run synchronously as part of `NestFactory.create()`'s initialization before `main.ts`'s `app.listen()` resolves, and the load generator can only observe `GET /health` once the server is actually listening, this ordering is guaranteed without any change to `HealthService` (which already only checks DB connectivity + migration status). Using application-level idempotent SQL rather than a migration keeps "schema changes" (migrations) and "data seeding" (bootstrap logic) cleanly separated, matching this project's existing convention (migrations only ever create schema/indexes — see `src/migrations/*`; nothing today seeds rows via migration).

**Alternatives considered**:
- `ON CONFLICT (email) DO NOTHING` with an undocumented/implicit reserved email — the original (now corrected) approach; rejected because "idempotent" without a stated, fixed conflict target isn't a real guarantee, just a hope.
- Seed via a TypeORM migration `up()` — rejected: migrations run once per migration name (TypeORM tracks them in `typeorm_migrations`), so a migration-based seed could not naturally re-verify/re-idempotently-ensure the key still exists on every restart the way FR-007 implies; it would only ever run once, ever, at first deploy.
- Seed lazily on first request — rejected: violates "before reporting healthy."

## Decision 10: Index design for `logs`

**Decision**: Replace `idx_logs_service_timestamp_id` and `idx_logs_level_timestamp_id` with tenant-led equivalents `(tenant_id, service, timestamp DESC, id DESC)` and `(tenant_id, level, timestamp DESC, id DESC)`. Add one new index `idx_logs_tenant_timestamp_id (tenant_id, timestamp DESC, id DESC)` for the no-service/no-level filter case (today served by a backward scan of the `(timestamp, id)` primary key, which can no longer serve a tenant-scoped query efficiently since `tenant_id` isn't part of the PK). GIN indexes (`idx_logs_attributes_text_gin`) are unaffected — JSONB containment filtering still runs after the tenant/service/level/time predicates narrow the row set.

**Rationale**: Per CLAUDE.md's indexing rule ("add, remove, or modify indexes only when justified by query patterns... not blindly"), this is a direct, mechanical consequence of Decision 6: every single query against `logs` — ingestion aside — now carries `tenant_id = :tenantId` as a mandatory leading predicate (Decision 8), so every existing composite index needs `tenant_id` as its new leading column to remain useful, exactly mirroring the existing `service`/`level` leading-equality-column pattern already used in this schema (see the original `CreateLogsTableBtreeIndexes` migration's own documented "equality first, range/sort last" rationale).

**Alternatives considered**:
- Leave existing indexes as-is, add `tenant_id` as a trailing column — rejected: a trailing column doesn't help an equality-then-range query; Postgres needs the equality columns first to seek efficiently, which is exactly why the original indexes already lead with `service`/`level`.
- Composite index `(tenant_id, timestamp, id)` only, dropping the service/level-specific indexes — rejected without a measurement to justify it; the existing indexes exist because `service`/`level` filters are explicitly supported query parameters, and removing them would need the same kind of `EXPLAIN ANALYZE` evidence the project's own retention-index decisions were made from (see `DropLogsMessageTrigramIndex`'s migration comment for the project's own bar for removing an index).

**Status — provisional pending measurement (per `/speckit-analyze` finding E3 — HIGH, resolved via Decision 14)**: this three-index design is the best *reasoned* choice available at design time, but it is reasoned by inference, not by benchmark — and this codebase has direct, first-party evidence (the `DropLogsMessageTrigramIndex` migration) that index-maintenance cost is the dominant lever on ingestion throughput at this project's hardware tier. `idx_logs_tenant_timestamp_id` is net-new (the other two replace existing indexes 1:1, so their write-amplification delta is smaller — they don't add an index, they widen one). Per CLAUDE.md's "prefer measured optimization over assumptions" rule, this design is **not final** until Decision 14's mandatory post-implementation benchmark confirms it doesn't regress ingestion throughput. If it does, the first thing to reconsider is dropping `idx_logs_tenant_timestamp_id` and accepting a PK-backward-scan-plus-tenant-filter for the no-service/no-level-filter query case — viable specifically because the spec's own Clarification fixes scale at "tens of tenants," meaning that scan only needs to skip on the order of tens-to-one non-matching rows per matching row, not thousands-to-one.

## Decision 11: Migration strategy — fold vs. new

**Decision**: `tenant_id` on `logs` and the two updated B-tree indexes are folded directly into the existing `CreateLogsTable` (`1785684350114`) and `CreateLogsTableBtreeIndexes` (`1785684350115`) migrations. The three new tables (`tenants`, `api_keys`, `tenant_refresh_tokens`) get one new migration.

**Rationale**: This mirrors CLAUDE.md's own stated rule and this project's own precedent (the `attributes_text` column was folded into `CreateLogsTable` rather than added via a standalone migration, per the project's own recorded history) — the project has shipped no migrations to a real environment yet (confirmed via `git log`; the dev DB has been reset from scratch for exactly this reason before), so there is nothing to preserve compatibility with. Folding avoids an `ALTER TABLE ... ADD COLUMN` + `ALTER TABLE ... ADD CONSTRAINT` pair that would otherwise sit awkwardly against a table that was created moments earlier by an adjacent migration in the same migration set.

**Alternatives considered**:
- New `ALTER TABLE` migrations layered on top — the standard practice for a *shipped* project, explicitly not this one's situation right now per its own established convention.

## Decision 12: CI — extend the existing smoke job

**Decision**: Add a second smoke pass to `.github/workflows/ci.yml` that runs `docker compose up` with `AUTH_ENABLED=true` and a generated `LOADGEN_API_KEY`, asserting: (a) `GET /health` still unauthenticated and 200; (b) all three data endpoints succeed with `Authorization: Bearer <key>`; (c) all three data endpoints return 401 without it.

**Rationale**: Directly implements FR-027 / the project brief's CI Requirement ("Your pipeline must run the required-contract smoke test in both configurations"). The existing `smoke` job's comment already anticipates this ("No `AUTH_ENABLED` is set here on purpose: the project implements no optional auth feature... only the unauthenticated configuration applies" — this feature is what changes that).

**Alternatives considered**:
- A wholly separate workflow file — rejected as unnecessary duplication of the existing `docker compose up` / health-poll / teardown steps; a second job (or a matrix over `AUTH_ENABLED`) reusing the same steps is simpler to maintain.

## Decision 13: Retention/partition management must be made tenant-aware (`/speckit-analyze` finding E1 — CRITICAL)

**Decision**: `src/retention/partition.service.ts`'s `ensureDailyPartition()` method must be updated as part of this feature — it is **not** unchanged, correcting an error in the original version of this plan.

Specifically, in the temp-table re-insertion step:

```sql
INSERT INTO "logs" (
  "id", "timestamp", "level", "service", "message",
  "attributes", "attributes_text", "ingested_at"
  -- MUST ADD: "tenant_id"
) OVERRIDING SYSTEM VALUE
SELECT
  "id", "timestamp", "level", "service", "message",
  "attributes", "attributes_text", "ingested_at"
  -- MUST ADD: "tenant_id"
FROM "${temporaryTableName}"
```

Both the `INSERT INTO "logs" (...)` column list and the `SELECT ...` column list immediately above it must gain `tenant_id`. The preceding `CREATE TEMP TABLE ... AS SELECT * FROM "logs_default" WHERE ...` step needs **no change** — `SELECT *` already captures `tenant_id` automatically once it exists on `logs`; only the two explicit column lists in the final re-insertion `INSERT ... SELECT` were missed.

**Rationale**: `tenant_id` is `NOT NULL` with no column default (Decision 6, by design — no FK, no fallback value). `PartitionService.ensureDailyPartition()` is invoked by `RetentionService.runMaintenance()` proactively (governed by `LOG_PARTITION_DAYS_AHEAD`, default 7 days ahead) — it is not a rare code path, it is the routine mechanism by which every day's data gets a properly-pruned partition instead of accumulating in `logs_default`. Without this fix:

1. The very first time `ensureDailyPartition()` needs to migrate any row out of `logs_default` into a newly created named partition, the `INSERT` throws a `NOT NULL` constraint violation.
2. `ensureDailyPartition()`'s own error handling rolls back its transaction and re-throws (see its `catch` block); the exception propagates up through `ensureDailyPartitions()` and out of `runMaintenance()` uncaught.
3. Because the partition was never successfully created, every subsequent scheduled retention run hits the exact same failure on the same window — this does not self-heal, it fails identically forever.
4. All new data silently keeps accumulating in `logs_default` (which has no time-range constraint, being the `DEFAULT` partition), permanently defeating partition pruning for every query and aggregation, directly threatening the `<1s` p95 / `20s`-queryable targets, and permanently defeating retention's ability to drop expired data (`dropExpiredDailyPartitions()` only ever drops *named*, date-pattern-matching partitions — it never touches `logs_default`).

This is a correctness bug, not a performance nuance — it would not be caught by a schema review that only looked at `CREATE TABLE`/index migrations and the entity file, because the breakage lives in *application code that constructs an explicit column-list INSERT against a table it doesn't own the schema of*. It was caught only by directly reading `partition.service.ts` end-to-end against the new `NOT NULL` constraint, which is why `/speckit-analyze` — not the original planning pass — is what surfaced it.

**Retention policy itself remains tenant-agnostic, correctly**: `RetentionService.deleteExpiredRows()` (`DELETE ... WHERE timestamp < cutoff`) and `dropExpiredDailyPartitions()` (drops whole partition tables by date) both need **no tenant-awareness at the policy level** — spec Assumptions explicitly keep retention system-wide across all tenants. The fix here is narrowly about `ensureDailyPartition()`'s SQL correctness under the new `NOT NULL` constraint, not about making retention policy itself tenant-scoped.

**Alternatives considered**:
- Give `tenant_id` a column default (e.g., `DEFAULT_TENANT_ID`) so the omission wouldn't crash — rejected: this would *silently* misattribute every partition-migrated row to the wrong tenant (whatever the default happens to be) instead of failing loudly, which is strictly worse than a visible `NOT NULL` error during development/testing. Fixing the actual column list is no harder and is correct rather than merely non-crashing.

## Decision 14: Mandatory post-implementation performance validation (`/speckit-analyze` finding E3 — HIGH)

**Decision**: This feature is not considered complete until it has been benchmarked against the pre-multi-tenancy baseline using the project's existing load-testing methodology (the external load-testing portal — see `.wolf/cerebrum.md`'s recorded workflow: local runs are diagnostic only, the portal is the source of authoritative numbers). At minimum, compare, before vs. after:

- Ingestion throughput (logs/sec)
- Aggregation query latency, p95
- Query (`GET /logs`) latency, p95
- Application container CPU/memory usage under load
- PostgreSQL container CPU/memory usage under load

**Rationale**: Spec SC-007 ("enabling authentication and multi-tenancy does not measurably regress previously achieved ingestion throughput or aggregate query latency") is a Success Criterion, not a suggestion, and the original task set had zero tasks covering it — a pure coverage gap caught by `/speckit-analyze`. It is especially load-bearing here because this feature's highest-risk single change, by this project's own documented history, is exactly the kind of change that has silently regressed the headline metric before: `idx_logs_tenant_timestamp_id` (Decision 10) is a **net-new** composite btree index added to the hottest write path in the system, justified by inference about query patterns rather than by measurement — precisely the situation CLAUDE.md's indexing rule ("prefer measured optimization over assumptions") exists to catch before it ships, not after.

**Enforcement rule**: if this benchmark shows a meaningful ingestion-throughput regression, the correct response is to **revisit the index strategy** (starting with the alternative sketched in Decision 10's "Status" note — dropping `idx_logs_tenant_timestamp_id` and relying on a PK-backward-scan-plus-tenant-filter for the no-filter query case, viable at "tens of tenants" scale) — not to accept the regression, and not to keep the current three-index design merely because it was the original design. Indexes in this codebase are removed on measured evidence (see `DropLogsMessageTrigramIndex`'s own migration comment for the precedent) — the same bar applies to indexes *added* here.

**Alternatives considered**:
- Rely on `quickstart.md`'s functional scenarios alone — rejected: those scenarios prove correctness (isolation, auth, contract-compatibility), not throughput/latency; they run against trivial data volumes and cannot surface a regression that only appears under the ~1M-row / concurrent-load conditions SC-007 is actually about.
- Skip re-benchmarking and trust the reasoning in Decision 10 — rejected: this is exactly the "assumption over measurement" pattern CLAUDE.md's own performance principles warn against, in a codebase that has already been burned by it once (the trigram-index episode).

## Constitution re-check notes

Revisited after drafting the above against CLAUDE.md's principles (no ratified `.specify/memory/constitution.md` exists — see plan.md's Constitution Check):
- **Simplicity**: no global guard machinery (Decision 7), no caching layer (ruled out by SC-005's immediate-revocation requirement), no refresh-token family tracking (Decision 3), no FK-driven default-tenant seeding (Decision 6).
- **One new dependency, justified**: `@nestjs/jwt` only (Decision 2); password hashing and API-key generation stay dependency-free (Decisions 1, 5).
- **Indexes justified by query pattern, but not yet by measurement**: Decision 10 is a direct, mechanical consequence of the new mandatory `tenant_id` predicate — reasoned the same way the existing indexes' "equality columns lead" pattern was originally reasoned — but per CLAUDE.md's own stronger bar ("prefer measured optimization over assumptions"), reasoning alone is provisional. Decision 14 makes the post-implementation benchmark mandatory, with an explicit instruction to revisit the index design (not defend it) if it regresses ingestion.
- **Existing architecture/API contracts preserved**: the required 4 endpoints' request/response shapes are untouched (verified endpoint-by-endpoint in `contracts/logs-endpoints-auth.md`); the dual read/write connection-pool split and the COPY-based ingestion path are extended, not replaced.
- **Retention/partitioning corrected, not merely "preserved"**: the original planning pass incorrectly described `src/retention/` as unchanged. `/speckit-analyze` caught that `partition.service.ts`'s explicit-column-list re-insertion SQL needed a real code change (Decision 13) to remain correct once `tenant_id` became `NOT NULL`. Retention *policy* (what to delete, on what schedule) stays correctly tenant-agnostic per spec Assumptions; only the partition-management *mechanics* needed a fix — this distinction is now made explicit throughout the plan so it isn't mischaracterized as "no retention changes" again.
