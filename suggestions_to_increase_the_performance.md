## 1. Slim the row

### 1a. Drop the duplicate `attributes_text` column — biggest single item

`mapLogEntryToNewLog()` writes every attribute map twice: once as `attributes` (typed) and once as
`attributes_text` (all values stringified, GIN-indexed for `attr.<key>`). Measured cost: **heap
81 MB → 59 MB (−27%)**, WAL −8%, and it doubles the JSONB the app serialises, transmits over the
COPY stream, and PostgreSQL parses.

Options, cheapest first:

- **Expression index on a stringified view of `attributes`** — store only `attributes`, and index
  `((<immutable fn>(attributes)) jsonb_path_ops)`. Requires a small `IMMUTABLE` SQL function. Keeps
  `attr.<key>` filtering exactly as fast, removes the duplicate from the heap and from the wire.
- **`GENERATED ALWAYS AS (…) STORED`** — PostgreSQL derives the column instead of the app. Saves app
  CPU, serialisation, and COPY payload, but still stores the duplicate. Smaller win, near-zero risk.

Verify `attr.retries=3` still matches `{"retries": 3}` (string comparison per spec) before keeping.

### 1b. Drop `idx_logs_level_timestamp_id`

`level` has four possible values, so this index is weakly selective yet pays a full B-tree insert on
every row. Measured on 300k rows: it is **15 MB of the 51 MB index total (29%)**.

The planner does use it — but the fallback is nearly as fast, because a 25%-selective filter finds
100 matching rows almost immediately when scanning the PK backwards:

| `WHERE level='error' AND timestamp >= now()-1d ORDER BY timestamp DESC LIMIT 100` | |
|---|---|
| With `idx_logs_level_timestamp_id` | **1.3 ms** (index scan) |
| Without it | **3.0 ms** (PK backward scan, only 331 rows filtered) |

Paying a per-row write on all ~3,000 rows/sec to save 1.7 ms on an occasional query is a bad trade
at this bottleneck. **Keep `idx_logs_service_timestamp_id`** — `service` is high-cardinality *and*
it serves the aggregation as an index-only scan (`Heap Fetches: 0` confirmed).

### 1c. Drop `ingested_at`

Grepped the whole of `src/`: it is written on every row and **never read by any query** — it appears
only in the entity, the create-table migration, and the partition handoff `INSERT`. It costs 8 bytes
plus a `CURRENT_TIMESTAMP` call per row for nothing. Removing it also lets the two
`jsonb_typeof(...)` CHECK constraints go, since Zod already guarantees object-typed attributes.

---

## 2. Raise the write pool — it is still on the driver default

`createReadDatabaseOptions()` sets `extra.max` for reads, but `createDatabaseOptions()` sets no
`max` at all, so the **write pool is on node-postgres's default of 10 connections** while
`max_connections` is 40. Make it explicit and sweep it:

```ts
extra: {
  application_name: 'logpulse-write',
  max: Number(process.env.DB_POOL_MAX ?? 20),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
},
```

Sweep 10 / 20 / 30.

---

## 3. Binary COPY format — measured −12.6%

`log-csv-encoder.ts` builds CSV text, so PostgreSQL re-parses every timestamp, enum, and JSONB value
from strings. `FORMAT binary` sends `timestamptz` as an int64 and skips all text parsing:
**3,401 ms → 2,974 ms** on the current schema (−12.6%), and it composes with §1 (−42% combined).

Cost: a hand-written binary encoder (or `pg-copy-streams-binary`) is fiddlier than CSV and easy to
get subtly wrong on NULLs and JSONB's leading version byte. Worth doing only after §1, and
only with a test asserting a binary-COPY round-trip is byte-identical to the CSV path.

The existing streaming setup is otherwise fine — `pg-copy-streams` already streams, and building the
~33-row payload in memory first is not a bottleneck at this size.

---

## 4. Read-path efficiency (small, safe)

- `LogRepository.findPage()` uses `getMany()`, which hydrates up to 1,000 `Log` entities per request.
  Switching to `getRawMany()` with explicit mapping avoids that. Assert the response body is
  byte-identical first.
- `mapLogToResponse()` runs `sanitizeStoredAttributes()` over every attribute of every row on every
  response. The data was already validated on the way in, so this is defensive work on the hot read
  path — consider trusting the stored value.

---

## Measured and rejected — do not spend time here

| Idea | Why not |
|---|---|
| **More read-pool connections** | Aggregation is starved of **CPU**, not connections. PostgreSQL has 1 core and is ~80–100% busy; a standalone aggregation is 11–189 ms vs the 4.40 s observed. Adding connections adds contention, not capacity. |
| **Per-minute rollup tables** | Measured: at this data density a 1-minute rollup grouped by (service, level) produced **287,286 rows from 300,000** — essentially no compression, since there is roughly one row per (minute, service, level) at ~1M rows/month. Only 1h/1d rollups would compress, and the spec requires 1m and 5m buckets too. |
| **`gin_pending_list_limit` tuning** | Tried and reverted — made ingestion p95 *worse* in 3 of 4 scenarios (Spike +30%). |
| **Dropping `idx_logs_attributes_text_gin`** | Measured: only ~1.5 µs/row to maintain, but gives a **22× read speedup** for `attr.<key>` (1.7 ms vs 37.4 ms). Keep it. |
| **Bigger `work_mem` for aggregation** | Full-range aggregation spills to disk (external merge, 8.4 MB) at `work_mem=8MB`. Raising it to 64 MB only moved 189 ms → 166 ms, and risks OOM on a 1 GB container against 40 connections. Not worth it. |

Also note `q` (`ILIKE '%…%'`) now runs without the trigram index: **37 ms** for a 1-day range
(PK bitmap scan), **144 ms** for an unbounded 30-day scan over 300k rows. Acceptable, and it scales
with the time range — but it is worth confirming the generator always sends `since`/`until` with `q`.

---

## Do not do

- `synchronous_commit = off` or `UNLOGGED` tables — both break the durability the spec requires.
- Raise container CPU/memory limits — fixed by the spec.
- Add Redis or a queue in front of PostgreSQL — the spec requires PostgreSQL as the sole source of truth.
- Shed load with 429/503 — currently 0 dropped and 0% errors; shed requests count as not ingested.
- Node.js clustering or worker threads — the app averages ~11% CPU and is not the bottleneck; the cap
  is a cgroup quota, not a core count.

---

## Suggested order

1. **Slim the row** (§1) — drop `attributes_text`, the `level` index, and `ingested_at`. −33% measured.
2. **Explicit write pool** (§2).
3. **Binary COPY** (§3) — a further −12.6%, once the bigger items are in.
4. Read-path trims (§4).

Re-submit to the portal after each step, keep only what measurably helps, and re-verify
Reliability / Correctness (35 of the current 60 points) every time.
