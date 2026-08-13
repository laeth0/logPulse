# Quickstart: Validating Performance Optimization

Runnable validation scenarios proving each user story works end-to-end without regressing the required contract. See `data-model.md` for the `LogRollup` shape and `research.md` for the mechanisms behind each scenario. Local runs here are diagnostic only — per FR-015/SC-008, the external load-testing portal is the authoritative source for whether a change is retained.

## Prerequisites

```bash
docker compose up --build -d
curl -s http://localhost:8080/health
```

## Scenario 1 — Ingestion throughput does not degrade under concurrency (User Story 1)

```bash
# Run the same concurrent-batch load at two concurrency levels and compare throughput.
# (Use the project's existing load-generation tooling/scripts at whatever concurrency
# levels were used to produce the ~20,400 / ~13,900 logs/sec baseline in README.md.)

run_load --concurrency 8  --duration 30s   # record throughput_1
run_load --concurrency 16 --duration 30s   # record throughput_2

# expect: throughput_2 is not meaningfully lower than throughput_1
# (today: throughput_2 is ~32% lower than throughput_1 — this must no longer hold)
```

**Correctness alongside throughput** — every batch's own `accepted`/`rejected` result is still exactly as if it had been written alone:

```bash
# Fire several concurrent batches, some with a deliberately invalid entry.
for i in 1 2 3 4 5; do
  curl -s -X POST http://localhost:8080/logs -H 'Content-Type: application/json' \
    -d "{\"logs\":[{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\",\"level\":\"info\",\"service\":\"coalesce-test\",\"message\":\"m$i\",\"attributes\":{}},{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\",\"level\":\"critical\",\"service\":\"coalesce-test\",\"message\":\"bad\",\"attributes\":{}}]}" &
done
wait
# expect: every response is {"accepted":1,"rejected":[{"index":1,"reason":"invalid level: 'critical'"}]}
# — identical to today's per-request response, even though writes may have been merged internally.

# expect: data is queryable immediately (no premature 200 before durable write — FR-002)
curl -s 'http://localhost:8080/logs?service=coalesce-test&limit:10'
```

## Scenario 2 — Aggregation stays fast and correct while ingestion is active (User Story 2)

```bash
# Start sustained ingestion in the background, then hit aggregate at 1 req/sec.
run_load --concurrency 16 --duration 60s &

for i in $(seq 1 60); do
  since=$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)
  until=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  time curl -s "http://localhost:8080/logs/aggregate?since=${since}&until=${until}&bucket=1h" > /dev/null
  sleep 1
done
# expect: p95 latency across the 60 samples stays under 1s (SC-003)
wait
```

**Correctness — rollup counts match a raw scan exactly**:

```bash
since=$(date -u -d '1 day ago' +%Y-%m-%dT%H:%M:%SZ)
until=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Unfiltered — answered via log_rollups for the bulk of the range
curl -s "http://localhost:8080/logs/aggregate?since=${since}&until=${until}&bucket=1h&group_by=service"

# Filtered by q — must still be fully correct, served without touching log_rollups
curl -s "http://localhost:8080/logs/aggregate?since=${since}&until=${until}&bucket=1h&q=payment"

# expect: summing the unfiltered buckets' counts equals a direct
#   SELECT COUNT(*) FROM logs WHERE tenant_id = ... AND timestamp >= since AND timestamp < until
# run manually against the database for the same tenant/range (exact match, not approximate — FR-005).
```

**Tenant isolation of rollups** (mirrors `specs/001-multi-tenancy/quickstart.md` Scenario 4, re-run here specifically against the rollup-backed path):

```bash
# Using two tenants' API keys from an existing multi-tenancy setup, ingest logs with the
# same service/level into the same time bucket under both tenants, then aggregate as each.
curl -s "http://localhost:8080/logs/aggregate?since=${since}&until=${until}&bucket=1h" -H "Authorization: Bearer ${API_KEY_A}"
curl -s "http://localhost:8080/logs/aggregate?since=${since}&until=${until}&bucket=1h" -H "Authorization: Bearer ${API_KEY_B}"
# expect: each tenant's counts reflect only its own ingested logs — never combined (FR-007/SC-006)
```

## Scenario 3 — Non-blocking rollup rebuild after restart (Clarifications 2026-08-13, FR-019)

```bash
# Ingest enough data that a full-table rollup rebuild would take a non-trivial amount of time,
# then simulate an unclean restart (kill -9, not a graceful stop) and measure health readiness.
docker kill -s SIGKILL <app-container>
docker compose up -d app
time curl -s -o /dev/null -w '%{http_code}\n' --retry 10 --retry-delay 1 --retry-connrefused http://localhost:8080/health
# expect: GET /health reports 200 quickly (comparable to a restart with no rollup-rebuild work at all) —
# it must NOT wait for log_rollups to finish rebuilding.

# Immediately after health reports ready, aggregate before the rebuild has necessarily finished:
curl -s "http://localhost:8080/logs/aggregate?since=${since}&until=${until}&bucket=1h"
# expect: still a fully correct result (served via raw-scan fallback if rollups aren't ready yet — FR-009)
```

## Scenario 4 — Byte-identical responses after the read-path and attribute-storage changes (User Story 3)

```bash
# Capture a GET /logs response before and after the getRawMany()/attributes_text changes,
# for a request covering a stable, already-ingested dataset.
curl -s 'http://localhost:8080/logs?service=checkout&limit=100' | diff - baseline_response.json
# expect: no diff — response shape and field values are unchanged (data-model.md's "unchanged externally" note)

# Mixed-type attribute equality, compared as strings, unchanged behavior:
curl -s 'http://localhost:8080/logs?attr.retries=3' | jq '.logs[].attributes.retries'
# expect: matches a log whose attributes.retries was ingested as the JSON number 3 — same as today
```

## Scenario 5 — Zero-config and `AUTH_ENABLED` behavior unaffected

```bash
# No .env, no AUTH_ENABLED set — identical to specs/001-multi-tenancy/quickstart.md Scenario 1.
curl -s -X POST http://localhost:8080/logs -H 'Content-Type: application/json' \
  -d '{"logs":[{"timestamp":"'"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"'","level":"info","service":"quickstart","message":"hello","attributes":{}}]}'
# expect: {"accepted":1,"rejected":[]} — unchanged, no tenant field anywhere, no behavior change
# from write coalescing or rollups being present under the hood.
```

## Performance validation (mandatory gate, not part of this quickstart)

Per spec.md FR-015/SC-008, this feature is not complete until each retained change has a documented, measured before/after comparison from the project's load-testing portal — matching the mandatory gate already established in `specs/001-multi-tenancy/quickstart.md`. At minimum, re-run the project's existing benchmark methodology (see `README.md`) before/after each of User Stories 1–3 independently, and compare: ingestion throughput at multiple concurrency levels (not just one), aggregation p95 under concurrent ingestion, application/PostgreSQL container CPU and memory. Any change that does not measurably help, per FR-015, must not be retained.
