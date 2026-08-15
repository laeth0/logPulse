# Graph Report - logPulse  (2026-08-15)

## Corpus Check
- 200 files · ~143,491 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1617 nodes · 2153 edges · 149 communities (111 shown, 38 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 33 edges (avg confidence: 0.79)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d48097c5`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- devDependencies
- Incremental Pre-Aggregation with Time-Based Rollup Tables.md
- scripts
- compilerOptions
- retention.service.ts
- app.module.ts
- Phase 0 Research: Multi-Tenancy
- log-query.schema.ts
- exclude
- Phase 0 Research: Performance Optimization
- nest-cli.json
- Research: Optional Backpressure Support
- dependencies
- Tasks: [FEATURE NAME]
- Tasks: Multi-Tenancy
- .agents/skills/speckit-analyze/SKILL.md
- .claude/skills/speckit-analyze/SKILL.md
- What You Must Do When Invoked
- aggregation-query.builder.ts
- tenant-auth.service.ts
- log-query.interface.ts
- LogRepository
- log-entry.validator.ts
- Introduce PostgreSQL Row-Level Security for Multi-Tenancy
- Tasks: Optional Backpressure Support
- .create
- Tasks: Performance Optimization
- logs.controller.ts
- tenancy.module.ts
- api-keys.controller.ts
- .aggregate
- .login
- tenancy.constants.ts
- log.repository.ts
- Execution Steps
- Execution Steps
- tenant-auth.controller.ts
- Final Project: Log Ingestion and Query Service
- Unit Testing Implementation Plan
- ApiKeyService
- CursorService
- logPulse
- common.ps1
- Feature Specification: [FEATURE NAME]
- .agents/skills/speckit-plan/SKILL.md
- .agents/skills/speckit-specify/SKILL.md
- .agents/skills/speckit-tasks/SKILL.md
- .claude/skills/speckit-plan/SKILL.md
- .claude/skills/speckit-specify/SKILL.md
- .claude/skills/speckit-tasks/SKILL.md
- Core Principles
- Core Principles
- Quickstart: Validating Multi-Tenancy
- Data Model: Optional Backpressure Support
- graphify reference: extra exports and benchmark
- Implementation Plan: [FEATURE]
- Quickstart: Validating Performance Optimization
- Quickstart: Validating Optional Backpressure Support
- .agents/skills/speckit-checklist/SKILL.md
- .claude/skills/speckit-checklist/SKILL.md
- Required API Contract
- `POST /logs`, `GET /logs`, `GET /logs/aggregate`
- parseWithSchema
- tenant-jwt-auth.guard.ts
- OpenWolf
- .agents/skills/speckit-clarify/SKILL.md
- .agents/skills/speckit-implement/SKILL.md
- .claude/skills/speckit-clarify/SKILL.md
- .claude/skills/speckit-implement/SKILL.md
- Optional Features and the Load Generator Contract
- 64. Comparison with your main alternatives
- Coding Agent Context Extension
- Phase 1 Data Model: Multi-Tenancy
- Contract: Additive Backpressure Responses on `POST /logs`
- OpenWolf
- commands/security-audit.md
- prompts/security-audit.md
- graphify reference: query, path, explain
- Authentication and API Keys
- Contract: Tenant Account Endpoints
- .agents/skills/speckit-constitution/SKILL.md
- .agents/skills/speckit-taskstoissues/SKILL.md
- .claude/skills/speckit-constitution/SKILL.md
- .claude/skills/speckit-taskstoissues/SKILL.md
- `POST /logs` — Ingest Logs
- 3. The terminology
- API documentation
- Performance
- [CHECKLIST TYPE] Checklist: [FEATURE NAME]
- Contract: Tenant API Key Management Endpoints
- Phase 1 Data Model: Performance Optimization
- load-testing-environment.ts
- Update Coding Agent Context
- commands/reframe.md
- prompts/reframe.md
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- 27. Choosing rollup granularity
- 29. Retention
- 48. Simple PostgreSQL schema
- Update Coding Agent Context
- create-new-feature.ps1
- CreatePgTrgmExtension1785684350112
- CreateLogLevelEnum1785684350113
- CreateLogsTable1785684350114
- CreateLogsTableBtreeIndexes1785684350115
- CreateLogsTableGinIndexes1785684350116
- DropLogsMessageTrigramIndex1785684350117
- CreateTenancyTables1785684350118
- CreateLogRollupsTable1785684350119
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- 32. PostgreSQL implementation choices
- Schema and index design
- extraction-spec.md
- 72. Technical terms worth studying next
- @eslint/eslintrc
- @eslint/js
- eslint-plugin-prettier
- globals
- jest
- @nestjs/cli
- @nestjs/schematics
- @nestjs/testing
- prettier
- source-map-support
- supertest
- ts-jest
- ts-loader
- ts-node
- @types/bcryptjs
- @types/bytes
- @types/express
- @types/jest
- @types/node
- @types/pg
- @types/supertest
- typescript
- typescript-eslint
- update-agent-context.sh

## God Nodes (most connected - your core abstractions)
1. `scripts` - 26 edges
2. `LogRepository` - 26 edges
3. `compilerOptions` - 23 edges
4. `Introduce PostgreSQL Row-Level Security for Multi-Tenancy` - 22 edges
5. `LogLevel` - 21 edges
6. `Log` - 17 edges
7. `ApiKey` - 17 edges
8. `PartitionService` - 16 edges
9. `Phase 0 Research: Multi-Tenancy` - 16 edges
10. `Tasks: Multi-Tenancy` - 16 edges

## Surprising Connections (you probably didn't know these)
- `LogEntryDto` --references--> `LogLevel`  [EXTRACTED]
  src/logs/dto/requests/log-entry.dto.ts → src/logs/enums/log-level.enum.ts
- `LogEntryDto` --references--> `LogAttributeValue`  [EXTRACTED]
  src/logs/dto/requests/log-entry.dto.ts → src/logs/interfaces/log-repository.interface.ts
- `LogResponseDto` --references--> `LogLevel`  [EXTRACTED]
  src/logs/dto/responses/query-logs-response.dto.ts → src/logs/enums/log-level.enum.ts
- `LogRollup` --references--> `LogLevel`  [EXTRACTED]
  src/logs/entities/log-rollup.entity.ts → src/logs/enums/log-level.enum.ts
- `Log` --references--> `LogLevel`  [EXTRACTED]
  src/logs/entities/log.entity.ts → src/logs/enums/log-level.enum.ts

## Import Cycles
- None detected.

## Communities (149 total, 38 thin omitted)

### Community 0 - "devDependencies"
Cohesion: 0.29
Nodes (7): eslint, eslint-config-prettier, devDependencies, eslint, eslint-config-prettier, tsconfig-paths, tsconfig-paths

### Community 1 - "Incremental Pre-Aggregation with Time-Based Rollup Tables.md"
Cohesion: 0.03
Nodes (65): 10. The most important part: hybrid raw + rollup queries, 11. Why the hybrid query remains exact, 12. An even better hierarchy with second rollups, 13. Output bucket granularity and source rollup granularity are different concepts, 14. 1m, 5m, 1h and 1d from minute rollups, 15. UNION ALL + final GROUP BY, 16. Why final GROUP BY is especially important for 5-minute requests, 17. Choosing what dimensions to pre-aggregate (+57 more)

### Community 2 - "scripts"
Cohesion: 0.04
Nodes (45): author, description, jest, collectCoverageFrom, coverageDirectory, moduleFileExtensions, rootDir, testEnvironment (+37 more)

### Community 3 - "compilerOptions"
Cohesion: 0.08
Nodes (23): compilerOptions, allowSyntheticDefaultImports, baseUrl, declaration, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, forceConsistentCasingInFileNames (+15 more)

### Community 4 - "retention.service.ts"
Cohesion: 0.07
Nodes (23): Cron, DAILY_PARTITION_NAME_PATTERN, DEFAULT_LOG_PARTITION_DAYS_AHEAD, DEFAULT_LOG_RETENTION_DAYS, LOG_RETENTION_LOCK_ID, LOG_RETENTION_LOCK_NAMESPACE, MAX_LOG_PARTITION_DAYS_AHEAD, MAX_LOG_RETENTION_DAYS (+15 more)

### Community 5 - "app.module.ts"
Cohesion: 0.05
Nodes (39): ApiServiceUnavailableResponse, Catch, AppController, Controller, Get, AppModule, Module, AppService (+31 more)

### Community 6 - "Phase 0 Research: Multi-Tenancy"
Cohesion: 0.04
Nodes (45): Content Quality, Feature Readiness, Notes, Requirement Completeness, Specification Quality Checklist: Multi-Tenancy, Complexity Tracking, Constitution Check, Documentation (this feature) (+37 more)

### Community 7 - "log-query.schema.ts"
Cohesion: 0.08
Nodes (38): ATTRIBUTE_QUERY_PREFIX, DEFAULT_BACKPRESSURE_MAX_PENDING_BYTES, DEFAULT_BACKPRESSURE_MAX_PENDING_ROWS, DEFAULT_BACKPRESSURE_RETRY_AFTER_SECONDS, DEFAULT_INGEST_COALESCE_MAX_ROWS, DEFAULT_INGEST_COALESCE_WINDOW_MS, DEFAULT_LOG_QUERY_LIMIT, ESTIMATED_BYTES_OVERHEAD_PER_LOG_ENTRY (+30 more)

### Community 8 - "exclude"
Cohesion: 0.25
Nodes (7): dist, node_modules, **/*spec.ts, test, ./tsconfig.json, exclude, extends

### Community 9 - "Phase 0 Research: Performance Optimization"
Cohesion: 0.05
Nodes (40): Content Quality, Feature Readiness, Notes, Requirement Completeness, Specification Quality Checklist: Performance Optimization, Complexity Tracking, Constitution Check, Documentation (this feature) (+32 more)

### Community 10 - "nest-cli.json"
Cohesion: 0.33
Nodes (5): collection, compilerOptions, deleteOutDir, $schema, sourceRoot

### Community 11 - "Research: Optional Backpressure Support"
Cohesion: 0.05
Nodes (35): Content Quality, Feature Readiness, Notes, Requirement Completeness, Specification Quality Checklist: Optional Backpressure Support, Complexity Tracking, Constitution Check, Documentation (this feature) (+27 more)

### Community 13 - "dependencies"
Cohesion: 0.06
Nodes (35): bcryptjs, bytes, chalk, dotenv, @nestjs/common, @nestjs/core, @nestjs/jwt, @nestjs/platform-express (+27 more)

### Community 14 - "Tasks: [FEATURE NAME]"
Cohesion: 0.07
Nodes (26): Dependencies & Execution Order, Format: `[ID] [P?] [Story] Description`, Implementation for User Story 1, Implementation for User Story 2, Implementation for User Story 3, Implementation Strategy, Incremental Delivery, MVP First (User Story 1 Only) (+18 more)

### Community 15 - "Tasks: Multi-Tenancy"
Cohesion: 0.07
Nodes (26): Dependencies & Execution Order, Format: `[ID] [P?] [Story] Description`, Implementation for User Story 1, Implementation for User Story 2, Implementation for User Story 3, Implementation for User Story 4, Implementation for User Story 5, Implementation Strategy (+18 more)

### Community 16 - ".agents/skills/speckit-analyze/SKILL.md"
Cohesion: 0.08
Nodes (25): 1. Initialize Analysis Context, 2. Load Artifacts (Progressive Disclosure), 3. Build Semantic Models, 4. Detection Passes (Token-Efficient Analysis), 5. Severity Assignment, 6. Produce Compact Analysis Report, 7. Provide Next Actions, 8. Offer Remediation (+17 more)

### Community 17 - ".claude/skills/speckit-analyze/SKILL.md"
Cohesion: 0.08
Nodes (25): 1. Initialize Analysis Context, 2. Load Artifacts (Progressive Disclosure), 3. Build Semantic Models, 4. Detection Passes (Token-Efficient Analysis), 5. Severity Assignment, 6. Produce Compact Analysis Report, 7. Provide Next Actions, 8. Offer Remediation (+17 more)

### Community 18 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 19 - "aggregation-query.builder.ts"
Cohesion: 0.14
Nodes (20): LOG_AGGREGATION_BUCKET_INTERVALS, LOG_AGGREGATION_GROUP_COLUMNS, LOG_AGGREGATION_ORIGIN, Log, Check, Column, CreateDateColumn, Entity (+12 more)

### Community 20 - "tenant-auth.service.ts"
Cohesion: 0.14
Nodes (11): POSTGRES_UNIQUE_VIOLATION, AuthTokensDto, ApiProperty, TenantDto, ApiProperty, isUniqueViolation(), normalizeEmail(), TenantAuthService (+3 more)

### Community 21 - "log-query.interface.ts"
Cohesion: 0.18
Nodes (14): AggregateLogsDto, ApiProperty, ApiPropertyOptional, QueryLogsDto, ApiPropertyOptional, AggregationBucket, AggregationGroup, LogLevel (+6 more)

### Community 22 - "LogRepository"
Cohesion: 0.15
Nodes (9): alignUpToRollupBucket(), RawLogAggregation, NewLog, isRollupEligible(), LogRepository, PendingInsert, Injectable, InjectDataSource (+1 more)

### Community 23 - "log-entry.validator.ts"
Cohesion: 0.14
Nodes (14): IngestLogsDto, ApiProperty, LogEntryDto, ApiProperty, ApiPropertyOptional, IngestLogsResponseDto, RejectedLogDto, ApiProperty (+6 more)

### Community 24 - "Introduce PostgreSQL Row-Level Security for Multi-Tenancy"
Cohesion: 0.09
Nodes (22): API-Key Management and Tenant Account Tables, AUTH_ENABLED=false, AUTH_ENABLED=true, Clean Code, Connection Pool Safety, COPY FROM STDIN, Critical Compatibility Requirements, Existing Application-Level Tenant Predicate (+14 more)

### Community 25 - "Tasks: Optional Backpressure Support"
Cohesion: 0.09
Nodes (22): Dependencies & Execution Order, Format: `[ID] [P?] [Story] Description`, Implementation for User Story 1, Implementation for User Story 2, Implementation for User Story 3, Implementation Strategy, Incremental Delivery Beyond MVP, MVP First (User Story 1 only) (+14 more)

### Community 26 - ".create"
Cohesion: 0.13
Nodes (16): ApiForbiddenResponse, ApiNotFoundResponse, Delete, Param, ApiKeysController, mapApiKeyToDto(), ApiCreatedResponse, ApiOkResponse (+8 more)

### Community 27 - "Tasks: Performance Optimization"
Cohesion: 0.09
Nodes (21): Dependencies & Execution Order, Format: `[ID] [P?] [Story] Description`, Implementation for User Story 1, Implementation for User Story 2, Implementation for User Story 3, Implementation Strategy, Incremental Delivery Beyond MVP, MVP First (User Story 1 only) (+13 more)

### Community 28 - "logs.controller.ts"
Cohesion: 0.20
Nodes (13): AggregateBucketDto, AggregateLogsResponseDto, ApiProperty, LogResponseDto, QueryLogsResponseDto, ApiProperty, RawLogRow, LogAttributeValue (+5 more)

### Community 29 - "tenancy.module.ts"
Cohesion: 0.11
Nodes (15): TenantRefreshToken, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Tenant, Check (+7 more)

### Community 30 - "api-keys.controller.ts"
Cohesion: 0.19
Nodes (13): ApiKeyDto, ApiProperty, ApiKeyListDto, ApiProperty, ApiKey, Check, Column, CreateDateColumn (+5 more)

### Community 31 - ".aggregate"
Cohesion: 0.18
Nodes (15): ApiQuery, Query, Res, LogsController, ApiBadRequestResponse, ApiBody, ApiOkResponse, ApiOperation (+7 more)

### Community 32 - ".login"
Cohesion: 0.21
Nodes (13): ApiConflictResponse, HttpCode, TenantAuthController, ApiBadRequestResponse, ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation (+5 more)

### Community 33 - "tenancy.constants.ts"
Cohesion: 0.18
Nodes (10): ACCESS_TOKEN_TTL_SECONDS, API_KEY_PREFIX, LOADGEN_TENANT_EMAIL, LOADGEN_TENANT_ID, LOADGEN_TENANT_PASSWORD, REFRESH_TOKEN_TTL_DAYS, TenantJwtPayload, hash() (+2 more)

### Community 34 - "log.repository.ts"
Cohesion: 0.19
Nodes (8): LogRollup, Column, Entity, PrimaryColumn, IngestionBatchTooLargeError, IngestionCapacityExceededError, BackpressureException, RollupDelta

### Community 35 - "Execution Steps"
Cohesion: 0.12
Nodes (15): 1. Initialize Convergence Context, 2. Load Artifacts (Progressive Disclosure), 3. Build the Intent Inventory, 4. Assess the Codebase and Classify Findings, 5. Assign Severity, 6. Present the In-Session Findings Summary, 7. Append Convergence Tasks (or report converged), 8. Provide Next Actions (Handoff) (+7 more)

### Community 36 - "Execution Steps"
Cohesion: 0.12
Nodes (15): 1. Initialize Convergence Context, 2. Load Artifacts (Progressive Disclosure), 3. Build the Intent Inventory, 4. Assess the Codebase and Classify Findings, 5. Assign Severity, 6. Present the In-Session Findings Summary, 7. Append Convergence Tasks (or report converged), 8. Provide Next Actions (Handoff) (+7 more)

### Community 37 - "tenant-auth.controller.ts"
Cohesion: 0.17
Nodes (11): LoginTenantDto, ApiProperty, RefreshTokenDto, ApiProperty, RegisterTenantDto, ApiProperty, emailSchema, loginTenantSchema (+3 more)

### Community 38 - "Final Project: Log Ingestion and Query Service"
Cohesion: 0.13
Nodes (13): A Note on AI Usage, Core Requirements, Deliverables, Final Project: Log Ingestion and Query Service, Important Note:, Load Testing Portal, Overview, Performance Targets (+5 more)

### Community 39 - "Unit Testing Implementation Plan"
Cohesion: 0.13
Nodes (14): Explicitly not unit-tested (unchanged, still correct), Findings from this review (deviations from the original chat plan), `logs/repositories/log.repository.ts` — needs a specific fake-timer strategy, Phase 0 — Tooling, Phase 1 — Pure logic (no mocking, highest value-per-effort), Phase 2 — Query builders, Phase 3 — Guards & filters, Phase 4 — Services (+6 more)

### Community 40 - "ApiKeyService"
Cohesion: 0.18
Nodes (8): API_KEY_HEADER, DEFAULT_TENANT_ID, ApiKeyAuthGuard, extractCredential(), Injectable, ApiKeyService, Injectable, InjectRepository

### Community 41 - "CursorService"
Cohesion: 0.22
Nodes (5): CursorService, Injectable, CursorPayload, LogQueryService, Injectable

### Community 42 - "logPulse"
Cohesion: 0.15
Nodes (13): Attribute storage strategy, Backpressure, Configuration, Known limitations, Local development (without Docker), logPulse, Multi-tenancy, Optional features (+5 more)

### Community 43 - "common.ps1"
Cohesion: 0.23
Nodes (9): Find-SpecifyRoot(), Format-SpecKitCommand(), Get-CurrentBranch(), Get-FeaturePathsEnv(), Get-InvokeSeparator(), Get-Python3Command(), Get-RepoRoot(), Resolve-TemplateContent() (+1 more)

### Community 44 - "Feature Specification: [FEATURE NAME]"
Cohesion: 0.15
Nodes (12): Assumptions, Edge Cases, Feature Specification: [FEATURE NAME], Functional Requirements, Key Entities *(include if feature involves data)*, Measurable Outcomes, Requirements *(mandatory)*, Success Criteria *(mandatory)* (+4 more)

### Community 45 - ".agents/skills/speckit-plan/SKILL.md"
Cohesion: 0.18
Nodes (10): Completion Report, Done When, Key rules, Mandatory Post-Execution Hooks, Outline, Phase 0: Outline & Research, Phase 1: Design & Contracts, Phases (+2 more)

### Community 46 - ".agents/skills/speckit-specify/SKILL.md"
Cohesion: 0.18
Nodes (10): Completion Report, Done When, For AI Generation, Mandatory Post-Execution Hooks, Outline, Pre-Execution Checks, Quick Guidelines, Section Requirements (+2 more)

### Community 47 - ".agents/skills/speckit-tasks/SKILL.md"
Cohesion: 0.18
Nodes (10): Checklist Format (REQUIRED), Completion Report, Done When, Mandatory Post-Execution Hooks, Outline, Phase Structure, Pre-Execution Checks, Task Generation Rules (+2 more)

### Community 48 - ".claude/skills/speckit-plan/SKILL.md"
Cohesion: 0.18
Nodes (10): Completion Report, Done When, Key rules, Mandatory Post-Execution Hooks, Outline, Phase 0: Outline & Research, Phase 1: Design & Contracts, Phases (+2 more)

### Community 49 - ".claude/skills/speckit-specify/SKILL.md"
Cohesion: 0.18
Nodes (10): Completion Report, Done When, For AI Generation, Mandatory Post-Execution Hooks, Outline, Pre-Execution Checks, Quick Guidelines, Section Requirements (+2 more)

### Community 50 - ".claude/skills/speckit-tasks/SKILL.md"
Cohesion: 0.18
Nodes (10): Checklist Format (REQUIRED), Completion Report, Done When, Mandatory Post-Execution Hooks, Outline, Phase Structure, Pre-Execution Checks, Task Generation Rules (+2 more)

### Community 51 - "Core Principles"
Cohesion: 0.18
Nodes (10): Core Principles, Governance, [PRINCIPLE_1_NAME], [PRINCIPLE_2_NAME], [PRINCIPLE_3_NAME], [PRINCIPLE_4_NAME], [PRINCIPLE_5_NAME], [PROJECT_NAME] Constitution (+2 more)

### Community 52 - "Core Principles"
Cohesion: 0.18
Nodes (10): Core Principles, Governance, [PRINCIPLE_1_NAME], [PRINCIPLE_2_NAME], [PRINCIPLE_3_NAME], [PRINCIPLE_4_NAME], [PRINCIPLE_5_NAME], [PROJECT_NAME] Constitution (+2 more)

### Community 53 - "Quickstart: Validating Multi-Tenancy"
Cohesion: 0.20
Nodes (9): CI validation, Performance validation (mandatory gate, not part of this quickstart), Prerequisites, Quickstart: Validating Multi-Tenancy, Scenario 1 — Zero-config core is untouched (User Story 1), Scenario 2 — Auth on, seeded load-generator key works transparently (User Story 2), Scenario 3 — Self-registration, login, and API key self-management (User Stories 3 & 4), Scenario 4 — Two tenants, verified isolation (User Story 5) (+1 more)

### Community 54 - "Data Model: Optional Backpressure Support"
Cohesion: 0.20
Nodes (9): `BackpressureConfig` (env-driven, read once at construction — conceptual grouping, not a class), `BackpressureException` (HTTP exception, constructed in `LogIngestionService` — never in `LogRepository`), Byte-size estimation, Data Model: Optional Backpressure Support, Domain errors (in `LogRepository`, HTTP-agnostic — research.md Decision 8), `IngestionCapacityState` (in-memory, on `LogRepository`), `PendingInsert` (existing interface — extended), State transitions (admission decision) (+1 more)

### Community 55 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 56 - "Implementation Plan: [FEATURE]"
Cohesion: 0.22
Nodes (8): Complexity Tracking, Constitution Check, Documentation (this feature), Implementation Plan: [FEATURE], Project Structure, Source Code (repository root), Summary, Technical Context

### Community 57 - "Quickstart: Validating Performance Optimization"
Cohesion: 0.22
Nodes (8): Performance validation (mandatory gate, not part of this quickstart), Prerequisites, Quickstart: Validating Performance Optimization, Scenario 1 — Ingestion throughput does not degrade under concurrency (User Story 1), Scenario 2 — Aggregation stays fast and correct while ingestion is active (User Story 2), Scenario 3 — Rollup consistency survives an unclean restart, with no new readiness dependency (spec.md FR-009, FR-019; research.md Decisions 6, 8), Scenario 4 — Byte-identical responses after the read-path and attribute-storage changes (User Story 3), Scenario 5 — Zero-config and `AUTH_ENABLED` behavior unaffected

### Community 58 - "Quickstart: Validating Optional Backpressure Support"
Cohesion: 0.22
Nodes (8): Performance validation (mandatory gate, not part of this quickstart), Prerequisites, Quickstart: Validating Optional Backpressure Support, Scenario 1 — Default deployment is completely unaffected (User Story 3, SC-002, SC-006), Scenario 2 — Temporary capacity exhaustion returns 503 + Retry-After, admits nothing, and is global across tenants (User Story 2, FR-008), Scenario 3 — A batch that can never fit returns 413, not 503 (User Story 2, SC-008), Scenario 4 — Existing behavior fully preserved when backpressure is enabled but under threshold (SC-007), Scenario 5 — Auth/tenant checks still run before the capacity check (FR-009)

### Community 59 - ".agents/skills/speckit-checklist/SKILL.md"
Cohesion: 0.25
Nodes (7): Anti-Examples: What NOT To Do, Checklist Purpose: "Unit Tests for English", Example Checklist Types & Sample Items, Execution Steps, Post-Execution Checks, Pre-Execution Checks, User Input

### Community 60 - ".claude/skills/speckit-checklist/SKILL.md"
Cohesion: 0.25
Nodes (7): Anti-Examples: What NOT To Do, Checklist Purpose: "Unit Tests for English", Example Checklist Types & Sample Items, Execution Steps, Post-Execution Checks, Pre-Execution Checks, User Input

### Community 61 - "Required API Contract"
Cohesion: 0.25
Nodes (8): `GET /health`, `GET /logs/aggregate` — Aggregate Logs, `GET /logs` — Query Logs, Invalid Parameters, Required API Contract, Response, Response, Sorting

### Community 62 - "`POST /logs`, `GET /logs`, `GET /logs/aggregate`"
Cohesion: 0.25
Nodes (7): `AUTH_ENABLED=false` (default), `AUTH_ENABLED=true`, Contract: Additive Auth Behavior on the 4 Required Endpoints, `GET /health`, `POST /logs`, `GET /logs`, `GET /logs/aggregate`, Response shape confirmation (unchanged in all cases), Status code additions (only when `AUTH_ENABLED=true`)

### Community 63 - "parseWithSchema"
Cohesion: 0.43
Nodes (4): getFirstIssueMessage(), parseWithSchema(), LogQueryValidator, Injectable

### Community 64 - "tenant-jwt-auth.guard.ts"
Cohesion: 0.32
Nodes (4): RequestWithTenantId, extractBearerToken(), TenantJwtAuthGuard, Injectable

### Community 65 - "OpenWolf"
Cohesion: 0.29
Nodes (6): Engineering Quality and Performance Principles, graphify, HTTP Request Files, OpenWolf, Schema Updates, Workflow

### Community 66 - ".agents/skills/speckit-clarify/SKILL.md"
Cohesion: 0.29
Nodes (6): Completion Report, Done When, Mandatory Post-Execution Hooks, Outline, Pre-Execution Checks, User Input

### Community 67 - ".agents/skills/speckit-implement/SKILL.md"
Cohesion: 0.29
Nodes (6): Completion Report, Done When, Mandatory Post-Execution Hooks, Outline, Pre-Execution Checks, User Input

### Community 68 - ".claude/skills/speckit-clarify/SKILL.md"
Cohesion: 0.29
Nodes (6): Completion Report, Done When, Mandatory Post-Execution Hooks, Outline, Pre-Execution Checks, User Input

### Community 69 - ".claude/skills/speckit-implement/SKILL.md"
Cohesion: 0.29
Nodes (6): Completion Report, Done When, Mandatory Post-Execution Hooks, Outline, Pre-Execution Checks, User Input

### Community 70 - "Optional Features and the Load Generator Contract"
Cohesion: 0.29
Nodes (7): CI Requirement, Default Posture: Zero Configuration, Multi-Tenancy, Optional Features and the Load Generator Contract, Rate Limiting and Backpressure, README Requirement, The Golden Rule

### Community 71 - "64. Comparison with your main alternatives"
Cohesion: 0.29
Nodes (7): 64. Comparison with your main alternatives, ClickHouse, PostgreSQL materialized view, Raw PostgreSQL, Redis cache, Rollups, Timescale continuous aggregates

### Community 72 - "Coding Agent Context Extension"
Cohesion: 0.29
Nodes (6): Coding Agent Context Extension, Commands, Configuration, Disable, Requirements, Why an extension?

### Community 73 - "Phase 1 Data Model: Multi-Tenancy"
Cohesion: 0.29
Nodes (6): ApiKey, Entity-relationship summary, Log (existing entity, extended), Phase 1 Data Model: Multi-Tenancy, Tenant, TenantRefreshToken

### Community 74 - "Contract: Additive Backpressure Responses on `POST /logs`"
Cohesion: 0.29
Nodes (6): Contract: Additive Backpressure Responses on `POST /logs`, Existing contract (unchanged), New: `413` — Batch can never fit, New: `503` — Temporary capacity exhaustion, Response shape confirmation (unchanged in all cases), Status code summary (only when `BACKPRESSURE_ENABLED=true`)

### Community 75 - "OpenWolf"
Cohesion: 0.33
Nodes (5): Engineering Quality and Performance Principles, HTTP Request Files, OpenWolf, Schema Updates, Workflow

### Community 76 - "commands/security-audit.md"
Cohesion: 0.33
Nodes (5): Layer 1 — Dependencies, Layer 2 — Secrets, Layer 3 — Injection surfaces, Layer 4 — AuthN / AuthZ, Layer 5 — Report

### Community 77 - "prompts/security-audit.md"
Cohesion: 0.33
Nodes (5): Layer 1 — Dependencies, Layer 2 — Secrets, Layer 3 — Injection surfaces, Layer 4 — AuthN / AuthZ, Layer 5 — Report

### Community 78 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 79 - "Authentication and API Keys"
Cohesion: 0.33
Nodes (6): Authentication and API Keys, Configuration, Credential Transport, Exemptions, Rules, Status Codes

### Community 80 - "Contract: Tenant Account Endpoints"
Cohesion: 0.33
Nodes (5): Contract: Tenant Account Endpoints, Non-goals (explicitly out of scope for this iteration), `POST /tenants/login`, `POST /tenants/refresh`, `POST /tenants/register`

### Community 81 - ".agents/skills/speckit-constitution/SKILL.md"
Cohesion: 0.40
Nodes (4): Outline, Post-Execution Checks, Pre-Execution Checks, User Input

### Community 82 - ".agents/skills/speckit-taskstoissues/SKILL.md"
Cohesion: 0.40
Nodes (4): Outline, Post-Execution Checks, Pre-Execution Checks, User Input

### Community 83 - ".claude/skills/speckit-constitution/SKILL.md"
Cohesion: 0.40
Nodes (4): Outline, Post-Execution Checks, Pre-Execution Checks, User Input

### Community 84 - ".claude/skills/speckit-taskstoissues/SKILL.md"
Cohesion: 0.40
Nodes (4): Outline, Post-Execution Checks, Pre-Execution Checks, User Input

### Community 85 - "`POST /logs` — Ingest Logs"
Cohesion: 0.40
Nodes (5): Batch Behavior, `POST /logs` — Ingest Logs, Request, Response, Validation Rules

### Community 86 - "3. The terminology"
Cohesion: 0.40
Nodes (5): 3. The terminology, Incremental aggregation, Pre-aggregation, Rollup table, Time-bucket aggregation

### Community 87 - "API documentation"
Cohesion: 0.40
Nodes (5): API documentation, `GET /health`, `GET /logs/aggregate` — time-bucketed counts, `GET /logs` — query with combinable filters, `POST /logs` — ingest a batch

### Community 88 - "Performance"
Cohesion: 0.40
Nodes (5): Bottlenecks discovered, Optimizations applied, Performance, Preliminary measurements, Target environment

### Community 89 - "[CHECKLIST TYPE] Checklist: [FEATURE NAME]"
Cohesion: 0.40
Nodes (4): [Category 1], [Category 2], [CHECKLIST TYPE] Checklist: [FEATURE NAME], Notes

### Community 90 - "Contract: Tenant API Key Management Endpoints"
Cohesion: 0.40
Nodes (4): Contract: Tenant API Key Management Endpoints, `DELETE /tenants/api-keys/:id`, `GET /tenants/api-keys`, `POST /tenants/api-keys`

### Community 91 - "Phase 1 Data Model: Performance Optimization"
Cohesion: 0.40
Nodes (4): Entity-relationship summary, Log (existing entity, changed), LogRollup (new), Phase 1 Data Model: Performance Optimization

### Community 93 - "Update Coding Agent Context"
Cohesion: 0.50
Nodes (3): Behavior, Execution, Update Coding Agent Context

### Community 94 - "commands/reframe.md"
Cohesion: 0.50
Nodes (3): Mode: audit [target], Mode: fix [target], Mode: migrate [framework]

### Community 95 - "prompts/reframe.md"
Cohesion: 0.50
Nodes (3): Mode: audit [target], Mode: fix [target], Mode: migrate [framework]

### Community 96 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 97 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 98 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 99 - "27. Choosing rollup granularity"
Cohesion: 0.50
Nodes (4): 27. Choosing rollup granularity, Hours, Minutes, Seconds

### Community 100 - "29. Retention"
Cohesion: 0.50
Nodes (4): 29. Retention, Policy A, Policy B, Policy C

### Community 101 - "48. Simple PostgreSQL schema"
Cohesion: 0.50
Nodes (4): 48. Simple PostgreSQL schema, Minute rollup, Raw logs, Second rollup

### Community 102 - "Update Coding Agent Context"
Cohesion: 0.50
Nodes (3): Behavior, Execution, Update Coding Agent Context

### Community 114 - "32. PostgreSQL implementation choices"
Cohesion: 0.67
Nodes (3): 32. PostgreSQL implementation choices, Normal logged table, UNLOGGED table

### Community 115 - "Schema and index design"
Cohesion: 0.67
Nodes (3): Rollup table, Schema and index design, Tenant tables

## Knowledge Gaps
- **804 isolated node(s):** `update-agent-context.sh script`, `$schema`, `collection`, `sourceRoot`, `deleteOutDir` (+799 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **38 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `parseWithSchema()` connect `parseWithSchema` to `.login`, `tenant-auth.controller.ts`, `log-query.schema.ts`, `log-entry.validator.ts`, `.create`, `api-keys.controller.ts`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `ApiKeysController` connect `.create` to `tenancy.module.ts`, `api-keys.controller.ts`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Why does `Log` connect `aggregation-query.builder.ts` to `log.repository.ts`, `retention.service.ts`, `log-query.interface.ts`, `LogRepository`, `logs.controller.ts`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **What connects `update-agent-context.sh script`, `$schema`, `collection` to the rest of the system?**
  _804 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Incremental Pre-Aggregation with Time-Based Rollup Tables.md` be split into smaller, more focused modules?**
  _Cohesion score 0.030303030303030304 - nodes in this community are weakly interconnected._
- **Should `scripts` be split into smaller, more focused modules?**
  _Cohesion score 0.043478260869565216 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._