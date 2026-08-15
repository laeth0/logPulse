# LogPulse — Monorepo Restructure Plan

> **Goal:** Reorganize the current project (a pure NestJS backend) into a monorepo with a clear
> `backend/` root and an empty `frontend/` root ready for a new front-end project.

---

## Current State Analysis

The repository is currently a **100 % backend project** — a NestJS log-ingestion and query service
with PostgreSQL, TypeORM, JWT tenancy, and Docker. There is **no existing frontend code**.

Every file and folder in the project root belongs to the backend. The table below categorizes each
one so the move is unambiguous.

| Path | Category | Reason |
|---|---|---|
| `src/` | Backend | NestJS application source (controllers, services, entities, migrations) |
| `test/` | Backend | Integration test specs for NestJS endpoints |
| `dist/` | Backend | Compiled output from `nest build` |
| `coverage/` | Backend | Jest coverage reports |
| `requests/` | Backend | `.rest` files for VS Code REST Client (API endpoint samples) |
| `specs/` | Backend | Feature specification docs (multi-tenancy, performance, backpressure) |
| `docs/` | Shared | Project documentation — stays at root |
| `prompt/` | Backend | Implementation prompts / research notes |
| `package.json` | Backend | NestJS dependencies (no frontend deps) |
| `package-lock.json` | Backend | Lock file for backend deps |
| `nest-cli.json` | Backend | NestJS CLI configuration |
| `tsconfig.json` | Backend | TypeScript config for NestJS |
| `tsconfig.build.json` | Backend | TypeScript build config for NestJS |
| `eslint.config.mjs` | Backend | ESLint config scoped to `src/` and `test/` |
| `.prettierrc` | Backend | Prettier config (currently scoped to backend) |
| `Dockerfile` | Backend | Builds the NestJS container |
| `docker-compose.yml` | Backend | Orchestrates backend + PostgreSQL + Redis |
| `.dockerignore` | Backend | Docker ignore rules for backend build |
| `.env` / `.env.example` | Backend | Backend environment variables (DB, JWT, Redis) |
| `.env.test` / `.env.test.example` | Backend | Test environment variables |
| `.gitignore` | Root | Stays at monorepo root |
| `README.md` | Root | Stays at monorepo root (update paths after move) |
| `AGENTS.md` / `CLAUDE.md` | Root | Agent context files — stay at monorepo root |
| `projectSchema.dbml` | Backend | Database schema (PostgreSQL) |
| `.github/` | Root | CI/CD workflows — stay at monorepo root |
| `.agents/` | Root | Agent skills — stay at monorepo root |
| `.claude/` | Root | Claude settings — stay at monorepo root |
| `.codex/` | Root | Codex config — stay at monorepo root |
| `.specify/` | Root | SpecKit config — stays at monorepo root |
| `.wolf/` | Root | OpenWolf context — stays at monorepo root |
| `node_modules/` | Backend | Installed by backend `package.json` — never committed |

---

## Proposed New Structure

```
logPulse/                          <- monorepo root
|
+-- backend/                       <- ALL current backend code moves here
|   +-- src/
|   |   +-- app.controller.ts
|   |   +-- app.module.ts
|   |   +-- app.service.ts
|   |   +-- main.ts
|   |   +-- common/
|   |   |   +-- constants/
|   |   |   |   +-- http.constants.ts
|   |   |   |   +-- log-api.constants.ts
|   |   |   |   +-- log-query.constants.ts
|   |   |   |   +-- postgres.constants.ts
|   |   |   |   +-- retention.constants.ts
|   |   |   |   +-- tenancy.constants.ts
|   |   |   +-- filters/
|   |   |   |   +-- global-exception.filter.ts
|   |   |   +-- utils/
|   |   |   |   +-- rollup-bucket.utils.ts
|   |   |   +-- validators/
|   |   |       +-- zod-validation.utils.ts
|   |   +-- config/
|   |   |   +-- data-source.ts
|   |   |   +-- database.config.ts
|   |   +-- health/
|   |   |   +-- health.controller.ts
|   |   |   +-- health.module.ts
|   |   |   +-- health.service.ts
|   |   |   +-- health.types.ts
|   |   +-- logs/
|   |   |   +-- config/
|   |   |   |   +-- backpressure.config.ts
|   |   |   +-- cursor/
|   |   |   |   +-- cursor.service.ts
|   |   |   +-- dto/
|   |   |   |   +-- requests/
|   |   |   |   |   +-- aggregate-logs.dto.ts
|   |   |   |   |   +-- ingest-logs.dto.ts
|   |   |   |   |   +-- log-entry.dto.ts
|   |   |   |   |   +-- query-logs.dto.ts
|   |   |   |   +-- responses/
|   |   |   |       +-- aggregate-logs-response.dto.ts
|   |   |   |       +-- ingest-logs-response.dto.ts
|   |   |   |       +-- query-logs-response.dto.ts
|   |   |   +-- entities/
|   |   |   |   +-- log-rollup.entity.ts
|   |   |   |   +-- log.entity.ts
|   |   |   +-- enums/
|   |   |   |   +-- aggregation-bucket.enum.ts
|   |   |   |   +-- aggregation-group.enum.ts
|   |   |   |   +-- log-level.enum.ts
|   |   |   +-- errors/
|   |   |   |   +-- ingestion-capacity.errors.ts
|   |   |   +-- exceptions/
|   |   |   |   +-- backpressure.exception.ts
|   |   |   +-- interfaces/
|   |   |   |   +-- cursor-payload.interface.ts
|   |   |   |   +-- log-query.interface.ts
|   |   |   |   +-- log-repository.interface.ts
|   |   |   +-- mappers/
|   |   |   |   +-- log.mapper.ts
|   |   |   +-- query-builders/
|   |   |   |   +-- aggregation-query.builder.ts
|   |   |   |   +-- log-filter.builder.ts
|   |   |   |   +-- log-query.builder.ts
|   |   |   +-- repositories/
|   |   |   |   +-- log.repository.ts
|   |   |   +-- services/
|   |   |   |   +-- log-aggregation.service.ts
|   |   |   |   +-- log-ingestion.service.ts
|   |   |   |   +-- log-query.service.ts
|   |   |   +-- validators/
|   |   |   |   +-- cursor-payload.schema.ts
|   |   |   |   +-- iso-timestamp.schema.ts
|   |   |   |   +-- log-entry.schema.ts
|   |   |   |   +-- log-entry.validator.ts
|   |   |   |   +-- log-query.schema.ts
|   |   |   |   +-- log-query.validator.ts
|   |   |   +-- logs.controller.ts
|   |   |   +-- logs.module.ts
|   |   +-- migrations/
|   |   |   +-- 1785684350112-CreatePgTrgmExtension.ts
|   |   |   +-- 1785684350113-CreateLogLevelEnum.ts
|   |   |   +-- 1785684350114-CreateLogsTable.ts
|   |   |   +-- 1785684350115-CreateLogsTableBtreeIndexes.ts
|   |   |   +-- 1785684350116-CreateLogsTableGinIndexes.ts
|   |   |   +-- 1785684350117-DropLogsMessageTrigramIndex.ts
|   |   |   +-- 1785684350118-CreateTenancyTables.ts
|   |   |   +-- 1785684350119-CreateLogRollupsTable.ts
|   |   +-- retention/
|   |   |   +-- interfaces/
|   |   |   |   +-- partition.interface.ts
|   |   |   |   +-- retention.interface.ts
|   |   |   +-- partition.service.ts
|   |   |   +-- retention.module.ts
|   |   |   +-- retention.scheduler.ts
|   |   |   +-- retention.service.ts
|   |   +-- scripts/
|   |   |   +-- create-database.ts
|   |   |   +-- drop-database.ts
|   |   +-- tenancy/
|   |       +-- controllers/
|   |       |   +-- api-keys.controller.ts
|   |       |   +-- tenant-auth.controller.ts
|   |       +-- decorators/
|   |       |   +-- current-tenant-id.decorator.ts
|   |       +-- dto/
|   |       |   +-- requests/
|   |       |   |   +-- login-tenant.dto.ts
|   |       |   |   +-- refresh-token.dto.ts
|   |       |   |   +-- register-tenant.dto.ts
|   |       |   +-- responses/
|   |       |       +-- api-key-list.dto.ts
|   |       |       +-- api-key.dto.ts
|   |       |       +-- auth-tokens.dto.ts
|   |       |       +-- tenant.dto.ts
|   |       +-- entities/
|   |       |   +-- api-key.entity.ts
|   |       |   +-- refresh-token.entity.ts
|   |       |   +-- tenant.entity.ts
|   |       +-- enums/
|   |       |   +-- api-key-status.enum.ts
|   |       +-- guards/
|   |       |   +-- api-key-auth.guard.ts
|   |       |   +-- tenant-jwt-auth.guard.ts
|   |       +-- interfaces/
|   |       |   +-- jwt-payload.interface.ts
|   |       +-- services/
|   |       |   +-- api-key.service.ts
|   |       |   +-- loadgen-key-seeder.service.ts
|   |       |   +-- tenant-auth.service.ts
|   |       |   +-- token.service.ts
|   |       +-- utils/
|   |       |   +-- api-key-generator.util.ts
|   |       |   +-- password-hasher.util.ts
|   |       +-- validators/
|   |       |   +-- api-key.schema.ts
|   |       |   +-- tenant-auth.schema.ts
|   |       +-- tenancy.module.ts
|   +-- test/
|   |   +-- jest-integration.json
|   |   +-- integration/
|   |       +-- app/
|   |       |   +-- app.integration-spec.ts
|   |       +-- health/
|   |       |   +-- health.integration-spec.ts
|   |       +-- logs/
|   |       |   +-- logs.integration-spec.ts
|   |       +-- setup/
|   |       |   +-- global-setup.ts
|   |       |   +-- load-testing-environment.ts
|   |       +-- support/
|   |       |   +-- create-integration-app.ts
|   |       |   +-- environment.ts
|   |       |   +-- http-auth.ts
|   |       |   +-- log-fixtures.ts
|   |       |   +-- logs-api.ts
|   |       |   +-- tenancy-api.ts
|   |       |   +-- tenancy-assertions.ts
|   |       +-- tenancy/
|   |           +-- tenancy.integration-spec.ts
|   +-- requests/
|   |   +-- health.check.rest
|   |   +-- logs.aggregate.rest
|   |   +-- logs.ingest.rest
|   |   +-- logs.list.rest
|   |   +-- logs/
|   |   |   +-- logs.ingest.backpressure-503.rest
|   |   |   +-- logs.ingest.oversized-413.rest
|   |   +-- tenancy/
|   |       +-- tenancy.api-keys.create.rest
|   |       +-- tenancy.api-keys.list.rest
|   |       +-- tenancy.api-keys.revoke.rest
|   |       +-- tenancy.login.rest
|   |       +-- tenancy.refresh.rest
|   |       +-- tenancy.register.rest
|   +-- specs/
|   |   +-- 001-multi-tenancy/
|   |   +-- 002-performance-optimization/
|   |   +-- 003-ingestion-backpressure/
|   +-- prompt/
|   |   +-- RLS.md
|   +-- dist/                      <- build output (git-ignored)
|   +-- coverage/                  <- test coverage (git-ignored)
|   +-- Dockerfile
|   +-- .dockerignore
|   +-- .env
|   +-- .env.example
|   +-- .env.test
|   +-- .env.test.example
|   +-- eslint.config.mjs
|   +-- nest-cli.json
|   +-- package.json
|   +-- package-lock.json
|   +-- projectSchema.dbml
|   +-- tsconfig.json
|   +-- tsconfig.build.json
|   +-- .prettierrc
|
+-- frontend/                      <- NEW — empty, ready for your frontend project
|   +-- .gitkeep                   <- keeps the empty folder in git
|
+-- docs/                          <- Shared project documentation (stays at root)
|   +-- Final_Project.md
|   +-- monorepo-restructure.md    <- this file
|
+-- docker-compose.yml             <- stays at monorepo root (orchestrates backend + DB)
|
+-- .github/                       <- CI/CD workflows (stays at monorepo root)
|   +-- workflows/
|       +-- ci.yml
|
+-- .agents/                       <- Agent skills (stays at monorepo root)
+-- .claude/                       <- Claude settings (stays at monorepo root)
+-- .codex/                        <- Codex config (stays at monorepo root)
+-- .specify/                      <- SpecKit config (stays at monorepo root)
+-- .wolf/                         <- OpenWolf context (stays at monorepo root)
|
+-- AGENTS.md                      <- stays at monorepo root
+-- CLAUDE.md                      <- stays at monorepo root
+-- README.md                      <- stays at monorepo root (update paths)
+-- .gitignore                     <- stays at monorepo root
```

---

## Move Summary Table

| What moves | Where it goes |
|---|---|
| `src/` | `backend/src/` |
| `test/` | `backend/test/` |
| `requests/` | `backend/requests/` |
| `specs/` | `backend/specs/` |
| `prompt/` | `backend/prompt/` |
| `dist/` | `backend/dist/` |
| `coverage/` | `backend/coverage/` |
| `Dockerfile` | `backend/Dockerfile` |
| `docker-compose.yml` | `docker-compose.yml` (stays at **root**) |
| `.dockerignore` | `backend/.dockerignore` |
| `.env` / `.env.example` | `backend/.env` / `backend/.env.example` |
| `.env.test` / `.env.test.example` | `backend/.env.test` / `backend/.env.test.example` |
| `nest-cli.json` | `backend/nest-cli.json` |
| `package.json` | `backend/package.json` |
| `package-lock.json` | `backend/package-lock.json` |
| `projectSchema.dbml` | `backend/projectSchema.dbml` |
| `tsconfig.json` | `backend/tsconfig.json` |
| `tsconfig.build.json` | `backend/tsconfig.build.json` |
| `eslint.config.mjs` | `backend/eslint.config.mjs` |
| `.prettierrc` | `backend/.prettierrc` |
| *(new)* `frontend/` | `frontend/` — **empty** |

| What stays at root | Reason |
|---|---|
| `.git/` | Always at repo root |
| `.gitignore` | Monorepo-wide ignore rules |
| `README.md` | Top-level project readme |
| `AGENTS.md` / `CLAUDE.md` | Agent context files (must be at root) |
| `.github/` | GitHub Actions workflows |
| `docker-compose.yml` | Orchestrates the whole stack from one place |
| `.agents/` / `.claude/` / `.codex/` / `.specify/` / `.wolf/` | Tooling configs discovered from root |
| `docs/` | Shared documentation |

---

## Notes & Open Decisions

### CI Pipeline
`ci.yml` currently references root-level paths (`npm run ...`, `src/`, `test/`).
After the move, update all paths in `.github/workflows/ci.yml` to point into `backend/`
(e.g. `working-directory: backend`).

### docker-compose.yml
The build context and volume mounts will need updating to reflect the new `backend/` prefix
(e.g. `context: ./backend`).

### Frontend Tech Stack
The `frontend/` folder is left intentionally empty.
Recommended next step: pick a framework (Vite + React, Next.js, etc.) and scaffold it
inside `frontend/` with its own `package.json`.

### Root package.json (optional)
Consider adding a root-level `package.json` with workspace scripts
(`npm run dev:backend`, `npm run dev:frontend`) to orchestrate both
apps from the monorepo root.
