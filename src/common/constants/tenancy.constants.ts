// Fixed tenant identifiers reserved by the system, never issued to a
// self-registered Tenant. See data-model.md's "Reserved tenant identifiers"
// table and research.md Decisions 6 and 9.

// Used when AUTH_ENABLED=false: every request resolves to this single
// implicit tenant. No corresponding row is ever seeded in `tenants` — nothing
// references logs.tenant_id via a foreign key, so none is needed.
export const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000000';

// Used to seed LOADGEN_API_KEY at startup: a real `tenants` row, distinct
// from DEFAULT_TENANT_ID, idempotently upserted via `ON CONFLICT (id) DO NOTHING`.
export const LOADGEN_TENANT_ID = '00000000-0000-0000-0000-000000000001';

// Reserved email for the LOADGEN_TENANT_ID row. Not the upsert's conflict
// target (LoadgenKeySeeder conflicts on id, not email — research.md
// Decision 9) — this is purely a value to satisfy the NOT NULL/UNIQUE
// constraint on tenants.email, never used to authenticate.
export const LOADGEN_TENANT_EMAIL = 'loadgen@internal.logpulse';

// Prefix for generated Tenant API keys (e.g. `lp_<32 base64url chars>`).
// Dot-free by construction, letting guards cheaply tell an API key apart
// from a JWT (which always contains `.`) without a database round trip.
export const API_KEY_PREFIX = 'lp_';

// Node lowercases incoming header names, so lookups must use this exact form.
export const API_KEY_HEADER = 'x-api-key';
