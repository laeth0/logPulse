# Contract: Tenant API Key Management Endpoints

New, additive endpoints. Protected by `TenantJwtAuthGuard` (research.md Decision 7) — every request requires `Authorization: Bearer <tenant access token>` (a JWT, from `POST /tenants/login` or `/refresh`). Maps to spec FR-018, FR-020–FR-024.

> **`AUTH_ENABLED` does not apply here.** `TenantJwtAuthGuard` unconditionally validates the Tenant JWT on every request to every endpoint in this file, in every deployment configuration — including `AUTH_ENABLED=false`, the default. `AUTH_ENABLED` only gates `ApiKeyAuthGuard`'s behavior on the three required log data-plane endpoints (`POST /logs`, `GET /logs`, `GET /logs/aggregate` — see `logs-endpoints-auth.md`); it has no defined meaning here and this guard must never read it. Spec Assumptions' "reachable regardless of `AUTH_ENABLED`" describes these endpoints' *reachability*, not an exemption from authentication — the endpoint is always reachable, and always requires a valid JWT. Implementing this guard by copying `ApiKeyAuthGuard`'s `AUTH_ENABLED=false` short-circuit would silently make every tenant's key-management endpoints — including reading back full key secrets — accessible with no credential at all whenever `AUTH_ENABLED=false`. See research.md Decision 7's "Hard rule" for the full rationale.

**Auth failure behavior, shared by all three endpoints below**:

| Condition | Status | `error` |
|---|---|---|
| Missing/malformed `Authorization` header | `401` | `"missing or malformed credential"` |
| Token is a well-formed API key (not a JWT) presented here | `403` | `"this endpoint requires a Tenant access token, not an API key"` — FR-024 |
| JWT present but expired/invalid signature | `401` | `"invalid or expired access token"` |

## `POST /tenants/api-keys`

Creates a new API key owned by the authenticated Tenant. Maps to FR-020.

**Request**: no body required (an optional `label` field may be added later for human-readable naming — not required by the spec, omitted from this iteration to keep the surface minimal).
```json
{}
```

**Response — `201 Created`**:
```json
{
  "id": "9c1e2f3a-...",
  "key": "lp_8fK2mN...b7Qx",
  "status": "active",
  "created_at": "2026-08-12T14:40:00.000Z"
}
```
`key` is the full, usable secret — this is not a "shown once" value; it is also returned by the list endpoint below (research.md Decision 5).

## `GET /tenants/api-keys`

Lists every API key owned by the authenticated Tenant. Maps to FR-021, FR-023 (never another tenant's keys).

**Response — `200 OK`**:
```json
{
  "api_keys": [
    {
      "id": "9c1e2f3a-...",
      "key": "lp_8fK2mN...b7Qx",
      "status": "active",
      "created_at": "2026-08-12T14:40:00.000Z"
    },
    {
      "id": "1a2b3c4d-...",
      "key": "lp_qR9tYv...w3Zp",
      "status": "revoked",
      "created_at": "2026-08-01T09:15:00.000Z"
    }
  ]
}
```
Revoked keys remain listed (with `status: "revoked"`) rather than disappearing, so a Tenant can see its full key history — not required by the spec but a natural, low-cost consequence of a simple `SELECT * WHERE tenant_id = $1` with no extra filtering logic.

## `DELETE /tenants/api-keys/:id`

Revokes one of the authenticated Tenant's own API keys. Maps to FR-022, FR-023.

**Response — `200 OK`**:
```json
{
  "id": "9c1e2f3a-...",
  "status": "revoked"
}
```

**Errors**:

| Condition | Status | `error` |
|---|---|---|
| `:id` doesn't exist, or exists but belongs to a different Tenant | `404` | `"API key not found"` — deliberately identical for both cases (does not leak whether the id exists under another tenant, mirroring the login endpoint's non-disclosure pattern) |
| `:id` exists, belongs to this Tenant, already revoked | `200` | idempotent — re-revoking an already-revoked key is a no-op success, not an error (simpler than adding a separate "already revoked" error case the spec never asks for) |

Once revoked, `ApiKeyAuthGuard` rejects the key on its very next use — `401`, `{"error": "invalid or revoked API key"}` — satisfying spec SC-005.
