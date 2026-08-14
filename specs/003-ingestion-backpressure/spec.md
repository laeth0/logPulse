# Feature Specification: Optional Backpressure Support

**Feature Branch**: `003-ingestion-backpressure`

**Created**: 2026-08-14

**Status**: Draft

**Input**: User description: "Add optional Backpressure Support to the existing ingestion system. Protect the application from unbounded queue growth when incoming traffic exceeds sustainable processing capacity. Requirements: Preserve the existing API contract and POST /logs response behavior; preserve partial per-entry validation; preserve multi-tenancy, AUTH_ENABLED, and LOADGEN_API_KEY behavior; preserve PostgreSQL durability, rollups, retention, and existing write coalescing; backpressure must be disabled by default; admit each caller's valid batch atomically, never partially admit or silently drop an admitted caller; on temporary global capacity exhaustion, return 503 + Retry-After; rejected requests must not write logs or rollups; do not use DLQ, Kafka, Redis, RabbitMQ, adaptive CPU control, or complex per-tenant scheduling in V1."

## Clarifications

### Session 2026-08-14

- Q: What signal defines "at capacity" for backpressure admission? → A: Total admitted-but-not-completed ingestion work — validation-accepted log entries that have been admitted for durable write but not yet confirmed written (still queued or in-flight) — tracked along two independent dimensions: entry count and estimated total byte size. CPU utilization, event-loop lag, and database utilization are explicitly excluded as V1 admission signals.
- Q: Does the capacity check count raw incoming batch entries or only entries that survive per-entry validation? → A: Only validation-accepted entries count toward capacity consumption; entries rejected by validation never consume capacity.
- Q: What HTTP status should a single request whose valid entries alone can never fit within the configured capacity receive — even with zero concurrent load? → A: HTTP `413` (Payload Too Large), not `503`. This project already has a precedent for exactly this distinction: the `JSON_BODY_LIMIT` request-body size limit (`src/main.ts`) is enforced by the body parser and surfaced as `413` through `GlobalExceptionFilter`'s existing external-client-error passthrough, not as a retryable `5xx`. `503` + `Retry-After` is reserved for genuinely temporary exhaustion where retrying later can succeed; a request that can never fit is a permanent property of that request, which is exactly `413`'s semantics.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Service survives sustained overload without crashing (Priority: P1)

An operator running the service under traffic that exceeds what the application and database containers can sustainably process needs the service to keep running — responding to health checks, continuing to durably ingest whatever it can — instead of exhausting memory, stalling, or crashing because an internal queue grew without bound.

**Why this priority**: This is the entire point of the feature. Every other behavior (response codes, opt-in default, preserved contracts) only matters if the core protection — the service staying up and recoverable under sustained overload — actually works.

**Independent Test**: Enable backpressure, drive ingestion traffic well beyond the configured/measured sustainable capacity for a sustained period, and confirm the service remains responsive (health check still returns 200, process does not crash or OOM) throughout, then returns to normal accept behavior once traffic drops back to a sustainable level.

**Acceptance Scenarios**:

1. **Given** backpressure is enabled and the service is at its configured capacity, **When** additional `POST /logs` batches arrive, **Then** the service rejects the excess batches instead of continuing to grow its internal queue without bound.
2. **Given** the service has been rejecting batches under sustained overload, **When** incoming traffic drops back to a sustainable rate, **Then** the service resumes accepting batches normally without requiring a restart or manual intervention.
3. **Given** backpressure is enabled and under sustained overload, **When** the load is measured throughout the test, **Then** the application process does not crash, hang, or exceed its container's resource limits.

---

### User Story 2 - Caller receives an actionable "try again later" signal (Priority: P2)

A client application sending logs to the service needs to be able to distinguish "the system is temporarily overloaded, back off and retry" from every other kind of failure (validation error, auth failure, permanent malformed request), so it can implement sensible retry behavior instead of treating a shed request the same as a bad request.

**Why this priority**: Directly required by `docs/Final_Project.md`'s backpressure guidance ("shedding load with 429 or 503 plus Retry-After is better than crashing") and by this feature's explicit requirement to return `503` + `Retry-After` on capacity exhaustion. Depends on User Story 1 existing before it's meaningful.

**Independent Test**: With backpressure enabled and the service deliberately held at capacity, send a `POST /logs` batch and confirm the response is `503` with a `Retry-After` header, and that no rows were written for that batch.

**Acceptance Scenarios**:

1. **Given** backpressure is enabled and the service is at capacity, **When** a caller sends a valid `POST /logs` batch, **Then** the response is HTTP `503` with a `Retry-After` header, and none of that batch's entries appear in subsequent query results.
2. **Given** a batch was rejected with `503`, **When** the caller inspects the rejected batch, **Then** none of its entries were partially written — the rejection is all-or-nothing for that caller's request.
3. **Given** backpressure is enabled, **When** a batch mixes valid and invalid entries and the service currently has spare capacity, **Then** the existing per-entry validation response (`accepted`/`rejected` array) is returned unchanged — capacity rejection never replaces or interferes with validation rejection.

---

### User Story 3 - Default deployment is unaffected (Priority: P3)

An operator running the service with the default zero-configuration `docker compose up` setup — as required by `docs/Final_Project.md`'s "Default Posture: Zero Configuration" — must see no behavior change at all from this feature unless they explicitly opt in.

**Why this priority**: Required to keep the project's zero-config contract intact and to avoid the required-contract smoke tests (and the external load-testing portal's baseline run) seeing any different behavior than before this feature existed. Lower priority than P1/P2 only because "do nothing differently" requires no new runtime logic to prove — it is a guarantee about the *absence* of behavior change.

**Independent Test**: Run `docker compose up` with no environment variables set, then run the existing required-contract smoke test unmodified; every assertion must pass exactly as it did before this feature was added.

**Acceptance Scenarios**:

1. **Given** no backpressure-related environment variables are set, **When** the service starts, **Then** backpressure is disabled and ingestion behaves exactly as it did before this feature (including the existing unbounded-growth behavior of the in-process write queue).
2. **Given** backpressure is disabled, **When** traffic is driven at or above the levels used in User Story 1's test, **Then** the service never returns `503` for capacity reasons.

---

### Edge Cases

- A caller's validation-accepted entries alone exceed the absolute configured capacity limit (by count or by byte size), so the batch could never be admitted even with zero concurrent load: the batch is rejected in full with HTTP `413` (Payload Too Large), not `503` — retrying the identical batch can never succeed, so it must not be signaled as a temporary condition.
- A caller's validation-accepted entries would fit within the configured capacity on their own, but capacity is temporarily unavailable because other admitted-but-not-yet-completed work is currently consuming it: the batch is rejected with `503` + `Retry-After` — retrying later can succeed.
- A batch has few entries but very large messages or attributes (or the reverse — many small entries): either the entry-count limit or the byte-size limit alone can trigger capacity exhaustion; the two dimensions are enforced independently, not combined into one score.
- A batch contains zero valid entries after per-entry validation: the existing `400` ("all entries rejected") response is returned; the batch never reaches the capacity check, so a caller cannot receive `503` or `413` for a batch that would have been entirely invalid anyway.
- The request body is malformed JSON or doesn't match the expected top-level structure: the existing `400` response is returned immediately, before any capacity check.
- `AUTH_ENABLED=true` and the caller has no or an invalid credential: the existing `401` response is returned; backpressure is never evaluated for an unauthenticated request.
- The service transitions from "at capacity" back to "has capacity" while a request is mid-flight: each request's admission outcome is decided once, atomically, at the time it is evaluated — it is not re-evaluated mid-request.
- Backpressure is enabled but traffic never reaches the configured threshold: behavior is identical to backpressure being disabled.
- The seeded load-generator key (`LOADGEN_API_KEY`) sends a batch while the service is at capacity: it is rejected the same as any other caller's batch — capacity exhaustion is global, not exempted per-key (unlike this project's rate-limiting exemption rule, which `docs/Final_Project.md` deliberately does not extend to backpressure).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide an admission-control mechanism on the `POST /logs` ingestion path that can reject an incoming batch, before any of its rows are durably written, when the system determines it is at capacity.
- **FR-002**: Backpressure MUST be controlled by a single configuration setting that defaults to disabled. When disabled, ingestion behavior — including the existing in-process write queue's current unbounded growth — MUST be byte-for-byte unchanged from the system's behavior before this feature.
- **FR-003**: When backpressure is enabled and the system determines it is at capacity — defined as the total admitted-but-not-completed ingestion work (validation-accepted entries queued or in-flight, not yet confirmed durably written) reaching a configured limit — the system MUST reject the entire incoming batch with HTTP `503` and a `Retry-After` header, and MUST NOT write any log rows or rollup deltas for that batch.
- **FR-004**: The system MUST NOT partially admit a caller's batch for capacity reasons: for any single `POST /logs` request, either its entire set of validation-accepted entries is queued for durable write, or none of them are.
- **FR-005**: The capacity check MUST run only after existing per-entry validation completes, so a batch with zero valid entries continues to receive the existing `400` response rather than a capacity-related response, and the existing `accepted`/`rejected` per-entry contract is otherwise unaffected by whether backpressure is enabled.
- **FR-006**: The capacity check MUST be evaluated only against entries that survived per-entry validation (FR-005) — entries rejected by validation MUST NOT consume or count toward capacity.
- **FR-007**: The `503` response body MUST use this project's existing whole-request-rejection error shape (`{"error": "<description>"}`), consistent with how `401`/`403`/`429` responses are already shaped, and MUST include a `Retry-After` header.
- **FR-008**: Capacity MUST be evaluated as a single global signal shared across all tenants and API keys, including the seeded `LOADGEN_API_KEY` — there is no per-tenant capacity quota or per-key exemption in this version.
- **FR-009**: The system MUST evaluate existing authentication/authorization (`AUTH_ENABLED`, credential checks, tenant resolution) before the capacity check, so an unauthenticated or unauthorized request always receives its existing `401`/`403` response regardless of current system capacity.
- **FR-010**: The system MUST NOT implement backpressure using a dead-letter queue, Kafka, Redis, RabbitMQ, adaptive CPU-based control, or complex per-tenant scheduling in this version.
- **FR-011**: Existing write coalescing (the debounce/batching behavior of the in-process insert queue) MUST continue to operate unchanged for every batch that is admitted.
- **FR-012**: Existing rollup pre-aggregation, PostgreSQL durability guarantees (the system MUST NOT respond `200` for a batch it has not durably accepted), and retention behavior MUST be unaffected by backpressure for any admitted batch.
- **FR-013**: Once the system determines it is no longer at capacity, it MUST resume admitting batches automatically, without requiring a restart or other manual intervention.
- **FR-014**: When backpressure is enabled, its capacity threshold(s) MUST be configurable via environment variables with a documented default, following this project's existing pattern for other ingestion tunables (e.g., the write-coalescing window and row cap). When backpressure is disabled (the default), no threshold configuration is read or enforced.
- **FR-015**: The project README MUST document this feature per `docs/Final_Project.md`'s Optional Features contract: its default state (disabled), the environment variable(s) that control it, and confirmation that a zero-configuration `docker compose up` still yields the unauthenticated, backpressure-disabled core service.
- **FR-016**: Capacity MUST be tracked along two independent dimensions — the count of admitted-but-not-completed log entries, and their estimated total byte size — and the system MUST treat capacity as exhausted if admitting a batch would exceed either configured limit.
- **FR-017**: V1 admission decisions MUST be based solely on the entry-count and byte-size signals in FR-003/FR-016. CPU utilization, event-loop lag, and database utilization/connection-pool saturation MUST NOT be used as admission signals in this version.
- **FR-018**: A request whose validation-accepted entries alone exceed the absolute configured capacity limit — such that it could never be admitted regardless of concurrent load — MUST be rejected with HTTP `413` (Payload Too Large) rather than `503`, since retrying an identical request can never succeed. The `413` response MUST use the same `{"error": "<description>"}` shape as other rejection responses.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With backpressure enabled and ingestion traffic driven at least 2x above the configured/measured sustainable capacity for at least 60 continuous seconds, the service remains responsive (health check continues returning success) and does not crash or restart.
- **SC-002**: With backpressure disabled (the default configuration), ingestion throughput and response codes for identical input are indistinguishable from the system's behavior before this feature existed.
- **SC-003**: Zero log entries or rollup counts are ever observable, via the existing query/aggregate endpoints, that originated from a batch which received a capacity-exhaustion rejection.
- **SC-004**: 100% of batches that receive a capacity-exhaustion rejection have zero entries written — never a partial write — and 100% of batches that are admitted have all of their validation-accepted entries written — never a partial admission.
- **SC-005**: After sustained overload ends and traffic returns to a sustainable rate, the service resumes accepting batches normally within a few seconds, without manual intervention.
- **SC-006**: Running the required-contract smoke test (both the unauthenticated and the `AUTH_ENABLED=true` configurations) against a zero-configuration deployment produces identical results before and after this feature is added.
- **SC-007**: With backpressure enabled but traffic kept below the configured capacity threshold, ingestion throughput meets this project's existing baseline target (at least 15,000 logs/second sustained) with no measurable regression attributable to the admission-control check itself.
- **SC-008**: A batch whose valid entries alone exceed either configured capacity limit (entry count or byte size) always receives HTTP `413`, never `503`, regardless of concurrent load — and a batch that would fit within the limits but is temporarily blocked by other in-flight work always receives `503`, never `413`.

## Assumptions

- Backpressure protects only the `POST /logs` ingestion path in this version. `GET /logs` and `GET /logs/aggregate` are not gated by the same capacity signal, since the stated problem ("unbounded queue growth") is specific to the ingestion write queue, and the two query endpoints already run against a separately bounded connection pool.
- The `Retry-After` value is a configurable value with a conservative fixed default (not dynamically computed from a live queue-drain estimate), consistent with this project's existing approach of shipping configurable-but-fixed defaults for other ingestion tunables, pending measurement.
- No automated test files (`.test.`/`.spec.` or otherwise) will be added for this feature, per explicit instruction; verification relies on manual and load testing, consistent with how prior performance work in this project (`002-performance-optimization`) was validated.
- "Temporary" capacity exhaustion (per the feature's own framing) implies the condition is expected to be transient and self-recovering as admitted-but-not-completed work drains — this feature does not introduce any persistent or externally-visible "degraded mode" state beyond individual `503` responses while the condition lasts. A request that can never fit (FR-018) is a distinct, non-transient case and is deliberately excluded from this "temporary" framing — it always receives `413`.
- This feature introduces no new persisted data entities — only in-memory admission-control state scoped to the running application process, consistent with the "no DLQ / no external broker" constraint.
- Estimated byte size (FR-016) is computed from the batch as received (e.g., its serialized request-body size or an equivalent per-entry estimate), not from the eventual on-disk storage footprint after any transformation — the exact estimation method is an implementation detail left to planning.
