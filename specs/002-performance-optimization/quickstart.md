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

# expect: still comfortably within the 20-second ingest-to-queryable budget (SC-005) —
# a coalescing debounce window of a few ms cannot meaningfully threaten this, but confirm it wasn't missed.
```

**Multi-tenant coalescing** — different tenants' concurrent requests may be merged into the same flush; each log must still land under its own tenant, never another's (spec.md US1 Acceptance Scenario 4):

```bash
# Using two tenants' API keys from an existing multi-tenancy setup (see specs/001-multi-tenancy/quickstart.md),
# fire concurrent batches from both tenants at once, close enough together to likely coalesce into one flush.
curl -s -X POST http://localhost:8080/logs -H "Authorization: Bearer ${API_KEY_A}" -H 'Content-Type: application/json' \
  -d "{\"logs\":[{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\",\"level\":\"info\",\"service\":\"coalesce-tenant-a\",\"message\":\"a\",\"attributes\":{}}]}" &
curl -s -X POST http://localhost:8080/logs -H "Authorization: Bearer ${API_KEY_B}" -H 'Content-Type: application/json' \
  -d "{\"logs\":[{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\",\"level\":\"info\",\"service\":\"coalesce-tenant-b\",\"message\":\"b\",\"attributes\":{}}]}" &
wait

curl -s 'http://localhost:8080/logs?service=coalesce-tenant-a' -H "Authorization: Bearer ${API_KEY_B}"
# expect: {"logs":[],"next_cursor":null} — tenant B never sees tenant A's log, even though the two
# writes may have shared one internal COPY flush (FR-004).
curl -s 'http://localhost:8080/logs?service=coalesce-tenant-a' -H "Authorization: Bearer ${API_KEY_A}"
# expect: tenant A sees exactly its own log.
```

**A single request larger than the coalescing cap is never split** (research.md Decision 1, F1 fix) — `docs/Final_Project.md` sets no maximum batch size, so this is a real case, not a hypothetical:

```bash
# Build one request whose own logs array exceeds the configured max-batch-rows cap
# (e.g., 5,000 entries against a default cap in the low thousands).
python3 -c "
import json
logs = [{'timestamp': '$(date -u +%Y-%m-%dT%H:%M:%S.000Z)', 'level': 'info', 'service': 'oversized-batch', 'message': str(i), 'attributes': {}} for i in range(5000)]
print(json.dumps({'logs': logs}))
" > oversized_batch.json

curl -s -X POST http://localhost:8080/logs -H 'Content-Type: application/json' --data @oversized_batch.json
# expect: {"accepted":5000,"rejected":[]} — one single, complete result for the whole request,
# never a partial/ambiguous outcome from being split across two internal flushes.

curl -s 'http://localhost:8080/logs?service=oversized-batch&limit=1'
# expect: immediately queryable — confirms the entire oversized batch was durably committed
# as a unit before the 200 was returned, not just the portion that fit under the cap.
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
# expect: each tenant's counts reflect only its own ingested logs — never combined (FR-007/SC-006).
# This must hold even though both tenants' rollup rows can share the same `bucket`/`service`/`level` —
# isolation comes from the rollup-read query's own unconditional tenant_id filter (research.md Decision 7),
# not from the two tenants' data happening to land in different buckets.
```

## Scenario 3 — Rollup consistency survives an unclean restart, with no new readiness dependency (spec.md FR-009, FR-019; research.md Decisions 6, 8)

Per research.md Decision 6, `COPY` and the rollup upsert commit atomically in one transaction against a durable (`LOGGED`) `log_rollups` table — an unclean restart can no longer leave rollups out of sync with `logs`, so there is no "rebuild" step to wait for or verify a fallback against, and `GET /health` gains no new readiness dependency (FR-019). This scenario proves that directly:

```bash
# Ingest a batch, then immediately kill -9 the app mid-flush-window (not a graceful stop) to
# exercise the crash path, and restart it.
curl -s -X POST http://localhost:8080/logs -H 'Content-Type: application/json' \
  -d "{\"logs\":[{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\",\"level\":\"info\",\"service\":\"crash-test\",\"message\":\"before crash\",\"attributes\":{}}]}"
docker kill -s SIGKILL <app-container>
docker compose up -d app

# expect: GET /health reports 200 just as quickly as any other restart — there is no rollup-related
# work gating readiness at all (it was never gated on anything but the pre-existing conditions:
# database connectivity, applied migrations).
time curl -s -o /dev/null -w '%{http_code}\n' --retry 10 --retry-delay 1 --retry-connrefused http://localhost:8080/health

since=$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)
until=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# expect: the rollup-backed aggregate and a raw-scan-forced equivalent agree exactly — no
# undercounting from the pre-restart batch, no double-counting from anything replayed.
curl -s "http://localhost:8080/logs/aggregate?since=${since}&until=${until}&bucket=1h&service=crash-test"
curl -s "http://localhost:8080/logs/aggregate?since=${since}&until=${until}&bucket=1h&service=crash-test&q=before"  # q forces the raw-scan path (Decision 7)
# expect: both calls report the identical count for the batch ingested just before the crash.
```

**One-time historical backfill on an already-populated database** (research.md Decision 8) — this is the scenario that actually needs verifying now, replacing the old rebuild-after-restart test:

```bash
# Simulate deploying this feature against a database that already has logs rows from before
# log_rollups existed: run only the pre-existing migrations, ingest some data, THEN run the
# new CreateLogRollupsTable migration (which includes the one-time backfill INSERT).
npm run migration:run   # runs the new backfill migration against the already-populated table

since=$(date -u -d '1 day ago' +%Y-%m-%dT%H:%M:%SZ)
until=$(date -u +%Y-%m-%dT%H:%M:%SZ)
curl -s "http://localhost:8080/logs/aggregate?since=${since}&until=${until}&bucket=1h"
curl -s "http://localhost:8080/logs/aggregate?since=${since}&until=${until}&bucket=1h&q="   # raw-scan path, for comparison
# expect: identical counts — the backfill correctly covers every pre-existing row, computed with
# no concurrent writer running (the app hasn't started yet at migration time), so there is nothing
# to double-count or race against.

# On the actual grading path (a fresh docker compose up, empty database), confirm the backfill
# is a real no-op, not just a small cost:
time docker compose up --build -d
# expect: startup time is not measurably different from a build with no pre-existing logs rows at all —
# the backfill INSERT ... SELECT touches zero rows on a fresh database.
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
