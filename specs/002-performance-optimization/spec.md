# Feature Specification: Performance Optimization

**Feature Branch**: `002-performance-optimization`

**Created**: 2026-08-13

**Status**: Draft

**Input**: User description: "Improve the performance of my current log ingestion project. Use `LogIngestion-majed` only as a read-only reference because it currently performs better. Study its architecture and implementation to identify useful performance techniques that can be adapted to my project. All changes MUST remain compatible with docs/Final_Project.md. Do not break: the required API contract; multi-tenancy and tenant isolation; AUTH_ENABLED behavior; LOADGEN_API_KEY; retention; durability requirements; zero-config docker compose behavior. The goal is performance improvement only, without removing required features."

## Clarifications

### Session 2026-08-13

- Q: After an unclean restart, when pre-computed rollups are missing/stale and need rebuilding from raw log data, should `GET /health` block until the rebuild finishes, or report ready immediately with aggregation temporarily falling back to a direct raw-table scan until the rebuild completes in the background? → A: Report healthy immediately; aggregation falls back to direct raw-table scans (still correct, just slower) until rollups finish rebuilding in the background — no startup-delay risk to the load generator's readiness poll.
- **Resolution update (post-`/speckit-analyze` remediation)**: subsequent design work found a stronger guarantee than the one this question assumed was possible — pre-computed summaries can be kept atomically consistent with log data at all times (updated in the same transaction as the log data they summarize, both durably stored), so there is no "missing/stale after an unclean restart" state for a runtime rebuild to ever need to correct. The **principle** this clarification established — `GET /health` must never gain a new blocking dependency on rollup state — still holds and is fully preserved; it's now satisfied because no such dependency exists at all, rather than by a non-blocking rebuild mechanism. FR-009 and FR-019 below reflect this directly; the "rebuild"/"background rebuild" language originally introduced by this clarification has been superseded and removed from the requirements.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ingestion throughput stays high as concurrent load increases (Priority: P1)

An operator (in practice, the grading load generator) sends many concurrent batches of logs to the service. Today, measured throughput drops as concurrency rises — from ~20,400 logs/sec at concurrency 8 down to ~13,900 logs/sec at concurrency 16 (per this project's own recorded measurements), because each incoming batch triggers its own independent database write, and PostgreSQL's single CPU core becomes the bottleneck under concurrent load. The service should instead keep accepting and durably storing logs at high, stable throughput as concurrency increases, by reducing the number of separate database write operations without weakening any durability guarantee.

**Why this priority**: This is the single largest, most directly measured bottleneck in the system today. Ingestion throughput is graded directly (15,000 logs/sec required baseline, with higher sustained rates earning additional credit), and this is the improvement most clearly evidenced both by this project's own prior load-test results and by the reference project's measured numbers.

**Independent Test**: Run concurrent `POST /logs` batches at increasing concurrency levels (e.g., 8, 16, 32) and confirm throughput no longer drops as concurrency rises, with zero failed/rejected batches and no durability guarantee weakened.

**Acceptance Scenarios**:

1. **Given** the service under sustained concurrent ingestion load, **When** concurrency increases from a lower to a higher level, **Then** throughput does not measurably degrade the way it does today.
2. **Given** many concurrent batches arriving within a short window, **When** they are written to the database together for efficiency, **Then** each caller still receives an accurate `accepted`/`rejected` count for its own batch, indistinguishable from today's per-request behavior.
3. **Given** a batch that has received HTTP `200`, **When** the service is queried immediately after, **Then** that batch's data is present — no batch is ever acknowledged before it is durably stored.
4. **Given** the service is multi-tenant, **When** batches from different tenants arrive concurrently and are grouped together internally for efficiency, **Then** each log entry is still stored under its own correct tenant and never becomes visible to a different tenant.

---

### User Story 2 - Aggregation queries stay fast while ingestion is active (Priority: P2)

An operator queries `GET /logs/aggregate` while the system is simultaneously ingesting logs at high volume — the actual scenario the project is measured against. Today, every aggregation request re-scans and re-groups the raw stored log rows for the requested time range, competing with concurrent ingestion for the same database resources. The service should instead answer common aggregation requests from small, pre-computed summaries, so their cost does not grow with the total number of stored rows and does not compete as heavily with ingestion.

**Why this priority**: Directly targets two explicit, named requirements — aggregation under 1 second at p95, and maintaining query performance while ingestion is active, at one aggregation request per second during the ingestion test. Ranked P2 rather than P1 because it is the larger-scope change of the two (new derived data, an added write-path step) and delivers independent value on its own once User Story 1 exists, without needing to ship together with it.

**Independent Test**: Start sustained ingestion, issue aggregation requests against a broad time range at one request per second, and confirm p95 latency stays well under the required threshold and remains stable as stored data volume grows toward the ~1,000,000-row target.

**Acceptance Scenarios**:

1. **Given** logs already ingested across a wide time range, **When** an aggregation request covers a range that does not require examining every individual row, **Then** the response is correct and returned quickly regardless of how many rows exist in that range.
2. **Given** the service is multi-tenant, **When** two tenants ingest logs with the same service/level/time-bucket values, **Then** each tenant's aggregation results include only that tenant's own counts, never combined with or leaked from another tenant's.
3. **Given** an aggregation request that includes a message-content filter (`q`) or an attribute filter (`attr.<key>`) that a pre-computed summary cannot answer, **When** it is issued, **Then** the service still returns a fully correct result.
4. **Given** logs are deleted by the retention process, **When** an aggregation request is later issued over an affected range, **Then** deleted logs are no longer counted, and any pre-computed summaries used to answer it stay in sync with retention.
5. **Given** the service crashes and restarts (including mid-way through ingesting a batch), **When** `GET /health` is polled immediately after, **Then** it reports ready exactly as quickly as any other restart — with no additional delay related to pre-computed summaries — and aggregation requests immediately return results that exactly match a direct scan of the underlying log data, confirming the summaries never diverged from it as a result of the crash.

---

### User Story 3 - Query and ingestion paths avoid unnecessary internal overhead (Priority: P3)

Beyond the two changes above, several smaller inefficiencies add avoidable CPU, memory, and storage-write cost without changing observable behavior: the read path builds more internal object representations of every fetched row than the response actually needs; the write path maintains a second, duplicate copy of every log's attribute data purely to simplify one kind of filter; and the database connection pool used for writes has no explicit size, silently defaulting to a value that may not suit this workload. None of these should change what any request returns — only how much work the service does to produce it.

**Why this priority**: Each item here is independently smaller in expected impact than User Stories 1–2, safe to make, and does not depend on either higher-priority change — but still worth doing, since it reduces resource cost inside the same fixed, small container limits every other requirement must fit within.

**Independent Test**: Before/after comparison of resource usage (CPU, memory) and response latency for `GET /logs` and `POST /logs` at a fixed load level, with response contents verified byte-for-byte identical to today's.

**Acceptance Scenarios**:

1. **Given** a `GET /logs` request that matches many rows, **When** it is served, **Then** the response body is identical to today's, using less memory/CPU per request to produce it.
2. **Given** an ingested log with attributes of mixed types (string, number, boolean), **When** it is later filtered by `attr.<key>=<value>`, **Then** the match behavior (compared as strings) is unchanged from today, even if the underlying storage representation changes.
3. **Given** sustained concurrent ingestion, **When** the database write connection pool is sized explicitly rather than left at its unconfigured default, **Then** ingestion throughput is not artificially capped by an unintentional connection limit.

---

### Edge Cases

- What happens if the service restarts or crashes mid-way through updating a pre-computed aggregation summary? Because a summary is updated in the same durable transaction as the log data it summarizes, the two can never diverge as a result of a crash — there is nothing to detect or repair afterward, and `GET /health`'s readiness conditions (database connected, migrations applied) are unaffected by this in any way.
- What happens to log data that existed before this pre-computed-summary mechanism was introduced? It is backfilled into the summary table exactly once, as part of the database migration that creates it — completed before the system is ever reachable, not as an ongoing or restart-triggered process.
- What happens when concurrent requests being grouped together for a single database write belong to different tenants, or mix authenticated and zero-config (unauthenticated, single implicit tenant) requests? Each request's own accepted/rejected outcome and each log's tenant association must remain exactly as correct as if it had been written alone.
- What happens if a change intended to improve performance is measured and does not actually help, or makes some other metric worse? It must not be kept on the assumption that it should theoretically help — only changes with a demonstrated improvement are retained.
- What happens to a pre-computed aggregation summary when its underlying logs are deleted by retention? The summary must be corrected/pruned so later aggregation queries never over-count deleted data.
- What happens when `AUTH_ENABLED=false` (the default, zero-config posture) and requests from many different unauthenticated callers are grouped together for efficiency? Behavior must remain indistinguishable from today's zero-config service to the load generator.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST reduce the number of separate database write operations performed under concurrent ingestion load, compared to today's one-write-per-HTTP-request behavior, without changing the per-request `POST /logs` response contract (`accepted`/`rejected` counts and reasons, exactly as specified today).
- **FR-002**: The system MUST NOT acknowledge (HTTP `200`) any batch of logs before that batch is durably stored — grouping multiple callers' writes together MUST NOT weaken this guarantee for any individual caller.
- **FR-003**: The system MUST NOT reduce PostgreSQL's write-durability configuration (e.g., disabling synchronous commit) to achieve a throughput improvement; any throughput gain must come from reducing unnecessary work, not from accepting data-loss risk.
- **FR-004**: When multiple concurrent requests are grouped together for efficiency, the system MUST still resolve and store each log entry's tenant identity correctly, and MUST NOT let one tenant's data become visible to, or countable by, another tenant.
- **FR-005**: The system MUST answer common aggregation requests (no message-content or attribute filter) using pre-computed, incrementally-maintained summaries instead of scanning every matching raw row, while still returning results numerically identical to what a full scan of the raw data would produce.
- **FR-006**: Aggregation requests that include a message-content filter (`q`) or an attribute filter (`attr.<key>`) MUST continue to return fully correct results, whether or not a pre-computed summary is available to help answer them.
- **FR-007**: Pre-computed aggregation summaries MUST be tenant-scoped — two tenants with identical service/level/time-bucket values MUST never have their counts combined or made cross-visible.
- **FR-008**: Pre-computed aggregation summaries MUST be automatically and correctly reconciled when their underlying logs are deleted by the retention process, so aggregation results never overcount data that retention has removed.
- **FR-009**: Pre-computed aggregation summaries MUST be updated atomically — in the same durable transaction as the log data they summarize — so that an application or database crash can never leave a summary inconsistent with the log data it describes. Summary data for log entries that existed before this mechanism was introduced MUST be populated exactly once, as part of applying the database schema (i.e., through the same migration process every other schema change already goes through), not through an ongoing or restart-triggered runtime process.
- **FR-010**: The system MUST NOT introduce any new required request parameter, header, or response field on `GET /health`, `POST /logs`, `GET /logs`, or `GET /logs/aggregate` — every response shape for these four endpoints MUST remain exactly as specified today.
- **FR-011**: The system MUST continue to behave, under `AUTH_ENABLED=false` (the default), exactly as the current zero-config, unauthenticated core service — a plain `docker compose up` with no configuration MUST still yield that behavior.
- **FR-012**: The system MUST continue to honor `AUTH_ENABLED`/`LOADGEN_API_KEY` exactly as already implemented (idempotent startup seeding, credential transport, status codes, `GET /health` exemption) — this feature MUST NOT alter that behavior.
- **FR-013**: The system MUST continue to enforce existing tenant isolation guarantees (a tenant never sees another tenant's data, under any combination of filters, aggregation, or pagination) after every change made under this feature.
- **FR-014**: The system MUST continue to support the existing retention policy (expired-data deletion) without introducing long-running locks, excessive table bloat, or ingestion disruption, and any new derived data (e.g., aggregation summaries) introduced by this feature MUST be subject to the same retention window as the log data it summarizes.
- **FR-015**: Any change made under this feature MUST be validated by measurement (via the project's established load-testing process) before being considered complete; a change that does not demonstrate a measurable improvement, or that regresses another required metric, MUST NOT be retained.
- **FR-016**: The system MUST reduce unnecessary per-request internal overhead on the query path (e.g., building more internal object representations than a response needs) without changing any response's content.
- **FR-017**: The system MUST reduce unnecessary per-row write-time overhead on the ingestion path (e.g., maintaining redundant derived copies of the same data) without changing the observable behavior of any existing query filter, including attribute-equality filters compared as strings.
- **FR-018**: The database connection pool used for writes MUST be sized by explicit, documented configuration rather than left at an unconfigured default.
- **FR-019**: The system MUST NOT introduce any new readiness dependency for `GET /health` beyond its existing conditions (database connectivity, applied migrations). Populating historical aggregation-summary data MUST be achieved through that same existing migration mechanism rather than through a separate runtime process whose completion `GET /health` would need to track — so there is no new condition for it to wait on, or to be designed not to wait on, in the first place.

### Key Entities *(include if feature involves data)*

- **Log Rollup (pre-computed aggregation summary)**: A derived, tenant-scoped count of log entries for a given time bucket, service, and level. Not user-submitted data — always reconstructable from the underlying Log entries it summarizes. Exists purely to make `GET /logs/aggregate` fast; never a second source of truth for anything not otherwise durably stored.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Ingestion throughput no longer measurably degrades as concurrent request load increases across the range the system is graded at (today's measurement: ~20,400 logs/sec at concurrency 8 dropping to ~13,900 logs/sec at concurrency 16) — throughput at higher concurrency is at least as high as throughput at lower concurrency, within normal measurement variance.
- **SC-002**: The system sustains at least 15,000 logs/sec (the required baseline), with evidence of improvement over the currently measured baseline, under the same resource limits.
- **SC-003**: Aggregation query latency stays under 1 second at p95 while sustained ingestion is simultaneously running at target throughput, including for time ranges spanning a large fraction of the ~1,000,000-row target dataset.
- **SC-004**: Aggregation query latency does not measurably increase as the total stored row count grows toward the ~1,000,000-row target, for the common (not filtered by message or attribute) case.
- **SC-005**: Newly ingested data remains queryable within 20 seconds of acceptance, unchanged from today.
- **SC-006**: Zero cross-tenant data leakage — verified identically to the existing tenant-isolation guarantee — across every change made under this feature.
- **SC-007**: A plain `docker compose up` with no configuration continues to produce a fully compliant, unauthenticated core service on the first run, with no behavior change visible to the required API contract.
- **SC-008**: Every change retained under this feature has a documented, measured before/after comparison from the project's load-testing process; no change is retained on the basis of expected-but-unmeasured benefit.

## Assumptions

- `LogIngestion-majed` (a separate, single-tenant reference project analyzed once for this comparison) is used purely as inspiration for techniques; nothing is copied wholesale, and every technique adopted is re-evaluated against this project's multi-tenancy, durability, and retention requirements before being applied — consistent with the existing findings in `docs/performance_comparison_with_LogIngestion-majed.md`.
- This feature's scope is the set of techniques already identified and evaluated in `docs/performance_comparison_with_LogIngestion-majed.md` and `docs/suggestions_to_increase_the_performance.md`. User Stories are prioritized so the highest-confidence, lowest-risk improvements (User Story 1, and the smaller items in User Story 3) can ship and be measured independently of the higher-scope aggregation pre-computation work (User Story 2).
- "Measurable improvement" is assessed via this project's established load-testing process — the external load-testing portal is the authoritative source of numbers; local runs are diagnostic only — consistent with prior project convention.
- No new required request parameters, headers, or response fields are introduced by this feature on any of the four required endpoints; this is a performance/internal-implementation initiative, not a new externally-visible capability.
- Techniques identified in the reference project that conflict with this project's requirements — disabling write-durability guarantees, and replacing partition-drop retention with row-by-row batched deletion — are explicitly out of scope and MUST NOT be adopted, per the existing comparison report's findings.
- Existing optional features (multi-tenancy, `AUTH_ENABLED`, `LOADGEN_API_KEY`) are not being extended or changed by this feature — only their performance characteristics under load are in scope.
