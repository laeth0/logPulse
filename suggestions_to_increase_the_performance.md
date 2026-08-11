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
- [x] Re-submitted 2026-08-11: **59.68/100, rank #4** (up from 57.97, rank #5) — clear win. Load throughput 2,758.33 logs/sec (up from 2,601.67, +6%; +12.3% vs the pre-any-change baseline of 2,457). Aggregate p95 down to 3.57s (from 4.20s). Queries sub-score recovered 4.50→6.00/15. **Breakpoint eventual-consistency failure from the last run is fixed**: Passed 1.00 (was 0.00), 0 missing records (was 79.6K/105.3K), 0 timeouts (was 5). Every metric moved in the right direction on a single-variable change — keep this config. Still only ~18% of the 15,000 logs/sec target and ~3.6× over the 1s aggregate target, so proceed to step 4.

---

## 4. Isolate the read path from ingestion — ✅ Done

Add a second TypeORM `DataSource` dedicated to `GET /logs` and `GET /logs/aggregate`, with its own small pool (3–5 connections), separate from the ingestion pool. Strictly additive — no endpoint contract changes.

- [x] `src/config/database.config.ts`: added `createReadDatabaseOptions()` — same connection, `migrationsRun: false` (default connection already runs them), `extra.max` from `DB_READ_POOL_MAX` (default 5), tagged `application_name` (`logpulse-write` / `logpulse-read`) on both for observability.
- [x] `src/app.module.ts`: registered a second `TypeOrmModule.forRootAsync({ name: 'read', ... })` alongside the default.
- [x] `src/logs/logs.module.ts`: `TypeOrmModule.forFeature([Log], 'read')`.
- [x] `src/logs/repositories/log.repository.ts`: `findPage()`/`aggregate()` now query through the injected `'read'` repository; `insertMany()` still uses the default DataSource's raw connection for `COPY` — write and read never share a pool.
- [x] `DB_READ_POOL_MAX=5` added to `.env.example`, `.env`, and `docker-compose.yml`'s `app` environment block.
- [x] Verified live: `npm run lint && npm run build` clean, `docker compose up -d --build` both containers healthy, no duplicate migration run in logs. `pg_stat_activity` confirms two genuinely separate backends — `logpulse-write` and `logpulse-read` — after hitting `POST /logs` then `GET /logs`/`GET /logs/aggregate`. All 4 endpoints re-verified, idle resources fine (DB 44 MiB/1 GiB, app 66 MiB/256 MiB, `OOMKilled: false` both).
- [x] Re-submitted 2026-08-11: **60.07/100, rank #4** (up from 59.68) — net win, but with a real trade-off. Load throughput 2,758.33→3,055.83 logs/sec (+10.8%). **Ingestion Latency p95 dropped dramatically**: Load 3.22s→2.34s, Stress 6.48s→0.615s (10.5×), Spike 4.08s→0.396s (10.3×), Breakpoint 12.49s→1.09s (11.5×) — ingestion is no longer queueing behind reads, exactly as intended. **Aggregate p95 got slightly worse in most scenarios** (Load 3.57s→4.40s, Stress 7.01s→8.16s, Spike unchanged 5.01s, Breakpoint 13.94s→13.71s) and Queries sub-score held flat at 6.00/15. Likely cause: `DB_READ_POOL_MAX=5` is now the *only* capacity reads get (previously they could use spare capacity in the shared 10-connection default pool) — the read pool itself may now be too small. Breakpoint consistency still passes (0 missing, 0 timeouts). Net: keep this change (ingestion win outweighs the read regression, and the score improved), but `DB_READ_POOL_MAX` is a good next tuning target — likely raise it now that ingestion isn't pool-constrained.

---

## 5. Tune GIN `fastupdate` / pending list (only if step 2 says keep the index) — ❌ Tried, reverted

```sql
ALTER INDEX idx_logs_attributes_text_gin SET (gin_pending_list_limit = '8MB');
```

- [x] **The SQL above doesn't actually work — verified live before implementing.** Two problems found by testing directly against the container: (1) `gin_pending_list_limit` takes an **integer number of KB**, not a size string — `'8MB'` errors with `invalid value for integer option`; the correct value is `8192`. (2) `idx_logs_attributes_text_gin` is a **partitioned index** (`logs` is `PARTITION BY RANGE`) — PostgreSQL rejects `ALTER INDEX ... SET (...)` on it outright (`This operation is not supported for partitioned indexes`). The setting has to be applied to every partition's own physical index.
- [x] New migration `src/migrations/1785684350118-TuneAttributesTextGinPendingList.ts`: sets `gin_pending_list_limit = 8192` on `logs_default_attributes_text_idx` plus every daily partition index that already exists at migration time (PL/pgSQL loop over `pg_inherits`).
- [x] `src/retention/partition.service.ts`: `ensureDailyPartition()` now sets the same reloption on each partition's index right after creating it — otherwise every new daily partition created by retention going forward would silently miss the tuning.
- [x] Verified live: migration ran (`typeorm_migrations` shows it applied), all 39 existing `attributes_text` partition indexes tuned (`reloptions` shows `gin_pending_list_limit=8192` on every one, 0 missed). Dropped and let retention recreate the newest (empty, future-dated) partition to confirm the `PartitionService` code path independently — the freshly created partition's index was tuned automatically with no migration involved.
- [x] `npm run lint && npm run build` clean, `docker compose up -d --build` both containers healthy, all endpoints re-verified including `attr.<key>` filtering (which exercises this exact index), idle resources fine, `OOMKilled: false`.
- [x] Re-submitted 2026-08-11: **59.97/100, rank #4** (was 60.07 — essentially flat, -0.10). But per-scenario detail shows a real directional problem: **Ingestion Latency p95 got worse in 3 of 4 scenarios** — Stress 615ms→702ms (+14%), Spike 396ms→514ms (+30%), Breakpoint 1.09s→1.29s (+18%). Load throughput also dipped slightly (3,055.83→2,980.83, -2.5%). Mechanism: doubling `gin_pending_list_limit` (4MB default → 8MB) means bigger, less frequent pending-list flushes, and p95 is exactly where an infrequent-but-expensive flush shows up as a latency spike — the opposite of the intended effect.
- [x] **Reverted.** New migration `src/migrations/1785684350119-RevertAttributesTextGinPendingListTuning.ts` resets `gin_pending_list_limit` on `logs_default` + all partitions (migration 118 itself is kept, not deleted — the revert is a new forward migration, consistent with treating migrations as an immutable historical record). Removed the matching `ALTER INDEX` call from `PartitionService.ensureDailyPartition()` so new partitions stop getting it too.
- [x] Verified live: migration ran, all 39 partition indexes confirmed back to default reloptions (0 tuned), dropped+recreated the newest partition to confirm `PartitionService` no longer applies the setting to new ones either. Lint/build clean, all endpoints re-verified including `attr.<key>` filtering, `OOMKilled: false`.
- [ ] **Not yet re-submitted to confirm the revert restores step-4 numbers** — expected but not yet portal-confirmed.

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
