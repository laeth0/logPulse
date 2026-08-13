# Performance Comparison: logPulse vs. `LogIngestion-majed`

**Scope note**: `LogIngestion-majed` is a separate, unrelated project analyzed once, on explicit request, for this comparison only. It is not part of logPulse and is otherwise off-limits per `CLAUDE.md`/`AGENTS.md`. This report is read-only analysis — no production code was modified.

**Source of truth**: `docs/Final_Project.md`. Every recommendation below is checked against the required API contract, load-generator compatibility, zero-config behavior, multi-tenancy, retention, and the stated performance targets before being called "safe."

**Fairness framing**: Majed's project has no auth, no API keys, no tenant resolution, and no tenant-aware indexes — `README.md`'s own "Optional Features" section says so explicitly ("No optional features... have been implemented in this submission"). Every finding below is labeled as either an **implementation-quality** difference (something logPulse could genuinely learn from) or a **scope** difference (something that's faster only because that project does less).

---

## 1. Main architectural differences

| Dimension | logPulse | `LogIngestion-majed` |
|---|---|---|
| HTTP framework | NestJS (Express adapter) | Fastify |
| ORM / query layer | TypeORM (QueryBuilder for reads, raw `pg` for COPY) | Prisma (schema/migrations only) + raw `pg.Pool` for all hot-path SQL |
| Write path | One `COPY FROM STDIN` per HTTP request | Concurrent requests **coalesced** (up to 2 ms / 2,048 rows) into one `INSERT ... SELECT FROM jsonb_to_recordset()` per flush |
| Aggregation | Live `GROUP BY` over the raw `logs` table, every request | Pre-aggregated `LogRollup` (per-minute) / `LogSecondRollup` (per-second) tables, updated synchronously in the same statement as the insert; live scan only for the sub-second/sub-minute edges of a range |
| Table partitioning | Daily range partitions (`PARTITION BY RANGE (timestamp)`) | None — single flat table |
| Retention | `DROP TABLE` on expired daily partitions (O(1) per partition) | Batched `DELETE ... LIMIT 5000` loop with a 100 ms pause between batches |
| Multi-tenancy | Full (`tenant_id` on every table/index, two credential types, guards) | None |
| Durability | Default `synchronous_commit` (durable) | `synchronous_commit=off` (explicitly traded away) |

The two biggest single reasons Majed's numbers are higher are **write coalescing** (§3) and **synchronous rollups** (§5) — both are implementation-quality wins logPulse can adapt. The biggest reason his numbers are *allowed* to be higher is that his project skips durability guarantees logPulse's spec requires (§6) and carries none of multi-tenancy's overhead (§7).

---

## 2. Why Majed's project is faster — the short version

Majed's own README states the finding directly (`README.md` → "Bottlenecks Discovered"): *"Per-request database commits — a write per HTTP request saturates the single PostgreSQL CPU."* That is the same bottleneck logPulse's own measurements already surfaced: `README.md:336` records throughput **dropping from ~20,400 to ~13,900 logs/sec as concurrency rises from 8 to 16**, with "the `database` container's CPU hit ~99.9% of its 1.0 CPU limit." Both projects are capped by the same single Postgres vCPU; Majed's project simply does less *work per commit* under concurrency by merging many callers' rows into fewer, larger transactions, and it answers aggregation from tiny pre-summed tables instead of scanning the raw log stream.

Neither of these is a NestJS-vs-Fastify or TypeORM-vs-Prisma story — both projects already bypass their ORM's row-by-row path for the actual hot-path SQL. The gap is architectural (transaction count, and whether aggregation touches raw rows), not framework choice.

---

## 3. Ingestion-path differences

### 3.1 Request-level batching → coalesced batching

**logPulse** (`src/logs/repositories/log.repository.ts`): `insertMany()` runs immediately, once per HTTP request, via `COPY logs (...) FROM STDIN`. Ten concurrent `POST /logs` calls mean ten independent COPY operations, each its own transaction, each with its own commit.

**Majed** (`src/repositories/log.repository.ts`): `insertMany()` doesn't write immediately. It pushes the batch onto an in-memory queue and schedules a flush `setTimeout(..., 2)` — a 2 ms debounce window. Any other request arriving in that window gets merged into the same flush, up to a `maxInsertRows = 2_048` cap. All callers in a flush share **one** SQL statement and **one** commit; each caller's promise resolves once that shared commit succeeds.

```ts
// LogIngestion-majed/src/repositories/log.repository.ts
insertMany(logs: ValidatedLogInput[]): Promise<{ count: number }> {
  const deferred = Promise.withResolvers<{ count: number }>();
  this.pendingInserts.push({ logs, deferred });
  this.scheduleFlush();          // setTimeout(..., 2ms)
  return deferred.promise;
}
```

This is the direct answer to logPulse's own measured concurrency cliff (§2). At concurrency 16, ten independent COPY calls become, at best, a handful of merged flushes — fewer transactions, fewer commits, less WAL-flush contention on the single Postgres core.

### 3.2 `COPY` vs. `INSERT ... FROM jsonb_to_recordset()`

Majed's merged batch isn't sent via `COPY` — it's a single `INSERT INTO "Log" (...) SELECT ... FROM jsonb_to_recordset($1::jsonb) AS input(...)`, letting Postgres expand the whole JSON payload into rows server-side. `COPY` is still Postgres's fastest raw bulk-load primitive, and logPulse's `pg-copy-streams` path is a proven, deliberate choice (`README.md:348`) — the CSV-encode-and-stream approach is not the bottleneck. **The insight to take is the coalescing, not the mechanism**: logPulse can keep `COPY` as the underlying write and simply merge multiple requests' rows into one `COPY` call per flush, instead of switching to Prisma's JSON-expansion trick. That is very likely a *better* outcome than copying Majed's exact SQL — COPY should still outperform `INSERT ... SELECT` for the same row count once both are batched the same way.

### 3.3 Rollup maintenance fused into the insert

Majed's insert statement is a chain of CTEs: insert into `Log`, `RETURNING` the just-inserted rows, group them into per-minute/per-second counts, then `INSERT ... ON CONFLICT DO UPDATE SET count = count + EXCLUDED.count` into `LogRollup`/`LogSecondRollup` — all in one round trip, no separate background job. This is what makes aggregation fast (§5) without adding a second write path to maintain.

### 3.4 Sequential ID generation

Majed's `id` column is typed `uuid`, but the value is built from a Postgres sequence: `'00000000-0000-7000-8000-' || lpad(to_hex(nextval(seq)), 12, '0')`. This is a workaround for a real, well-known problem — pure-random UUID primary keys cause random-order B-tree insertion, which fragments the index and hurts write throughput over time. **logPulse does not have this problem**: `logs.id` is already a native `bigint GENERATED ALWAYS AS IDENTITY` column, which is monotonic by construction and simpler than reverse-engineering monotonicity out of a UUID type. This is a case where logPulse's existing design is already the better solution — nothing to adopt here.

### 3.5 Validation cost

Majed replaced an earlier Zod-based schema (`src/schemas/log.schema.ts` — confirmed dead code, never imported anywhere in the project) with a hand-written imperative `for` loop (`src/validators/log.validator.ts`), almost certainly to shave per-batch CPU on the ingest path. logPulse validates via Zod throughout (`src/logs/validators/log-entry.schema.ts` + `LogEntryValidator`), which is an established, deliberate project convention used consistently across both `logs` and `tenancy`. Given the dominant bottleneck is transaction count (§3.1), not per-row validation CPU, and given ripping out Zod would conflict with "preserve existing architecture and established project conventions" (`CLAUDE.md`), this is **not** recommended for adoption — flagged only for completeness.

---

## 4. Schema and index differences

| | logPulse | Majed |
|---|---|---|
| `logs`/`Log` PK | `(timestamp, id)` | `(timestamp, id)` — arrived at independently; originally a plain UUID PK, later merged with the pagination index (`merge_log_primary_and_pagination_indexes` migration) into the same `(timestamp, id)` shape logPulse already uses |
| `service`/`level` indexes | `idx_logs_tenant_service_timestamp_id`, `idx_logs_tenant_level_timestamp_id` — kept, tenant-led | Dropped, restored, then **dropped again for good** (`remove_write_heavy_filter_indexes` → `restore_filter_indexes` → dropped a second time in `make_rollups_synchronous_and_lightweight`) once rollups made them unnecessary for aggregation; `GET /logs` filtered by service/level now falls back to the PK backward scan |
| Attribute storage | `attributes` (JSONB, typed) **+** `attributes_text` (JSONB, all values pre-stringified) — two columns, two GIN indexes historically (one dropped, `idx_logs_attributes_text_gin` on `attributes_text` remains) | `attributes` only (JSONB, typed) — one GIN index (`jsonb_path_ops`), no mirror column |
| Attribute equality query | Single string-equality containment check against the pre-stringified column | Type-branched containment: tries string match, OR numeric match, OR boolean match against the *typed* column, depending on what the query-string value looks like |
| Rollup/pre-aggregation tables | None | `LogRollup` (per-minute), `LogSecondRollup` (per-second), both `UNLOGGED`, keyed `(bucket, service, level)` |
| Message search (`q=`) | Plain `ILIKE '%...%'`, no index (trigram index measured and dropped — `projectSchema.dbml` note, migration `1785684350117`) | Plain `LIKE`, no index, **plus** an explicit planner hint (`SET LOCAL enable_bitmapscan = off; SET LOCAL enable_seqscan = off`) to force a backward index scan on the PK so the query can stop as soon as `LIMIT` rows are found |

Both projects independently reached the same conclusion on the trigram/message-search index (not worth the write cost) and on `(timestamp, id)` as the pagination-friendly primary key — convergent evidence, not something to change.

The two differences worth real consideration: **dropping `attributes_text`** (§8, Recommendation 6) and **Majed's explicit planner hint for `q=`** (§8, Recommendation 7).

---

## 5. Query and aggregation differences

`GET /logs` in both projects is structurally similar: build a `WHERE` clause from optional filters, order by `timestamp DESC, id DESC`, keyset-paginate off a `(timestamp, id)` cursor, `LIMIT n+1` to detect a next page. No meaningful difference here beyond the planner hint noted above.

`GET /logs/aggregate` is where the two projects diverge completely:

- **logPulse** (`src/logs/query-builders/aggregation-query.builder.ts`): always a live `date_bin(...)`/`GROUP BY` scan over `logs`, filtered by the unconditional `tenant_id` predicate plus whatever optional filters apply. Cost scales with the number of raw rows in the requested time range.
- **Majed** (`src/repositories/aggregate.builder.ts`): when the request has no `q`/`attr.*` filter (the only case rollups can answer), `buildRollupAggregateQuery()` builds a **three-way `UNION ALL`**: (1) a direct raw-table scan for the small sliver of the range that doesn't align to a full second, (2) `LogSecondRollup` for the slivers that align to a second but not a full minute, (3) `LogRollup` for the bulk of the range that aligns to full minutes. The three parts are re-summed (`GROUP BY bucket, group`) to produce an exact result. Cost scales with the *rollup* row count (tiny) for the bulk of any real-world range, not the raw log count.

Both projects' `q=`/`attr.*`-filtered aggregation falls back to a raw scan — Majed's rollups don't help there either, for the same reason logPulse's don't exist there: pre-aggregating every possible filter combination isn't tractable.

**Numbers, with an honest caveat**: Majed's README reports **89 ms p95** aggregation measured *while 21,757 logs/sec of concurrent ingestion was running*. logPulse's README reports **27–38 ms** — but explicitly "not yet measured concurrently with sustained ingestion, which is the actual target scenario" (`README.md:337`). These numbers are not comparable as stated; logPulse's is the easier condition. The architectural point stands regardless of the exact figures: an aggregation query that reads a few thousand rollup rows will degrade far more gracefully under concurrent write load than one that scans the raw table, because it isn't competing with ingestion for the same heap pages and isn't re-doing `COUNT(*)` work across the same historical data on every single request.

---

## 6. PostgreSQL and Docker configuration differences

| Setting | logPulse | Majed | Note |
|---|---|---|---|
| Image | `postgres:16-alpine` | `postgres:17` (Debian, non-Alpine) | Newer major version, different libc (glibc vs musl) |
| `synchronous_commit` | default (on) | **`off`** | See §6.1 — explicitly rejected for logPulse already |
| `work_mem` | `8MB` | `32MB` | logPulse already measured this lever (see below) |
| `shared_buffers` | `256MB` | `256MB` | Same |
| `effective_cache_size` | `640MB` | `768MB` | Marginal |
| `max_connections` | `40` | `200` | Neither project's actual pool usage gets close to either limit |
| `maintenance_work_mem` | `128MB` (explicit) | not set (defaults to `64MB`) | logPulse is already ahead here — and Majed's batched-DELETE retention (§6.2) needs this tuned *more* than logPulse's does, not less |
| `checkpoint_timeout` / `max_wal_size` / `min_wal_size` | `15min` / `2GB` / `512MB` (explicit) | not set (Postgres defaults) | logPulse is already ahead — more frequent default checkpointing works against Majed's own sustained-write benchmark |
| `commit_delay` / `commit_siblings` | `2000` / `5` (explicit group-commit tuning) | not set | See §6.3 |
| `jit` | `off` (explicit) | not set (default on) | Unlikely to matter at these query costs either way |

### 6.1 `synchronous_commit=off` — real speedup, explicitly disallowed here

This is Majed's single largest raw config-level win, and it is the clearest example in this whole comparison of **"faster, but not safe to adopt."** `docs/Final_Project.md` requires: *"Never respond `200` to a batch you have not durably accepted"* (line 373). With `synchronous_commit=off`, a `COMMIT` — and therefore the `200` response — can return to the caller before the WAL record is fsynced to disk; a crash in that narrow window loses the batch despite the client having already received `200`. logPulse's own `docs/suggestions_to_increase_the_performance.md` already lists this under "Do not do," for exactly this reason. Nothing new to do here beyond confirming the existing decision was correct.

### 6.2 Retention: logPulse's design is already better

This is the one place in this report where **Majed's approach is not faster, and logPulse's is architecturally superior** — worth stating plainly since the point of this exercise isn't to assume the other project always wins. logPulse drops entire expired daily partitions (`DROP TABLE`, `src/retention/partition.service.ts`) — O(1) regardless of row count, no dead tuples, no bloat, no vacuum pressure. Majed deletes in batches of 5,000 rows with a 100 ms pause between batches (`src/services/retention.service.ts`) — correctness-preserving and lock-friendly, but every deleted row becomes a dead tuple that autovacuum must later reclaim, and the cost scales with row count instead of partition count. At Majed's current benchmark scale this hasn't surfaced as a visible problem, but it's a latent bloat/vacuum cost logPulse's partitioning design avoids entirely by construction.

### 6.3 Commit batching: two different layers, same goal

logPulse tunes Postgres's own group-commit mechanism (`commit_delay=2000`, `commit_siblings=5`) — Postgres briefly delays a WAL flush to let multiple *concurrent connections'* commits batch together. Majed doesn't use this at all. Instead, his application-level coalescing (§3.1) achieves a related effect one layer higher: it reduces the *number of transactions reaching Postgres in the first place*, rather than asking Postgres to batch the fsyncs of transactions that already arrived separately. The application-level approach is strictly more effective — fewer transactions is better than the same number of transactions with batched fsyncs — which is why Recommendation 1 (§8) ranks above any further `commit_delay` tuning.

---

## 7. The cost multi-tenancy adds in logPulse

To keep the comparison fair, here is a concrete accounting of what tenant-awareness costs logPulse that a single-tenant project like Majed's simply doesn't pay. None of these is the dominant factor in the throughput gap (§2) — the architectural differences in §3 and §5 are — but they are real and worth naming explicitly:

- **One extra indexed column on every row**: `logs.tenant_id` (`uuid`, 16 bytes) on every stored row and every COPY payload row.
- **One genuinely new index**: of the three tenant-led B-tree indexes on `logs`, two are tenant-prefixed replacements of indexes Majed also has in some form; `idx_logs_tenant_timestamp_id` is net-new — required because the partitioned table's PK can't lead with `tenant_id` (the partition key, `timestamp`, must be first). This is real added write cost with no equivalent in Majed's schema.
- **Per-request credential resolution**: when `AUTH_ENABLED=true`, `ApiKeyAuthGuard` does one indexed point lookup (`WHERE key_value = $1 AND status = 'active'`) per HTTP request before any log data is touched. Majed's ingest path has zero request-level auth work.
- **An unconditional `WHERE tenant_id = :tenantId` predicate** on every query (`src/logs/query-builders/log-filter.builder.ts`) — negligible marginal cost since it's satisfied by the leading index column, but it is one more condition evaluated on every request that Majed's queries don't carry.
- **No RLS**: worth stating explicitly since it's a common way to implement tenant isolation — logPulse does **not** use Postgres Row-Level Security. Isolation is enforced entirely at the application/query-builder layer (research.md Decision 6), a deliberate choice specifically to avoid RLS's per-row policy-check overhead on the ingestion hot path. This means the "RLS overhead" some multi-tenant systems pay doesn't apply here — one less thing logPulse's multi-tenancy costs, relative to a naive RLS-based design (though it's not something Majed's project has either way, since it has no tenants at all).
- **NestJS guard/decorator pipeline**: `@UseGuards(ApiKeyAuthGuard)` and `@CurrentTenantId()` add a small, framework-level per-request cost that a route with zero middleware (Majed's) doesn't pay. This is closer to a framework-choice cost (§3.5-adjacent) than a multi-tenancy-specific one, but it only exists *because* tenant resolution needs to happen somewhere in the request pipeline.

None of the above explains a 20,400→13,900 logs/sec concurrency cliff on its own. That gap is the transaction-count problem in §3.1.

---

## 8. Recommendations, ranked by expected impact

### High impact

#### 1. Coalesce concurrent ingestion requests into fewer, larger writes

- **What Majed does**: `LogRepository.insertMany()` queues incoming batches and flushes them together after a 2 ms debounce (or at a 2,048-row cap), so N concurrent `POST /logs` calls become far fewer actual database transactions.
- **What logPulse does**: every `POST /logs` call runs its own independent `COPY FROM STDIN` immediately (`src/logs/repositories/log.repository.ts`).
- **Why it affects performance**: this directly targets logPulse's own measured bottleneck — throughput dropping from ~20,400 to ~13,900 logs/sec as concurrency doubles, with Postgres CPU pinned at ~99.9% (`README.md:336`). Fewer, larger transactions means less per-transaction overhead (connection/transaction setup, WAL commit, planning) competing for the same single Postgres core.
- **Multi-tenancy or implementation quality?** Implementation quality — this is orthogonal to tenancy. Each row already carries its own resolved `tenant_id` by the time it reaches `insertMany()` (via `mapLogEntryToNewLog`), so merging rows from multiple concurrent requests — potentially from *different* tenants — is safe: nothing about coalescing requires the merged rows to share a tenant.
- **Safe to apply?** Yes, with two things to verify: (a) the added debounce latency (a few ms) doesn't meaningfully affect the spec's "queryable within 20 seconds" target — trivially true at a few ms; (b) error handling must still let each caller's batch fail/succeed independently in its response (`accepted`/`rejected` semantics per request), which Majed's `PendingInsert`/`deferred` pattern already models correctly — a batch failure only fails the callers in *that* flush, not unrelated ones.
- **Recommended adaptation, not a copy**: keep `COPY FROM STDIN` as the underlying write (it's already proven, and is generally faster than `INSERT ... SELECT` for the same row count) — add a coalescing queue *in front of* the existing COPY call, rather than switching to Majed's `jsonb_to_recordset` approach. Get the concurrency-reduction benefit without giving up logPulse's already-fastest bulk-load mechanism.
- **Files likely affected**: `src/logs/repositories/log.repository.ts` (new queue/flush logic ahead of `insertMany`/`copyLogsIn`), possibly `src/logs/services/log-ingestion.service.ts` if the per-caller promise plumbing needs to move up a layer.

#### 2. Pre-aggregate into rollup tables for `GET /logs/aggregate`

- **What Majed does**: `LogRollup` (per-minute) and `LogSecondRollup` (per-second) tables, `UNLOGGED`, updated synchronously in the same statement as ingestion via `INSERT ... ON CONFLICT DO UPDATE SET count = count + EXCLUDED.count`. Aggregation queries union pre-summed rollup rows for the bulk of a time range with a raw-table scan only for the sub-minute edges.
- **What logPulse does**: `GET /logs/aggregate` always runs a live `date_bin(...)` / `GROUP BY` scan over the raw `logs` table (`src/logs/query-builders/aggregation-query.builder.ts`), scaling with the number of raw rows in range.
- **Why it affects performance**: aggregation cost becomes independent of raw row count for the common case (no `q`/`attr.*` filter), and — just as importantly — stops competing with concurrent ingestion for the same heap pages, which is the actual target scenario the spec measures against ("one aggregation request/sec sustained during ingestion load").
- **Multi-tenancy or implementation quality?** Both. The rollup idea itself is pure implementation quality. But applying it to logPulse is **not** a direct copy: rollup rows must be keyed `(bucket, tenant_id, service, level)`, not just `(bucket, service, level)`, or cross-tenant counts would leak into each other's aggregates — a direct violation of FR-012/SC-003. Adding `tenant_id` to the rollup key increases row cardinality (more distinct rollup rows per bucket across "tens of tenants"), reducing the compression ratio Majed enjoys — but at this project's stated scale, pre-aggregated rollups still vastly outperform a raw-table scan.
- **Safe to apply?** Yes, in principle, but this is the largest-scope recommendation in this report — new tables, new sync logic in the ingest path, and retention/partition-drop needs a matching rollup-pruning step (mirroring Majed's `refreshRollupsAtRetentionBoundary`). Recommend treating this as its own follow-up milestone with its own benchmark pass, not a quick patch — consistent with `CLAUDE.md`'s "prefer measured optimization over assumptions."
- **Files likely affected**: new migration for `tenant_log_rollups` / `tenant_log_second_rollups` (with `tenant_id` in the PK), `src/retention/partition.service.ts` and/or `retention.service.ts` (rollup pruning/rebuild at the retention boundary), `src/logs/repositories/log.repository.ts` (rollup upsert after/alongside the COPY — note `COPY` doesn't support `RETURNING`, so counts would need to be computed from the in-memory batch before the COPY call, then a companion `INSERT ... ON CONFLICT` issued right after), `src/logs/query-builders/aggregation-query.builder.ts` (rollup-first query path with raw-scan fallback for filtered/edge cases), `projectSchema.dbml`, `specs/001-multi-tenancy/data-model.md` if this becomes a tracked feature.

### Medium impact

#### 3. Set the write pool explicitly

- **What Majed does**: a single explicit `pg.Pool({ max: 20, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 })` for all queries.
- **What logPulse does**: `createReadDatabaseOptions()` sets an explicit `extra.max` for reads; `createDatabaseOptions()` (the write/default connection) sets no `max` at all, silently defaulting to node-postgres's built-in default of 10.
- **Why it affects performance**: this is already independently documented in logPulse's own `docs/suggestions_to_increase_the_performance.md` §2 — an unset pool size is an easy, unintentional cap. Majed's explicit config is corroborating evidence, not a new finding.
- **Multi-tenancy or implementation quality?** Implementation quality, unrelated to tenancy.
- **Safe to apply?** Yes — no spec conflict, no tenant-isolation impact. Sweep 10/20/30 as the existing suggestions doc already recommends.
- **Files likely affected**: `src/config/database.config.ts`.

#### 4. Read raw rows instead of hydrating full ORM entities

- **What Majed does**: all reads go through `Prisma.sql`/`$queryRaw`, which does not build a full ORM entity graph.
- **What logPulse does**: `LogRepository.findPage()` uses TypeORM's `getMany()`, hydrating up to 1,000 `Log` entity instances per request (`src/logs/repositories/log.repository.ts`).
- **Why it affects performance**: entity hydration is real per-row CPU/allocation work that a raw row mapping avoids. Already identified independently in logPulse's own suggestions doc §4.
- **Multi-tenancy or implementation quality?** Implementation quality, unrelated to tenancy.
- **Safe to apply?** Yes, with the existing caveat already noted in that doc: verify the response body stays byte-identical after switching to `getRawMany()` + explicit mapping.
- **Files likely affected**: `src/logs/repositories/log.repository.ts`, `src/logs/query-builders/log-query.builder.ts`, `src/logs/mappers/log.mapper.ts`.

#### 5. Drop the `attributes_text` mirror column and its GIN index

- **What Majed does**: a single JSONB `attributes` column with one `jsonb_path_ops` GIN index; attribute-equality filters do type-branched containment (`attributes @> {"k":"v"} OR attributes @> {"k": v::numeric} OR ... ::boolean`) directly against the typed column.
- **What logPulse does**: maintains a second column, `attributes_text` (every value pre-stringified at ingest time), with its own GIN index, so query-time attribute filters can stay a single string-equality containment check.
- **Why it affects performance**: one fewer JSONB column to populate and one fewer GIN index to maintain on every insert — real, if secondary, per-row write cost. Both approaches satisfy the spec's "attribute equality, compared as strings" requirement — they just allocate the cost differently (logPulse pays it once at write time; Majed's approach pays a slightly more complex predicate at read time).
- **Multi-tenancy or implementation quality?** Implementation quality, orthogonal to tenancy.
- **Safe to apply?** Yes, but not free: Majed's own comment flags a real gotcha — parameters must be explicitly cast (`${key}::text`) or `jsonb_build_object` can't infer a type for a prepared statement, which silently turns into a `500`. This needs the same care logPulse already applies to parameterized queries elsewhere.
- **Files likely affected**: `src/logs/entities/log.entity.ts`, `src/migrations/1785684350114-CreateLogsTable.ts` (or a new migration, depending on release status), `src/logs/repositories/log-csv-encoder.ts`, `src/logs/repositories/log.repository.ts` (COPY column list), `src/logs/mappers/log.mapper.ts`, `src/logs/query-builders/log-filter.builder.ts` (attribute predicate), `projectSchema.dbml`, `README.md`.

### Low impact

#### 6. Planner hint to force an index scan on unfiltered `q=` searches

- **What Majed does**: when a `q=` search has no `attr.*` filter alongside it, wraps the query in a transaction and issues `SET LOCAL enable_bitmapscan = off; SET LOCAL enable_seqscan = off` to force a backward PK index scan, so the query can stop as soon as `LIMIT` rows are found instead of collecting every match first.
- **What logPulse does**: plain `ILIKE '%...%'`, no planner hint (`src/logs/query-builders/log-filter.builder.ts`).
- **Why it affects performance**: on a large unfiltered substring search, this can meaningfully shorten worst-case latency by enabling early exit.
- **Multi-tenancy or implementation quality?** Implementation quality.
- **Safe to apply?** Plausible, but genuinely needs measurement first — `docs/suggestions_to_increase_the_performance.md` already notes logPulse's own `q` numbers (37 ms for a 1-day range, 144 ms unbounded over 300k rows) as "acceptable, and it scales with the time range." Forcing a scan strategy can backfire if the planner's default choice is already reasonable for the actual data distribution — this is exactly the kind of thing `CLAUDE.md` asks to justify by measurement, not assumption.
- **Files likely affected**: `src/logs/repositories/log.repository.ts` or `log-query.builder.ts`, if pursued.

#### 7. PostgreSQL 17

- **What Majed does**: `postgres:17` (non-Alpine).
- **What logPulse does**: `postgres:16-alpine`.
- **Why it affects performance**: PG17 has real, documented improvements (vacuum memory efficiency, some bulk-operation paths); the Alpine/musl vs. Debian/glibc difference is a secondary, harder-to-predict factor.
- **Multi-tenancy or implementation quality?** Neither — infrastructure choice.
- **Safe to apply?** Low-risk, low-effort version bump with no known spec conflict — but the actual gain is speculative until measured. Not urgent.
- **Files likely affected**: `docker-compose.yml`.

### Not applicable — conflicts with project requirements

| Idea | Why it's off the table |
|---|---|
| `synchronous_commit=off` | Directly violates `docs/Final_Project.md`'s "never respond 200 to a batch you have not durably accepted." Already correctly rejected in logPulse's own suggestions doc. |
| Batched-DELETE retention (copying Majed's approach) | Would be a *downgrade* — logPulse's partition-drop retention is already architecturally superior (O(1) vs. O(n), no bloat). Nothing to adopt here. |
| Swapping NestJS/Express for Fastify | Disproportionate, high-risk rewrite (guards, DI, Swagger, the entire module system) for a marginal per-request overhead saving, when the actual bottleneck is DB-side transaction count, not HTTP routing. |
| Replacing Zod validation with hand-rolled loops | Conflicts with an established, deliberate project convention for a benefit that's secondary to the real bottleneck (§3.1). |
| Higher `work_mem` (32MB) | Already measured and rejected for logPulse specifically (`docs/suggestions_to_increase_the_performance.md`: moved 189ms → 166ms, "risks OOM on a 1 GB container against 40 connections. Not worth it.") |

---

## Suggested order

1. **Coalesce concurrent ingestion writes** (§8 #1) — targets the exact bottleneck logPulse's own load test already identified, no schema change, no tenant-isolation risk.
2. **Explicit write pool** (§8 #3) — a few lines, already-documented, zero risk.
3. **Raw-row reads instead of entity hydration** (§8 #4) — already-documented, zero tenant-isolation risk.
4. **Drop `attributes_text`** (§8 #5) — self-contained, moderate effort, no tenant-isolation risk.
5. **Rollup tables** (§8 #2) — highest ceiling, but real scope; treat as its own milestone with `tenant_id` in the rollup key from the start, and its own before/after benchmark submission per this project's established "local runs are diagnostic only, the portal is authoritative" convention.
6. Re-measure via the external load-testing portal after each step, same as `docs/suggestions_to_increase_the_performance.md` already recommends — and re-verify tenant isolation (SC-003) specifically after step 5, since that's the one change with real cross-tenant-leakage risk if the rollup key is built wrong.
