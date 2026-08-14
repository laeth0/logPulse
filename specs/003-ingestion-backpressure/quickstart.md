# Quickstart: Validating Optional Backpressure Support

Runnable manual validation scenarios proving each user story works end-to-end. Unlike `002-performance-optimization`'s quickstart, these scenarios are designed to be **deterministic without needing sustained 15,000 logs/sec load** — correctness here is proven with intentionally tiny configured thresholds, not high throughput. See `data-model.md` for the state model and `contracts/post-logs-backpressure.md` for exact response shapes.

## Prerequisites

```bash
docker compose up --build -d
curl -s http://localhost:8080/health
```

## Scenario 1 — Default deployment is completely unaffected (User Story 3, SC-002, SC-006)

```bash
# No BACKPRESSURE_* env vars set at all.
curl -s -X POST http://localhost:8080/logs -H 'Content-Type: application/json' \
  -d '{"logs":[{"timestamp":"'"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"'","level":"info","service":"quickstart","message":"hello","attributes":{}}]}'
# expect: {"accepted":1,"rejected":[]} — identical to before this feature existed.

# Drive a modest burst of concurrent requests — confirm none of them ever see 503/413.
for i in $(seq 1 50); do
  curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8080/logs -H 'Content-Type: application/json' \
    -d "{\"logs\":[{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\",\"level\":\"info\",\"service\":\"quickstart-burst\",\"message\":\"m$i\",\"attributes\":{}}]}" &
done
wait
# expect: every line is 200 — never 503, never 413.

# The existing required-contract smoke test (both AUTH_ENABLED configurations) must also pass unmodified.
```

## Scenario 2 — Temporary capacity exhaustion returns 503 + Retry-After, admits nothing, and is global across tenants (User Story 2, FR-008)

```bash
# Restart with backpressure enabled and a deliberately tiny row cap, so a handful of
# concurrent requests is enough to exhaust it — no need for real load-test throughput.
BACKPRESSURE_ENABLED=true BACKPRESSURE_MAX_PENDING_ROWS=5 BACKPRESSURE_MAX_PENDING_BYTES=1mb \
  docker compose up --build -d
curl -s http://localhost:8080/health

# Fire more concurrent single-entry batches than the cap allows, all at once.
for i in $(seq 1 20); do
  curl -s -o /tmp/resp_$i.json -w '%{http_code} %{header_json}\n' -X POST http://localhost:8080/logs \
    -H 'Content-Type: application/json' \
    -d "{\"logs\":[{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\",\"level\":\"info\",\"service\":\"backpressure-503\",\"message\":\"m$i\",\"attributes\":{}}]}" &
done
wait
# expect: some responses are 200 ({"accepted":1,"rejected":[]}), others are 503 with a
# Retry-After header and body {"error": "..."} — never a partial accept for a single request.

grep -l '"error"' /tmp/resp_*.json | head -1 | xargs cat
# expect: {"error": "the service is temporarily at ingestion capacity; retry shortly"}

curl -s 'http://localhost:8080/logs?service=backpressure-503&limit=20' | jq '.logs | length'
# expect: exactly the count of requests that received 200 — none of the 503'd requests
# ever wrote a row (SC-003/SC-004).

# Confirm the service recovers on its own, and MEASURE how long it takes (SC-005: "within
# a few seconds") rather than just asserting it eventually works:
start=$(date +%s.%N)
until curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:8080/logs \
  -H 'Content-Type: application/json' \
  -d "{\"logs\":[{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\",\"level\":\"info\",\"service\":\"backpressure-recovery\",\"message\":\"recovered\",\"attributes\":{}}]}" \
  | grep -q '^200$'; do
  sleep 0.2
done
end=$(date +%s.%N)
echo "recovered after $(echo "$end - $start" | bc)s — no restart or manual intervention (FR-013)"
# expect: a reported recovery time of a few seconds at most — report the actual measured
# value, not just "it eventually worked."

## Two-tenant capacity is shared globally, not per-tenant (FR-008)

# With AUTH_ENABLED=true (see specs/001-multi-tenancy/quickstart.md for provisioning two
# tenants' API keys), restart with the same tiny-cap config as above. Saturate capacity
# using ONLY tenant A's traffic, then confirm tenant B — which has sent nothing itself —
# is ALSO rejected. A per-tenant (rather than global) implementation would incorrectly
# admit tenant B's request here.
for i in $(seq 1 20); do
  curl -s -o /dev/null -X POST http://localhost:8080/logs \
    -H "Authorization: Bearer ${API_KEY_A}" -H 'Content-Type: application/json' \
    -d "{\"logs\":[{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\",\"level\":\"info\",\"service\":\"tenant-a-load\",\"message\":\"m$i\",\"attributes\":{}}]}" &
done
wait

status=$(curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:8080/logs \
  -H "Authorization: Bearer ${API_KEY_B}" -H 'Content-Type: application/json' \
  -d "{\"logs\":[{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\",\"level\":\"info\",\"service\":\"tenant-b-check\",\"message\":\"x\",\"attributes\":{}}]}")
echo "tenant B (sent nothing itself) got: ${status}"
# expect: 503 at least some of the time while tenant A's burst is still draining — tenant
# B's request is judged against the SAME global counters tenant A's burst just filled.
```

## Scenario 3 — A batch that can never fit returns 413, not 503 (User Story 2, SC-008)

```bash
# Same tiny-cap config as Scenario 2 (BACKPRESSURE_MAX_PENDING_ROWS=5), but this time send
# ONE request whose own valid-entry count already exceeds the cap, with nothing else pending.
python3 -c "
import json
logs = [{'timestamp': '$(date -u +%Y-%m-%dT%H:%M:%S.000Z)', 'level': 'info', 'service': 'too-big', 'message': str(i), 'attributes': {}} for i in range(50)]
print(json.dumps({'logs': logs}))
" > oversized_for_capacity.json

curl -s -w '\n%{http_code}\n' -X POST http://localhost:8080/logs --data @oversized_for_capacity.json -H 'Content-Type: application/json'
# expect: 413, {"error": "batch of 50 entries (...) exceeds the configured ingestion capacity limit and can never be admitted"}
# — NOT 503, even though the system was otherwise completely idle (nothing else pending).

curl -s 'http://localhost:8080/logs?service=too-big&limit=5'
# expect: {"logs":[],"next_cursor":null} — nothing was written.

# Byte-size dimension, independently: a small number of entries with a huge message,
# under BACKPRESSURE_MAX_PENDING_BYTES=1mb.
python3 -c "
import json
print(json.dumps({'logs': [{'timestamp': '$(date -u +%Y-%m-%dT%H:%M:%S.000Z)', 'level': 'info', 'service': 'too-big-bytes', 'message': 'x' * 2_000_000, 'attributes': {}}]}))
" > oversized_bytes.json
curl -s -w '\n%{http_code}\n' -X POST http://localhost:8080/logs --data @oversized_bytes.json -H 'Content-Type: application/json'
# expect: 413 — one single entry, well under the row cap, but over the byte cap alone.
```

## Scenario 4 — Existing behavior fully preserved when backpressure is enabled but under threshold (SC-007)

```bash
# Generous, realistic limits this time — not the deliberately tiny ones above.
BACKPRESSURE_ENABLED=true BACKPRESSURE_MAX_PENDING_ROWS=20000 BACKPRESSURE_MAX_PENDING_BYTES=25mb \
  docker compose up --build -d

# Re-run 002-performance-optimization's coalescing/rollup/tenant-isolation scenarios
# (specs/002-performance-optimization/quickstart.md Scenario 1) unmodified.
# expect: identical results — write coalescing, atomic per-caller accepted/rejected results,
# multi-tenant isolation, and durability are all unaffected by this feature being enabled
# but not triggered (FR-011/FR-012).

# Confirm throughput still clears the baseline target under normal load
# (re-run the project's existing load-generation methodology; compare against the
# 002-performance-optimization measured baseline in README.md).
```

## Scenario 5 — Auth/tenant checks still run before the capacity check (FR-009)

```bash
# With AUTH_ENABLED=true and backpressure enabled+exhausted (Scenario 2's tiny-cap config),
# an unauthenticated request must still get 401, never 503.
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8080/logs -H 'Content-Type: application/json' \
  -d '{"logs":[{"timestamp":"2026-01-01T00:00:00.000Z","level":"info","service":"auth-order","message":"x","attributes":{}}]}'
# expect: 401 — regardless of current capacity state.
```

## Performance validation (mandatory gate, not part of this quickstart)

Per this project's established convention (`specs/002-performance-optimization/plan.md`, `.wolf/cerebrum.md`), local runs above are diagnostic only. Before considering this feature's *default configuration* (thresholds) final, re-run the project's external load-testing portal with `BACKPRESSURE_ENABLED=true` at the generous defaults (Scenario 4) and confirm no throughput regression versus the `002` baseline (SC-007) — and revert to disabled-by-default only if a real regression is found, per this project's established perf-change bar.
