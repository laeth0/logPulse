# Contract: Additive Auth Behavior on the 4 Required Endpoints

This is **not** a new contract — it documents the auth behavior layered onto the existing required endpoints, and confirms the golden rule (spec + `docs/Final_Project.md`): **no required request or response shape changes, ever.**

## `GET /health`

**No change whatsoever.** No guard is applied (research.md Decision 7). Reachable with or without credentials, regardless of `AUTH_ENABLED`, exactly as today. FR-002.

## `POST /logs`, `GET /logs`, `GET /logs/aggregate`

Guarded by `ApiKeyAuthGuard` (research.md Decision 7). Behavior branches only on `AUTH_ENABLED`:

### `AUTH_ENABLED=false` (default)

The guard resolves `request.tenantId = DEFAULT_TENANT_ID` unconditionally and returns `true` immediately — it does not read, parse, or validate any `Authorization`/`X-API-Key` header at all. An unrecognized `Authorization` header is therefore silently ignored, never rejected (FR-005). Request/response shapes: **byte-for-byte identical to today.**

### `AUTH_ENABLED=true`

1. Guard reads `Authorization: Bearer <value>` (or `X-API-Key: <value>`).
2. Missing/empty → `401`, `{"error": "missing or malformed credential"}`.
3. Present but shaped like a JWT (contains `.`) rather than an API key → `403`, `{"error": "this endpoint requires an API key, not a Tenant access token"}` (FR-024).
4. Present, API-key-shaped, but not found in `api_keys` or `status != 'active'` → `401`, `{"error": "invalid or revoked API key"}`.
5. Valid, active key → `request.tenantId` set to the key's `tenant_id`; request proceeds exactly as today, scoped to that tenant.

In every case, **the request body and query parameters are validated and interpreted exactly as they are today** — tenant scoping is applied only inside the repository layer (`applyLogFilters`'s new unconditional `tenant_id` predicate, and the ingestion mapper's new `tenant_id` field on `NewLog`), never as a new required field, header, or parameter on these three endpoints (FR-013).

### Response shape confirmation (unchanged in all cases)

| Endpoint | Response shape |
|---|---|
| `POST /logs` | `{"accepted": <int>, "rejected": [{"index": <int>, "reason": <string>}]}` — identical |
| `GET /logs` | `{"logs": [{"id", "timestamp", "level", "service", "message", "attributes"}], "next_cursor": <string \| null>}` — identical; no `tenant` field added to any log object |
| `GET /logs/aggregate` | `{"buckets": [{"start", "group", "count"}]}` — identical |

### Status code additions (only when `AUTH_ENABLED=true`)

| Status | When | Existing behavior preserved? |
|---|---|---|
| `401` | Missing/invalid/revoked credential | New — only reachable when `AUTH_ENABLED=true` |
| `403` | Wrong credential type (JWT on a data endpoint) | New — same condition |
| `200` / `400` | Normal success/validation-failure paths | **Unchanged** — identical logic to today, just now additionally gated by the guard passing first |

This table is the acceptance check for spec User Stories 1 and 2 (P1 priority — the two non-negotiable constraints) and directly informs the CI smoke-test extension in research.md Decision 12.
