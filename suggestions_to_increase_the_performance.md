# Performance Improvement Steps

Implementation checklist, in priority order. After each step: re-run `npm run lint && npm run build`, `docker compose up -d --build`, confirm all 4 endpoints still return correct responses, then re-benchmark and keep the change only if it measurably helped.

---

## 1. Drop the trigram index on `message` — ✅ Done

- [x] Migration `src/migrations/1785684350117-DropLogsMessageTrigramIndex.ts` drops `idx_logs_message_trigram`.
- [x] `projectSchema.dbml` updated.
- [x] Verified live: index gone, `q` search still correct, all endpoints 200.
- [x] Re-submitted 2026-08-11: 57.97/100 rank #5 (was 59.28). Load throughput 2,601.67 logs/sec, up from 2,457 (+5.9%) — small confirmed gain, still 17% of the 15,000 target. Aggregate p95 4.20s, still ~4× over target. Queries sub-score dropped 6→4.50 (run-to-run noise or aggregate p95 regression, not yet isolated). New finding: Breakpoint scenario (45,000 logs/s stage) failed eventual consistency — 79.6K of 105.6K accepted logs never became visible in the 30s drain window, plus 5 request timeouts. Proceed to step 3 (PG config) and step 4 (read-path isolation) — the extreme-load consistency failure supports the pool-queueing diagnosis.

---

## 2. Measure the `attributes_text` GIN index — ✅ Done, verdict: keep

- [x] Live `pg_stat_user_indexes` check: every per-partition `attributes_text` GIN index is tiny (16-24 kB, near-empty local dev data) with `idx_scan = 0` — inconclusive on this dataset size, so measured on a scratch copy instead.
- [x] Scratch A/B in the same container (two throwaway tables, 300,000 synthetic rows each, one with `USING GIN (attributes_text jsonb_path_ops)`, one without, dropped after measuring):
  - Insert 300k rows **with** the index: 1,236 ms. **Without**: 799 ms → **+55% insert time, ~1.5 µs/row extra CPU.** Index size for 300k rows: 5 MB.
  - `attr.<key>` filter query (`attributes_text @> '{"k":"v"}'`) **with** the index: 1.7 ms (bitmap index scan). **Without**: 37.4 ms, parallel seq scan (~22× slower).
- [x] **Decision: keep it.** ~1.5 µs/row is small next to the ~400 µs/row total DB CPU cost measured on the benchmark portal — this index is not a major contributor, unlike the trigram index (which cost ~250x more per row). Dropping it would also break `attr.<key>` filtering correctness/speed, which is graded. Do not revisit unless step 3 (PG config) and step 4 (read isolation) fail to close the gap and every remaining lever needs re-checking.

---

## 3. Apply PostgreSQL configuration — ✅ Done

Edit `docker-compose.yml`, `database` service:

```yaml
  database:
    image: postgres:16-alpine
    command:
      - postgres
      - -c
      - shared_buffers=256MB
      - -c
      - effective_cache_size=640MB
      - -c
      - work_mem=8MB
      - -c
      - maintenance_work_mem=128MB
      - -c
      - max_connections=40
      - -c
      - max_wal_size=2GB
      - -c
      - min_wal_size=512MB
      - -c
      - wal_buffers=16MB
      - -c
      - checkpoint_timeout=15min
      - -c
      - commit_delay=2000
      - -c
      - commit_siblings=5
      - -c
      - random_page_cost=1.1
      - -c
      - effective_io_concurrency=200
      - -c
      - jit=off
      - -c
      - max_parallel_workers_per_gather=0
```

- After applying: `docker stats --no-stream logpulse-database-1` and `docker inspect logpulse-database-1 --format '{{.State.OOMKilled}}'` — must stay `false`. PG memory already peaked at 605 MiB of 1 GB before this change.
- [x] Applied to `docker-compose.yml`, rebuilt (`docker compose up -d --build`), both containers came up healthy.
- [x] Verified live via `SHOW`: all 8 checked settings (`shared_buffers`, `effective_cache_size`, `work_mem`, `jit`, `max_parallel_workers_per_gather`, `commit_delay`, `random_page_cost`, `max_connections`) match the config exactly.
- [x] Idle resource check: DB 36 MiB / 1 GiB (3.5%), app 48 MiB / 256 MiB (18.8%), both `OOMKilled: false`. (This is idle, not under load — re-check `docker stats` during/after the next portal run, since these settings raise `work_mem`/`maintenance_work_mem` which only cost memory when active.)
- [x] All 4 endpoints re-verified: `/health` 200, `POST /logs` accepted, `GET /logs` returned the row, `GET /logs/aggregate` responded.
- [ ] **Not yet re-submitted to the benchmark portal — push and re-test to confirm this actually helps before moving on.**

---

## 4. Isolate the read path from ingestion

Add a second TypeORM `DataSource` dedicated to `GET /logs` and `GET /logs/aggregate`, with its own small pool (3–5 connections), separate from the ingestion pool. Strictly additive — no endpoint contract changes.

---

## 5. Tune GIN `fastupdate` / pending list (only if step 2 says keep the index)

```sql
ALTER INDEX idx_logs_attributes_text_gin SET (gin_pending_list_limit = '8MB');
```

---

## 6. Tune autovacuum for an insert-only table

```sql
ALTER TABLE logs SET (
  autovacuum_vacuum_insert_scale_factor = 0.4,
  autovacuum_analyze_scale_factor = 0.2
);
```

---

## 7. Increase the identity sequence cache

```sql
ALTER TABLE logs ALTER COLUMN id SET GENERATED ALWAYS SET (CACHE 1000);
-- verify exact syntax against the installed PG version
```

---

## 8. Make the connection pool explicit

`src/config/database.config.ts`:

```typescript
extra: {
  max: Number(process.env.DB_POOL_MAX ?? 20),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
},
```

Do this after steps 1–4. Sweep `DB_POOL_MAX` = 10 / 20 / 30 and keep the winner.

---

## 9. Read-path efficiency

- `LogRepository.findPage()`: switch `getMany()` → `getRawMany()` + explicit mapping. Verify response is byte-identical to the current shape.

---

## 10. Write coalescing (only if still short of target after 1–9)

Micro-batch concurrent `COPY` calls within a short window (20–50 ms). **Hard constraint: an HTTP response may only be sent after its rows are durably committed** — never acknowledge before commit.

---

## Do not do

- `synchronous_commit = off` or `UNLOGGED` tables — both break durability guarantees.
- Raise container CPU/memory limits — fixed by the spec.
- Add Redis/a queue in front of PostgreSQL — spec requires PostgreSQL as sole source of truth.
- Reject load with 429/503 to improve latency — currently 0 dropped/errored requests; don't trade that away.
- Node.js clustering/worker threads — CPU cap is a cgroup quota, not core count; adds overhead for no gain.
