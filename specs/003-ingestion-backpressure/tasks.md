---

description: "Task list for the Optional Backpressure Support feature"
---

# Tasks: Optional Backpressure Support

**Input**: Design documents from `specs/003-ingestion-backpressure/` (`plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/post-logs-backpressure.md`, `quickstart.md`)

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/post-logs-backpressure.md ✅, quickstart.md ✅

**Tests**: Not included, per explicit instruction and this project's established convention (`specs/001-multi-tenancy/plan.md`, `specs/002-performance-optimization/plan.md`, `.wolf/cerebrum.md`). Verification is via `quickstart.md`'s deterministic manual scenarios (tiny configured thresholds — no need for real load), the existing `smoke`/`smoke-auth` CI jobs (must stay unaffected by the disabled default), and — per SC-007 — the external load-testing portal as the final gate.

**Organization**: Tasks are grouped by user story (US1–US3, matching spec.md's priority order), each an independently checkpointable increment. Because all three stories are facets of one small mechanism (not separate subsystems, unlike `002`'s US1/US2/US3), later stories *refine* files US1 already touched rather than opening new ones — this mirrors how `002-performance-optimization`'s own US3 phase modified files US1/US2 had already changed. Each phase is still independently reviewable and independently valuable: US1 alone already makes the service refuse excess load with correct status codes instead of growing without bound; US2 upgrades the `503` case with a real `Retry-After` header and locks in the exact contract; US3 is a verification-only phase confirming what US1 already built is truly inert when disabled.

**Layering**: `LogRepository` throws plain, HTTP-agnostic domain errors (`IngestionCapacityExceededError`, `IngestionBatchTooLargeError` — T006), never a NestJS `HttpException`, per an explicit engineering requirement ("keep HTTP/error-response concerns out of repository logic"). A small translation step in `LogIngestionService.ingest()` (T012, refined by T016) maps them to the actual HTTP exceptions. `plan.md`, `research.md` (Decision 8), and `data-model.md` all describe this same layering consistently — this note previously flagged it as a delta from an earlier draft of `plan.md`; that draft has since been brought into alignment, so it no longer is one. `GlobalExceptionFilter` stays exactly as generic as intended (T015), scoped to its existing `HttpException` branch, and no new service/module is introduced.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: Which user story this task belongs to (US1–US3) — omitted for Setup/Foundational/Polish
- File paths are exact and relative to the repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Expose every new tuning knob as optional, documented, zero-config-safe environment variables before any code reads them.

- [ ] T001 [P] Add `BACKPRESSURE_ENABLED` (default `false`), `BACKPRESSURE_MAX_PENDING_ROWS` (default `20000`), `BACKPRESSURE_MAX_PENDING_BYTES` (default `25mb`), and `BACKPRESSURE_RETRY_AFTER_SECONDS` (default `1`) to `.env.example`, with a comment block explaining each (mirroring the existing `INGEST_COALESCE_*` comment block's style) — all optional; their absence must leave the service byte-for-byte unchanged (FR-002)
- [ ] T002 [P] Add the same 4 env vars to the `app.environment` block in `docker-compose.yml`, using the existing `${VAR:-default}` pattern already used for every other optional var there

**Checkpoint**: New config surface exists but nothing reads it yet — zero behavior change.

---

## Phase 2: Foundational (Config, Domain Errors)

**Purpose**: Centralized, validated configuration parsing and an HTTP-agnostic error vocabulary that every user story below builds on.

**⚠️ CRITICAL**: US1's first implementation task (T007) depends on T005; US1's admission check (T009) depends on T006. No user story can begin meaningfully before this phase completes.

- [ ] T003 [P] Add 5 default constants to `src/common/constants/log-api.constants.ts` — `DEFAULT_BACKPRESSURE_ENABLED = false`, `DEFAULT_BACKPRESSURE_MAX_PENDING_ROWS = 20_000`, `DEFAULT_BACKPRESSURE_MAX_PENDING_BYTES = '25mb'`, `DEFAULT_BACKPRESSURE_RETRY_AFTER_SECONDS = 1`, and `ESTIMATED_BYTES_OVERHEAD_PER_LOG_ENTRY` (a small internal constant, not env-configurable, covering the timestamp and JSON structural punctuation the field-length byte estimator doesn't otherwise account for — research.md Decision 2) — matching the existing `DEFAULT_INGEST_COALESCE_*` naming/placement convention exactly (research.md Decision 6)
- [ ] T004 [P] Promote `bytes` (already present transitively via `body-parser`) to a direct `dependencies` entry in `package.json`, pinned to the version already resolved in `package-lock.json` — no new supply-chain surface, just a declared dependency (research.md Decision 6; plan.md Technical Context)
- [ ] T005 Create `src/logs/config/backpressure.config.ts`: a `BackpressureConfig` interface (`enabled: boolean`, `maxPendingRows: number`, `maxPendingBytes: number`, `retryAfterSeconds: number`) and a `createBackpressureConfig(): BackpressureConfig` factory function, mirroring `createDatabaseOptions()`'s existing plain-factory style in `src/config/database.config.ts`. Reads all 4 env vars (falling back to T003's defaults), parses `BACKPRESSURE_MAX_PENDING_BYTES` via the `bytes` package (T004), and **validates eagerly**: if `BACKPRESSURE_ENABLED=true` and any of `maxPendingRows`/`maxPendingBytes`/`retryAfterSeconds` fails to parse to a finite positive number, throw a clear startup error immediately (fail fast at boot, not silently misbehave on the first request) — this is the single, centralized, reusable place all backpressure config parsing/validation lives (depends on T003, T004)
- [ ] T006 [P] Create `src/logs/errors/ingestion-capacity.errors.ts`: `IngestionCapacityExceededError` (plain `Error` subclass, constructor takes `retryAfterSeconds: number` and stores it as a public readonly field) and `IngestionBatchTooLargeError` (plain `Error` subclass, constructor takes a descriptive `message`). **Neither imports anything from `@nestjs/common`** — this is the repository layer's HTTP-agnostic vocabulary for "why admission was refused" (data-model.md's `BackpressureException` note, layering refinement above)

**Checkpoint**: Config parsing is centralized and validated; the domain-error vocabulary exists. US1 can now implement capacity accounting.

---

## Phase 3: User Story 1 - Service survives sustained overload without crashing (Priority: P1) 🎯 MVP

**Goal**: `LogRepository` tracks total admitted-but-not-completed row/byte count (queued + in-flight) and refuses new work — with a correct HTTP status, not a crash or a `500` — once a configured limit would be exceeded, releasing capacity safely whether the corresponding flush succeeds or fails. Zero cost when disabled.

**Independent Test**: quickstart.md Scenario 2, evaluated at the status-code level (not yet `Retry-After`/exact body text — that's US2): with a deliberately tiny `BACKPRESSURE_MAX_PENDING_ROWS`, concurrent requests beyond the cap are refused (a `5xx`, not silently queued) instead of growing `pendingInserts` without bound; `GET /health` stays responsive throughout; no rows/rollup deltas are written for refused batches; the service resumes accepting once load subsides.

### Implementation for User Story 1

- [ ] T007 [US1] In `src/logs/repositories/log.repository.ts`: add `private readonly backpressureConfig = createBackpressureConfig();` and two private mutable counters, `pendingRowCount = 0` and `pendingByteCount = 0`, alongside the existing `pendingInserts`/`flushTimer`/`isFlushing` fields (depends on T005)
- [ ] T008 [US1] In `src/logs/repositories/log.repository.ts`: add a private `estimateByteSize(logs: readonly NewLog[]): number` method that sums, per entry, `message.length + service.length + tenant_id.length` plus each `attributes` key/value's length plus `ESTIMATED_BYTES_OVERHEAD_PER_LOG_ENTRY` (T003) — **not** `JSON.stringify`/`Buffer.byteLength`, which would allocate and fully serialize each entry on the ingestion hot path for no precision this project's "estimate, not exact" requirement (spec.md Assumptions) actually needs (research.md Decision 2). This is the **single, only** place this computation happens in the codebase — both the admission check and the counters below reuse its one result per batch, never recomputing it (depends on T003, T007)
- [ ] T009 [US1] In `src/logs/repositories/log.repository.ts`: add a private `checkAdmission(logs: readonly NewLog[], byteSize: number): void` method implementing data-model.md's two-tier decision: if `logs.length > maxPendingRows` OR `byteSize > maxPendingBytes`, throw `IngestionBatchTooLargeError` (T006) — the batch can never fit, at any pending level; else if `pendingRowCount + logs.length > maxPendingRows` OR `pendingByteCount + byteSize > maxPendingBytes`, throw `IngestionCapacityExceededError(this.backpressureConfig.retryAfterSeconds)` (T006); otherwise return normally (depends on T006, T008)
- [ ] T010 [US1] In `src/logs/repositories/log.repository.ts`: extend the `PendingInsert` interface with a `byteSize: number` field. Wire admission into `insertMany()`, **guarded by `if (this.backpressureConfig.enabled)` as the only new code reachable on the disabled path** (FR-002, SC-002): when enabled, compute `byteSize` once via T008, call `checkAdmission()` (T009) — which throws synchronously before anything is queued if refused — then increment `pendingRowCount`/`pendingByteCount` and store `byteSize` on the new `PendingInsert` entry, immediately before the existing `pendingInserts.push(...)` (depends on T009)
- [ ] T011 [P] [US1] **Safe capacity release on both success and failure**: in `flushBatch()`'s two existing per-entry settle loops (`for (const entry of batch) { entry.resolve(); }` and the `entry.reject(error)` one), add — guarded by the same `if (this.backpressureConfig.enabled)` check — a decrement of `pendingRowCount`/`pendingByteCount` by that entry's own `logs.length`/`byteSize`, in **both** loops, so a failed flush frees capacity exactly as reliably as a successful one and no entry is ever double-counted or leaked (data-model.md's invariant) (depends on T010)
- [ ] T012 [P] [US1] In `src/logs/services/log-ingestion.service.ts`: wrap the existing `await this.logRepository.insertMany(...)` call in a try/catch that translates `IngestionCapacityExceededError` → a bare `ServiceUnavailableException` and `IngestionBatchTooLargeError` → a bare `PayloadTooLargeException` (both built into `@nestjs/common` — no new files needed yet), re-throwing any other error unchanged. This is the HTTP-translation boundary described in research.md Decision 8. Only needs the domain errors to exist and be thrown (T006, T009, T010) — does **not** need T011's capacity-release logic, which is unrelated to whether this catch block fires; can be implemented in parallel with T011 (depends on T006, T009, T010)
- [ ] T013 [US1] Run quickstart.md Scenario 2 against a locally built stack with `BACKPRESSURE_ENABLED=true` and a deliberately tiny `BACKPRESSURE_MAX_PENDING_ROWS` (e.g. `5`): confirm excess concurrent requests receive a `5xx` instead of hanging or growing the queue unboundedly, `GET /health` returns `200` throughout, `GET /logs` shows exactly the accepted requests' entries (never a refused one), and the service accepts normally again once the burst subsides — without a restart. Recovery must actually happen, which needs T011's release logic in place, not just T012's translation (depends on T011, T012)

**Checkpoint**: MVP-critical — the service can no longer be driven into unbounded queue growth; it sheds excess load with a correct status code instead of crashing, hanging, or falling through to a generic `500`.

---

## Phase 4: User Story 2 - Caller receives an actionable "try again later" signal (Priority: P2)

**Goal**: Upgrade US1's bare `503` into the fully actionable, contract-complete signal spec.md requires: a real `Retry-After` header, exact response body text, and confirmation that per-entry validation's `accepted`/`rejected` contract is completely undisturbed.

**Independent Test**: quickstart.md Scenarios 2 (full) and 3 — a `503` response carries `Retry-After` and the documented error message; a batch that can never fit (row-count or, independently, byte-size) gets `413` with no `Retry-After`, even when the system is otherwise idle; a batch mixing valid/invalid entries under spare capacity still returns the unchanged `{"accepted", "rejected"}` body.

### Implementation for User Story 2

- [ ] T014 [P] [US2] Create `src/logs/exceptions/backpressure.exception.ts`: `BackpressureException extends ServiceUnavailableException`, constructor takes `retryAfterSeconds: number` and exposes it as a public readonly field, with a message matching `contracts/post-logs-backpressure.md` ("the service is temporarily at ingestion capacity; retry shortly")
- [ ] T015 [P] [US2] In `src/common/filters/global-exception.filter.ts`: **inside the existing `exception instanceof HttpException` branch only** (after `status`/`message` are resolved there, before `response.status(status).json(...)`), add a small, generic, duck-typed check — if the caught exception exposes a numeric `retryAfterSeconds` property, call `response.set('Retry-After', String(retryAfterSeconds))`. Scoping this to the `HttpException` branch (not an unconditional check against any caught value) is deliberate: `IngestionCapacityExceededError` (T006) is a plain `Error` that also happens to carry a `retryAfterSeconds` property, and must never be able to trigger this header if it ever reached the filter untranslated — only a confirmed `HttpException` can. No import from `logs/` — the filter stays exactly as feature-agnostic as it is today, and this same mechanism is reusable by any future exception that wants a `Retry-After` (research.md Decision 4; preserves `GlobalExceptionFilter`'s generic responsibility)
- [ ] T016 [US2] In `src/logs/services/log-ingestion.service.ts`: change T012's `IngestionCapacityExceededError` translation from the bare `ServiceUnavailableException` to `new BackpressureException(error.retryAfterSeconds)` — a one-line refinement of T012's already-written catch block, not new logic (depends on T012, T014)
- [ ] T017 [US2] Run quickstart.md Scenarios 2 and 3 in full against the tiny-cap local stack: confirm every `503` carries `Retry-After: <BACKPRESSURE_RETRY_AFTER_SECONDS>` and the exact documented message; confirm a single request whose valid entries alone exceed the row cap gets `413` with **no** `Retry-After` header even with nothing else pending; confirm the same for the byte-size dimension independently (one entry with an oversized `message`, under a small `BACKPRESSURE_MAX_PENDING_BYTES`); confirm a batch mixing one valid and one invalid entry, sent while capacity is available, still returns `{"accepted":1,"rejected":[{"index":1,"reason":"..."}]}` unchanged. Also run Scenario 2's two additions: the **timed** recovery check (report the actual measured seconds-to-recovery, confirming it's consistent with SC-005's "a few seconds," not just that it eventually recovers) and the **two-tenant global-capacity check** (`AUTH_ENABLED=true`, tenant A's burst alone exhausts capacity, tenant B's unrelated request is also `503`'d — proves FR-008's global-not-per-tenant guarantee empirically, not just by code inspection) (depends on T015, T016)

**Checkpoint**: The rejection signal matches `contracts/post-logs-backpressure.md` exactly — this is the acceptance check for spec.md SC-008.

---

## Phase 5: User Story 3 - Default deployment is unaffected (Priority: P3)

**Goal**: Confirm — not build new logic; T010/T011's `if (this.backpressureConfig.enabled)` guards already are the entire mechanism — that the disabled default is truly inert, adds no measurable cost, and that the required-contract smoke tests are unaffected.

**Independent Test**: quickstart.md Scenario 1 and the existing `smoke`/`smoke-auth` CI jobs, run against a genuinely zero-config stack, pass with zero changes to their expected output.

### Implementation for User Story 3

- [ ] T018 [US3] **Zero-cost-when-disabled review**: read through every line T007–T016 added to `log.repository.ts`/`log-ingestion.service.ts` and confirm that when `backpressureConfig.enabled === false`, `estimateByteSize()` and `checkAdmission()` are never invoked, no `JSON.stringify` call happens, and the only additional cost on the hot path is one boolean-field read per call site (`insertMany()`'s guard, and the two guards in `flushBatch()`'s settle loops) (FR-002, SC-002) (depends on T011)
- [ ] T019 [US3] Run quickstart.md Scenario 1 against a genuinely zero-config stack (`docker compose up`, no `.env`, no `BACKPRESSURE_*` vars) and re-run the existing `smoke` and `smoke-auth` CI job steps locally, unmodified: confirm every assertion passes exactly as it did before this feature existed (SC-006) (depends on T018)
- [ ] T020 [US3] Using the tiny-cap config from US1/US2 with `AUTH_ENABLED=true` and no `LOADGEN_API_KEY` credential supplied, confirm the response is `401`, never `503`/`413` — auth resolution precedes the capacity check by construction (research.md Decision 1), so this is a confirmation, not new code (FR-009) (depends on T017)

**Checkpoint**: All three user stories independently verified. Zero-config behavior is provably unaffected, not just assumed by design.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, repo-wide checks, and the mandatory performance-validation gate.

- [ ] T021 [P] Update `README.md`'s "Optional features" section per `docs/Final_Project.md`'s Optional Features contract: this feature's default state (disabled), the 4 env vars that control it, and confirmation that zero-config `docker compose up` still yields the unauthenticated, backpressure-disabled core service (FR-015) (depends on T013, T017, T019)
- [ ] T022 [P] Update `README.md`'s "Configuration" table with the 4 new env vars and their defaults (depends on T013, T017, T019)
- [ ] T023 [P] *(optional, deferred per plan.md — this feature adds no new endpoint so CLAUDE.md's per-endpoint `.rest` rule doesn't strictly apply)* Add example `.rest` requests demonstrating the new responses, e.g. `requests/logs/logs.ingest.backpressure-503.rest` and `requests/logs/logs.ingest.oversized-413.rest`, consistent with existing project documentation practice
- [ ] T024 Run `npm run build` to confirm the entire feature type-checks cleanly. Depends only on the code tasks (through T020, the last US3 task) — **not** on T021-T023, which are documentation-only and cannot affect a TypeScript compile; T023 in particular is explicitly optional/deferred, and a required build task must never be gated on an optional one (depends on T020)
- [ ] T025 Run `npm run format` and `npm run lint` immediately before opening the PR, per `CLAUDE.md`'s workflow rule — not run earlier during implementation (depends on T024)
- [ ] T026 **Local performance check (diagnostic only, not the gate)**: with `BACKPRESSURE_ENABLED=true` at the generous default thresholds (`20000` rows / `25mb` — well above steady-state usage at the coalescing window's arrival rate), re-run the project's existing load-generation methodology and confirm no visible throughput/latency regression versus the `002-performance-optimization` baseline already recorded in `README.md`; also confirm the disabled-default configuration's numbers are unchanged from `002`'s already-measured baseline. **Also explicitly measure/log `pendingRowCount`/`pendingByteCount` (e.g., via a temporary debug log or a manual breakpoint) during the sustained ≥15k logs/sec run and confirm they stay comfortably under the configured caps** — this validates the *safety margin* of the chosen defaults under real flush/commit latency, not just that throughput doesn't regress; research.md Decision 6's stated rationale for the row-count default only reasoned about debounce-window arrival rate, not actual in-flight duration under load, so this is the first point that empirically confirms it. Local runs are diagnostic only, per this project's established convention (`.wolf/cerebrum.md`) — not a substitute for T027 (depends on T025)
- [ ] T027 **[mandatory gate]** Benchmark via the project's external load-testing portal, per spec.md SC-007 and this project's established "measured, not assumed" principle (`specs/002-performance-optimization/tasks.md` T037 precedent): (a) `BACKPRESSURE_ENABLED=false` (the default) shows no measurable regression versus the existing `002` baseline; (b) `BACKPRESSURE_ENABLED=true` at the generous default thresholds also clears the ≥15,000 logs/sec baseline. **When counting throughput for either run, count only `200` responses as ingested.** A load-generator run or analysis script that counts `503`/`413` responses toward throughput will produce a falsely inflated number — `docs/Final_Project.md` is explicit that shed requests "do not contribute to your throughput number." Any configuration that does not clear the baseline, or that regresses another required metric, MUST NOT be retained as the shipped default — per this project's established perf-change bar, revert rather than keep a change that comes back flat or ambiguous (depends on T026)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup only for T003's naming to match the env vars T001/T002 already introduced. Blocks all three user stories — T007 needs T005, T009 needs T006.
- **User Story 1 (Phase 3)**: Depends on Foundational (T005, T006). MVP-critical; delivers a fully functional (if not yet fully "actionable") admission-control mechanism on its own.
- **User Story 2 (Phase 4)**: Depends on User Story 1 (T012's already-written catch block, refined by T016) — unlike `002`'s stories, US1 and US2 here are **not** architecturally independent; US2 is a small, additive refinement of code US1 already wrote, not a parallel track.
- **User Story 3 (Phase 5)**: Depends on User Story 1 (T011, for the review in T018) and User Story 2 (T017, for T020's confirmation) — it is a verification-only phase, not new logic, so it necessarily comes last among the three stories despite being independently *testable*.
- **Polish (Phase 6)**: `T024` (build) depends only on all code tasks through `T020` — **not** on `T021-T023` (README updates, optional `.rest` examples), which are documentation and cannot affect a compile. `T025` (format/lint) depends on `T024`. `T026` (local diagnostic, now including counter-headroom measurement) depends on `T025`. `T027` (external benchmark) is the final gate and depends on `T026`. `T021-T023` can proceed independently, any time after `T020`, in parallel with `T024-T027`.

### Recommended Order

Setup → Foundational → US1 → US2 → US3 → Polish — matching spec.md's priority order (P1 → P2 → P3). Unlike `002-performance-optimization`, this order is not just a convention here but reflects a real dependency: US2 literally edits code US1 wrote, and US3 verifies both.

### Parallel Opportunities

- Setup: T001, T002 in parallel (different files).
- Foundational: T003, T004, T006 in parallel (three independent files); T005 must wait for T003 and T004.
- User Story 1: T011 and T012 in parallel (different files — `log.repository.ts` vs. `log-ingestion.service.ts`; T012 depends only on T006/T009/T010, not on T011's capacity-release logic).
- User Story 2: T014 and T015 in parallel (different files, neither depends on the other).
- Polish: T021, T022, T023 in parallel (different files/sections) — and, per the dependency note above, all three can run in parallel with T024-T027 as well, not just with each other.

---

## Parallel Example: Foundational Phase

```bash
Task: "Add 5 backpressure default constants to src/common/constants/log-api.constants.ts"
Task: "Promote bytes to a direct dependency in package.json"
Task: "Create the IngestionCapacityExceededError/IngestionBatchTooLargeError domain errors in src/logs/errors/ingestion-capacity.errors.ts"
```

## Parallel Example: User Story 1 (capacity release + HTTP translation)

```bash
Task: "Add capacity-release decrements to flushBatch()'s settle loops in src/logs/repositories/log.repository.ts"
Task: "Add the domain-error-to-HTTP-exception translation try/catch to src/logs/services/log-ingestion.service.ts"
```

## Parallel Example: User Story 2 (exception class + filter change)

```bash
Task: "Create BackpressureException in src/logs/exceptions/backpressure.exception.ts"
Task: "Add the generic Retry-After pass-through to src/common/filters/global-exception.filter.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1 — **STOP and VALIDATE** with quickstart.md Scenario 2 (status-code level)
4. This is the MVP: the service can no longer be driven into unbounded queue growth by sustained overload, and refuses excess load with a correct `5xx` instead of crashing, hanging, or degrading to a generic `500`. Deployable/gradable at this point, though the signal isn't yet fully "actionable" (no `Retry-After`) — that's US2.

### Incremental Delivery Beyond MVP

5. Add User Story 2 → the `503`/`413` split becomes fully contract-complete (`Retry-After`, exact messages) → validate with Scenarios 2+3 in full
6. Add User Story 3 → confirm (not build) that the disabled default is truly inert and zero-cost, and the existing smoke tests are unaffected → validate with Scenario 1 + local smoke-test rerun
7. Polish: README updates, optional `.rest` examples, build/format/lint, local diagnostic perf check, **mandatory external benchmark (T027) — do not skip, and do not count shed `503`/`413` traffic as throughput**

---

## Notes

- No test files are created in any phase — see the **Tests** note at the top of this document.
- `[P]` tasks touch different files and have no incomplete same-phase dependency.
- Commit after each task or logical group, per the repository's existing incremental-commit-history convention.
- Every task traces to a specific spec.md FR/SC or research.md/data-model.md decision, called out inline.
- The **layering** noted at the top of this file (domain errors in `LogRepository`, HTTP translation in `LogIngestionService`) is documented consistently across `plan.md`, `research.md` (Decision 8), and `data-model.md` as of the 2026-08-14 revision below — this file no longer describes it as a deviation from the plan, since the plan has been updated to match.
- Byte-size estimation (T008) uses a field-length sum, not `JSON.stringify`/`Buffer.byteLength`, to avoid unnecessary serialization on the ingestion hot path (research.md Decision 2) — see `data-model.md`'s "Byte-size estimation" section for the exact formula.

**2026-08-14 revision**: this file, along with `plan.md`, `research.md`, and `data-model.md`, was updated after a code-level review surfaced two correctness/performance risks and re-confirmed several task-ordering issues from an earlier `/speckit-analyze` pass. Changes: (1) byte estimation switched from `JSON.stringify`+`Buffer.byteLength` to a cheap field-length sum (T008, T003's new constant); (2) `GlobalExceptionFilter`'s `Retry-After` check scoped to its `HttpException` branch only (T015), closing a coupling risk with the domain errors; (3) `T024`'s dependency corrected to not include the optional `T023` or the non-code `T021`/`T022`; (4) `T012`'s spurious dependency on `T011` removed, and both marked `[P]` since they're independent; (5) a two-tenant global-capacity check added to `quickstart.md` Scenario 2 and referenced from `T017` (FR-008 had no empirical verification before); (6) `T026` now explicitly measures capacity-counter headroom under sustained load, not just throughput; (7) `quickstart.md`'s recovery check now measures and reports actual elapsed time (SC-005), not just a fixed `sleep`. `plan.md`/`research.md`/`data-model.md` were already updated to describe the domain-error/HTTP-exception layering consistently, which this file had described from the start but the earlier planning docs hadn't yet caught up to.
