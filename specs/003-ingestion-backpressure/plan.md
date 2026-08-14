# Implementation Plan: Optional Backpressure Support

**Branch**: `003-ingestion-backpressure` | **Date**: 2026-08-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-ingestion-backpressure/spec.md`

## Summary

Add an opt-in admission-control gate directly in front of the existing `LogRepository` write-coalescing queue (`log.repository.ts`), which today accepts unbounded work into its in-process `pendingInserts` array. When `BACKPRESSURE_ENABLED=true`, every `insertMany()` call — one per `POST /logs` caller, invoked only after per-entry validation has already run — is checked against two independent, globally-shared limits (total admitted-but-not-completed row count, total admitted-but-not-completed estimated byte size) before its rows are pushed onto the queue. A batch that could never fit under either limit, even at zero load, is rejected once with `413`; a batch that would fit but is temporarily blocked by other pending work is rejected with `503` + `Retry-After`. When disabled (the default), zero code paths related to this feature execute — `insertMany()`'s behavior is identical to today's.

No new service or module is introduced, and `LogRepository` stays HTTP-agnostic: the two running counters, the two threshold checks, and a cheap field-length byte-estimation helper live as private fields/methods on `LogRepository` itself, mirroring exactly how the existing coalescing tuning (`coalesceWindowMs`, `coalesceMaxRows`) already lives there — but when admission is refused, it throws plain, HTTP-agnostic domain errors (`IngestionCapacityExceededError`, `IngestionBatchTooLargeError`), not NestJS exceptions. `LogIngestionService.ingest()` gains a small translation step (a `try`/`catch` around its existing `insertMany()` call) that maps those domain errors to `PayloadTooLargeException` (413) and a new `BackpressureException` (503, carries `retryAfterSeconds`) respectively — this keeps HTTP/error-response concerns out of the repository layer, per an explicit engineering requirement, without introducing any new service. Configuration parsing/validation is similarly centralized into one small, reusable factory function (`createBackpressureConfig()`) rather than scattered inline env reads. The only other production code touched is a four-line, generic addition to the already-central `GlobalExceptionFilter`, which reuses the existing `{"error": "<description>"}` envelope and adds a duck-typed `Retry-After` header pass-through — scoped to `HttpException`s only, so it can never fire on a domain error that happens to share a property name, and reusable by any future exception that wants a `Retry-After`.

## Technical Context

**Language/Version**: TypeScript 5.7 on Node.js 24 (existing — unchanged).

**Primary Dependencies**: NestJS 11, `@nestjs/common`'s built-in `PayloadTooLargeException` (413) and `ServiceUnavailableException` (base class for a new `BackpressureException`, 503) — both used only in `LogIngestionService`'s translation step, never in `LogRepository`, which throws plain `Error` subclasses instead (research.md Decision 8). Both built-ins already available with zero new install. One new *direct* dependency: `bytes` (parses `"25mb"`-style size strings) — already present in `node_modules` today as a transitive dependency of `body-parser`/`express` (the same package that already parses `JSON_BODY_LIMIT`), so this is a promotion to a declared direct dependency, not a new supply-chain addition.

**Storage**: PostgreSQL 16 (existing, unchanged). **No schema change** — this feature introduces no new persisted entity, only in-memory, process-scoped counters. `projectSchema.dbml` is not touched.

**Testing**: No `.test.ts`/`.spec.ts` files, per explicit instruction and this project's established convention (`specs/001-multi-tenancy/plan.md`, `specs/002-performance-optimization/plan.md`, `.wolf/cerebrum.md`). Verification is via `quickstart.md`'s runnable manual scenarios (deterministic, using intentionally tiny thresholds — this feature's correctness does not depend on reaching 15,000 logs/sec, unlike `002`) plus a CI smoke-test extension proving the *disabled default* behaves identically to today (spec.md User Story 3 / SC-006).

**Target Platform**: Linux containers via `docker compose` (existing, unchanged).

**Project Type**: Single NestJS web-service (monolith) — existing structure. Extends the existing `logs/` module; no new top-level feature module.

**Performance Goals**: Per spec.md's Success Criteria — zero throughput/latency regression when disabled (SC-002, the default) or when enabled-but-under-threshold (SC-007, must still clear the 15,000 logs/sec baseline); the admission check itself must be cheap enough not to threaten either, since it runs synchronously on every `POST /logs` request once opted in. Byte-size estimation deliberately avoids `JSON.stringify`/full serialization — a real, avoidable cost on a container whose entire ingestion budget is 0.5 CPU — in favor of summing already-materialized field lengths directly (see research.md Decision 2), and no lock/mutex is needed for the counters themselves (research.md Decision 5).

**Constraints**: Same fixed container limits as the base project (app: 0.5 CPU / 256 MB; PostgreSQL: 1 CPU / 1 GB — unchanged, and the actual reason this feature exists). Admission MUST be atomic per caller (FR-004) — satisfied by construction, not by a lock, because the check-then-push sequence for one `insertMany()` call runs synchronously within Node's single-threaded event loop with no `await` in between (research.md Decision 5). The capacity check MUST run strictly after per-entry validation (FR-005) — satisfied by construction, because `checkAdmission()` lives inside `insertMany()`, which `LogIngestionService.ingest()` only calls with the already-validated, already-filtered array; that same service method is also where the domain-error-to-HTTP-exception translation happens (research.md Decision 8), so the ordering guarantee and the layering boundary sit at the same call site. Capacity MUST be global, not per-tenant (FR-008) — satisfied by construction, because the counters are private instance fields on `LogRepository`, a process-wide Nest singleton, with no tenant key anywhere in their state — verified explicitly in quickstart.md's two-tenant scenario, not just asserted.

**Scale/Scope**: Same ~1,000,000 log rows / ~1 month of daily partitions / tens of tenants as `001`/`002` (unchanged). This feature adds no new data volume of its own — its state is two integers.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template — no ratified project constitution exists (same as `001`/`002`). This plan is held to `CLAUDE.md`'s "Engineering Quality and Performance Principles" instead: keep code simple and cohesive, apply patterns only where they genuinely simplify the design, treat performance as a first-class requirement, avoid unnecessary abstractions on performance-critical paths, and preserve the existing architecture and API contracts unless a requirement explicitly requires a change.

**Result**: PASS. The design deliberately rejects every abstraction that isn't strictly necessary: no new service/module (counters live on the existing `LogRepository`), no new persisted state (no DLQ, no external broker, no database table), no new concurrency-control primitive (relies on the same single-threaded-synchronous-check property the existing coalescing code already relies on for its own `isFlushing` guard), and no new response envelope (reuses `GlobalExceptionFilter`'s existing `{"error": ...}` shape). Every explicit exclusion in spec.md FR-010/FR-017 (no DLQ/Kafka/Redis/RabbitMQ, no CPU/event-loop-lag/DB-utilization signals, no per-tenant scheduling) is honored by simply not building any of it — the entire mechanism is two counters and two comparisons.

*Post-Phase-1 re-check*: PASS — see [research.md](./research.md)'s per-decision rationale. No decision here touches an existing hard requirement (durability, tenant isolation, `AUTH_ENABLED`/`LOADGEN_API_KEY`, retention, zero-config, the required API contract) except additively, as spec.md's Clarifications and FR-002/FR-004/FR-005/FR-008/FR-009/FR-011/FR-012 require and research.md's decisions each confirm.

## Project Structure

### Documentation (this feature)

```text
specs/003-ingestion-backpressure/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output — in-memory state model (no DB entities)
├── contracts/
│   └── post-logs-backpressure.md   # Phase 1 output — additive 503/413 responses on POST /logs
├── quickstart.md         # Phase 1 output
├── checklists/
│   └── requirements.md   # already produced by /speckit-specify + /speckit-clarify
└── tasks.md              # Phase 2 output (/speckit-tasks — NOT created by /speckit-plan)
```

**`contracts/` is included this time** (unlike `002`, which had none): this feature *does* add new externally-visible response codes (`413`, `503` + `Retry-After`) to `POST /logs` — an additive change to the existing contract, not a new endpoint, but still worth documenting explicitly per the project's established contracts-doc convention (`specs/001-multi-tenancy/contracts/logs-endpoints-auth.md`).

### Source Code (repository root)

Existing NestJS layout — no new top-level module, no new feature module. New/changed paths only; everything else in `src/` is unchanged:

```text
src/
├── common/
│   ├── constants/
│   │   └── log-api.constants.ts          # CHANGED: + 5 backpressure tuning defaults (enabled flag, max rows, max bytes, Retry-After seconds, per-entry byte-estimate overhead)
│   └── filters/
│       └── global-exception.filter.ts    # CHANGED: generic Retry-After header pass-through, scoped to the existing HttpException branch (duck-typed on a `retryAfterSeconds` property — no import from logs/, stays feature-agnostic; never fires on a plain domain error)
└── logs/                                  # existing module — CHANGED, not restructured
    ├── config/
    │   └── backpressure.config.ts        # NEW: BackpressureConfig interface + createBackpressureConfig() — centralized, validated env parsing (research.md Decision 6)
    ├── errors/
    │   └── ingestion-capacity.errors.ts  # NEW: IngestionCapacityExceededError / IngestionBatchTooLargeError — plain Error subclasses, no @nestjs/common import; LogRepository's HTTP-agnostic admission-refusal vocabulary (research.md Decision 8)
    ├── exceptions/
    │   └── backpressure.exception.ts     # NEW: BackpressureException extends ServiceUnavailableException, carries retryAfterSeconds — constructed by LogIngestionService's translation step, never by LogRepository
    ├── repositories/
    │   └── log.repository.ts              # CHANGED: insertMany() gains an admission check (2 new private counters, 1 new private field-length byte-estimation method, 1 new private admission-check method throwing the plain domain errors above); flushBatch()'s existing settle loops gain 2 decrement lines each
    └── services/
        └── log-ingestion.service.ts       # CHANGED: ingest() wraps its existing insertMany() call in a try/catch that translates the two domain errors into PayloadTooLargeException (413) / BackpressureException (503) — the HTTP-translation boundary (research.md Decision 8)

docker-compose.yml / .env.example           # CHANGED: + 4 new optional env vars, all with safe defaults (feature stays disabled/inert with none of them set)
package.json                                 # CHANGED: `bytes` promoted from transitive to direct dependency
README.md                                    # CHANGED: "Optional features" + "Configuration" sections document this feature per docs/Final_Project.md's Optional Features contract (FR-015)
requests/                                    # CANDIDATE (deferred to tasks.md): example .rest requests demonstrating the new 413/503 responses — this feature adds no new endpoint, so it's not strictly required by CLAUDE.md's per-endpoint rule, but is consistent with existing practice
```

**Not touched**: `logs.controller.ts`, `log-entry.validator.ts`/`log-entry.schema.ts`, every query-builder, every entity, every migration, `retention/`, `tenancy/` (any module), `projectSchema.dbml`. `log-ingestion.service.ts` **is** touched (see above) — its role is narrowly the domain-error-to-HTTP-exception translation, not new ingestion logic. The design's core point still holds: admission control is a gate in front of one existing method (`insertMany()`) plus a thin, single-purpose translation step immediately above it, not a new code path threaded through the ingestion pipeline — see research.md Decision 1 for why this placement satisfies FR-005/FR-009's ordering requirements (validation-then-capacity, auth-then-capacity) without any new sequencing code, and Decision 8 for why the translation step doesn't compromise that.

**Structure Decision**: Extend `logs/` in place, keeping every new piece of state and logic on `LogRepository` itself rather than introducing an `AdmissionControlService` or similar — directly per the user's explicit instruction ("prefer keeping admission/capacity ownership close to the existing LogRepository queue; avoid unnecessary abstractions") and consistent with how the existing coalescing mechanism is already implemented as private state on the same class, not a separate collaborator.

## Complexity Tracking

*No entries — no constitution violations to justify.* This feature is, by design, the minimum machinery that satisfies every FR: two counters, two comparisons, one new exception class, one generic header pass-through. No new abstraction layer, no new dependency beyond promoting an already-vendored transitive one, no new persisted state.
