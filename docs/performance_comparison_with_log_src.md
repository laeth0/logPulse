# Performance Comparison with `log_src` ("John Log")

**Source**: `log_src/` — a separate, independently-built log-ingestion service against the same brief
(`docs/Final_Project.md`), stack: Express + Drizzle ORM + `postgres.js`, no NestJS/TypeORM. Read-only reference,
same basis as `docs/performance_comparison_with_LogIngestion-majed.md` — techniques are evaluated against
logPulse's actual requirements, nothing is copied wholesale.

**Trigger for this doc**: user opened `log_src/src/ingestion/writeBuffer.ts` and asked whether its main
performance feature (the in-process write buffer) would help logPulse if adopted, plus a general "what else is
in here worth taking" pass.

**Headline verdict on the write buffer specifically**: logPulse already has the same core idea (Phase 3's write
coalescing in `log.repository.ts`) — so this isn't a "should I add this" question, it's "does John Log's *version*
of it beat logPulse's version." Two real, concrete deltas are worth taking (admission control, `message_lower`);
one lever John Log leans on hard (`synchronous_commit=off`) is explicitly forbidden for logPulse; one confirms a
design choice logPulse already made independently (single-flight flushing). None of this is a rewrite — every
item below is either a small addition or a "no action needed, already correct" finding.

---

## High impact

### 1. `message_lower` generated column for `q=` filtering — not in `writeBuffer.ts`, but the clearest win in the whole project

- **What John Log does**: `src/db/schema.ts` adds `message_lower text GENERATED ALWAYS AS (lower(message)) STORED`
  — Postgres computes and stores the lowercased form once, at insert time. `q=` filtering became
  `message_lower LIKE '%term%'` (term lowercased once in JS) instead of `message ILIKE '%term%'`.
- **What logPulse does**: `src/logs/query-builders/log-filter.builder.ts` still does
  `log.message ILIKE :messageQuery ESCAPE '\\'` — confirmed current, unchanged by this feature's work.
  `ILIKE` re-lowercases (locale-aware case-folding) `message` on every row of every scan, on every request.
- **Why it would help**: this is a pure per-row-cost reduction, not an indexing bet — John Log deliberately
  keeps `q=` unindexed (see finding 5 below for why), so the *only* lever left was making each row cheaper to
  check. logPulse's `q=` predicate has the identical shape and the identical cost profile today.
- **Measured evidence (John Log's own numbers, not assumed)**: isolated `EXPLAIN (ANALYZE, BUFFERS)` against a
  static ~1.1M-row partition, uncontended: 525.7ms → 147.2ms, a 3.6x reduction, same plan shape. Under real
  concurrent load at multiple rates: 768.8-923.0ms → 177.3ms (15,000/sec, ~4.8x), 1013.9ms → 271.5ms
  (16,000/sec, 3.7x), 1026.5ms → 253.6ms (20,000/sec, 4.0x).
- **Safe to apply?** Yes, cleanly — no spec conflict. `attr.<key>` equality already went through an analogous
  read-time-predicate redesign in this feature's own Phase 5 (`log-filter.builder.ts`'s type-branched containment
  check), so this would be the same kind of change to the sibling `q=` predicate, not a new pattern for this
  codebase. Doesn't touch write durability, tenant isolation, or any response shape.
- **Files likely affected**: `src/logs/entities/log.entity.ts` (add `message_lower` column,
  `GENERATED ALWAYS AS (lower(message)) STORED` — no application-level write needed, Postgres computes it),
  `src/migrations/1785684350114-CreateLogsTable.ts` (fold in, matching this feature's own pre-release convention
  for `attributes_text`'s removal), `src/logs/query-builders/log-filter.builder.ts` (swap the predicate),
  `projectSchema.dbml`.
- **Not yet measured on logPulse specifically** — per this project's own FR-015/SC-008 standard, this would
  need the same before/after portal comparison as everything else before being kept.

---

## Medium impact

### 2. Admission control on the write buffer — genuinely missing in logPulse, but a robustness fix, not a throughput fix

- **What John Log does**: `writeBuffer.ts`'s `pushLogs()` rejects a batch outright with `{ admitted: false }`
  (surfaced as `503` + `Retry-After`) if `buffer.length + entries.length > MAX_BUFFER_SIZE` (default 50,000) —
  *before* ever returning `200`. Explicitly framed in their own comments as fixing a real bug they'd shipped
  earlier: silently trimming the *oldest* buffered entries once over the cap, which let `POST /logs` return
  `200 { accepted: N }` for entries that then got dropped before ever reaching Postgres — "a direct violation of
  the brief's 'never respond 200 to a batch you have not durably accepted.'"
- **What logPulse does**: `LogRepository`'s `pendingInserts` queue (the coalescing buffer) has no depth cap and
  no rejection path at all — `insertMany()` always admits every caller, unconditionally. `INGEST_COALESCE_MAX_ROWS`
  caps how large *one flush* can be, not how large the *total pending queue* can grow.
- **Why this is a real, not hypothetical, gap**: `docs/Final_Project.md` (lines 355, 369-372) explicitly sanctions
  `429`/`503` + `Retry-After` as legitimate backpressure — "shedding load ... is better than crashing." If
  ingestion demand ever outpaces how fast flushes can drain (exactly the scenario the recent portal run showed —
  achieved throughput far under target, Postgres CPU pegged), logPulse's queue has no ceiling: it keeps
  accepting and growing, with no mechanism to protect the 256MB app container from unbounded memory growth, and
  every caller's response time silently grows worse as the backlog grows, instead of some callers getting an
  honest, immediate `503` and being told to retry.
- **Important caveat, so this isn't oversold**: the load-testing portal's own contract states shed requests
  "do not contribute to your throughput number." Adding this would *not* have fixed what the last run actually
  showed (achieved ~4,265/15,000 logs/sec, app CPU at most 49.7%, app memory at most 82.83 MiB — nowhere near a
  memory ceiling in that run). This is a defensive fix for a failure mode that hasn't actually been observed
  against logPulse yet, not a response to the specific bottleneck the last benchmark identified (the debounce
  window / per-flush Postgres cost — see the earlier conversation in this session).
- **Safe to apply?** Yes, in principle — no conflict with any FR. Sizing `MAX_BUFFER_SIZE`-equivalent correctly
  matters, though: too low sheds real, gradeable throughput for no protective benefit; too high provides no
  actual protection. Would need its own measurement pass, same as everything else, and shouldn't be adopted
  reflexively just because John Log has it — worth treating as its own follow-up item, not bundled into
  whatever fixes the current throughput gap.
- **Files likely affected**: `src/logs/repositories/log.repository.ts` (`insertMany()` gains a queue-depth check
  before pushing), `src/logs/services/log-ingestion.service.ts` or the controller (surface rejection as
  `503 { error }` + `Retry-After`), a new env var (`INGEST_QUEUE_MAX_ROWS` or similar).

---

## Corroborating evidence (no action needed)

### 3. Single-flight flushing — John Log independently reached the same conclusion logPulse's design already reflects

- **What John Log does**: `MAX_CONCURRENT_FLUSHES` defaults to `1`. Their README documents *actually testing*
  higher values twice: raising it to 8 caused an OOM crash and throughput fell to 8,255/sec with 793 errors;
  a later, more careful retest at 2 (after spreading writes across more partitions, to rule out the "one hot
  partition" explanation) still made things measurably worse — Breakpoint-scenario timeouts went from 9,361 to
  39,115, p95 from 10.0s to 55.9s. Their stated conclusion: with exactly one real CPU behind Postgres,
  "concurrent" flushes don't add parallelism, they add lock/scheduling contention for the same core.
- **What logPulse does**: `LogRepository`'s `isFlushing` boolean + drain loop already enforces strict
  single-flight flushing — only one flush ever runs at a time, by construction, not by a tunable that happens to
  default to 1.
- **Take**: this is useful *confirmation*, not a new lever. Two independent implementations against the same
  1-CPU-Postgres-container constraint converged on the identical answer, one of them by testing the alternative
  and watching it fail badly. Nothing to change here — logPulse's design was already right, and this is
  additional evidence for not trying to parallelize flushes.

### 4. `max_parallel_workers_per_gather=0` — already adopted, coincidentally, before this comparison

- **What John Log does**: sets this in `docker-compose.yml`'s Postgres `command:` block, because a single-core
  Postgres container gets zero benefit from parallel query workers, only Gather-node coordination overhead
  competing with the same core the write buffer's flushes need.
- **What logPulse does**: `docker-compose.yml` already has `max_parallel_workers_per_gather=0` (confirmed
  current). Same reasoning, already in place — no action needed, just a second independent project agreeing
  this is correct for the constrained-container scenario.

---

## Explicitly rejected / not applicable

### 5. `synchronous_commit=off` — forbidden by this project's own requirements

- **What John Log does**: sets this in `docker-compose.yml`, explicitly named as one of the three changes that
  fixed their main ingestion bottleneck (removes the WAL fsync-wait from every flush's commit). Their own
  "Known limitations" section is honest about the cost: a hard crash (not a clean shutdown) could lose the last
  fraction of a second of already-acknowledged writes.
- **Why it's out of scope here**: `specs/002-performance-optimization/spec.md` FR-003 — "The system MUST NOT
  reduce PostgreSQL's write-durability configuration (e.g., disabling synchronous commit) to achieve a
  throughput improvement" — and `docs/Final_Project.md`'s durability requirement this feature was built not to
  violate. This is the same rejection this project's `research.md` Decision 12 already reached independently
  when evaluating `LogIngestion-majed`. Not a close call either way; logPulse's throughput problem needs to be
  solved without this lever, full stop.

### 6. `UNNEST`-based bulk insert — a real, if currently low-urgency, structural difference

- **What John Log does**: `src/db/logs.ts`'s `insertLogs()` builds one array per column (timestamps, levels,
  services, messages, attributes) and inserts via
  `INSERT INTO logs (...) SELECT ... FROM UNNEST($1::text[], $2::text[], ...) AS t(...)` — a fixed 6 parameters
  regardless of batch size, explicitly to avoid Postgres's hard 65,535-parameter-per-statement limit on a
  row-oriented `VALUES (...), (...), ...` insert.
- **What logPulse does**: `LogRepository.insertLogsIn()` (just rewritten to use TypeORM's
  `manager.getRepository(Log).insert(rows)`) generates a row-oriented multi-row `INSERT ... VALUES` under the
  hood — parameters scale with `rows × columns`. At the current default `INGEST_COALESCE_MAX_ROWS=2000` and 6
  columns, that's 12,000 parameters — safely under the limit. The limit would only become a real risk if
  `INGEST_COALESCE_MAX_ROWS` were ever raised past roughly 10,900 (65,535 ÷ 6) — which is in the range this
  session was actively discussing raising the coalescing *window* (not the row cap) to fix, so worth being aware
  of, not urgent today.
- **Why not adopted now**: switching to UNNEST would mean dropping back to raw SQL for the insert path — directly
  reversing the ORM-based rewrite `log.repository.ts` just went through at the user's explicit request this same
  session. Worth revisiting only if the row cap is deliberately pushed close to the parameter ceiling; not a
  recommendation to make right now.

---

## Direct answer

**Would adopting John Log's write buffer, as a whole, increase logPulse's performance?** No — logPulse already
has the equivalent mechanism (write coalescing, since Phase 3 of this feature), and the *differences* between
the two designs split three ways: one lever is forbidden by logPulse's own requirements
(`synchronous_commit=off`), one is already independently confirmed correct in logPulse's existing design
(single-flight flushing — nothing to change), and one (admission control) is a legitimate robustness addition
but isn't what the most recent load-test data actually pointed at as the bottleneck, so it wouldn't be expected
to move the throughput score on its own.

**The one clearly, independently measured win worth taking is unrelated to the write buffer file you had open**:
the `message_lower` generated column for `q=` filtering. It's a small, low-risk, directly-transferable change
with real before/after numbers behind it (3-4.8x under load) — worth prioritizing over the write-buffer deltas
if the goal is "what should I actually go implement next."
