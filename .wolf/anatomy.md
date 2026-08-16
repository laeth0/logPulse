# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-08-16T06:33:46.446Z
> Files: 271 tracked | Anatomy hits: 0 | Misses: 0

## ./

- `.gitignore` — Git ignore rules (~152 tok)
- `AGENTS.md` — OpenWolf (~763 tok)
- `CLAUDE.md` — OpenWolf (~763 tok)
- `docker-compose.yml` — Docker Compose services (~956 tok)
- `README.md` — Project documentation (~10060 tok)

## .agents/skills/speckit-agent-context-update/

- `SKILL.md` — Update Coding Agent Context (~382 tok)

## .agents/skills/speckit-analyze/

- `SKILL.md` — User Input (~2714 tok)

## .agents/skills/speckit-checklist/

- `SKILL.md` — Checklist Purpose: "Unit Tests for English" (~5083 tok)

## .agents/skills/speckit-clarify/

- `SKILL.md` — User Input (~4316 tok)

## .agents/skills/speckit-constitution/

- `SKILL.md` — User Input (~2139 tok)

## .agents/skills/speckit-converge/

- `SKILL.md` — User Input (~2960 tok)

## .agents/skills/speckit-implement/

- `SKILL.md` — User Input (~2838 tok)

## .agents/skills/speckit-plan/

- `SKILL.md` — User Input (~1849 tok)

## .agents/skills/speckit-specify/

- `SKILL.md` — User Input (~4392 tok)

## .agents/skills/speckit-tasks/

- `SKILL.md` — User Input (~2536 tok)

## .agents/skills/speckit-taskstoissues/

- `SKILL.md` — User Input (~1115 tok)

## .claude/

- `settings.json` (~514 tok)
- `settings.local.json` (~187 tok)

## .claude/commands/

- `reframe.md` — Mode: migrate [framework] (~551 tok)
- `security-audit.md` — Layer 1 — Dependencies (~510 tok)

## .claude/rules/

- `openwolf.md` (~328 tok)

## .claude/skills/speckit-analyze/

- `SKILL.md` — User Input (~2740 tok)

## .claude/skills/speckit-checklist/

- `SKILL.md` — Checklist Purpose: "Unit Tests for English" (~5110 tok)

## .claude/skills/speckit-clarify/

- `SKILL.md` — User Input (~4343 tok)

## .claude/skills/speckit-constitution/

- `SKILL.md` — User Input (~2169 tok)

## .claude/skills/speckit-converge/

- `SKILL.md` — User Input (~2973 tok)

## .claude/skills/speckit-implement/

- `SKILL.md` — User Input (~2867 tok)

## .claude/skills/speckit-plan/

- `SKILL.md` — User Input (~1876 tok)

## .claude/skills/speckit-specify/

- `SKILL.md` — User Input (~4419 tok)

## .claude/skills/speckit-tasks/

- `SKILL.md` — User Input (~2562 tok)

## .claude/skills/speckit-taskstoissues/

- `SKILL.md` — User Input (~1143 tok)

## .codex/

- `config.toml` (~7 tok)
- `hooks.json` (~693 tok)

## .codex/prompts/

- `reframe.md` — Mode: migrate [framework] (~551 tok)
- `security-audit.md` — Layer 1 — Dependencies (~510 tok)

## .github/workflows/

- `ci.yml` — CI: CI (~2713 tok)

## .specify/

- `extensions.yml` (~180 tok)
- `feature.json` (~18 tok)
- `init-options.json` (~51 tok)
- `integration.json` (~110 tok)

## .specify/extensions/

- `.registry` (~170 tok)

## .specify/extensions/agent-context/

- `agent-context-config.yml` (~30 tok)
- `extension.yml` (~267 tok)
- `README.md` — Project documentation (~666 tok)

## .specify/extensions/agent-context/commands/

- `speckit.agent-context.update.md` — Update Coding Agent Context (~322 tok)

## .specify/extensions/agent-context/scripts/bash/

- `update-agent-context.sh` — update-agent-context.sh (~1886 tok)

## .specify/extensions/agent-context/scripts/powershell/

- `update-agent-context.ps1` — update-agent-context.ps1 (~2055 tok)

## .specify/integrations/

- `claude.manifest.json` (~372 tok)
- `codex.manifest.json` (~372 tok)
- `speckit.manifest.json` (~376 tok)

## .specify/memory/

- `constitution.md` — [PROJECT_NAME] Constitution (~584 tok)

## .specify/scripts/powershell/

- `check-prerequisites.ps1` — Consolidated prerequisite checking script (PowerShell) (~1273 tok)
- `common.ps1` — Common PowerShell functions analogous to common.sh (~5529 tok)
- `create-new-feature.ps1` — Create a new feature (~2476 tok)
- `setup-plan.ps1` — Setup implementation plan for a feature (~566 tok)
- `setup-tasks.ps1` (~781 tok)

## .specify/templates/

- `checklist-template.md` — [CHECKLIST TYPE] Checklist: [FEATURE NAME] (~328 tok)
- `constitution-template.md` — [PROJECT_NAME] Constitution (~584 tok)
- `plan-template.md` — Implementation Plan: [FEATURE] (~886 tok)
- `spec-template.md` — Feature Specification: [FEATURE NAME] (~1139 tok)
- `tasks-template.md` — Tasks: [FEATURE NAME] (~2284 tok)

## .specify/workflows/

- `workflow-registry.json` (~109 tok)

## .specify/workflows/speckit/

- `workflow.yml` (~626 tok)

## backend/

- `.dockerignore` — Docker ignore rules (~51 tok)
- `.gitignore` — Git ignore rules (~152 tok)
- `.prettierrc` — Prettier configuration (~15 tok)
- `Dockerfile` — Docker container definition (~304 tok)
- `eslint.config.mjs` — ESLint flat configuration (~250 tok)
- `nest-cli.json` (~49 tok)
- `package-lock.json` — npm lock file (~112418 tok)
- `package.json` — Node.js package manifest (~1094 tok)
- `projectSchema.dbml` (~1467 tok)
- `tsconfig.build.json` — TypeScript build configuration (~28 tok)
- `tsconfig.json` — TypeScript configuration (~207 tok)

## backend/prompt/

- `RLS.md` — Introduce PostgreSQL Row-Level Security for Multi-Tenancy (~3151 tok)

## backend/requests/

- `health.check.rest` — GET /health (~90 tok)
- `logs.aggregate.rest` — Aggregates filtered logs into supported time buckets with optional grouping. (~119 tok)
- `logs.ingest.rest` — Ingests a batch while preserving valid entries when another entry is rejected. (~241 tok)
- `logs.list.rest` — Queries logs with freely combinable filters and opaque cursor pagination. (~133 tok)

## backend/requests/logs/

- `logs.ingest.backpressure-503.rest` — Demonstrates the optional backpressure feature's 503 response (specs/003-ingestion-backpressure). (~376 tok)
- `logs.ingest.oversized-413.rest` — Demonstrates the optional backpressure feature's 413 response (specs/003-ingestion-backpressure) (~491 tok)

## backend/requests/tenancy/

- `tenancy.api-keys.create.rest` — Creates a new API key for the authenticated Tenant's own account. Requires (~175 tok)
- `tenancy.api-keys.list.rest` — Lists every API key owned by the authenticated Tenant — including each (~103 tok)
- `tenancy.api-keys.revoke.rest` — Revokes one of the authenticated Tenant's own API keys. Idempotent if (~147 tok)
- `tenancy.login.rest` — Authenticates a Tenant and issues an access token (account/API-key (~205 tok)
- `tenancy.refresh.rest` — Exchanges a valid refresh token for a new access + refresh pair (rotation: (~177 tok)
- `tenancy.register.rest` — Self-registers a new Tenant account (email + password). No auth required — (~187 tok)

## backend/specs/001-multi-tenancy/

- `data-model.md` — Phase 1 Data Model: Multi-Tenancy (~2295 tok)
- `plan.md` — Implementation Plan: Multi-Tenancy (~3205 tok)
- `quickstart.md` — Quickstart: Validating Multi-Tenancy (~1593 tok)
- `research.md` — Phase 0 Research: Multi-Tenancy (~9027 tok)
- `spec.md` — Feature Specification: Multi-Tenancy (~5485 tok)
- `tasks.md` — Tasks: Multi-Tenancy (~10004 tok)

## backend/specs/001-multi-tenancy/checklists/

- `requirements.md` — Specification Quality Checklist: Multi-Tenancy (~615 tok)

## backend/specs/001-multi-tenancy/contracts/

- `api-keys-api.md` — Contract: Tenant API Key Management Endpoints (~1006 tok)
- `logs-endpoints-auth.md` — Contract: Additive Auth Behavior on the 4 Required Endpoints (~784 tok)
- `tenant-accounts-api.md` — Contract: Tenant Account Endpoints (~783 tok)

## backend/specs/002-performance-optimization/

- `data-model.md` — Phase 1 Data Model: Performance Optimization (~1579 tok)
- `plan.md` — Implementation Plan: Performance Optimization (~3922 tok)
- `quickstart.md` — Quickstart: Validating Performance Optimization (~3182 tok)
- `research.md` — Phase 0 Research: Performance Optimization (~8685 tok)
- `spec.md` — Feature Specification: Performance Optimization (~5215 tok)
- `tasks.md` — Tasks: Performance Optimization (~6904 tok)

## backend/specs/002-performance-optimization/checklists/

- `requirements.md` — Specification Quality Checklist: Performance Optimization (~468 tok)

## backend/specs/003-ingestion-backpressure/

- `data-model.md` — Data Model: Optional Backpressure Support (~1800 tok)
- `plan.md` — Implementation Plan: Optional Backpressure Support (~3550 tok)
- `quickstart.md` — Quickstart: Validating Optional Backpressure Support (~2257 tok)
- `research.md` — Research: Optional Backpressure Support (~4920 tok)
- `spec.md` — Feature Specification: Optional Backpressure Support (~4654 tok)
- `tasks.md` — Tasks: Optional Backpressure Support (~8401 tok)

## backend/specs/003-ingestion-backpressure/checklists/

- `requirements.md` — Specification Quality Checklist: Optional Backpressure Support (~578 tok)

## backend/specs/003-ingestion-backpressure/contracts/

- `post-logs-backpressure.md` — Contract: Additive Backpressure Responses on `POST /logs` (~958 tok)

## backend/src/

- `app.controller.ts` — Exports AppController (~79 tok)
- `app.module.ts` — Exports AppModule (~479 tok)
- `app.service.ts` — Exports AppService (~41 tok)
- `main.ts` — Declares bootstrap (~639 tok)
  - fn `bootstrap` L10-58 (~522 tok)

## backend/src/common/constants/

- `http.constants.ts` — Exports DEFAULT_JSON_BODY_LIMIT (~14 tok)
- `log-api.constants.ts` — Exports DEFAULT_LOG_QUERY_LIMIT, MAX_LOG_QUERY_LIMIT, MAX_FUTURE_TIMESTAMP_OFFSET_MS, ATTRIBUTE_QUERY_PREFIX + 12 more (~693 tok)
- `log-query.constants.ts` — Exports LOG_AGGREGATION_ORIGIN, LOG_AGGREGATION_BUCKET_INTERVALS, LOG_AGGREGATION_GROUP_COLUMNS (~91 tok)
- `postgres.constants.ts` — PostgreSQL SQLSTATE error codes (stable, part of the Postgres error-code (~59 tok)
- `retention.constants.ts` — Exports DEFAULT_LOG_RETENTION_DAYS, MAX_LOG_RETENTION_DAYS, DEFAULT_LOG_PARTITION_DAYS_AHEAD, MAX_LOG_PARTITION_DAYS_AHEAD + 5 more (~261 tok)
- `tenancy.constants.ts` — Fixed tenant identifiers reserved by the system, never issued to a (~646 tok)

## backend/src/common/filters/

- `global-exception.filter.ts` — Global exception filter that normalizes all thrown exceptions into the (~1048 tok)
  - class `GlobalExceptionFilter` L25-82 (~649 tok)
  - section `ExternalClientError` L83-87 (~21 tok)
  - fn `getExternalClientError` L88-100 (~114 tok)
  - fn `getRetryAfterSeconds` L101-108 (~73 tok)

## backend/src/common/utils/

- `rollup-bucket.utils.ts` — Rounds a Date up to the next rollup-bucket (minute) boundary, unchanged if (~310 tok)

## backend/src/common/validators/

- `zod-validation.utils.ts` — Exports parseWithSchema, getFirstIssueMessage (~142 tok)

## backend/src/config/

- `data-source.ts` — Exports AppDataSource (~148 tok)
- `database.config.ts` — Builds a TypeORM {@link DataSourceOptions} object from environment variables. (~590 tok)
  - fn `createDatabaseOptions` L16-47 (~332 tok)
  - fn `createReadDatabaseOptions` L48-61 (~91 tok)

## backend/src/health/

- `health.controller.ts` — Exposes the GET /health endpoint required by the project specification. (~386 tok)
- `health.module.ts` — HealthModule — no TypeOrmModule.forFeature() needed here. (~158 tok)
- `health.service.ts` — Performs deep health checks against each infrastructure dependency. (~682 tok)
  - class `HealthService` L21-83 (~510 tok)
- `health.types.ts` — Exports DatabaseStatus, MigrationStatus, HealthStatus (~82 tok)

## backend/src/logs/

- `logs.controller.ts` — Exports LogsController (~1130 tok)
  - class `LogsController` L37-100 (~768 tok)
- `logs.module.ts` — Exports LogsModule (~339 tok)

## backend/src/logs/config/

- `backpressure.config.ts` — Reads and validates the optional backpressure configuration from environment (~688 tok)
  - section `BackpressureConfig` L9-22 (~165 tok)
  - fn `createBackpressureConfig` L23-49 (~227 tok)
  - fn `parsePositiveInteger` L50-70 (~123 tok)
  - fn `parseByteSize` L71-87 (~112 tok)

## backend/src/logs/cursor/

- `cursor.service.ts` — Exports CursorService (~343 tok)

## backend/src/logs/dto/requests/

- `aggregate-logs.dto.ts` — Exports AggregateLogsDto (~339 tok)
- `ingest-logs.dto.ts` — Exports IngestLogsDto (~59 tok)
- `log-entry.dto.ts` — Exports LogEntryDto (~238 tok)
- `query-logs.dto.ts` — Exports QueryLogsDto (~280 tok)

## backend/src/logs/dto/responses/

- `aggregate-logs-response.dto.ts` — Exports AggregateBucketDto, AggregateLogsResponseDto (~124 tok)
- `ingest-logs-response.dto.ts` — Exports RejectedLogDto, IngestLogsResponseDto (~106 tok)
- `query-logs-response.dto.ts` — Exports LogResponseDto, QueryLogsResponseDto (~312 tok)

## backend/src/logs/entities/

- `log-rollup.entity.ts` — A derived, tenant-scoped, minute-granularity count — never a second (~467 tok)
- `log.entity.ts` — Exports Log (~504 tok)
  - class `Log` L31-71 (~284 tok)

## backend/src/logs/enums/

- `aggregation-bucket.enum.ts` — Exports AggregationBucket (~33 tok)
- `aggregation-group.enum.ts` — Exports AggregationGroup (~22 tok)
- `log-level.enum.ts` — Exports LogLevel (~28 tok)

## backend/src/logs/errors/

- `ingestion-capacity.errors.ts` — Thrown by `LogRepository.checkAdmission()` when a batch's valid entries alone (~313 tok)

## backend/src/logs/exceptions/

- `backpressure.exception.ts` — HTTP-layer counterpart of `IngestionCapacityExceededError` — constructed (~203 tok)

## backend/src/logs/interfaces/

- `cursor-payload.interface.ts` — Exports CursorPayload (~20 tok)
- `log-query.interface.ts` — Raw `getRawMany()` row shape for a page of `logs` — see log-query.builder.ts's explicit column aliases. (~389 tok)
- `log-repository.interface.ts` — Exports LogAttributeValue, NewLog, LogRepositoryContract (~184 tok)

## backend/src/logs/mappers/

- `log.mapper.ts` — Exports mapLogEntryToNewLog, mapLogToResponse, mapAggregationToResponse (~478 tok)

## backend/src/logs/query-builders/

- `aggregation-query.builder.ts` — True when the request can be answered (wholly or in part) from (~1145 tok)
  - fn `buildAggregationQuery` L14-47 (~302 tok)
  - fn `isRollupEligible` L48-61 (~142 tok)
  - fn `buildRollupAggregationQuery` L62-104 (~420 tok)
  - fn `createBucketExpression` L105-108 (~57 tok)
  - fn `createGroupExpression` L109-119 (~60 tok)
- `log-filter.builder.ts` — `attr.<key>=<value>` equality, "compared as strings" per (~1165 tok)
  - fn `applyLogFilters` L6-61 (~438 tok)
  - fn `escapeLikePattern` L62-81 (~312 tok)
  - fn `buildAttributeEqualityClause` L82-112 (~308 tok)
  - fn `parseCanonicalNumber` L113-119 (~55 tok)
- `log-query.builder.ts` — Exports buildLogPageQuery (~309 tok)

## backend/src/logs/repositories/

- `log.repository.ts` — One caller's still-pending insertMany() call: its rows plus the settlers (~4430 tok)
  - section `PendingInsert` L45-53 (~96 tok)
  - section `RollupDelta` L54-62 (~38 tok)
  - class `LogRepository` L63-463 (~3866 tok)

## backend/src/logs/services/

- `log-aggregation.service.ts` — Exports LogAggregationService (~310 tok)
- `log-ingestion.service.ts` — Exports LogIngestionService (~595 tok)
  - class `LogIngestionService` L18-67 (~401 tok)
- `log-query.service.ts` — Exports LogQueryService (~482 tok)

## backend/src/logs/validators/

- `cursor-payload.schema.ts` — Zod schemas: cursorPayloadSchema (~128 tok)
- `iso-timestamp.schema.ts` — Exports createIsoTimestampSchema (~112 tok)
- `log-entry.schema.ts` — Zod schemas: attributeValueSchema, logBatchSchema, logEntrySchema (~485 tok)
- `log-entry.validator.ts` — Exports LogEntryValidator (~625 tok)
  - class `LogEntryValidator` L14-64 (~438 tok)
  - fn `readProperty` L65-70 (~50 tok)
- `log-query.schema.ts` — Zod schemas: attributeFilterKeySchema, aggregationBucketSchema (~944 tok)
  - fn `createParametersSchema` L16-36 (~172 tok)
  - fn `createSingleStringSchema` L37-40 (~38 tok)
  - fn `createTimestampSchema` L41-112 (~582 tok)
- `log-query.validator.ts` — Exports LogQueryValidator (~704 tok)
  - class `LogQueryValidator` L20-76 (~510 tok)

## backend/src/migrations/

- `1785684350112-CreatePgTrgmExtension.ts` — Installs the pg_trgm extension required for trigram-based (~253 tok)
- `1785684350113-CreateLogLevelEnum.ts` — Creates the log_level PostgreSQL enum type. (~221 tok)
- `1785684350114-CreateLogsTable.ts` — Creates the partitioned logs table with all column definitions, (~680 tok)
  - class `CreateLogsTable1785684350114` L12-58 (~552 tok)
- `1785684350115-CreateLogsTableBtreeIndexes.ts` — Creates B-tree indexes for equality + range filtering and deterministic (~771 tok)
  - class `CreateLogsTableBtreeIndexes1785684350115` L25-64 (~439 tok)
- `1785684350116-CreateLogsTableGinIndexes.ts` — Creates GIN indexes for unstructured search on the logs table. (~432 tok)
- `1785684350117-DropLogsMessageTrigramIndex.ts` — Drops the trigram GIN index on `logs.message`. (~398 tok)
- `1785684350118-CreateTenancyTables.ts` — Creates the multi-tenancy tables: `tenants` (self-service customer (~968 tok)
  - class `CreateTenancyTables1785684350118` L14-94 (~782 tok)
- `1785684350119-CreateLogRollupsTable.ts` — Creates `log_rollups` — a derived, tenant-scoped, minute-granularity (~733 tok)
  - class `CreateLogRollupsTable1785684350119` L24-61 (~382 tok)

## backend/src/retention/

- `partition.service.ts` — Exports PartitionService (~1841 tok)
  - class `PartitionService` L15-237 (~1732 tok)
- `retention.module.ts` — Exports RetentionModule (~104 tok)
- `retention.scheduler.ts` — Exports RetentionScheduler (~280 tok)
- `retention.service.ts` — Bulk-deletes rows strictly before `cutoffBucket` — every log_rollups (~1920 tok)
  - class `RetentionService` L22-205 (~1712 tok)

## backend/src/retention/interfaces/

- `partition.interface.ts` — Exports PartitionRow, PartitionExistsRow (~34 tok)
- `retention.interface.ts` — Exports AdvisoryLockRow, BoundaryBucketDeleteRow (~37 tok)

## backend/src/scripts/

- `create-database.ts` — Declares createDatabase (~349 tok)
- `drop-database.ts` — Declares dropDatabase (~274 tok)

## backend/src/tenancy/

- `tenancy.module.ts` — Exports TenancyModule (~502 tok)
  - class `TenancyModule` L38-39 (~9 tok)

## backend/src/tenancy/controllers/

- `api-keys.controller.ts` — Guarded by TenantJwtAuthGuard — always authenticated, regardless of (~982 tok)
  - class `ApiKeysController` L38-97 (~573 tok)
  - fn `mapApiKeyToDto` L98-106 (~56 tok)
- `tenant-auth.controller.ts` — No guards on any of these three — self-service Tenant account creation (~819 tok)
  - class `TenantAuthController` L33-75 (~491 tok)

## backend/src/tenancy/decorators/

- `current-tenant-id.decorator.ts` — `ApiKeyAuthGuard`/`TenantJwtAuthGuard` attach the resolved tenant id to the (~181 tok)

## backend/src/tenancy/dto/requests/

- `login-tenant.dto.ts` — Exports LoginTenantDto (~69 tok)
- `refresh-token.dto.ts` — Exports RefreshTokenDto (~44 tok)
- `register-tenant.dto.ts` — Exports RegisterTenantDto (~70 tok)

## backend/src/tenancy/dto/responses/

- `api-key-list.dto.ts` — Exports ApiKeyListDto (~60 tok)
- `api-key.dto.ts` — Exports ApiKeyDto (~179 tok)
- `auth-tokens.dto.ts` — Exports AuthTokensDto (~110 tok)
- `tenant.dto.ts` — Exports TenantDto (~65 tok)

## backend/src/tenancy/entities/

- `api-key.entity.ts` — Exports ApiKey (~236 tok)
- `refresh-token.entity.ts` — Exports TenantRefreshToken (~203 tok)
- `tenant.entity.ts` — Exports Tenant (~111 tok)

## backend/src/tenancy/enums/

- `api-key-status.enum.ts` — Exports ApiKeyStatus (~21 tok)

## backend/src/tenancy/guards/

- `api-key-auth.guard.ts` — Guards POST /logs, GET /logs, GET /logs/aggregate. Branches on (~690 tok)
  - class `ApiKeyAuthGuard` L24-62 (~365 tok)
  - fn `extractCredential` L63-78 (~129 tok)
- `tenant-jwt-auth.guard.ts` — Guards the Tenant account/API-key-management endpoints. (~622 tok)
  - class `TenantJwtAuthGuard` L27-50 (~238 tok)
  - fn `extractBearerToken` L51-60 (~82 tok)

## backend/src/tenancy/interfaces/

- `jwt-payload.interface.ts` — Exports TenantJwtPayload (~24 tok)

## backend/src/tenancy/services/

- `api-key.service.ts` — Single indexed point lookup (idx_api_keys_tenant_id's unique key_value (~629 tok)
  - class `ApiKeyService` L10-72 (~521 tok)
- `loadgen-key-seeder.service.ts` — Idempotently seeds LOADGEN_API_KEY at startup (spec FR-006/FR-007/FR-008; (~657 tok)
  - class `LoadgenKeySeeder` L21-69 (~424 tok)
- `tenant-auth.service.ts` — Exports TenantAuthService (~1239 tok)
  - class `TenantAuthService` L20-131 (~902 tok)
  - fn `normalizeEmail` L132-135 (~26 tok)
  - fn `isUniqueViolation` L136-144 (~63 tok)
- `token.service.ts` — Signs/verifies Tenant access and refresh tokens (research.md Decisions 2, (~598 tok)
  - class `TokenService` L18-74 (~430 tok)

## backend/src/tenancy/utils/

- `api-key-generator.util.ts` — Generates an opaque, dot-free API key (`lp_<32 base64url chars>`), (~107 tok)
- `password-hasher.util.ts` — Hashes a password (or any secret — also reused for refresh-token hashing, (~298 tok)

## backend/src/tenancy/validators/

- `api-key.schema.ts` — POST /tenants/api-keys takes no meaningful body today (contracts/ (~84 tok)
- `tenant-auth.schema.ts` — Zod schemas: emailSchema, registerTenantSchema, loginTenantSchema, refreshTokenSchema (~249 tok)

## backend/test/

- `jest-integration.json` (~131 tok)

## backend/test/integration/app/

- `app.integration-spec.ts` — API routes: GET (1 endpoints) (~214 tok)

## backend/test/integration/health/

- `health.integration-spec.ts` — API routes: GET (2 endpoints) (~604 tok)
  - section `MigrationRow` L11-73 (~500 tok)

## backend/test/integration/logs/

- `logs.integration-spec.ts` — API routes: POST, GET (9 endpoints) (~2341 tok)

## backend/test/integration/setup/

- `global-setup.ts` — Declares globalSetup (~205 tok)
- `load-testing-environment.ts` — Declares testEnvironmentPath (~206 tok)

## backend/test/integration/support/

- `create-integration-app.ts` — Exports createIntegrationApp (~240 tok)
- `environment.ts` — Exports restoreEnvironmentVariable (~66 tok)
- `http-auth.ts` — Exports bearer (~26 tok)
- `log-fixtures.ts` — Exports buildLog, buildTenantLog, alignToMinute (~228 tok)
- `logs-api.ts` — API routes: POST, GET (2 endpoints) (~337 tok)
- `tenancy-api.ts` — API routes: POST (3 endpoints) (~420 tok)
- `tenancy-assertions.ts` — Exports expectAuthTokens (~143 tok)

## backend/test/integration/tenancy/

- `tenancy.integration-spec.ts` — API routes: POST, GET, DELETE (19 endpoints) (~2529 tok)

## docs/

- `Final_Project.md` — Final Project: Log Ingestion and Query Service (~4615 tok)
- `frontend-folder-structure.md` — LogPulse — Frontend Folder Structure (~1690 tok)

## frontend/

- `.gitignore` — Git ignore rules (~68 tok)
- `.prettierrc` — Prettier configuration (~34 tok)
- `Dockerfile` — Docker container definition (~77 tok)
- `eslint.config.js` — ESLint flat configuration (~211 tok)
- `index.html` — logpulse (~96 tok)
- `package-lock.json` — npm lock file (~39142 tok)
- `package.json` — Node.js package manifest (~385 tok)
- `README.md` — Project documentation (~607 tok)
- `tsconfig.app.json` (~188 tok)
- `tsconfig.json` — TypeScript configuration (~34 tok)
- `tsconfig.node.json` (~160 tok)
- `vite.config.ts` — Vite build configuration (~113 tok)

## frontend/public/

- `.gitkeep` (~1 tok)

## frontend/src/

- `App.css` (~0 tok)
- `App.tsx` — App — uses useState (~83 tok)
- `index.css` (~0 tok)
- `main.tsx` (~66 tok)

## frontend/src/features/

- `.gitkeep` (~1 tok)

## frontend/src/features/auth/

- `.gitkeep` (~1 tok)

## frontend/src/features/auth/api/

- `.gitkeep` (~1 tok)

## frontend/src/features/auth/hooks/

- `.gitkeep` (~1 tok)

## frontend/src/features/auth/pages/

- `.gitkeep` (~1 tok)

## frontend/src/features/auth/schemas/

- `.gitkeep` (~1 tok)

## frontend/src/features/auth/types/

- `.gitkeep` (~1 tok)

## frontend/src/features/dashboard/

- `.gitkeep` (~1 tok)

## frontend/src/features/dashboard/api/

- `.gitkeep` (~1 tok)

## frontend/src/features/dashboard/components/

- `.gitkeep` (~1 tok)

## frontend/src/features/dashboard/hooks/

- `.gitkeep` (~1 tok)

## frontend/src/features/dashboard/pages/

- `.gitkeep` (~1 tok)

## frontend/src/features/logs/

- `.gitkeep` (~1 tok)

## frontend/src/features/logs/api/

- `.gitkeep` (~1 tok)

## frontend/src/features/logs/components/

- `.gitkeep` (~1 tok)

## frontend/src/features/logs/hooks/

- `.gitkeep` (~1 tok)

## frontend/src/features/logs/pages/

- `.gitkeep` (~1 tok)

## frontend/src/features/logs/schemas/

- `.gitkeep` (~1 tok)

## frontend/src/features/logs/types/

- `.gitkeep` (~1 tok)

## frontend/src/lib/

- `.gitkeep` (~1 tok)

## frontend/src/router/

- `.gitkeep` (~1 tok)

## frontend/src/shared/

- `.gitkeep` (~1 tok)

## frontend/src/shared/api/

- `.gitkeep` (~1 tok)

## frontend/src/shared/components/

- `.gitkeep` (~1 tok)

## frontend/src/shared/components/layout/

- `.gitkeep` (~1 tok)

## frontend/src/shared/components/ui/

- `.gitkeep` (~1 tok)

## frontend/src/shared/hooks/

- `.gitkeep` (~1 tok)

## frontend/src/shared/types/

- `.gitkeep` (~1 tok)

## frontend/src/store/

- `.gitkeep` (~1 tok)

## frontend/src/styles/

- `.gitkeep` (~1 tok)
