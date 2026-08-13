# Feature Specification: Multi-Tenancy

**Feature Branch**: `001-multi-tenancy`

**Created**: 2026-08-12

**Status**: Draft

**Input**: User description: "I want to build the multi-tenancy feature for this project from scratch. Read docs/Final_Project.md carefully and treat it as the authoritative source of truth, especially the sections covering Optional Features and the Load Generator Contract, Authentication and API Keys, Multi-Tenancy, AUTH_ENABLED, LOADGEN_API_KEY, required API compatibility, performance requirements, retention, and CI requirements. Create a complete specification for adding multi-tenancy to the existing log ingestion and query system. The most important constraint is that the existing required API contract must remain fully backward compatible with the load generator. Multi-tenancy must be additive and must never require changes to the existing request or response structures. The system is a simplified version of Datadog or Grafana Loki, so requirements may draw from those systems, but the implementation should stay simple. No .test or .spec files should be written yet."

**Revision (2026-08-12)**: Simplified the business model — a Tenant is a single customer/account (not an organization with multiple users/roles), and the System Admin concept is removed entirely. Tenants self-register, log in, and manage their own API keys; there is no administrator who provisions tenants or keys on their behalf.

## Clarifications

### Session 2026-08-12

- Q: What scale of tenant count should the design assume? → A: Small — tens of tenants
- Q: Should the spec explicitly require secure password storage as a testable requirement? → A: Yes, explicit requirement
- Q: After an API key is created, can its full secret value be retrieved again later (e.g., via the list endpoint)? → A: Retrievable anytime

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Zero-configuration core service is untouched (Priority: P1)

An operator starts the system the same way it has always been started, with no environment configuration at all. The service must behave exactly as it did before multi-tenancy existed: fully open, unauthenticated, single implicit tenant, with the required endpoints producing the exact same request/response shapes as today.

**Why this priority**: This is the non-negotiable constraint from the project brief — the graded load generator always runs against this default configuration first. Breaking it fails the entire submission regardless of how good multi-tenancy is.

**Independent Test**: Start the system with no `.env` file and no manual setup, then run the existing ingest/query/aggregate/health flows unmodified. All must succeed with unchanged response structures.

**Acceptance Scenarios**:

1. **Given** `AUTH_ENABLED` is unset, **When** a client calls `GET /health`, `POST /logs`, `GET /logs`, or `GET /logs/aggregate` with no credentials, **Then** each request succeeds exactly as the current unauthenticated contract describes.
2. **Given** `AUTH_ENABLED` is unset, **When** a client sends an unrecognized `Authorization` header anyway, **Then** the header is ignored and the request still succeeds.

---

### User Story 2 - Authentication can be turned on and the load generator keeps working (Priority: P1)

An operator enables authentication (`AUTH_ENABLED=true`) and provides a seeded key (`LOADGEN_API_KEY`). The system must start healthy, silently provision that key with full ingest and query rights scoped to one tenant, and the load generator's existing requests — sent exactly as before, just now with a bearer token — must keep succeeding with the same response shapes.

**Why this priority**: This is the second non-negotiable constraint. If the graded run enables auth and the seeded key does not transparently work, the submission fails grading.

**Independent Test**: Start the system with `AUTH_ENABLED=true` and `LOADGEN_API_KEY=<value>` set, wait for healthy, then send the same ingest/query/aggregate requests as User Story 1 but with `Authorization: Bearer <value>`. All must succeed with unchanged response shapes and no tenant identifier anywhere in the request.

**Acceptance Scenarios**:

1. **Given** `AUTH_ENABLED=true` and `LOADGEN_API_KEY` set, **When** the service starts, **Then** it reports healthy only after the key has been seeded and resolves to exactly one tenant with ingest+query permission.
2. **Given** the seeded key, **When** a client calls the three data endpoints with `Authorization: Bearer <key>`, **Then** each succeeds exactly as the unauthenticated contract, with results scoped transparently to the key's tenant.
3. **Given** the service is restarted with the same `LOADGEN_API_KEY`, **When** it comes back up, **Then** the previously seeded key still works and no duplicate tenant or key is created.
4. **Given** `AUTH_ENABLED=true` and `LOADGEN_API_KEY` unset, **When** the service starts, **Then** it still starts and reports healthy, simply without a seeded key.
5. **Given** `AUTH_ENABLED=true`, **When** a client calls a data endpoint with a missing or malformed credential, **Then** the service returns `401` with `{"error": "<description>"}`.

---

### User Story 3 - A customer registers and logs in as a Tenant (Priority: P2)

A new customer registers a Tenant account with an email and password. Once registered, the customer can log in with those same credentials and receive an access token and a refresh token, which are used only for managing its own account and API keys — never for sending or reading logs directly.

**Why this priority**: Without self-registration, multi-tenancy has exactly one tenant (the seeded load-generator one) and delivers no real isolation value beyond satisfying the grading contract. There is no administrator to provision tenants on a customer's behalf, so self-service is the only path to a second tenant.

**Independent Test**: Register a new Tenant with an email and password, then log in with those credentials and confirm an access token and refresh token are returned.

**Acceptance Scenarios**:

1. **Given** an email not already registered, **When** a customer submits registration with that email and a password, **Then** a new Tenant account is created with those credentials and no API key yet.
2. **Given** an email that is already registered, **When** someone attempts to register again with it, **Then** the registration is rejected and no second Tenant is created.
3. **Given** a registered Tenant's correct email and password, **When** the customer logs in, **Then** the response includes an access token and a refresh token scoped to that Tenant's own account.
4. **Given** an incorrect password for a registered email, **When** login is attempted, **Then** the request is rejected and no token is issued.
5. **Given** a Tenant's access token, **When** it is presented on `POST /logs`, `GET /logs`, or `GET /logs/aggregate` instead of an API key, **Then** the request is rejected — the access token grants account/API-key management only, never log ingestion or query.

---

### User Story 4 - A Tenant manages its own API keys (Priority: P2)

After logging in, a Tenant creates one or more API keys for its own account, lists the keys it currently owns, and revokes a key it no longer wants active — all without needing anyone else's involvement.

**Why this priority**: API keys are the credential applications actually use to send and read logs; without self-service key management, a self-registered Tenant still couldn't do anything with its account.

**Independent Test**: Log in as a Tenant, create an API key, list keys and confirm it appears, then revoke it and confirm it stops working while the account itself remains active.

**Acceptance Scenarios**:

1. **Given** an authenticated Tenant (valid access token), **When** it requests a new API key, **Then** a key is created belonging only to that Tenant and is immediately usable on the log endpoints.
2. **Given** a Tenant with multiple API keys, **When** it lists its keys, **Then** only its own keys are returned, never another tenant's.
3. **Given** a Tenant's own active API key, **When** the Tenant revokes it, **Then** subsequent requests using that key receive `401`, while the Tenant's other keys and account remain unaffected.
4. **Given** no access token (or another tenant's access token), **When** a request is made to create, list, or revoke API keys, **Then** the request is rejected and no key is created, listed, or revoked.

---

### User Story 5 - Tenant data is isolated (Priority: P2)

Two tenants use their own API keys to ingest and query logs. Neither tenant can see, count, or page through the other's data under any combination of filters, aggregation, or pagination.

**Why this priority**: Isolation is the actual point of multi-tenancy; without it the feature is cosmetic.

**Independent Test**: Ingest distinct logs under tenant A's key and tenant B's key, then query/aggregate with each key and confirm each only ever sees its own logs, including when paginating with cursors.

**Acceptance Scenarios**:

1. **Given** tenant A has ingested logs and tenant B has ingested different logs, **When** tenant B queries `GET /logs` with no filters, **Then** none of tenant A's logs appear in the results or the total implied by pagination.
2. **Given** tenant A has ingested logs, **When** tenant B calls `GET /logs/aggregate` over the same time range, **Then** tenant A's logs are not counted in tenant B's buckets.
3. **Given** a pagination cursor issued to tenant A from a `GET /logs` response, **When** that same cursor value is presented alongside tenant B's API key, **Then** the service does not return any of tenant A's data (it either scopes the cursor to tenant B's own data or rejects it as invalid).

---

### Edge Cases

- `AUTH_ENABLED=true` with `LOADGEN_API_KEY` unset: service still starts and reports healthy, with no seeded key and no data endpoints usable until a key exists.
- Restarting the service repeatedly with the same `LOADGEN_API_KEY` must never create duplicate tenants or duplicate/rotated keys, and must never invalidate the existing one.
- An unknown, expired, or revoked key on a data endpoint must return `401`, never `500` and never `200` with an empty result standing in for a rejection.
- A valid credential presented against the wrong surface (a Tenant access token on a log endpoint, or an API key on an account/API-key-management endpoint) must return `403`, not `401`.
- Two tenants using the exact same attribute keys/values (e.g., both logging `user_id=42`) must remain distinguishable and isolated — attribute collisions across tenants must never merge results.
- A registration attempt with an email that is already registered must be rejected before any new Tenant record is created.
- A login attempt with a wrong password must be rejected without revealing whether the email itself is registered.
- An expired or invalid refresh token must be rejected when used to obtain a new access token.
- A Tenant with zero ingested logs querying or aggregating must receive a normal empty result, not an error.
- Ingestion and query load on one tenant must not visibly degrade another tenant's query latency beyond normal shared-resource contention (no per-tenant resource starvation by design).
- The tenant seeded for `LOADGEN_API_KEY` at startup is created internally by the system, not through the registration endpoint, and needs no login credentials of its own — the load generator only ever uses the seeded API key.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: With `AUTH_ENABLED` unset or `false`, the system MUST serve `GET /health`, `POST /logs`, `GET /logs`, and `GET /logs/aggregate` exactly as the existing unauthenticated contract, with no tenancy restriction applied to any request.
- **FR-002**: `GET /health` MUST always be reachable without credentials, regardless of the value of `AUTH_ENABLED`.
- **FR-003**: When `AUTH_ENABLED=true`, `POST /logs`, `GET /logs`, and `GET /logs/aggregate` MUST require a valid credential, accepted via `Authorization: Bearer <key>` (an additional `X-API-Key` header MAY also be accepted).
- **FR-004**: A missing or malformed credential on a protected endpoint MUST return HTTP `401` with body `{"error": "<description>"}`.
- **FR-005**: When `AUTH_ENABLED=false`, any `Authorization` header present on a request MUST be ignored, never rejected.
- **FR-006**: When `AUTH_ENABLED=true` and `LOADGEN_API_KEY` is set, the system MUST idempotently seed that key at startup, before reporting healthy, resolving to exactly one tenant with permission to ingest and query all data in that tenant.
- **FR-007**: Restarting the service with the same `LOADGEN_API_KEY` MUST NOT invalidate the previously seeded key, and MUST NOT create a duplicate tenant or duplicate key.
- **FR-008**: When `AUTH_ENABLED=true` and `LOADGEN_API_KEY` is unset, the system MUST still start and report healthy, with no seeded key.
- **FR-009**: Every valid tenant API key MUST resolve to exactly one tenant.
- **FR-010**: Tenant identity MUST be derived only from the credential presented; it MUST NOT be accepted as a query parameter, header, or body field on `POST /logs`, `GET /logs`, or `GET /logs/aggregate`.
- **FR-011**: `POST /logs` MUST persist ingested entries scoped to the credential's tenant; an entry ingested under one tenant MUST never become visible to another tenant.
- **FR-012**: `GET /logs` and `GET /logs/aggregate` MUST only return or aggregate log entries belonging to the requesting credential's tenant.
- **FR-013**: The request and response shapes of `GET /health`, `POST /logs`, `GET /logs`, and `GET /logs/aggregate` MUST remain identical, field-for-field, to the non-multi-tenant contract — no new required fields, headers, or parameters on these endpoints.
- **FR-014**: A pagination cursor issued for one tenant's query MUST NOT expose another tenant's data if replayed with a different tenant's key.
- **FR-015**: The system MUST allow a new customer to self-register a Tenant account with an email and password, in a single step, with no administrator involvement.
- **FR-016**: Registration with an email that is already registered to a Tenant MUST be rejected, and MUST NOT create a second Tenant.
- **FR-017**: The system MUST allow a registered Tenant to log in with its email and password and receive an access token and a refresh token; an incorrect password MUST be rejected without issuing a token.
- **FR-018**: A Tenant access token MUST be usable only for account and API-key management operations (create/list/revoke API keys); it MUST NOT grant access to `POST /logs`, `GET /logs`, or `GET /logs/aggregate`.
- **FR-019**: A Tenant API key MUST be usable only for `POST /logs`, `GET /logs`, and `GET /logs/aggregate`; it MUST NOT grant access to account or API-key-management operations.
- **FR-020**: The system MUST allow an authenticated Tenant (via its access token) to create a new API key belonging to its own account.
- **FR-021**: The system MUST allow an authenticated Tenant (via its access token) to list only the API keys belonging to its own account, including each key's full secret value, so a Tenant can retrieve a previously created key again without having to revoke and recreate it.
- **FR-022**: The system MUST allow an authenticated Tenant (via its access token) to revoke one of its own API keys; requests using a revoked key MUST subsequently receive `401`.
- **FR-023**: A Tenant MUST only ever be able to create, list, or revoke its own API keys — never another tenant's — regardless of key identifiers guessed or reused.
- **FR-024**: Presenting a credential on the wrong surface (a Tenant access token on a log endpoint, or a Tenant API key on an account/API-key-management endpoint) MUST return `403`, not `401`.
- **FR-025**: The system MUST never respond `200` to a request whose data was not durably persisted and correctly tenant-scoped.
- **FR-026**: Authentication and authorization failures MUST never return `500`, and MUST never return `200` with an empty result set used as a stand-in for a rejection.
- **FR-027**: The CI pipeline MUST verify both required configurations: (a) `AUTH_ENABLED=false` with all four endpoints reachable without credentials, and (b) `AUTH_ENABLED=true` with `LOADGEN_API_KEY` set, with all four endpoints reachable using the seeded bearer token and rejected with `401` without it.
- **FR-028**: Enabling authentication and multi-tenancy MUST NOT require any change to how the load generator's requests are constructed, beyond adding the `Authorization` header it already always sends.
- **FR-029**: A Tenant's password MUST be stored using a strong one-way hash; the system MUST NOT store or log a Tenant's password in plaintext at any point, including in registration/login request logs.

### Key Entities

- **Tenant**: A single customer account — not an organization with multiple users, teams, or roles. Owns its own log entries, its own API keys, and its own login credentials (email + password). Has an identity, an email, a password credential, and a creation timestamp. All log entries and API keys belong to exactly one Tenant, and a Tenant has no members other than itself.
- **API Key**: A machine credential presented as a bearer token by applications, agents, integrations, and the load generator to reach the log endpoints. Belongs to exactly one Tenant, carries ingest+query permission for that Tenant's logs only, and has a status (active or revoked) plus a creation timestamp. A Tenant may own multiple API keys. Unlike a typical "shown once" secret, the full key value remains retrievable by its owning Tenant at any time via the list operation.
- **Tenant Session (Refresh Token)**: Represents a Tenant's logged-in session issued at login, used to obtain new access tokens for account/API-key management without repeating email/password login. Belongs to exactly one Tenant.
- **Log Entry** *(existing entity, extended)*: Once multi-tenancy is enabled, each log entry is associated with the Tenant that ingested it; this association is never exposed in the required response shape and is used only to scope queries.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With zero environment configuration, 100% of health, ingest, query, and aggregate requests succeed with response structures identical to the pre-multi-tenancy contract.
- **SC-002**: With authentication enabled and a seeded load-generator key, a full load-generator run (ingest + query + aggregate) completes with a 0% rate of unexpected `401`/`403` responses attributable to the seeded key.
- **SC-003**: Across all supported filter, aggregation, and pagination combinations, a tenant never observes another tenant's data — verified as zero cross-tenant records returned in isolation testing.
- **SC-004**: A newly self-registered tenant can create an API key and successfully ingest and query its own logs within minutes of registering, with no service restart and no other party's involvement.
- **SC-005**: A revoked API key is rejected on the very next request made with it — no valid grace-period window.
- **SC-006**: The CI pipeline passes for both the unauthenticated and authenticated configurations on every run.
- **SC-007**: Enabling authentication and multi-tenancy does not measurably regress previously achieved ingestion throughput or aggregate query latency versus the same load profile run without them.

## Assumptions

- Authentication and multi-tenancy remain optional features, off by default (`AUTH_ENABLED=false`), per the project's load generator contract.
- Tenant self-service endpoints (registration, login, API-key management) are reachable regardless of `AUTH_ENABLED`; while `AUTH_ENABLED=false`, the log endpoints ignore credentials entirely, so any issued API key simply has no enforcement effect until authentication is turned on.
- A Tenant is identified for registration/login by email + password; no separate human-readable tenant name/slug is required by this spec (a display name, if any, is a non-authenticating detail).
- There is no System Administrator role, account, login, or admin-only endpoint anywhere in this feature. A Tenant operates entirely independently — registration, login, and API-key management are all self-service.
- Tenant API keys carry a single permission level (ingest + query) for this iteration; there are no finer-grained per-key scopes within a tenant. `403` is reserved for credential-surface boundary violations (Tenant access token vs. Tenant API key), not partial tenant permissions.
- Per-tenant rate limiting and quotas, and any limit on the number of API keys a Tenant may hold, are out of scope for this feature; any future rate limiting must still exempt or never throttle the seeded load-generator key, per the existing project-wide rule.
- The system is expected to serve a small tenant population (tens of tenants, not hundreds or thousands); a single shared logs table scoped by tenant identity is sufficient, and no per-tenant partitioning or schema-per-tenant scheme is required.
- Retention policy behavior (already part of the system) is assumed to keep operating system-wide; making retention independently configurable per tenant is out of scope unless requested later.
- The exact lifetime, rotation behavior, and revocation mechanics of access/refresh tokens are implementation decisions for the planning phase, not specification-level constraints — this spec only requires that login issues both, and that the access token is scoped to account/API-key management.
- No `.test.`/`.spec.` files will be introduced as part of implementing this feature, consistent with current project convention.
- Tenant account deletion/deactivation, password reset/recovery, and email verification are not required by this iteration; they may be considered later but are out of scope here.
