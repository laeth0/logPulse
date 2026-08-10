# Performance Improvement Suggestions

Suggestions for improving logPulse performance under the constraints in [docs/Final_Project.md](docs/Final_Project.md), grounded in the **current** implementation, in settings read from the **actually running** container ([Appendix A](#appendix-a--measured-current-postgresql-settings)), and in a **real external benchmark run** ([Appendix B](#appendix-b--raw-benchmark-results)).

> **Status: the system currently fails its two headline performance targets.** External benchmark score **59.28 / 100**, rank #5. Reliability (20/20) and correctness (15/15) are perfect — the losses are entirely in Performance (18.28/50) and Queries (6/15).

| Target | Requirement | Measured | Verdict |
| --- | --- | --- | --- |
| Ingestion | ≥15,000 logs/sec sustained | **2,457 logs/sec** | ❌ **16% of target** |
| Aggregation | `GET /logs/aggregate` p95 < 1 s | **3.97 s** | ❌ **4× over** |
| Visibility | Queryable within 20 s | 18.30 s drain | ⚠️ **passes with 1.7 s margin** |
| Durability / correctness | No drops, no crashes, correct results | 0 rejected, 0 errors, 75/75 checks | ✅ **perfect — protect this** |
| Resources | App 0.5 CPU / 256 MB · PG 1 CPU / 1 GB | App peaked 90 MB · PG peaked 605 MB | ✅ within limits |

---

## Part 0 — What the benchmark actually proved

Four scenarios were run (Load, Stress, Spike, Breakpoint). Full numbers in [Appendix B](#appendix-b--raw-benchmark-results). Five findings dominate everything else in this document.

### Finding 1 — PostgreSQL is saturated; the application is nearly idle

| | App container | PostgreSQL container |
| --- | --- | --- |
| CPU (max) | 34.91% | **100.60%** |
| CPU (avg) | 9.69% | **75.56%** |
| Memory (max) | 90.73 MiB / 256 MB | 325.90 MiB / 1 GB |

Percentages are relative to one full core (PostgreSQL exceeding 100% confirms the scale). The app's ceiling is 0.5 CPU = 50% on this scale, so it peaked at ~70% of its own quota but averaged only ~19%. PostgreSQL hit its 1.0 CPU ceiling exactly.

**Every application-layer micro-optimization is therefore near-worthless right now.** The database is the wall.

### Finding 2 — ~400 µs of database CPU per ingested row

This is the most important number in the document.

```
1 CPU core, saturated  ÷  2,457 rows/sec  ≈  400 µs of CPU per row
```

A heap insert plus two B-tree index updates costs **single-digit microseconds**. Concurrent aggregation queries (1/sec) account for a small percentage at most. So roughly **98% of the database's CPU is being spent on something other than the base insert.**

The schema maintains **five indexes on every partition**, all updated on every inserted row:

| Index | Type | Entries written per row |
| --- | --- | --- |
| `pk_logs` (timestamp, id) | B-tree | 1 |
| `idx_logs_service_timestamp_id` | B-tree | 1 |
| `idx_logs_level_timestamp_id` | B-tree | 1 |
| `idx_logs_attributes_text_gin` | GIN `jsonb_path_ops` | ~1 per attribute (≈3–6) |
| `idx_logs_message_trigram` | GIN `gin_trgm_ops` | **≈1 per character of `message`** |

`gin_trgm_ops` decomposes each message into overlapping 3-character trigrams. A 100-character message produces **~100 index entries**. At the 15,000 logs/sec target that is **~1.5 million GIN entries per second** on a single core — not achievable.

**The trigram index on `message` is the prime suspect for the entire throughput gap.** See item 1.1.

### Finding 3 — Throughput *degrades* as load and table size increase

Scenarios ran in sequence against a growing table:

| Scenario (in run order) | Offered load | Achieved | Cumulative rows | PG memory (max) |
| --- | --- | --- | --- | --- |
| Load | 15,000/s | **2,457/s** | ~295 K | 325.90 MiB |
| Stress | 15,000 → 30,000/s | **1,171/s** | ~470 K | 412.80 MiB |
| Spike | 7,500 → 30,000/s | **1,030/s** | ~573 K | 450.10 MiB |
| Breakpoint | 15,000 → 45,000/s | **831/s** | ~673 K | 604.80 MiB |

Offering *more* load produced *less* throughput, and PostgreSQL memory climbed steadily. This is the signature of a working set outgrowing `shared_buffers` (currently **128 MB**): as indexes grow, each insert touches more uncached pages.

This matters enormously for grading, because **the graded scenario is ~1,000,000 rows** — 50% larger than the worst point measured here. Expect further degradation, not stability.

### Finding 4 — Aggregation latency is queueing, not query cost

| Scenario | Overall latency p95 | Aggregate p95 | Gap |
| --- | --- | --- | --- |
| Load | 3.78 s | 3.97 s | 0.19 s |
| Stress | 9.11 s | 9.71 s | 0.60 s |
| Spike | 4.09 s | 4.40 s | 0.31 s |
| Breakpoint | 14.71 s | 16.13 s | 1.42 s |

Aggregate p95 tracks *overall* p95 almost exactly across every scenario. Ad hoc sequential measurement of the same query was **~30 ms**. The query is not slow — it is **waiting in line**.

Two queues are responsible:

1. **The shared connection pool.** TypeORM sets no pool size, so the `pg` driver default of **max 10** applies. Aggregation requests compete for the same 10 connections as thousands of queued ingestion requests.
2. **The saturated CPU.** Even once a connection is obtained, the query competes with ingestion for a fully-consumed core.

**Consequence:** fixing ingestion throughput will improve aggregation p95 for free. But item 1.3 (isolating the read path) can recover much of the Queries score *independently* — this is the cheapest available win against the 6/15 Queries score.

### Finding 5 — The batch size is small, and the queue is deep

Consistent across all four scenarios:

```
294,900 logs ÷ 8,850 requests  =  33.3 logs per request
8,850 requests ÷ 120 s         =  73.75 requests/sec
```

The load generator sends **~33 logs per HTTP request** — not the large batches earlier local testing assumed. To reach 15,000 logs/sec the service must serve **~450 requests/sec**, roughly **6× the current rate**.

The 18.30 s drain time implies roughly **45,000 logs (~1,350 requests) still in flight** when the load stopped. The service is heavily over-subscribed and requests are queueing deeply — which is exactly why p95 latency is measured in seconds while zero requests fail.

> ⚠️ **This invalidates the earlier "~20,400 logs/sec" local figure**, which was produced by a throwaway script using large batches with no concurrent query load. Treat the external benchmark as the only credible measurement. Do not reuse the old number.

---

## Part 1 — Pre-flight checks

Several checks from the earlier revision of this document are **now answered by the benchmark**. They are kept below with their verdicts so the reasoning is auditable, and so they can be re-run after changes.

### ✅ Answered — Check A: Which side is the bottleneck?

**Answer: PostgreSQL, decisively.** DB at 100% CPU, app averaging 9.69%. Prioritize Tier 1; deprioritize all app-layer CPU work.

### ✅ Answered — Check B: Is the app near its 256 MB memory ceiling?

**Answer: No.** Peak 91.06 MiB across all four scenarios — about 35% of the limit, with no OOM kills.

This **downgrades** the previously-flagged risk in item 3.4 (`encodeLogsAsCsv()` materializing the whole CSV). At ~33 logs/request the strings are tiny. It remains a latent risk only if batch sizes grow dramatically; it is not a current problem.

### ✅ Answered — Check C: Are requests being dropped or erroring?

**Answer: No.** 0 rejected logs, 0% HTTP error rate, POST status min = max = 200, 75/75 correctness checks passed, 0 missing records.

**This is worth 35 of the 100 points and is currently perfect. Do not regress it.** Any change in Part 2 must be re-validated against correctness before being kept.

### ⚠️ Answered with a warning — Check D: Is the 20-second visibility budget safe?

**Answer: Barely.** Drain was **18.30 s** against a **20 s** limit — 91.5% of budget consumed, 1.7 s of margin.

This is a direct consequence of queue depth (Finding 5), not of the storage path. A longer run or a slightly slower host would fail it. Improving throughput shrinks the queue and fixes this automatically.

---

The following remain **unanswered** and should be run before/while applying Part 2.

### Check 1 — Confirm partition pruning is working

If pruning is broken, every query scans all partitions and no tuning will save you.

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT date_bin(CAST('5 minutes' AS interval), log.timestamp,
                TIMESTAMPTZ '1970-01-01 00:00:00+00') AS start,
       log.service AS "group", COUNT(*) AS count
FROM logs log
WHERE log.timestamp >= now() - interval '1 day'
  AND log.timestamp <  now()
GROUP BY 1, 2
ORDER BY 1 ASC;
```

**Pass criteria:** the plan touches only partitions covering the requested range — look for `Subplans Removed: N` or a short partition list, not a scan of every `logs_2026_xx_xx`.

### Check 2 — Measure the actual size of each index

This directly tests Finding 2. Run at realistic scale.

```sql
SELECT indexrelname,
       pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
       idx_scan AS times_used
FROM pg_stat_user_indexes
WHERE relname LIKE 'logs%'
ORDER BY pg_relation_size(indexrelid) DESC;
```

**What to look for:** if `idx_logs_message_trigram` is comparable to or larger than the table itself, Finding 2 is confirmed. `idx_scan` also tells you whether each index is ever actually *used* by queries — an index with a large size and near-zero scans is pure cost.

### Check 3 — Confirm the aggregation isn't spilling to disk

`work_mem` is **4 MB** (default). A `GROUP BY` over 1M rows can exceed that and spill.

```sql
-- In EXPLAIN (ANALYZE) output, look for:
--   "Sort Method: external merge  Disk: NNNNkB"          <- BAD, spilling
--   "Sort Method: quicksort  Memory: NNNkB"              <- GOOD
--   "Batches: 4 ... Disk Usage: ..." on HashAggregate    <- BAD
```

### Check 4 — Confirm JIT isn't adding latency

`jit` is **on**, `jit_above_cost` is **100000**. Aggregations over 1M rows can exceed that, triggering LLVM compilation on every query.

```sql
-- In EXPLAIN (ANALYZE) output, look for a "JIT:" section:
--   JIT:
--     Functions: 12
--     Timing: Generation 3.2ms, Inlining 15.1ms, Optimization 88.3ms, Emission 45.2ms
```

Any non-trivial Optimization/Emission time is pure overhead here. See item 2.6.

### Check 5 — Confirm checkpoints aren't thrashing

```bash
docker compose logs database | grep -iE "checkpoint|too frequently"
```

**Fail signal:** `checkpoints are occurring too frequently (N seconds apart)` — PostgreSQL explicitly telling you to raise `max_wal_size` (item 2.5).

### Check 6 — Confirm `logs_default` is not accumulating rows

Rows landing in the catch-all partition silently destroy pruning and force retention into row-level `DELETE`s.

```sql
SELECT count(*) FROM logs_default;
SELECT count(*) FROM pg_inherits WHERE inhparent = 'public.logs'::regclass;
```

**Pass criteria:** `logs_default` count is **0** (verified 0 locally at time of writing).

### Check 7 — Enable `pg_stat_statements` to stop guessing

`shared_preload_libraries` is currently **empty**, so you are tuning blind.

```yaml
# docker-compose.yml, database service:
command: postgres -c shared_preload_libraries=pg_stat_statements
```

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
-- after a benchmark run:
SELECT calls, round(mean_exec_time::numeric, 2) AS avg_ms,
       round(total_exec_time::numeric, 2) AS total_ms, query
FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 15;
```

### Check 8 — Watch PostgreSQL memory when raising `shared_buffers`

PostgreSQL memory already reached **604.80 MiB of its 1 GB limit** in the Breakpoint scenario, and the graded dataset is larger. Raising `shared_buffers` from 128 MB to 256 MB adds real committed memory.

```bash
docker stats --no-stream logpulse-database-1
docker inspect logpulse-database-1 --format '{{.State.OOMKilled}}'   # must stay false
```

**An OOM-killed database would turn a perfect 20/20 Reliability score into a zero.** Pair any `shared_buffers` increase with the `max_connections` reduction in item 2.4, and verify under the Breakpoint scenario specifically.

---

## Part 2 — Suggestions, ranked by measured impact

> Ranking changed substantially from the previous revision. Items now sit where the benchmark evidence puts them, not where intuition did.

### Tier 1 — Attack per-row database cost (this is where the 6× gap lives)

#### 1.1 — Measure, then almost certainly remove or replace the trigram index ⭐ **highest expected impact**

**The evidence:** ~400 µs of CPU per row (Finding 2), and `gin_trgm_ops` writes roughly one index entry per character of `message`.

**Step 1 — quantify it.** On a scratch copy of the database, not production:

```sql
-- Baseline: run the ingestion benchmark, record logs/sec.
DROP INDEX idx_logs_message_trigram;
-- Re-run the identical benchmark. The delta is the index's true write cost.
```

**Step 2 — decide.** If removing it produces a large throughput jump, evaluate this trade honestly:

- `q` (case-insensitive substring search on `message`) is **required** functionality — it must keep working.
- But **it does not need this index to work acceptably.** At ~1M rows across ~30 daily partitions, each partition holds roughly **33,000 rows**. A query with a `since`/`until` range prunes to a handful of partitions, and an `ILIKE '%term%'` sequential scan over tens of thousands of rows completes in **single-digit to low tens of milliseconds** — comfortably inside the 1-second budget.

In other words: this index may be costing an enormous share of ingestion throughput to accelerate a query that is already fast enough without it. That is a bad trade under this spec, where ingestion is the failing target.

**Options, in preference order:**

| Option | Effect on ingestion | Effect on `q` queries | Notes |
| --- | --- | --- | --- |
| Drop the index entirely | Largest gain | Seq scan within pruned partitions | Simplest. Verify `q` latency at 1M rows first. |
| Keep it, tune `fastupdate` (item 3.2) | Partial gain | Unchanged | Try if the drop proves unnecessary. |
| Index only recent partitions | Gain on older data only | Unchanged | Complex; partitioned indexes are per-partition, so this is possible but adds moving parts. |

**Whichever you choose, document the reasoning in the README.** The spec explicitly asks for bottlenecks discovered and trade-offs made — "we measured the trigram index at N% of ingestion CPU and removed it because partition-pruned sequential scan meets the query target" is exactly the kind of evidence being graded.

#### 1.2 — Measure the `attributes_text` GIN index the same way

Cheaper than trigrams (roughly one entry per attribute, so ~3–6 per row rather than ~100), but still real. Same method: drop on a scratch copy, re-benchmark, measure the delta.

Unlike `q`, `attr.<key>` equality filtering has **no cheap fallback** other than a scan over pruned partitions — which, per the arithmetic in 1.1, is likely also acceptable. Measure before deciding, and treat this as a lower priority than 1.1.

#### 1.3 — Isolate the read path from the ingestion queue ⭐ **cheapest win on the Queries score**

**The evidence:** Finding 4 — aggregation latency tracks overall latency almost exactly. Queries are stuck behind ingestion in a shared pool of 10 connections.

Give reads their own connection budget so an aggregation request never waits behind thousands of queued writes. Two viable approaches:

- **A second TypeORM `DataSource`** dedicated to read queries, with its own small pool (e.g. 3–5 connections), pointed at the same database. Ingestion keeps the main pool.
- **An application-level semaphore** that reserves a slice of the existing pool for reads.

The first is cleaner and easier to reason about. Both are strictly additive — no endpoint contract changes.

**Expected impact:** with 1 aggregation request/sec against a dedicated connection, the query executes in roughly its true cost (~30 ms measured) plus CPU contention, instead of ~4 s of queueing. This targets the **6/15 Queries score directly** and is independent of the ingestion work in 1.1.

#### 1.4 — Raise `shared_buffers` to keep the index working set cached

**The evidence:** Finding 3 — throughput fell steadily as the table grew and PostgreSQL memory climbed, the classic signature of a working set outgrowing a **128 MB** buffer pool.

Covered in the config block in item 2.1. Called out separately here because the benchmark gives it specific justification rather than generic "tune your database" reasoning. **Read Check 8 first** — this interacts with the 1 GB container limit.

---

### Tier 2 — PostgreSQL configuration (high value, low risk, no code)

PostgreSQL is running on **stock defaults sized for a much larger machine**. The container is capped at 1 CPU / 1 GB and PostgreSQL has no idea. The most glaring case: `effective_cache_size` is **4 GB** on a **1 GB** container — the planner believes it has 4× the memory that physically exists.

#### 2.1 — Apply a container-appropriate configuration

Keep it visible in `docker-compose.yml` rather than a mounted file — easier for a reviewer to audit.

```yaml
  database:
    image: postgres:16-alpine
    command:
      - postgres
      # --- Memory ---
      - -c
      - shared_buffers=256MB              # was 128MB; see Finding 3 and Check 8
      - -c
      - effective_cache_size=640MB        # was 4GB (!) — planner was badly misinformed
      - -c
      - work_mem=8MB                      # was 4MB; prevents GROUP BY disk spills
      - -c
      - maintenance_work_mem=128MB        # was 64MB; faster per-partition index builds
      # --- Connections (each backend costs memory; 1 CPU needs far fewer) ---
      - -c
      - max_connections=40                # was 100
      # --- WAL / checkpoints (COPY is WAL-heavy) ---
      - -c
      - max_wal_size=2GB
      - -c
      - min_wal_size=512MB
      - -c
      - wal_buffers=16MB                  # was 4MB
      - -c
      - checkpoint_timeout=15min          # was 5min
      # --- Group commit: batches fsyncs across concurrent txns, keeps durability ---
      - -c
      - commit_delay=2000
      - -c
      - commit_siblings=5
      # --- Planner: assume SSD, not spinning rust ---
      - -c
      - random_page_cost=1.1              # was 4
      - -c
      - effective_io_concurrency=200      # was 1
      # --- Remove pure overhead on a 1-CPU container ---
      - -c
      - jit=off
      - -c
      - max_parallel_workers_per_gather=0
```

#### Item-by-item rationale

| # | Setting | Current | Suggested | Why it matters *here* |
| --- | --- | --- | --- | --- |
| 2.2 | `effective_cache_size` | **4 GB** | 640 MB | Planner thinks it has 4× the real memory. Pure misinformation → wrong plan choices. Costs nothing to fix. |
| 2.3 | `shared_buffers` | 128 MB | 256 MB | Directly targets Finding 3 — the degradation as indexes outgrow the buffer pool. **Verify against Check 8.** |
| 2.4 | `max_connections` | 100 | 40 | Every backend reserves memory. On 1 CPU you cannot usefully serve 100 concurrent queries; the app pool is 10. Frees memory for `shared_buffers`/`work_mem` and offsets 2.3. |
| 2.5 | `max_wal_size` / `checkpoint_timeout` | 1 GB / 5 min | 2 GB / 15 min | `COPY` produces WAL fast. Frequent checkpoints = periodic I/O stalls = the throughput dips visible in the benchmark graphs. Confirm via Check 5. |
| 2.6 | `jit` | **on** | off | LLVM compilation per aggregation query, likely triggered above `jit_above_cost=100000`, typically adds 50–200 ms for no gain on queries this short. Confirm via Check 4. |
| 2.7 | `max_parallel_workers_per_gather` | **2** | 0 | Parallel workers on a **1 CPU** container don't add compute — they compete for the same core and add coordination overhead. Strictly harmful here. |
| 2.8 | `work_mem` | 4 MB | 8 MB | The aggregation `GROUP BY` is p95-critical; spilling to disk is a latency cliff. Worst case ≈ `work_mem × concurrent sort/hash nodes`, so raising this while lowering `max_connections` (2.4) keeps the bound safe. |
| 2.9 | `random_page_cost` / `effective_io_concurrency` | 4 / 1 | 1.1 / 200 | Defaults model a spinning disk. On SSD/NVMe, `random_page_cost=4` biases the planner *away* from index scans it should choose. |
| 2.10 | `commit_delay` / `commit_siblings` | 0 / 5 | 2000 / 5 | **Group commit.** With ~74 small transactions/sec and deep concurrency, batching WAL fsyncs is a real throughput win **with durability fully preserved** — strictly better than `synchronous_commit=off` (see Part 3). |

**Expected impact:** moderate-to-large on aggregation latency (2.2, 2.6, 2.7) and moderate on ingestion (2.3, 2.5, 2.10). Highest value per unit of effort after Tier 1, and zero code risk.

---

### Tier 3 — Measure, then decide

#### 3.1 — Tune autovacuum for an insert-only table

PostgreSQL 13+ triggers vacuums on insert-heavy tables via `autovacuum_vacuum_insert_threshold` (default 1000) and `autovacuum_vacuum_insert_scale_factor` (default 0.2). On rapidly-growing partitions this fires repeatedly, and **every autovacuum worker steals CPU from a core that is already at 100%**.

```sql
ALTER TABLE logs SET (
  autovacuum_vacuum_insert_scale_factor = 0.4,
  autovacuum_analyze_scale_factor = 0.2
);
```

Logs are append-only and never updated or deleted (retention drops whole partitions), so there are no dead tuples to reclaim — only `ANALYZE` for statistics genuinely matters. Do not disable autovacuum entirely: the planner needs current statistics, and stale stats would hurt aggregation latency.

#### 3.2 — Tune GIN `fastupdate` / `gin_pending_list_limit`

Only relevant if you keep the GIN indexes after item 1.1. `fastupdate` (on by default) buffers new entries in an unsorted pending list — cheap inserts, slower reads until it flushes, and the flush itself is a latency spike.

```sql
ALTER INDEX idx_logs_attributes_text_gin SET (gin_pending_list_limit = '8MB');
```

Larger limit = better ingestion throughput, bigger and rarer flush spikes, slower reads between flushes. Ingestion is the harder target, so a larger pending list is likely right — but it trades directly against query latency, so measure both.

#### 3.3 — Increase the identity sequence cache

`id` is `BIGINT GENERATED ALWAYS AS IDENTITY`, so every row calls `nextval`. The default cache of 1 means lock acquisition per call and periodic WAL logging of sequence advances.

```sql
ALTER TABLE logs ALTER COLUMN id SET GENERATED ALWAYS
  SET (CACHE 1000);   -- verify exact syntax against your PG version
```

A minor win individually, but essentially free and it compounds at 15,000 rows/sec. Note the trade-off: larger caches produce gaps in the ID sequence after a restart. Since `id` is only a pagination tie-breaker and carries no business meaning, gaps are harmless here.

#### 3.4 — Tune the connection pool explicitly

`createDatabaseOptions()` sets no pool size, so the `pg` driver default (**max 10**) applies implicitly.

```typescript
// src/config/database.config.ts
extra: {
  max: Number(process.env.DB_POOL_MAX ?? 20),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
},
```

**Important caveat given the benchmark:** the database is already at 100% CPU, so *more* connections will not create throughput out of nothing — beyond the DB's usable parallelism they add contention and memory. Do this **after** Tier 1 has reduced per-row cost, then sweep 10 / 20 / 30 and keep the winner. This pairs naturally with item 1.3.

#### 3.5 — Reconsider dual JSONB storage (only if measurably I/O-bound)

Every log stores attributes **twice** (`attributes` typed + `attributes_text` stringified), roughly doubling attribute write volume and WAL.

This was a deliberate, well-reasoned trade (see [README](README.md#attribute-storage-strategy)) — precompute once at write, index it, avoid per-row casting at read time. **Do not undo it casually.** The benchmark shows the database is **CPU**-bound, not I/O-bound, so this is unlikely to be the dominant cost. Revisit only if measurements specifically implicate attribute write volume. The alternative (casting at query time) moves cost onto the p95-critical read path, which is likely worse.

#### 3.6 — `wal_compression`

Trades CPU for I/O volume. Since the database is **CPU**-bound (Finding 1), this will probably **hurt**. Listed only for completeness — test, never assume.

---

### Tier 4 — Application layer (confirmed low value)

The benchmark measured the app at **9.69% average CPU** and **91 MiB peak memory**. These items are documented for completeness, but optimizing an idle container will not move any score.

#### 4.1 — Write coalescing / micro-batching

Accumulate entries across concurrent requests for a short window (e.g. 20–50 ms) and issue one larger `COPY`, then resolve all waiting requests together.

**Honest assessment given the evidence:** coalescing reduces **per-transaction** cost, but Finding 2 shows the cost is overwhelmingly **per-row** (index maintenance). Merging 10 requests into one `COPY` still writes the same number of index entries. Expect a modest gain, not a 6× one — pursue Tier 1 first.

- **Critical constraint if you do build it:** each HTTP response must still be sent **only after** its rows are durably committed. The spec is explicit: *"Never respond 200 to a batch you have not durably accepted."* Getting this wrong fails a correctness requirement worth 15 points that is currently perfect.
- **Cost:** added per-request latency and real error-handling complexity — one bad row must not fail unrelated requests' entries.

#### 4.2 — Avoid entity hydration on the read path

`LogRepository.findPage()` uses `getMany()`, which makes TypeORM instantiate a `Log` entity per row. At `limit=1000` that is 1000 entity constructions per request.

Switching to `getRawMany()` plus the existing mapper avoids that. **Caveat:** raw results skip TypeORM's type transformation, so `timestamp` and `attributes` must be mapped explicitly — verify the response is byte-identical before and after, since the API contract is graded at 15/15 today.

#### 4.3 — Micro-optimize the per-entry hot path

`mapLogEntryToNewLog()` builds `attributes_text` via `Object.fromEntries(Object.entries(...).map(...))` — three allocations per log — and per-entry Zod `safeParse` has real cost at high rates.

**Do not do this now.** At 9.69% average CPU the app has ample headroom. Revisit only if Tier 1 succeeds so completely that the app becomes the new bottleneck — and then profile with `node --cpu-prof` rather than guessing.

#### 4.4 — Consider the Fastify adapter

Lower HTTP-layer overhead than Express, but the app is not CPU-bound, and it requires reworking `useBodyParser` and re-verifying the malformed-JSON → `400` behavior that `GlobalExceptionFilter` depends on. **Not justified by the current evidence.**

#### 4.5 — Stream the COPY payload instead of materializing it

`encodeLogsAsCsv()` joins all rows into one large string before `copyStream.end()`. **Measured as a non-issue** — peak app memory was 91 MiB of 256 MB at ~33 logs/request. Keep this in mind only if batch sizes ever grow by an order of magnitude.

---

### Not now — Pre-aggregated rollup tables

An explicit stretch goal in the spec: maintain per-minute rollups so `GET /logs/aggregate` reads a small summary table instead of scanning raw logs.

**Do not build this yet.** Finding 4 proves aggregation is slow because of *queueing*, not query cost — the underlying query runs in ~30 ms. Rollups would add write cost to the **ingestion** path, which is the failing target, to fix a read problem that item 1.3 addresses far more cheaply. Revisit only if aggregation is still slow after ingestion throughput is fixed and reads are isolated.

---

## Part 3 — Things NOT to do

Each of these is a plausible-sounding instinct that the benchmark data specifically rules out.

| Idea | Why not |
| --- | --- |
| **Node.js `cluster` / `worker_threads` to "use more cores"** | The app averaged **9.69% CPU**. It is not the bottleneck. Worse, its 0.5 CPU is a **cgroup quota**, not a core count — extra processes add context-switching and memory overhead inside a 256 MB limit without adding compute. |
| **Optimizing application code** | Same reason. Measured idle. Every hour spent here is an hour not spent on the database. |
| **`synchronous_commit = off`** | Genuinely faster, but acknowledges commits before WAL reaches disk — a crash can lose already-`200`-ed batches. Directly contradicts *"Never respond 200 to a batch you have not durably accepted."* Use `commit_delay` group commit (item 2.10) instead: similar benefit, durability intact. |
| **`UNLOGGED` tables** | Much faster writes, but data is **lost on crash** and the table is truncated on unclean shutdown. Disqualifying for a system whose durability is graded — and Reliability is currently a perfect 20/20. |
| **Raising container CPU/memory limits** | Fixed by the spec (0.5/256 MB and 1/1 GB). Tuning *within* them is the entire exercise. |
| **Raising the connection pool size as a first move** | The database is already at **100% CPU**. More connections cannot manufacture throughput; they add contention and memory. Reduce per-row cost first (Tier 1), then tune the pool (item 3.4). |
| **Adding Redis / a queue in front of PostgreSQL** | The spec requires *"PostgreSQL remains the source of truth for both reads and writes."* A write-buffering queue also risks acknowledging batches before durable storage. |
| **Rejecting load with 429/503 to improve latency** | Would trade a perfect Reliability score for a marginal latency gain. The system currently drops **nothing** — protect that. |
| **Applying everything at once and declaring victory** | You won't know which change helped, and one may have regressed correctness. See Part 4. |

---

## Part 4 — Change protocol

1. **Re-run the external benchmark as your measurement.** It is now the authoritative baseline — 59.28/100, 2,457 logs/sec, 3.97 s aggregate p95. A local script that reports 20,000 logs/sec is measuring the wrong thing (Finding 5).
2. **Seed to ~1M rows before measuring locally.** Query plans and index behavior at 10k rows tell you nothing about 1M — and Finding 3 shows this system specifically degrades with size.
3. **Change one thing at a time.** Batching changes makes attribution impossible.
4. **Re-measure against the same scenario** and compare directly.
5. **Keep it only if it measurably helped.** Revert otherwise — complexity without benefit is a net loss, and code quality is graded.
6. **Re-validate correctness after every change**, because 35 of the current 59 points come from Reliability and Correctness:
   ```bash
   npm run lint && npm run build
   docker compose up -d --build
   curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/health
   ```
   The CI `smoke` job in [.github/workflows/ci.yml](.github/workflows/ci.yml) covers the endpoint contract — make sure it still passes.
7. **Record the result in the README** ([Performance](README.md#performance) section). The spec asks for bottlenecks discovered and optimizations applied. A documented change that *didn't* help is still evidence you measured rather than assumed — and the trigram-index analysis in item 1.1 is exactly the kind of reasoning worth writing up.

### Suggested order of work

| Order | Action | Targets | Effort |
| --- | --- | --- | --- |
| 1 | Item 1.1 — measure and likely drop `idx_logs_message_trigram` | Ingestion (Performance 18.28/50) | Low |
| 2 | Item 2.1 — apply the PostgreSQL configuration block | Both | Low |
| 3 | Item 1.3 — isolate the read connection pool | Aggregation (Queries 6/15) | Medium |
| 4 | Item 1.2 — measure the `attributes_text` GIN index | Ingestion | Low |
| 5 | Items 3.1–3.4 — autovacuum, GIN tuning, sequence cache, pool sweep | Ingestion | Medium |
| 6 | Item 4.1 — write coalescing, *only if* still short of target | Ingestion | High |

Items 1 and 2 together are low-effort, low-risk, and target the largest measured gap. Start there.

---

## Appendix A — Measured current PostgreSQL settings

Read from the running `logpulse-database-1` container (PostgreSQL 16.14 on Alpine). `source = default` means nothing in this project has tuned it.

| Setting | Current value | Source | Sized for |
| --- | --- | --- | --- |
| `shared_buffers` | 128 MB | configuration file | image default |
| `effective_cache_size` | **4 GB** | default | **a 4 GB+ machine — container has 1 GB** |
| `work_mem` | 4 MB | default | generic |
| `maintenance_work_mem` | 64 MB | default | generic |
| `max_connections` | 100 | configuration file | image default |
| `synchronous_commit` | on | default | ✅ correct — keep |
| `wal_buffers` | 4 MB | default | generic |
| `max_wal_size` / `min_wal_size` | 1 GB / 80 MB | configuration file | image default |
| `checkpoint_timeout` | 5 min | default | generic |
| `checkpoint_completion_target` | 0.9 | default | ✅ already good |
| `random_page_cost` | 4 | default | **spinning disk** |
| `effective_io_concurrency` | 1 | default | **spinning disk** |
| `jit` / `jit_above_cost` | **on** / 100000 | default | large analytical workloads |
| `max_parallel_workers_per_gather` | **2** | default | **multi-core — container has 1 CPU** |
| `commit_delay` | 0 | default | no group commit |
| `wal_compression` | off | default | generic |
| `log_checkpoints` | on | default | ✅ useful for Check 5 |
| `shared_preload_libraries` | *(empty)* | default | no `pg_stat_statements` |
| `default_statistics_target` | 100 | default | generic |

**Other verified state:** `logs_default` contains **0 rows** (healthy); TypeORM sets no explicit pool size, so the `pg` driver default of **max 10** connections applies.

### Indexes maintained on every insert

| Index | Definition | Type |
| --- | --- | --- |
| `pk_logs` | `PRIMARY KEY (timestamp, id)` | B-tree |
| `idx_logs_service_timestamp_id` | `(service, timestamp DESC, id DESC)` | B-tree |
| `idx_logs_level_timestamp_id` | `(level, timestamp DESC, id DESC)` | B-tree |
| `idx_logs_attributes_text_gin` | `(attributes_text jsonb_path_ops)` | GIN |
| `idx_logs_message_trigram` | `(message gin_trgm_ops)` | GIN |

---

## Appendix B — Raw benchmark results

External load-generator submission. **Score 59.28 / 100, rank #5.**

| Category | Score |
| --- | --- |
| Performance | 18.28 / 50.00 |
| Reliability | 20.00 / 20.00 |
| Correctness | 15.00 / 15.00 |
| Queries | 6.00 / 15.00 |

### Throughput and latency

| Metric | Load | Stress | Spike | Breakpoint |
| --- | --- | --- | --- | --- |
| Configured load | 15,000/s for 120 s | 15,000 → 22,500 → 30,000/s | 7,500 → 30,000 → 7,500/s | 15,000 → 22,500 → 30,000 → 45,000/s |
| Duration | 2.00 min | 2.50 min | 1.67 min | 2.00 min |
| HTTP requests | 8.85 K | 5.27 K | 3.09 K | 2.99 K |
| Accepted logs | 294.9 K | 175.7 K | 103 K | 99.7 K |
| Rejected logs | 0 | 0 | 0 | 0 |
| **Logs per second** | **2,457.50** | **1,171.33** | **1,030.00** | **830.83** |
| Latency p95 | 3.78 s | 9.11 s | 4.09 s | 14.71 s |
| Ingestion latency p95 | 3.67 s | 8.51 s | 3.76 s | 12.59 s |
| **Aggregate p95** | **3.97 s** | **9.71 s** | **4.40 s** | **16.13 s** |
| POST success rate | 100.00% | 100.00% | 100.00% | 100.00% |
| HTTP error rate | 0.00% | 0.00% | 0.00% | 0.00% |

### Resources

| Metric | Load | Stress | Spike | Breakpoint |
| --- | --- | --- | --- | --- |
| App CPU max / avg | 34.91% / 9.69% | 14.97% / 4.55% | 11.77% / 4.19% | 13.52% / 3.02% |
| App memory max / avg | 90.73 / 71.94 MiB | 90.59 / 77.05 MiB | 90.64 / 76.10 MiB | 91.06 / 76.41 MiB |
| **PG CPU max / avg** | **100.60% / 75.56%** | **105.59% / 83.21%** | **100.66% / 75.95%** | **101.77% / 78.42%** |
| PG memory max / avg | 325.90 / 281.22 MiB | 412.80 / 362.39 MiB | 450.10 / 412.13 MiB | 604.80 / 484.64 MiB |

CPU percentages are relative to one full core: the app's 0.5 CPU limit is 50% on this scale, PostgreSQL's 1 CPU limit is 100%.

### Eventual consistency

| Metric | Load | Stress | Spike | Breakpoint |
| --- | --- | --- | --- | --- |
| Passed | ✅ true | ✅ true | ✅ true | ✅ true |
| Accepted / visible records | 294.9 K / 294.9 K | 175.7 K / 175.7 K | 103 K / 103 K | 99.7 K / 99.7 K |
| Missing records | 0 | 0 | 0 | 0 |
| **Drain time** | **18.30 s** | 9.08 s | 3.23 s | 6.59 s |
| Read-after-write success rate | 0.03% | 0.06% | 0.10% | 0.10% |
| Timeout count | 0 | 0 | 0 | 0 |

**Reading the eventual-consistency block:** every log was eventually visible and none were lost — the storage path is correct. The near-zero read-after-write rate and the 18.30 s drain are **latency** symptoms, not correctness ones: reads issued immediately after a write were themselves queued for seconds. Both improve automatically as throughput improves.

**Correctness checks: 75 / 75 passed.**
