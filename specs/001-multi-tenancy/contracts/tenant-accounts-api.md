# Contract: Tenant Account Endpoints

New, additive endpoints — not part of the required load-generator contract. All three are reachable regardless of `AUTH_ENABLED` (spec Assumptions/Clarifications). No guard is applied to any of them (research.md Decision 7) — anonymous access is the point.

## `POST /tenants/register`

Creates a new Tenant account. Maps to spec FR-015, FR-016, FR-029.

**Request**:
```json
{
  "email": "customer@example.com",
  "password": "at-least-8-characters"
}
```

**Response — `201 Created`**:
```json
{
  "id": "3fa2b1c4-...",
  "email": "customer@example.com"
}
```
No tokens are issued at registration — the customer must call `POST /tenants/login` next (matches the user-supplied conceptual flow: Register → Login → Tokens).

**Errors** (using the project's existing `{"error": "<description>"}` envelope, produced automatically by `GlobalExceptionFilter` from a thrown `HttpException`):

| Condition | Status | `error` |
|---|---|---|
| Malformed body / invalid email / password too short | `400` | e.g. `"email must be a valid email address"` |
| Email already registered | `409` | `"email is already registered"` — FR-016. `409 Conflict` chosen over `400` since the request is well-formed but conflicts with existing state. |

## `POST /tenants/login`

Authenticates a Tenant and issues tokens. Maps to spec FR-017.

**Request**:
```json
{
  "email": "customer@example.com",
  "password": "at-least-8-characters"
}
```

**Response — `200 OK`**:
```json
{
  "access_token": "eyJhbGciOi...",
  "refresh_token": "eyJhbGciOi...",
  "token_type": "Bearer",
  "expires_in": 900
}
```
`expires_in` is the access token's lifetime in seconds (900 = 15 minutes, research.md Decision 3). `access_token` is a JWT whose `sub` claim is the Tenant's `id`; `refresh_token` is an opaque, JWT-shaped token whose hash is stored in `tenant_refresh_tokens` (Decision 4).

**Errors**:

| Condition | Status | `error` |
|---|---|---|
| Malformed body | `400` | validation message |
| Unknown email or wrong password | `401` | `"invalid email or password"` — deliberately identical message for both cases (spec Edge Cases: don't reveal whether the email is registered) |

## `POST /tenants/refresh`

Exchanges a valid refresh token for a new access+refresh pair (rotation — Decision 3).

**Request**:
```json
{
  "refresh_token": "eyJhbGciOi..."
}
```

**Response — `200 OK`**: same shape as login's response. The previous refresh token is invalidated as part of this call.

**Errors**:

| Condition | Status | `error` |
|---|---|---|
| Malformed body | `400` | validation message |
| Unknown, expired, or already-used (revoked) refresh token | `401` | `"invalid or expired refresh token"` |

## Non-goals (explicitly out of scope for this iteration)

- No `POST /tenants/logout` — not required by the spec; a Tenant's only way to invalidate a session today is letting the refresh token expire (7 days) or rotating past it. Noted in plan.md as a possible future addition.
- No password reset/recovery, no email verification (spec Assumptions).
- No tenant profile update/deactivation endpoints (spec Assumptions).
