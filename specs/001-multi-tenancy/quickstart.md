# Quickstart: Validating Multi-Tenancy

Runnable validation scenarios proving the feature works end-to-end, one per spec user story. Uses `curl` against a locally running stack. See `contracts/` for exact request/response shapes and `requests/tenancy/*.rest` (created during implementation) for editor-runnable versions of the same requests.

## Prerequisites

```bash
docker compose up --build -d
# wait for GET /health to return 200
curl -s http://localhost:8080/health
```

## Scenario 1 — Zero-config core is untouched (User Story 1)

No `.env`, no `AUTH_ENABLED` set.

```bash
curl -s -X POST http://localhost:8080/logs \
  -H 'Content-Type: application/json' \
  -d '{"logs":[{"timestamp":"'"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"'","level":"info","service":"quickstart","message":"hello","attributes":{}}]}'
# expect: {"accepted":1,"rejected":[]}

curl -s 'http://localhost:8080/logs?service=quickstart&limit=5'
# expect: {"logs":[...one entry...],"next_cursor":null} — no auth needed, no tenant field anywhere
```

## Scenario 2 — Auth on, seeded load-generator key works transparently (User Story 2)

```bash
AUTH_ENABLED=true LOADGEN_API_KEY=lp_quickstart_test_key docker compose up --build -d
# wait for GET /health

curl -s -X POST http://localhost:8080/logs \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer lp_quickstart_test_key' \
  -d '{"logs":[{"timestamp":"'"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"'","level":"info","service":"quickstart","message":"hello again","attributes":{}}]}'
# expect: {"accepted":1,"rejected":[]}

curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:8080/logs?limit=5'
# expect: 401 — no credential presented

# restart with the same key — must not invalidate it
docker compose restart app
curl -s -X POST http://localhost:8080/logs \
  -H 'Authorization: Bearer lp_quickstart_test_key' -H 'Content-Type: application/json' \
  -d '{"logs":[{"timestamp":"'"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"'","level":"info","service":"quickstart","message":"still works","attributes":{}}]}'
# expect: {"accepted":1,"rejected":[]}
```

## Scenario 3 — Self-registration, login, and API key self-management (User Stories 3 & 4)

```bash
curl -s -X POST http://localhost:8080/tenants/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"quickstart@example.com","password":"correct-horse-battery"}'
# expect: 201 {"id": "...", "email": "quickstart@example.com", "created_at": "..."}

LOGIN=$(curl -s -X POST http://localhost:8080/tenants/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"quickstart@example.com","password":"correct-horse-battery"}')
echo "$LOGIN"
# expect: 200 {"access_token": "...", "refresh_token": "...", "token_type": "Bearer", "expires_in": 900}

ACCESS_TOKEN=$(echo "$LOGIN" | node -pe 'JSON.parse(require("fs").readFileSync(0)).access_token')

# JWT must not work on a log endpoint (FR-018/FR-024)
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:8080/logs' -H "Authorization: Bearer ${ACCESS_TOKEN}"
# expect: 403

KEY=$(curl -s -X POST http://localhost:8080/tenants/api-keys \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")
echo "$KEY"
# expect: 201 {"id": "...", "key": "lp_...", "status": "active", "created_at": "..."}

API_KEY=$(echo "$KEY" | node -pe 'JSON.parse(require("fs").readFileSync(0)).key')

curl -s -X POST http://localhost:8080/logs \
  -H "Authorization: Bearer ${API_KEY}" -H 'Content-Type: application/json' \
  -d '{"logs":[{"timestamp":"'"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"'","level":"info","service":"tenant-a","message":"my own log","attributes":{}}]}'
# expect: {"accepted":1,"rejected":[]}

curl -s 'http://localhost:8080/tenants/api-keys' -H "Authorization: Bearer ${ACCESS_TOKEN}"
# expect: 200 {"api_keys":[{"id":"...","key":"lp_...","status":"active",...}]} — full key still visible (FR-021)
```

## Scenario 4 — Two tenants, verified isolation (User Story 5)

Repeat Scenario 3's register→login→create-key flow with a second email (`tenant-b@example.com`) to get a second `API_KEY_B`, then:

```bash
# Tenant B queries — must never see Tenant A's "tenant-a" service logs
curl -s 'http://localhost:8080/logs?service=tenant-a' -H "Authorization: Bearer ${API_KEY_B}"
# expect: {"logs":[],"next_cursor":null}

curl -s 'http://localhost:8080/logs/aggregate?since=2020-01-01T00:00:00Z&until=2030-01-01T00:00:00Z&bucket=1d' \
  -H "Authorization: Bearer ${API_KEY_B}"
# expect: buckets that never include Tenant A's counts
```

## Scenario 5 — Revocation takes effect immediately

```bash
KEY_ID=$(echo "$KEY" | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')

curl -s -X DELETE "http://localhost:8080/tenants/api-keys/${KEY_ID}" -H "Authorization: Bearer ${ACCESS_TOKEN}"
# expect: 200 {"id": "...", "status": "revoked"}

curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:8080/logs' -H "Authorization: Bearer ${API_KEY}"
# expect: 401 — immediately, no grace period (SC-005)
```

## CI validation

`.github/workflows/ci.yml`'s extended smoke job (research.md Decision 12) automates the `AUTH_ENABLED=false` and `AUTH_ENABLED=true` halves of Scenarios 1 and 2 on every push/PR — see that job for the scripted equivalent of the curl calls above.

## Performance validation (mandatory gate, not part of this quickstart)

Per spec SC-007 and research.md Decision 14, this feature is **not complete** until it has been benchmarked against the pre-multi-tenancy baseline. This quickstart's scenarios only prove correctness (auth, isolation, contract-compatibility) at trivial data volumes — they cannot surface a throughput/latency regression, which only shows up under the ~1M-row / concurrent-load conditions SC-007 is about. Local runs are diagnostic only (per `.wolf/cerebrum.md`); the project's external load-testing portal is the source of authoritative numbers.

Run the project's existing benchmark methodology (see README) before/after this feature and compare, at minimum:
- Ingestion throughput (logs/sec)
- Aggregation query latency, p95
- Query (`GET /logs`) latency, p95
- Application container CPU/memory
- PostgreSQL container CPU/memory

If ingestion throughput regresses meaningfully, revisit the index design (research.md Decision 10) — starting with dropping the net-new `idx_logs_tenant_timestamp_id` index — rather than keeping it on the assumption it was necessary. See tasks.md's final task for the full enforcement rule.
