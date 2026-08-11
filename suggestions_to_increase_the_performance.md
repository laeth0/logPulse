# Performance Improvement Plan

Rewritten 2026-08-11 after a full code review of the ingestion and query paths, with every
recommendation below measured against the live PostgreSQL 16 container rather than assumed.

---

## Where things stand

| Date | Change | Score | Rank | Load logs/sec | Aggregate p95 |
|---|---|---|---|---|---|
| 2026-08-10 | baseline | 59.28 | #5 | 2,457 | 3.97 s |
| 2026-08-11 | 1. drop trigram index | 57.97 | #5 | 2,601 | 4.20 s |
| 2026-08-11 | 3. PostgreSQL config tuning | 59.68 | #4 | 2,758 | 3.57 s |
| 2026-08-11 | 4. read-path isolation | **60.07** | **#4** | **3,056** | 4.40 s |
| 2026-08-11 | 5. GIN pending-list ❌ reverted | 59.97 | #4 | 2,981 | 4.32 s |
| 2026-08-11 | 6. autovacuum tuning ❌ removed | 60.00 | #4 | 3,001 | 4.43 s |

Targets: **15,000 logs/sec** (at 3,056 → 20% of target) and **aggregate p95 < 1 s** (at 4.40 s → 4.4× over).
Reliability 20/20, Correctness 15/15, 75/75 checks pass — **protect these**; Queries sits at 6/15.

---

## The headline finding: batch size, not row cost

The load generator sends **~33 logs per HTTP request**. `LogRepository.insertMany()` runs one
`COPY … FROM STDIN` per request in autocommit, so **one durable commit per 33 rows**. Measured on
the live container, same 300,000 rows, only the batch size varying:

| Batch size | Commits | µs/row | rows/sec | WAL |
|---|---|---|---|---|
| **33 (what happens today)** | 9,091 | **100.7** | **9,935** | 248 MB |
| 330 (10 requests coalesced) | 910 | 24.2 | 41,358 | 245 MB |
| 3,300 (100 coalesced) | 91 | 9.3 | 108,027 | 245 MB |
| 300,000 (single transaction) | 1 | 8.2 | 122,215 | 245 MB |

Inserting a row costs **~8 µs**. At 33-row batches the app pays **~101 µs/row** — roughly
**92 µs of pure per-transaction commit overhead, 12× the actual work**. WAL volume is identical
across every variant, so this is not I/O volume: it is fsync count and transaction bookkeeping.

This one factor explains the gap. It also explains the 4.40 s aggregate p95: PostgreSQL sits at
~80–100% of its single core doing commit overhead, so read queries starve. A standalone aggregation
measures **11 ms** (1-day range) to **189 ms** (full 30-day range) — nowhere near 4.40 s. Aggregation
is not slow; it is waiting for CPU.

**Fixing batching fixes both headline targets at once.** Everything else on this page is secondary.

---

## 1. Coalesce writes across requests — the one change that matters

Currently step 10 of the old checklist and gated behind "only if still short after 1–9". It should be
first. Buffer rows from concurrent `POST /logs` requests and flush them as a single `COPY` +
commit on a short timer.

**Expected:** 10× coalescing → ~41,000 rows/sec ceiling; even partial coalescing clears the
15,000 target with room to spare.

Sketch for `LogRepository` / a new `LogWriteBuffer` provider:

```ts
type Pending = { rows: NewLog[]; resolve: () => void; reject: (e: unknown) => void };

private pending: Pending[] = [];
private pendingRows = 0;
private timer: NodeJS.Timeout | null = null;

enqueue(rows: readonly NewLog[]): Promise<void> {
  return new Promise((resolve, reject) => {
    this.pending.push({ rows: [...rows], resolve, reject });
    this.pendingRows += rows.length;
    if (this.pendingRows >= MAX_ROWS) void this.flush();          // size trigger
    else this.timer ??= setTimeout(() => void this.flush(), FLUSH_MS);
  });
}

private async flush(): Promise<void> {
  const batch = this.pending; this.pending = []; this.pendingRows = 0;
  if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  if (batch.length === 0) return;
  try {
    await this.copyIn(batch.flatMap((p) => p.rows));   // ONE copy, ONE commit
    for (const p of batch) p.resolve();                // resolve only AFTER commit
  } catch (error) {
    for (const p of batch) p.reject(error);            // never fake a 200
  }
}
```

Start with `FLUSH_MS = 20` and `MAX_ROWS = 2000`, then sweep both.

**Non-negotiable correctness rules:**

- **Resolve each request's promise only after the COPY has committed.** The spec is explicit:
  "Never respond `200` to a batch you have not durably accepted." The `resolve()` calls above sit
  after the `await`, and the `catch` rejects every request in the batch — no request may be told
  its rows landed when they did not.
- Per-entry validation still happens per request *before* enqueueing, so the `accepted` /
  `rejected[]` response shape and partial-batch semantics are untouched.
- **Bound the buffer.** The app container is capped at 256 MB (currently peaking ~99 MB). Flush on
  size as well as time so a traffic spike cannot grow the queue without limit.
- A 20 ms window is irrelevant to the 20 s visibility requirement (current drain: 11.7 s).
- Flush any remaining buffer on shutdown (`OnApplicationShutdown`).

**Risk:** one failing row fails the whole coalesced batch. Since every row is already Zod-validated
before enqueueing, a COPY failure means an infrastructure problem, where failing the group is
correct. If this proves flaky, fall back to re-running the failed group as individual COPYs.

---

## 2. Slim the row — measured −33% on the real COPY path

Measured with `COPY` from a file, 300,000 rows, current schema vs a slimmed one:

| Variant | 300k rows | µs/row | vs today |
|---|---|---|---|
| Current schema, CSV COPY (**today**) | 3,401 ms | 11.3 | — |
| Current schema, binary COPY | 2,974 ms | 9.9 | −12.6% |
| **Slim schema, CSV COPY** | 2,260 ms | 7.5 | **−33.5%** |
| Slim schema, binary COPY | 1,965 ms | 6.6 | **−42.2%** |

Storage for the same 300k rows: **132 MB → 93 MB (−30%)**; WAL **−18%**.

Three independent changes make up "slim":

### 2a. Drop the duplicate `attributes_text` column — biggest single item

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

### 2b. Drop `idx_logs_level_timestamp_id`

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

### 2c. Drop `ingested_at`

Grepped the whole of `src/`: it is written on every row and **never read by any query** — it appears
only in the entity, the create-table migration, and the partition handoff `INSERT`. It costs 8 bytes
plus a `CURRENT_TIMESTAMP` call per row for nothing. Removing it also lets the two
`jsonb_typeof(...)` CHECK constraints go, since Zod already guarantees object-typed attributes.

---

## 3. Raise the write pool — it is still on the driver default

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

Do this **after** step 1 — coalescing changes the ideal pool size, so tuning it first would just
have to be redone. Sweep 10 / 20 / 30.

---

## 4. Binary COPY format — measured −12.6%

`log-csv-encoder.ts` builds CSV text, so PostgreSQL re-parses every timestamp, enum, and JSONB value
from strings. `FORMAT binary` sends `timestamptz` as an int64 and skips all text parsing:
**3,401 ms → 2,974 ms** on the current schema (−12.6%), and it composes with step 2 (−42% combined).

Cost: a hand-written binary encoder (or `pg-copy-streams-binary`) is fiddlier than CSV and easy to
get subtly wrong on NULLs and JSONB's leading version byte. Worth doing only after steps 1–2, and
only with a test asserting a binary-COPY round-trip is byte-identical to the CSV path.

The existing streaming setup is otherwise fine — `pg-copy-streams` already streams, and building the
~33-row payload in memory first is not a bottleneck at this size.

---

## 5. Step 6 autovacuum change — ❌ removed

Step 6 **raised** `autovacuum_vacuum_insert_scale_factor` to 0.4 and `autovacuum_analyze_scale_factor`
to 0.2, so autovacuum runs *less* often. For an insert-only table, autovacuum's main value is setting
visibility-map bits, which is what lets the aggregation run as an index-only scan.

Locally, `Heap Fetches: 0` both before and after an explicit `VACUUM`, and a 1-day aggregation ran
13.8 ms before vs 11.4 ms after — no measurable harm on current data volume.

**Portal result, 2026-08-11, against the step-4 baseline (60.07, Load 3,056 logs/sec, 4.40s):**

| Metric | Step 4 baseline | After step 6 | Δ |
|---|---|---|---|
| Score / rank | 60.07 / #4 | 60.00 / #4 | −0.07 (noise) |
| Load logs/sec | 3,055.83 | 3,000.83 | −1.8% |
| Aggregate p95 (Load) | 4.40 s | 4.43 s | flat |
| Ingestion p95 (Load) | 2.34 s | 2.34 s | flat |
| Ingestion p95 (Stress) | 615 ms | 733 ms | **+19%** |
| Ingestion p95 (Spike) | 396 ms | 284 ms | **−28%** |
| Ingestion p95 (Breakpoint) | 1.09 s | 1.02 s | −6% |
| Breakpoint timeouts | 0 | **2** | new, small |

**Verdict: removed.** Unlike step 5 (consistent double-digit-percent regressions in 3/4 scenarios),
this was a mixed, small signal — one scenario worse, two better, overall score within run-to-run
noise. Judged as "keep" first, but on reflection it wasn't earning its keep either: no measurable
benefit to justify carrying the extra migration/`PartitionService` complexity, so it was fully
removed (still pre-release, same as step 5) rather than kept for a negligible, unproven effect.
Migration file deleted, the matching `ALTER TABLE` line removed from `PartitionService`, and the
local `typeorm_migrations` row + all partition reloptions cleaned up so tracked state matches the
migrations folder exactly (stops at `DropLogsMessageTrigramIndex1785684350117`). Verified live:
0 tuned partitions, a freshly recreated partition confirmed untuned, lint/build clean, all
endpoints re-checked.

---

## 6. Read-path efficiency (small, safe)

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
| **More read-pool connections** | Aggregation is starved of **CPU**, not connections. PostgreSQL has 1 core and is ~80–100% busy; a standalone aggregation is 11–189 ms vs the 4.40 s observed. Adding connections adds contention, not capacity. Fix batching instead. |
| **Per-minute rollup tables** | Measured: at this data density a 1-minute rollup grouped by (service, level) produced **287,286 rows from 300,000** — essentially no compression, since there is roughly one row per (minute, service, level) at ~1M rows/month. Only 1h/1d rollups would compress, and the spec requires 1m and 5m buckets too. Revisit only if aggregation is still slow after batching is fixed. |
| **`gin_pending_list_limit` tuning** | Tried and reverted — made ingestion p95 *worse* in 3 of 4 scenarios (Spike +30%). |
| **Dropping `idx_logs_attributes_text_gin`** | Measured: only ~1.5 µs/row to maintain, but gives a **22× read speedup** for `attr.<key>` (1.7 ms vs 37.4 ms). Keep it. |
| **Bigger `work_mem` for aggregation** | Full-range aggregation spills to disk (external merge, 8.4 MB) at `work_mem=8MB`. Raising it to 64 MB only moved 189 ms → 166 ms, and risks OOM on a 1 GB container against 40 connections. Not worth it. |

Also note `q` (`ILIKE '%…%'`) now runs without the trigram index: **37 ms** for a 1-day range
(PK bitmap scan), **144 ms** for an unbounded 30-day scan over 300k rows. Acceptable, and it scales
with the time range — but it is worth confirming the generator always sends `since`/`until` with `q`.

---

## Do not do

- `synchronous_commit = off` or `UNLOGGED` tables — both break the durability the spec requires.
  Coalescing (step 1) gets the same fsync reduction *without* lying about durability.
- Raise container CPU/memory limits — fixed by the spec.
- Add Redis or a queue in front of PostgreSQL — the spec requires PostgreSQL as the sole source of truth.
- Shed load with 429/503 — currently 0 dropped and 0% errors; shed requests count as not ingested.
- Node.js clustering or worker threads — the app averages ~11% CPU and is not the bottleneck; the cap
  is a cgroup quota, not a core count.

---

## Suggested order

1. **Write coalescing** (§1) — the only change that moves both headline numbers.
2. **Slim the row** (§2) — drop `attributes_text`, the `level` index, and `ingested_at`. −33% measured.
3. **Explicit write pool** (§3) — sweep after coalescing changes the shape of the load.
4. **Binary COPY** (§4) — a further −12.6%, once the bigger items are in.
5. Re-check autovacuum (§5) and read-path trims (§6).

Re-submit to the portal after each step, keep only what measurably helps, and re-verify
Reliability / Correctness (35 of the current 60 points) every time.
