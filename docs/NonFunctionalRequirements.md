# Non-Functional Requirements

The project brief ([Final_Project.md](Final_Project.md)) states its quality constraints across several scattered sections (Overview, Resource Limits, Optional Features, Performance Targets, What We Are Evaluating). This document pulls them into one place, grouped by the quality attribute they govern, so they can be checked independently of the functional feature list in [FunctionalRequirements.md](FunctionalRequirements.md).

Each requirement includes a brief current-status note; see [README.md § Performance](../README.md#performance) for the measurements behind the performance rows.

## 1. Performance

| ID | Requirement | Status |
| --- | --- | --- |
| NFR-1.1 | Sustain **≥15,000 log entries/sec** ingested, without dropped requests or application crashes | ⚠️ ~20,400 logs/sec measured ad hoc at moderate concurrency; not yet confirmed under the full formal benchmark |
| NFR-1.2 | The primary aggregation query (`GET /logs/aggregate`) responds in **<1 second at p95** | ⚠️ ~30ms observed in sequential spot checks over 1.1M rows; p95 not yet measured under concurrent load |
| NFR-1.3 | Query performance must be maintained **while ingestion is actively running** | ❌ Not yet measured — requires the formal concurrent benchmark |
| NFR-1.4 | The system must handle **~1,000,000 stored log records**, representing ~1 month of data | ✅ Table has held 1.1M+ rows without degradation in ad hoc checks |
| NFR-1.5 | Newly ingested data must be **queryable within 20 seconds** of ingestion | ✅ Structurally guaranteed — `COPY` commits synchronously before `POST /logs` responds, and no caching/async materialization sits between write and read; not separately timed |
| NFR-1.6 | The system must support **1 aggregation request/sec** while the ingestion benchmark is running | ❌ Not yet measured — requires the formal concurrent benchmark |

## 2. Resource constraints (scalability under a fixed footprint)

| ID | Requirement | Status |
| --- | --- | --- |
| NFR-2.1 | Application container limited to **0.5 CPU / 256 MB RAM** | ✅ Enforced via `docker-compose.yml` `deploy.resources.limits`; confirmed applied (not just declared) via `docker inspect` |
| NFR-2.2 | PostgreSQL container limited to **1 CPU / 1 GB RAM** | ✅ Same enforcement/verification as above |
| NFR-2.3 | PostgreSQL must remain the **source of truth** for both reads and writes, even if additional infrastructure is introduced | ✅ No caching layer, queue, or secondary datastore exists — every read and write goes directly to PostgreSQL |

## 3. Reliability & availability

| ID | Requirement | Status |
| --- | --- | --- |
| NFR-3.1 | Per-entry ingestion validation — one bad entry must not fail the batch | ✅ See FR-2.6 |
| NFR-3.2 | Malformed input (bad JSON, wrong top-level shape, invalid query parameters, malformed cursors) must fail predictably with a documented error shape, never a crash or an unhandled `500` | ✅ [`global-exception.filter.ts`](../src/common/filters/global-exception.filter.ts) normalizes every thrown error into `{ error }`; unexpected errors are caught and logged, never left to crash the process |
| NFR-3.3 | Empty time ranges and other edge cases must be handled gracefully (empty result set, not an error) | ✅ Query builders return an empty page rather than erroring on a range with no matching rows |
| NFR-3.4 | Retention must expire data **without long-running locks, excessive table bloat, or major ingestion disruption** | ✅ Partition-drop strategy — see [README.md § Retention strategy](../README.md#retention-strategy); the only lock taken (`ACCESS EXCLUSIVE`, during new-partition creation) is near-instant in steady state because partitions are pre-created ahead of need |
| NFR-3.5 | The service must never respond `200` to a batch that was not durably accepted | ✅ `COPY` is awaited and part of a single atomic PostgreSQL statement before the response is constructed; a failed `COPY` propagates as an error, not a `200` |
| NFR-3.6 | `GET /health` must only report ready once the database is connected, migrations are applied, and the service can accept logs | ✅ See FR-1.1–FR-1.3 |

## 4. Security

| ID | Requirement | Status |
| --- | --- | --- |
| NFR-4.1 | All dynamic queries must be parameterized; unsafe dynamic SQL construction is disqualifying | ✅ See FR-6.4 — every user-supplied value is bound as a query parameter; the only non-parameterized dynamic SQL fragments (aggregation bucket interval, group-by column) are selected from fixed enum-backed constant maps, never built from raw request input |
| NFR-4.2 | If authentication is implemented, it must follow the exact contract in the spec (status codes, credential transport, seeding) | N/A — no authentication is implemented (see [FunctionalRequirements.md § Not implemented](FunctionalRequirements.md#not-implemented-by-design)) |
| NFR-4.3 | Credentials, if any, must never be accepted via query string or request body | N/A — no credentials exist in this system |

## 5. Compatibility & extensibility (the "Golden Rule")

| ID | Requirement | Status |
| --- | --- | --- |
| NFR-5.1 | Any optional feature must be strictly **additive** — never remove/rename a required endpoint, change a required response shape, add a new required parameter/header, or turn a previously-successful request into a failure | ✅ Trivially satisfied — no optional features exist yet to violate this |
| NFR-5.2 | `docker compose up` with **no environment file, no arguments, no manual setup** must yield the full, unauthenticated, unrestricted core service | ✅ Verified by simulating a fresh clone (no local `.env`) and rebuilding — all four endpoints, correct resource limits, correct production behavior |
| NFR-5.3 | An unrecognized `Authorization` header must be ignored, not rejected, when auth is disabled | ✅ Trivially satisfied — no auth guard exists to reject anything |

## 6. Maintainability & code quality

| ID | Requirement | Status |
| --- | --- | --- |
| NFR-6.1 | Readable TypeScript with strong typing and clear abstractions | ✅ Strict ESLint (zero warnings), no `any` leakage in public contracts, Prettier-enforced formatting |
| NFR-6.2 | Query-building and persistence logic must be separated from HTTP handlers | ✅ Controllers → services → validators/mappers/cursor → repositories → query-builders, each in its own directory (see [folderStructure.md](folderStructure.md)) |
| NFR-6.3 | CI must run a **meaningful** pipeline — build, test, and validate, not just a placeholder | ⚠️ Builds, lints, and runs a real black-box contract smoke test against `docker compose up`; no automated unit/integration test job yet (see [FunctionalRequirements.md § Not yet implemented](FunctionalRequirements.md#not-yet-implemented-gaps)) |
| NFR-6.4 | Docker Compose setup must work on the first run and apply migrations automatically | ✅ See FR-1.5, FR-6.1 |

## 7. Documentation

| ID | Requirement | Status |
| --- | --- | --- |
| NFR-7.1 | README must cover setup, API docs, schema/index design, attribute storage strategy, retention strategy, measured performance results, known limitations, and optional-feature configuration | ✅ See [README.md](../README.md) |
| NFR-7.2 | Performance evidence must be **measured**, not assumed | ⚠️ Partially — real measurements exist (see NFR-1.1–1.2) but the full formal benchmark suite producing target-scenario evidence is still outstanding |
