# k6 Load-Testing Guide for logPulse

## Purpose

This document is the handoff contract for a separate k6 project that will load-test the `logPulse` backend while k6 runs in Docker.

It documents every HTTP endpoint exposed by:

- `backend/src/health`
- `backend/src/logs`

The behavior below was verified against the current controllers, validators, services, authentication guard, exception filter, and Docker Compose configuration. The original grading requirements are in [`Final_Project.md`](Final_Project.md).

## The two throughput targets are different

The project requirement is **at least 15,000 accepted log entries per second**. The requested stress test is **15,000 HTTP requests per second**.

For `POST /logs`:

```text
attempted logs/second = HTTP requests/second x entries/request
accepted logs/second = sum of response.accepted / elapsed seconds
```

Examples:

| HTTP request rate | Batch size | Attempted log rate |
| ---: | ---: | ---: |
| 15,000 requests/s | 1 | 15,000 logs/s |
| 1,500 requests/s | 10 | 15,000 logs/s |
| 150 requests/s | 100 | 15,000 logs/s |
| 15,000 requests/s | 100 | 1,500,000 logs/s |

The k6 project should therefore contain two named profiles:

1. **Contract baseline:** 15,000 accepted logs/s. Sweep several batch sizes to find the best request rate/batch-size combination.
2. **Requested RPS stress:** 15,000 `POST /logs` requests/s, initially with a batch size of 1. This tests HTTP/API overhead as well as ingestion.

Do not describe 15,000 requests/s with batches larger than one as merely a 15,000 logs/s test.

## System under test

Start the backend from the root of the `logPulse` repository:

```bash
docker compose up -d --build
```

The required endpoint is published at `http://localhost:8080`. The application listens on port `8080` inside its container.

The default Compose resource limits match the grading environment:

| Container | CPU limit | Memory limit |
| --- | ---: | ---: |
| Application | 0.5 CPU | 256 MB |
| PostgreSQL 16 | 1.0 CPU | 1 GB |

Keep these limits enabled during benchmark runs. The k6 container is the load generator and must not be included in the application's resource allowance.

The default configuration has:

- `AUTH_ENABLED=false`
- `BACKPRESSURE_ENABLED=false`
- `JSON_BODY_LIMIT=10mb`
- `INGEST_COALESCE_WINDOW_MS=5`
- `INGEST_COALESCE_MAX_ROWS=2000`
- `DB_WRITE_POOL_MAX=20`
- `DB_READ_POOL_MAX=5`

Record all overrides with the test results.

## Docker connectivity from the k6 project

The correct base URL depends on where the k6 container runs:

| k6 location | Recommended `BASE_URL` |
| --- | --- |
| Same Docker network as the backend Compose project | `http://app:8080` |
| Separate Docker project on Docker Desktop (Windows/macOS) | `http://host.docker.internal:8080` |
| Separate Docker project on Linux | `http://host.docker.internal:8080`, with `host.docker.internal:host-gateway` added to `extra_hosts` |
| k6 runs directly on the host | `http://localhost:8080` |

A minimal service in the separate k6 project's Compose file can use this shape:

```yaml
services:
  k6:
    image: grafana/k6:<pin-a-version>
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      BASE_URL: http://host.docker.internal:8080
      TARGET_RPS: "15000"
      BATCH_SIZE: "1"
      API_KEY: ""
    volumes:
      - ./tests:/scripts:ro
      - ./results:/results
    command: run /scripts/main.js
    ulimits:
      nofile:
        soft: 1048576
        hard: 1048576
```

Pin the k6 image version in the actual test project so results remain reproducible.

At 15,000 RPS, the load generator can become the bottleneck. Use a separate machine when possible. If k6 and the system under test share one host, record host CPU, memory, Docker Desktop/WSL settings, and whether k6 exhausted CPU or file descriptors.

## Endpoint summary

| Endpoint | Purpose | Successful status | Authentication |
| --- | --- | --- | --- |
| `GET /health` | Readiness check | `200` | Never required |
| `POST /logs` | Ingest one or more logs | `200` when at least one entry is accepted | API key only when `AUTH_ENABLED=true` |
| `GET /logs` | Filter and paginate stored logs | `200` | API key only when `AUTH_ENABLED=true` |
| `GET /logs/aggregate` | Return time-bucketed counts | `200` | API key only when `AUTH_ENABLED=true` |

There is no required URL prefix such as `/api`. Swagger uses `/api/docs` only in non-production mode; it is not part of the load-test API.

## Authentication behavior

`GET /health` is always public.

When `AUTH_ENABLED` is unset or `false`, all three log endpoints are public. An unrecognized `Authorization` header is ignored, so the k6 project may consistently send a bearer header in both modes.

When `AUTH_ENABLED=true`, set `LOADGEN_API_KEY` on the backend and send the identical key from k6:

```http
Authorization: Bearer <LOADGEN_API_KEY>
```

`X-API-Key: <key>` is also accepted, but bearer authentication is the primary contract.

Authentication errors use this response shape:

```json
{ "error": "<description>" }
```

| Condition | Status |
| --- | ---: |
| Missing or malformed credential | `401` |
| Invalid or revoked API key | `401` |
| Tenant access JWT supplied instead of an API key | `403` |

For the main performance baseline, use the required zero-configuration mode with `AUTH_ENABLED=false`. Run auth-enabled performance as a separate comparison profile.

## `GET /health`

### Purpose

k6 must poll this endpoint before preloading data or starting traffic. A `200` means PostgreSQL is connected, all configured migrations are applied, and the service is ready to accept logs.

### Request

```http
GET /health HTTP/1.1
Host: localhost:8080
```

### Ready response

Status: `200 OK`

```json
{
  "status": "ok",
  "database": "connected",
  "migrations": "applied",
  "uptime": 42,
  "timestamp": "2026-08-15T10:00:00.000Z"
}
```

`uptime` is the application process uptime in whole seconds. `timestamp` is generated for each request.

### Not-ready response

Status: `503 Service Unavailable`

```json
{ "error": "Service is not ready" }
```

### k6 behavior

- Poll with a short interval until `200`, with a finite overall timeout such as 120 seconds.
- Do not start ingestion after a `503`.
- Do not include readiness requests in the ingestion RPS or latency metrics; tag them as `endpoint=health`.
- A later health failure during the run should be recorded as a service reliability failure.

## `POST /logs`

### Purpose

Durably accepts a batch of structured logs. A one-entry batch is valid. A response is not returned until the valid rows have completed the ingestion write path.

### Request

```http
POST /logs HTTP/1.1
Host: localhost:8080
Content-Type: application/json

{
  "logs": [
    {
      "timestamp": "2026-08-15T10:00:00.000Z",
      "level": "error",
      "service": "checkout",
      "message": "payment declined",
      "attributes": {
        "user_id": "42",
        "region": "eu-west",
        "retries": 3,
        "synthetic": true
      }
    }
  ]
}
```

### Top-level validation

- Body must be valid JSON.
- Body must contain a `logs` array.
- `logs` must contain at least one entry.
- The default JSON body-size limit is `10mb`.

### Per-entry validation

| Field | Required | Rules |
| --- | --- | --- |
| `timestamp` | Yes | ISO 8601 with a timezone; must not be more than five minutes in the future |
| `level` | Yes | Exactly `debug`, `info`, `warn`, or `error` |
| `service` | Yes | String containing at least one non-whitespace character |
| `message` | Yes | String containing at least one non-whitespace character |
| `attributes` | No | Flat object; values may only be strings, finite numbers, or booleans |

Nested objects, arrays, `null`, `NaN`, and infinite attribute values are invalid. Omitted `attributes` is stored as `{}`.

### Partial acceptance

Entries are validated independently. Invalid entries do not reject valid entries in the same batch.

Status: `200 OK` when at least one entry is accepted.

```json
{
  "accepted": 9,
  "rejected": [
    {
      "index": 3,
      "reason": "invalid level: 'critical'"
    }
  ]
}
```

Status: `400 Bad Request` when every entry is rejected. The response still uses the ingestion result shape:

```json
{
  "accepted": 0,
  "rejected": [
    {
      "index": 0,
      "reason": "timestamp must be a valid ISO 8601 timestamp"
    }
  ]
}
```

Malformed JSON and invalid top-level structures return `400` with the standard error envelope:

```json
{ "error": "<description>" }
```

### Optional backpressure responses

These occur only when `BACKPRESSURE_ENABLED=true`:

| Status | Meaning | Retry? | Count as ingested? |
| ---: | --- | --- | --- |
| `503` plus `Retry-After` | The batch fits by itself, but admitted work is temporarily using the remaining capacity | Yes, after the indicated seconds | No |
| `413` | The valid portion of this batch exceeds the configured row or estimated-byte capacity by itself | No; reduce the batch | No |

Example temporary overload response:

```http
HTTP/1.1 503 Service Unavailable
Retry-After: 1
Content-Type: application/json

{ "error": "the service is temporarily at ingestion capacity; retry shortly" }
```

The grading contract explicitly says `413` and `503` responses do not contribute to throughput. Count only the `accepted` value from successful `200` responses as ingested logs.

### k6 payload rules

- Use `new Date().toISOString()` or an equivalent UTC timestamp. Do not use a fixed date that retention may delete or a future timestamp that validation rejects.
- Add a `run_id` attribute to isolate one test run from another.
- Add a unique `event_id`, such as `<run-id>-<VU>-<ITER>-<timestamp>`, when later visibility checks must identify an exact event.
- Keep attributes flat and bounded in size.
- Use deterministic service and level distributions so aggregate counts can be checked.
- Reuse HTTP connections. Do not enable `noConnectionReuse` or `noVUConnectionReuse` for the baseline.
- Do not add a `sleep()` to an arrival-rate ingestion function unless the resulting virtual-user demand is understood.

Suggested normal distribution:

| Field | Distribution |
| --- | --- |
| `service` | `checkout` 40%, `auth` 30%, `catalog` 20%, `shipping` 10% |
| `level` | `info` 70%, `warn` 15%, `error` 10%, `debug` 5% |
| `message` | Small bounded messages, with a few predictable search terms |
| `attributes` | `run_id`, `region`, `event_id`, and one numeric or boolean field |

## `GET /logs`

### Purpose

Returns stored logs using freely combinable filters and cursor-based pagination.

### Query parameters

| Parameter | Required | Behavior |
| --- | --- | --- |
| `service` | No | Exact service match |
| `level` | No | Exact match: `debug`, `info`, `warn`, or `error` |
| `since` | No | Inclusive ISO 8601 lower timestamp bound |
| `until` | No | Exclusive ISO 8601 upper timestamp bound |
| `attr.<key>` | No | Attribute equality compared through its query-string representation |
| `q` | No | Case-insensitive substring match on `message`; `%`, `_`, and backslash are treated literally |
| `limit` | No | Positive integer; default `100`, minimum `1`, maximum `1000` |
| `cursor` | No | Opaque cursor returned by a previous page |

Unknown query parameters return `400`. Repeated parameters that become multiple values are invalid because each supported parameter must be one string.

### Combined-filter request

```http
GET /logs?service=checkout&level=error&since=2026-08-15T09%3A00%3A00.000Z&until=2026-08-15T10%3A00%3A00.000Z&attr.run_id=run-123&q=declined&limit=100
```

### Successful response

Status: `200 OK`

```json
{
  "logs": [
    {
      "id": "959793",
      "timestamp": "2026-08-15T09:59:59.123Z",
      "level": "error",
      "service": "checkout",
      "message": "payment declined",
      "attributes": {
        "run_id": "run-123",
        "region": "eu-west"
      }
    }
  ],
  "next_cursor": "eyJ0aW1lc3RhbXAiOiIyMDI2LTA4LTE1VDA5OjU5OjU5LjEyM1oiLCJpZCI6Ijk1OTc5MyJ9"
}
```

Results are ordered by `timestamp DESC`, then `id DESC` for deterministic ordering. `next_cursor` is `null` when no additional page exists.

Treat the cursor as opaque. Pass it back unchanged and preserve all the original filters while paging.

Invalid parameters return `400`:

```json
{ "error": "<description>" }
```

Invalid cases include malformed timestamps, `until` earlier than `since`, unsupported levels, empty attribute keys, invalid limits, unsupported parameters, and malformed cursors.

### k6 checks

- Status is `200`.
- Body contains an array named `logs`.
- `next_cursor` is a string or `null`.
- Every returned row satisfies all requested filters.
- Timestamps are descending; equal timestamps have descending numeric IDs.
- A pagination walk produces no duplicate IDs and does not cross the requested `run_id` or authenticated tenant.

Run expensive `q` and `attr.*` cases as separately tagged scenarios. They use a different database path than an unfiltered or service/level-only query and must not hide the primary-query latency.

## `GET /logs/aggregate`

### Purpose

Returns log counts in time buckets. The required benchmark runs one aggregation request per second while ingestion is active, and its p95 latency must remain below one second.

### Query parameters

| Parameter | Required | Behavior |
| --- | --- | --- |
| `since` | Yes | Inclusive ISO 8601 lower bound |
| `until` | Yes | Exclusive ISO 8601 upper bound |
| `bucket` | Yes | Exactly `1m`, `5m`, `1h`, or `1d` |
| `group_by` | No | Exactly `service` or `level` |
| `service` | No | Exact service filter |
| `level` | No | Exact level filter |
| `attr.<key>` | No | Attribute equality filter |
| `q` | No | Case-insensitive message substring filter |

`limit` and `cursor` are not supported by this endpoint.

### Request

```http
GET /logs/aggregate?since=2026-08-15T09%3A00%3A00.000Z&until=2026-08-15T10%3A00%3A00.000Z&bucket=1m&group_by=service
```

### Successful response

Status: `200 OK`

```json
{
  "buckets": [
    {
      "start": "2026-08-15T09:00:00.000Z",
      "group": "checkout",
      "count": 118
    },
    {
      "start": "2026-08-15T09:00:00.000Z",
      "group": "auth",
      "count": 42
    }
  ]
}
```

There is one row per non-empty bucket/group combination. Rows are ordered by bucket start ascending. `group` is `null` when `group_by` is absent.

Invalid or missing parameters return `400`:

```json
{ "error": "<description>" }
```

### k6 checks

- Status is `200`.
- Body contains an array named `buckets`.
- `start` values are ascending.
- Every `count` is a non-negative integer.
- `group` is `null` without `group_by`, or a valid requested group value when grouping.
- `http_req_duration{endpoint:aggregate}` has `p(95) < 1000ms` while ingestion is active.

Use a service/level-only or unfiltered aggregation as the primary one-request-per-second benchmark. `q` and `attr.*` filters force raw-log filtering and should be measured as separate named cases.

## Required k6 test profiles

### 1. Smoke and readiness

Before every benchmark:

1. Poll `GET /health` until it returns `200` or the startup timeout expires.
2. Send one valid one-entry `POST /logs`; require `accepted=1` and no rejections.
3. Retrieve it through `GET /logs` using a unique `attr.run_id`.
4. Aggregate the same time window through `GET /logs/aggregate`.
5. Abort the load run if any step fails.

### 2. Contract baseline: 15,000 accepted logs/s

Use an open-model arrival-rate executor. Test several equivalent profiles instead of assuming the best batch size:

| Profile | Request rate | Batch size | Attempted logs/s |
| --- | ---: | ---: | ---: |
| B1 | 15,000 RPS | 1 | 15,000 |
| B10 | 1,500 RPS | 10 | 15,000 |
| B100 | 150 RPS | 100 | 15,000 |
| B1000 | 15 RPS | 1,000 | 15,000 |

For each profile:

- Warm up for 30 seconds.
- Sustain the target for at least 5 minutes for the formal run.
- Run `GET /logs/aggregate` at 1 RPS throughout the sustained interval.
- Use all-valid payloads.
- Require zero application crashes and zero silently dropped requests.
- Measure accepted logs/s from the response bodies, not from requests sent.
- Record p50, p90, p95, and p99 ingestion latency.

The existing ad hoc measurement used batch size 2,000 and concurrency 8, reaching approximately 20,400 logs/s over a short run. At concurrency 16 it fell to approximately 13,900 logs/s with PostgreSQL near its CPU limit. These numbers are context only, not a substitute for the repeatable k6 run.

### 3. Requested stress: 15,000 HTTP requests/s

Start with `BATCH_SIZE=1` so the offered request rate and log rate are both 15,000/s.

Use a staged discovery run before the sustained run:

1. 1,000 RPS for 30 seconds.
2. 5,000 RPS for 30 seconds.
3. 10,000 RPS for 30 seconds.
4. 15,000 RPS for 60 seconds.
5. If stable, run 15,000 RPS for 5 minutes.

At 15,000 RPS:

- 60 seconds creates 900,000 one-entry requests/logs.
- 5 minutes creates 4,500,000 one-entry requests/logs.

Plan storage and retention accordingly. Do not increase batch size in this profile unless the report clearly states the much higher attempted log rate.

### 4. One-million-row concurrent workload

The grading scenario expects approximately 1,000,000 stored records representing roughly one month.

Use a dedicated preload phase that:

- Distributes timestamps across the last 30 days.
- Uses batch requests for efficient setup.
- Waits for all successful responses.
- Verifies the expected accepted total.

Then run sustained ingestion while:

- Calling the primary aggregation at 1 RPS.
- Optionally calling a representative `GET /logs` query at 1 RPS under a separate metric tag.
- Tracking application and PostgreSQL CPU/memory.

Do not include preload requests in the steady-state benchmark metrics.

### 5. Ingest-to-query visibility

The requirement is that newly ingested data becomes queryable within 20 seconds.

At a controlled rate during the sustained run:

1. Send a valid event with a unique `event_id`.
2. Record the end time of its successful `POST /logs` response.
3. Poll `GET /logs?attr.event_id=<id>&limit=1` until it appears.
4. Record the visibility delay.
5. Fail the check if it exceeds 20 seconds.

Keep this probe rate low so polling does not distort the main query workload.

### 6. Optional-feature comparisons

Run separate, clearly labeled comparisons for:

- `AUTH_ENABLED=false` versus `AUTH_ENABLED=true` with the seeded load-generator API key.
- `BACKPRESSURE_ENABLED=false` versus enabled with its default generous thresholds.

When backpressure is enabled, report `200`, `413`, and `503` separately. Never count shed requests as accepted throughput.

## Suggested k6 scenario shape

The external k6 project should use `constant-arrival-rate` for sustained measurements because the target is an offered rate, not a fixed number of virtual users.

```javascript
const targetRps = Number(__ENV.TARGET_RPS || 15000);

export const options = {
  scenarios: {
    ingest: {
      executor: 'constant-arrival-rate',
      exec: 'ingest',
      rate: targetRps,
      timeUnit: '1s',
      duration: __ENV.DURATION || '5m',
      preAllocatedVUs: Number(__ENV.PRE_ALLOCATED_VUS || 2000),
      maxVUs: Number(__ENV.MAX_VUS || 10000),
      tags: { endpoint: 'ingest' },
    },
    aggregate: {
      executor: 'constant-arrival-rate',
      exec: 'aggregate',
      rate: 1,
      timeUnit: '1s',
      duration: __ENV.DURATION || '5m',
      preAllocatedVUs: 2,
      maxVUs: 10,
      tags: { endpoint: 'aggregate' },
    },
  },
};
```

The VU values are starting points, not validated constants. Required VUs are approximately:

```text
required VUs = target requests/second x average iteration duration in seconds
```

For example, 15,000 RPS at 100 ms per iteration needs about 1,500 active VUs plus headroom. If `dropped_iterations` rises while the backend is still responsive, the load generator lacks VUs or resources and the run is invalid as evidence of backend capacity.

Use stable request names/tags so dynamic query strings do not create high-cardinality URL metrics:

```javascript
http.post(`${baseUrl}/logs`, body, {
  headers,
  tags: { name: 'POST /logs', endpoint: 'ingest' },
});
```

## Metrics and thresholds

The k6 project should define custom counters/trends for at least:

- `logs_attempted`
- `logs_accepted`
- `entries_rejected`
- `ingest_200`
- `ingest_400`
- `ingest_401`
- `ingest_403`
- `ingest_413`
- `ingest_503`
- `ingest_other_status`
- `visibility_delay_ms`

Required result calculations:

```text
accepted logs/s = logs_accepted / sustained test seconds
accepted request rate = ingest_200 / sustained test seconds
request success ratio = ingest_200 / ingestion attempts
entry rejection ratio = entries_rejected / logs_attempted
```

Recommended baseline thresholds:

- `logs_accepted` rate is at least 15,000/s for the contract baseline.
- Ingestion status is `200` for every all-valid request with backpressure disabled.
- Entry rejection ratio is zero for all-valid traffic.
- `dropped_iterations` is zero.
- Aggregate response p95 is below 1,000 ms during ingestion.
- Visibility delay is below 20,000 ms.
- No application restart, crash, or unhandled `500` response occurs.

Also report:

- `http_reqs` rate for `endpoint=ingest`.
- `http_req_duration` p50/p90/p95/p99/max per endpoint.
- `http_req_waiting`, `http_req_connecting`, and `http_req_blocked` to distinguish backend latency from load-generator/socket pressure.
- Checks pass rate.
- `dropped_iterations` and achieved iteration rate.
- Bytes sent/received.

Do not use the overall `http_reqs` metric as the claimed ingestion RPS because it also includes health and query traffic.

## Retry policy

Use no automatic retries in the zero-configuration baseline. Retries change the offered rate and can hide errors.

In a dedicated backpressure-recovery scenario, a `503` may be retried after the integer seconds in `Retry-After`. Track original attempts and retry attempts separately. Do not retry `413`.

A network timeout after sending `POST /logs` has an unknown outcome: the server may have committed the rows even though k6 did not receive the response. Because this endpoint has no idempotency key, automatically retrying an ambiguous timeout can create duplicates. Record it as an ambiguous failure unless the test data and verification strategy can safely detect duplicates.

## Data isolation and cleanup

There is no HTTP endpoint that deletes load-test data.

Preferred choices:

1. Use a dedicated disposable PostgreSQL volume for each formal run.
2. Add a unique `run_id` attribute to every generated log and filter verification queries by it.

On a dedicated disposable environment only, the backend can be reset with:

```bash
docker compose down -v
docker compose up -d --build
```

`docker compose down -v` permanently removes the Compose database volume. Never run it against an environment containing data that must be retained.

## Resource monitoring

Capture resource usage during warm-up and sustained traffic. A simple local sampler can start with:

```bash
docker stats --no-stream
```

For formal evidence, sample continuously and retain timestamps for:

- Application CPU and memory.
- PostgreSQL CPU and memory.
- k6 CPU and memory.
- Container restart count.
- Host CPU, memory, disk utilization, and disk latency.
- PostgreSQL connection count and saturation symptoms when available.

If the achieved rate is lower than requested, determine whether the limiter is k6, the host/Docker network, the application, PostgreSQL CPU, disk I/O, connections, or backpressure. Do not attribute every shortfall to the backend without this evidence.

## Result report template

Each run should produce a Markdown or JSON summary containing:

```text
Run ID:
UTC start/end:
Git commit:
k6 image/version:
Host hardware and OS:
Docker/WSL settings:
Backend environment overrides:
Auth mode:
Backpressure mode and limits:
Initial dataset rows:
Test duration and warm-up:
Target ingestion RPS:
Achieved ingestion RPS:
Batch size:
Attempted logs/s:
Accepted logs/s:
Accepted/rejected/shed/error totals by status:
Ingestion latency p50/p90/p95/p99/max:
GET /logs latency p50/p90/p95/p99:
Aggregation latency p50/p90/p95/p99:
Visibility delay p95/max:
Dropped iterations:
App CPU peak / memory peak / restarts:
PostgreSQL CPU peak / memory peak / restarts:
k6 CPU peak / memory peak:
Bottleneck observed:
Pass/fail against each requirement:
```

## Formal acceptance checklist

A run passes the project baseline only when all of these are true:

- The backend started with `docker compose up` and became ready through `GET /health`.
- The application and PostgreSQL resource limits remained unchanged.
- Accepted throughput was at least 15,000 logs/s, based on successful response bodies.
- No shed, rejected, failed, or ambiguous requests were counted as ingested.
- No application or database crash/restart occurred.
- The primary aggregation ran at 1 RPS during ingestion and stayed below 1 second p95.
- Query performance was measured while the dataset contained approximately 1,000,000 rows.
- New accepted logs were queryable within 20 seconds.
- k6 had no dropped iterations and was not the limiting resource.
- Test environment, dataset, batch size, request rate, latency percentiles, resource usage, bottlenecks, and configuration were recorded.

The 15,000 HTTP requests/s stress profile is an additional pass/fail result. It does not replace the baseline calculation unless its batch size is exactly one and at least 15,000 log entries/s are confirmed accepted.
