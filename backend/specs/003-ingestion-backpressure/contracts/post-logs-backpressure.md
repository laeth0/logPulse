# Contract: Additive Backpressure Responses on `POST /logs`

This is **not** a new endpoint — it documents two new, additive response outcomes layered onto the existing `POST /logs` contract, and confirms the golden rule (spec + `docs/Final_Project.md`): **no required request or response shape changes, ever.** Both outcomes are only reachable when `BACKPRESSURE_ENABLED=true`; with the default (`false`), `POST /logs` is byte-for-byte identical to today.

## Existing contract (unchanged)

| Status | When | Body |
|---|---|---|
| `200` | At least one entry accepted | `{"accepted": <int>, "rejected": [{"index": <int>, "reason": <string>}]}` |
| `400` | All entries rejected, or malformed JSON/structure | `{"accepted": 0, "rejected": [...]}` or `{"error": "<description>"}` |
| `401` / `403` | `AUTH_ENABLED=true`, missing/invalid credential | `{"error": "<description>"}` |

None of the above change. Both new outcomes below are only reachable *after* the existing `401`/`403` (auth) and `400` (validation) checks have already passed — see research.md Decision 1.

## New: `503` — Temporary capacity exhaustion

**When**: `BACKPRESSURE_ENABLED=true`, the request's validation-accepted entries would individually fit within the configured capacity, but admitting them right now would exceed either the row-count or byte-size limit because of *other* currently admitted-but-not-completed work.

**Response**:

```http
HTTP/1.1 503 Service Unavailable
Retry-After: 1
Content-Type: application/json

{"error": "the service is temporarily at ingestion capacity; retry shortly"}
```

- `Retry-After` is a fixed, configurable number of seconds (`BACKPRESSURE_RETRY_AFTER_SECONDS`, default `1`) — not dynamically computed.
- **No rows or rollup deltas are written for this batch** — the entire batch, not just the excess, is rejected (FR-004).
- The identical request, resent after the interval, may succeed once other admitted work has completed and freed capacity.
- Retrying does **not** require re-validating the batch client-side — nothing about the batch itself was the problem.

## New: `413` — Batch can never fit

**When**: `BACKPRESSURE_ENABLED=true`, and the request's validation-accepted entries alone — independent of any other pending work — exceed the configured row-count or byte-size limit.

**Response**:

```http
HTTP/1.1 413 Payload Too Large
Content-Type: application/json

{"error": "batch of <N> entries (~<M> bytes) exceeds the configured ingestion capacity limit and can never be admitted"}
```

- No `Retry-After` header — retrying the identical batch can never succeed; the client must send a smaller batch (fewer entries, or split across multiple requests) instead.
- **No rows or rollup deltas are written for this batch.**
- Mirrors this project's existing precedent for `JSON_BODY_LIMIT` overflow (also `413`, also non-retryable) — see research.md Decision 3.

## Response shape confirmation (unchanged in all cases)

| Endpoint | Response shape |
|---|---|
| `POST /logs` (`200`/`400`) | `{"accepted": <int>, "rejected": [...]}` — identical to today |
| `GET /logs`, `GET /logs/aggregate` | Untouched by this feature — no backpressure gating on read paths (spec.md Assumptions) |

## Status code summary (only when `BACKPRESSURE_ENABLED=true`)

| Status | When | Retryable? |
|---|---|---|
| `503` | Temporarily full (other pending work) | Yes — after `Retry-After` seconds |
| `413` | Batch itself exceeds the absolute limit | No — must send a smaller batch |
| `200` / `400` / `401` / `403` | Existing paths | Unchanged — identical logic to today, evaluated first |

This table is the acceptance check for spec.md User Story 2 (P2) and SC-008, and directly informs `quickstart.md`'s manual validation scenarios and any future CI smoke-test extension for the `BACKPRESSURE_ENABLED=true` configuration.
