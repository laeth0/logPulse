I’m using your attached study brief as the scope for this explanation.  I also checked the current PostgreSQL 18 documentation and official Timescale, ClickHouse, and Redis documentation so the PostgreSQL-specific behavior and comparisons below are current as of August 2026. ([PostgreSQL][1])

# 1. Start with the problem

Imagine a `logs` table:

```text
logs
-------------------------------------------------------
timestamp                 service     level     message
-------------------------------------------------------
10:00:01.100              checkout    error     ...
10:00:02.300              checkout    error     ...
10:00:03.200              auth        info      ...
10:00:20.900              checkout    error     ...
...
```

Your API exposes an aggregation endpoint:

```http
GET /logs/aggregate
```

and internally you do something like:

```sql
SELECT
    date_bin(
        interval '1 minute',
        timestamp,
        timestamptz '2000-01-01 00:00:00+00'
    ) AS bucket,
    service,
    COUNT(*) AS count
FROM logs
WHERE tenant_id = $1
  AND timestamp >= $2
  AND timestamp < $3
GROUP BY bucket, service;
```

`date_bin()` assigns timestamps to fixed-width bins aligned to an origin; PostgreSQL explicitly supports arbitrary fixed intervals this way. ([PostgreSQL][2])

At first this is fine.

Suppose there are only:

```text
20,000 logs
```

Scanning and aggregating 10,000 rows is cheap.

But later:

```text
1 million logs
10 million logs
100 million logs
```

Now an aggregation might require PostgreSQL to:

```text
find hundreds of thousands of rows
        ↓
read heap/index pages
        ↓
evaluate filters
        ↓
calculate date_bin()
        ↓
hash/sort group keys
        ↓
increment COUNT states
        ↓
build result
```

And the important part is:

> You repeat essentially the same work every time somebody asks the same type of aggregation.

Suppose your dashboard refreshes every 5 seconds.

```text
12 requests/minute
×
500,000 matching logs
=
6,000,000 rows examined/minute
```

for effectively the same historical information.

Meanwhile:

```text
POST /logs
POST /logs
POST /logs
POST /logs
```

are continuously writing new rows.

So PostgreSQL is simultaneously dealing with:

```text
                  PostgreSQL

              ┌──────────────┐
writers ─────►│              │◄──── aggregation queries
writers ─────►│    logs      │◄──── aggregation queries
writers ─────►│              │◄──── aggregation queries
              └──────────────┘
```

That means contention for CPU, memory, buffer-cache capacity, I/O bandwidth, indexes, and database connections.

Indexes help PostgreSQL **find** relevant rows, but an index cannot magically eliminate the cost of aggregating a huge number of matching rows. PostgreSQL's own documentation also emphasizes that indexes speed retrieval but add system-wide overhead, which is particularly relevant to ingestion-heavy systems. ([PostgreSQL][3])

This is the problem rollups try to solve.

---

# 2. The fundamental idea

Instead of asking:

> "Every time someone requests this aggregation, count all these logs again."

you say:

> "As logs arrive, maintain the counts incrementally."

Raw:

```text
10:00:01 checkout error
10:00:02 checkout error
10:00:03 auth     info
10:00:20 checkout error
```

becomes:

```text
minute bucket   service     level    count
------------------------------------------------
10:00:00        checkout    error      3
10:00:00        auth        info       1
```

You still retain the raw logs:

```text
                    Raw logs
                       +
              Precomputed summary

logs                            minute_rollups

10:00:01 checkout error         10:00 checkout error 3
10:00:02 checkout error         10:00 auth     info  1
10:00:03 auth info
10:00:20 checkout error
```

Now imagine this time range contains:

```text
600,000 raw logs
```

but only:

```text
600 minute buckets
×
20 active service/level combinations
≈
12,000 rollup rows
```

Instead of processing hundreds of thousands of events, PostgreSQL might process a few thousand small rows.

That is the core performance win.

---

# 3. The terminology

## Pre-aggregation

**Pre-aggregation means computing summaries before the read request needs them.**

Instead of:

```text
query arrives
     ↓
scan raw rows
     ↓
aggregate
```

you do:

```text
data arrives
     ↓
update aggregate

later...

query arrives
     ↓
read aggregate
```

---

## Incremental aggregation

Incremental means:

> Don't recompute the entire aggregate when new data arrives. Only incorporate the new data.

Assume current state:

```text
10:00 checkout/error = 250
```

Three new logs arrive:

```text
checkout error
checkout error
checkout error
```

Don't run:

```sql
SELECT COUNT(*)
FROM logs
WHERE ...
```

again.

Instead:

```text
old = 250
delta = 3

new = 253
```

That's **incremental aggregation**.

ClickHouse describes its incremental materialized views in essentially these terms: work is performed on newly inserted blocks and merged into target aggregate state, moving computation from SELECT time toward INSERT time. ([ClickHouse][4])

---

## Rollup table

A rollup table is an ordinary stored representation of those aggregates.

For example:

```text
tenant_id
bucket
service
level
count
```

Every row represents:

> "For tenant X, during bucket Y, service S had N logs of level L."

---

## Time-bucket aggregation

Time is divided into deterministic ranges:

```text
10:00:00 → 10:00:59.999...
10:01:00 → 10:01:59.999...
10:02:00 → 10:02:59.999...
```

Usually model them as half-open intervals:

```text
[10:00:00, 10:01:00)
[10:01:00, 10:02:00)
```

Meaning:

```text
>= bucket start
<  next bucket start
```

This avoids ambiguous boundary ownership.

---

# 4. Raw aggregation vs pre-aggregation vs everything else

A useful mental distinction is:

| Technique                    | When computation happens | Stored result? | Typical purpose             |
| ---------------------------- | ------------------------ | -------------: | --------------------------- |
| Raw aggregation              | Query time               |             No | Flexible ad-hoc analytics   |
| Pre-aggregation              | Before query             |            Yes | Faster repeated aggregation |
| Incremental aggregation      | As changes arrive        |            Yes | Efficient maintenance       |
| Rollup table                 | Persistent               |            Yes | Store time-based summaries  |
| PostgreSQL materialized view | Refresh time             |            Yes | Persist query results       |
| Cache                        | After/around reads       |    Temporarily | Avoid repeated requests     |

A **rollup table** describes the physical data model.

**Incremental aggregation** describes how you maintain it.

**Pre-aggregation** describes the overall strategy.

They are related but not synonyms.

---

# 5. Why a rollup is not simply a cache

This distinction is important.

Imagine this query:

```text
tenant=5
since=10:00
until=11:00
bucket=5m
groupBy=service
```

A Redis cache might store:

```text
key:
aggregate:tenant5:10:00:11:00:5m:service

value:
{...complete response...}
```

The cache exists because someone previously made that query.

A rollup instead stores:

```text
10:00 checkout error 32
10:00 auth     info  92
10:01 checkout error 44
10:01 auth     info  81
...
```

Nobody needs to have requested a 5-minute query before.

PostgreSQL can construct it from the minute rollups.

So:

```text
CACHE
query → computed response → store response

ROLLUP
incoming data → maintain reusable aggregate state
```

Redis's cache-aside documentation explicitly describes the cache-hit/miss model and the need for invalidation/staleness management. ([Redis][5])

A rollup can certainly be considered **derived data**, but it is structurally different from request-result caching.

---

# 6. Rollups become part of your database model

You now have two representations of reality:

```text
Raw representation
------------------
one row per event

Aggregated representation
-------------------------
one row per bucket/group combination
```

For example:

```text
logs

event_id
tenant_id
timestamp
service
level
message
attributes
```

and:

```text
tenant_log_minute_rollups

tenant_id
bucket
service
level
count
```

The raw table answers:

```text
show me individual logs
search message
filter arbitrary attributes
inspect event #123
```

The rollup answers:

```text
logs per minute
logs per service
errors per service
total logs per interval
```

---

# 7. Incrementally maintaining the rollup

Consider:

```sql
INSERT INTO tenant_log_minute_rollups (
    tenant_id,
    bucket,
    service,
    level,
    count
)
VALUES (
    $1,
    $2,
    $3,
    $4,
    $5
)
ON CONFLICT (tenant_id, bucket, service, level)
DO UPDATE
SET count =
    tenant_log_minute_rollups.count
    + EXCLUDED.count;
```

Suppose:

```text
existing row:

tenant = A
bucket = 10:00
service = checkout
level = error
count = 40
```

incoming batch contributes:

```text
12
```

The conflicting insert effectively becomes:

```text
40 + 12 = 52
```

PostgreSQL guarantees an atomic insert-or-update outcome for `ON CONFLICT DO UPDATE`, including under concurrency. ([PostgreSQL][1])

---

# 8. Why batch aggregation before UPSERT matters enormously

Consider 1,000 incoming logs.

Bad approach:

```text
log 1 → UPSERT
log 2 → UPSERT
log 3 → UPSERT
...
log 1000 → UPSERT
```

That's:

```text
1000 rollup modifications
```

Now suppose those logs really belong to only 20 combinations:

```text
tenant A / 10:00 / checkout / error = 431
tenant A / 10:00 / auth     / info  = 203
...
```

Better:

```text
1000 incoming logs
       ↓
group batch
       ↓
20 aggregate deltas
       ↓
20 UPSERTs
```

Conceptually:

```text
1000 raw events

       GROUP

┌─────────────────────────┐
│ checkout,error       431│
│ checkout,info        104│
│ auth,error            62│
│ auth,info            203│
│ ...                    │
└─────────────────────────┘

           ↓

~20 rollup changes
```

This reduces:

* SQL work
* unique-index lookups
* row updates
* WAL generation
* tuple generation
* lock acquisitions
* contention on hot rollup rows
* round trips if queries are not properly batched

There's also a PostgreSQL correctness detail: one `INSERT ... ON CONFLICT DO UPDATE` statement is not allowed to affect the same existing target row more than once. PostgreSQL calls it a deterministic statement and raises a cardinality violation if duplicate conflict keys in the proposed rows would update the same target row repeatedly. Pre-grouping avoids this problem too. ([PostgreSQL][1])

So this:

```text
GROUP BEFORE UPSERT
```

is often one of the most important parts of the design.

---

# 9. Multi-level rollups

You don't have to choose one granularity.

You could have:

```text
Raw Logs
   │
   ▼
1-second rollups
   │
   ▼
1-minute rollups
```

Potentially:

```text
Raw
 ↓
1 second
 ↓
1 minute
 ↓
1 hour
```

Why?

Because different granularities make different trade-offs.

Consider one day:

```text
seconds/day = 86,400
minutes/day = 1,440
hours/day   = 24
```

If someone asks:

```text
last 30 days, bucket=1h
```

reading millions of second rollups is silly.

An hourly representation could be much cheaper.

But if someone asks:

```text
10:00:12 → 10:01:12
bucket=1s
```

hourly rollups are useless.

So multi-level rollups create a hierarchy:

```text
precision              rows/query

raw
 ↑ highest              ↑ most

seconds
 |
minutes
 |
hours
 ↓ lowest               ↓ fewest
```

Timescale supports an analogous concept through hierarchical continuous aggregates, where one aggregate can be built at a higher granularity from another. ([Timescale Documentation][6])

---

# 10. The most important part: hybrid raw + rollup queries

Suppose:

```text
since = 10:00:12.500
until = 11:05:42.200
```

Remember the recommended API semantics:

```text
timestamp >= since
timestamp < until
```

or:

```text
[10:00:12.500, 11:05:42.200)
```

You have minute rollups.

Can you simply query:

```text
10:00 rollup
...
11:05 rollup
```

No.

The `10:00` rollup represents:

```text
[10:00:00, 10:01:00)
```

but your user requested:

```text
[10:00:12.500, 10:01:00)
```

Using the complete `10:00` rollup would incorrectly include:

```text
10:00:00.000
        →
10:00:12.499...
```

Likewise the `11:05` rollup includes events after:

```text
11:05:42.200
```

which the caller did not request.

So split the query.

```text
requested:

10:00:12.500                                   11:05:42.200
     |------------------------------------------------|

     raw                     rollup                raw
     |----|=======================================|---|
          10:01:00                           11:05:00
```

Mathematically:

```text
LEFT
[10:00:12.500, 10:01:00)

MIDDLE
[10:01:00, 11:05:00)

RIGHT
[11:05:00, 11:05:42.200)
```

Now:

```text
LEFT   → raw
MIDDLE → minute rollup
RIGHT  → raw
```

This gives exact semantics.

You are **not rounding the requested range**.

You're merely choosing a different physical representation for portions of the requested range.

That's the core idea.

---

# 11. Why the hybrid query remains exact

Suppose `10:00` contains:

```text
10:00:05 error
10:00:15 error
10:00:40 error
```

minute rollup:

```text
10:00 error = 3
```

Query starts:

```text
10:00:12.500
```

Correct answer from 10:00 should be:

```text
2
```

because:

```text
10:00:05   ❌
10:00:15   ✅
10:00:40   ✅
```

If you use the minute rollup:

```text
3    ❌
```

If you scan raw logs only for that partial minute:

```text
2    ✅
```

That's why boundary handling exists.

---

# 12. An even better hierarchy with second rollups

If you already have second-level rollups, you don't necessarily need raw logs for almost the whole boundary minute.

For:

```text
since = 10:00:12.500
```

you could do:

```text
raw:
10:00:12.500 → 10:00:13.000

second rollups:
10:00:13 → 10:01:00

minute rollups:
10:01:00 → 11:05:00

second rollups:
11:05:00 → 11:05:42

raw:
11:05:42.000 → 11:05:42.200
```

Visually:

```text
|R|ssssssss|MMMMMMMMMMMMMMMMMMMMMMMMMMMM|ssss|R|
```

where:

```text
R = raw
s = second rollups
M = minute rollups
```

Now raw scanning is potentially reduced to fractions of seconds.

This is the full idea of **hierarchical hybrid query execution**.

---

# 13. Output bucket granularity and source rollup granularity are different concepts

This is an important advanced point.

Suppose the user requests:

```text
bucket = 5 minutes
```

but your stored rollup is:

```text
1 minute
```

You do **not** need a special 5-minute table.

Take:

```text
10:00  count 10
10:01  count 15
10:02  count 12
10:03  count  7
10:04  count 20
```

then:

```text
5-minute bucket 10:00
=
10 + 15 + 12 + 7 + 20
=
64
```

SQL conceptually:

```sql
SELECT
    date_bin(
        interval '5 minutes',
        bucket,
        $origin
    ) AS output_bucket,
    service,
    level,
    SUM(count)
FROM tenant_log_minute_rollups
...
GROUP BY output_bucket, service, level;
```

So:

```text
stored resolution = 1 minute
requested resolution = 5 minutes
```

The stored resolution only needs to be **fine enough** to construct the requested bucket.

---

# 14. 1m, 5m, 1h and 1d from minute rollups

A minute rollup can directly answer:

```text
1 minute
```

and be re-aggregated into:

```text
5 minutes
1 hour
1 day
```

Conceptually:

```text
1m:
[M]

5m:
[M M M M M]
      ↓
    SUM

1h:
60 × [M]
      ↓
    SUM

1d:
1440 × [M]
       ↓
     SUM
```

At some point, however, re-aggregating enormous numbers of minute rows may itself become expensive.

That's where an hourly rollup can make sense.

For example:

```text
1-year daily query

minute representation:
365 × 1440 = 525,600 time rows before dimensions

hour representation:
365 × 24 = 8,760
```

Whether you need that extra level depends on measurements.

---

# 15. UNION ALL + final GROUP BY

A nice implementation pattern is:

```text
LEFT edge
UNION ALL
MIDDLE rollup
UNION ALL
RIGHT edge
       ↓
final GROUP BY
```

Conceptually:

```sql
SELECT
    bucket,
    service,
    level,
    SUM(count) AS count
FROM (
    -- left raw edge
    ...

    UNION ALL

    -- rollup middle
    ...

    UNION ALL

    -- right raw edge
    ...
) x
GROUP BY bucket, service, level;
```

Why `UNION ALL`, not `UNION`?

Because these aren't duplicate rows to eliminate.

They are pieces of aggregate state that should be added.

---

# 16. Why final GROUP BY is especially important for 5-minute requests

Suppose:

```text
since = 10:00:12.500
bucket = 5m
```

The first output bucket is:

```text
10:00 → 10:05
```

Your physical sources might be:

```text
10:00:12.500 → 10:01
raw

10:01 → 10:05
minute rollup
```

But **both belong to the same output bucket**:

```text
10:00
```

So after `UNION ALL`:

```text
bucket 10:00 from raw      count=20
bucket 10:00 from rollups  count=80
```

final group:

```text
10:00 count=100
```

That's why the final aggregation isn't merely cosmetic.

---

# 17. Choosing what dimensions to pre-aggregate

Suppose your rollup is:

```text
tenant_id
bucket
service
level
count
```

Each row means:

```text
COUNT(*)
GROUP BY tenant_id, bucket, service, level
```

Can you answer:

```sql
GROUP BY service
```

Yes.

Sum over levels:

```text
checkout error = 20
checkout info  = 40

checkout total = 60
```

Can you answer:

```sql
GROUP BY level
```

Yes.

Sum over services.

Can you answer:

```text
no GROUP BY
```

Yes.

Sum everything.

In general:

> A rollup containing dimensions `{service, level}` can normally be aggregated **upward** by dropping dimensions.

```text
(bucket, service, level)
          ↓
(bucket, service)
          ↓
(bucket)
```

But it cannot recreate dimensions that were discarded.

If your rollup only has:

```text
(bucket, service)
```

you cannot later ask:

```text
GROUP BY level
```

because the level information has already been lost.

---

# 18. Why arbitrary message filters break simple rollups

Suppose the rollup says:

```text
10:00 checkout error = 9,304
```

Then someone asks:

```sql
WHERE message ILIKE '%payment declined%'
```

How many of those 9,304 matched?

The rollup doesn't know.

Similarly:

```sql
attributes->>'user_id' = '42'
```

Your rollup knows:

```text
checkout,error,9304
```

It does not know which users contributed those counts.

You could add:

```text
user_id
```

to the rollup.

Then tomorrow somebody asks:

```text
country
browser
http_status
route
trace_id
customer_type
feature_flag
deployment_version
```

Eventually:

```text
bucket
tenant
service
level
user
country
route
browser
status
version
...
```

The number of possible combinations explodes.

That's **dimensional cardinality explosion**.

Therefore a practical planner often says:

```text
Can rollup answer this filter?

           YES
            │
            ▼
      rollup strategy

           NO
            │
            ▼
        raw logs
```

For example:

```text
tenant_id
service
level
time
```

could be rollup-supported.

But:

```text
message contains ...
arbitrary JSON condition
regex
trace_id
user_id
```

could trigger raw fallback.

---

# 19. Multi-tenancy is not optional in the rollup key

Suppose:

```text
Tenant A

checkout error = 100
```

and:

```text
Tenant B

checkout error = 50
```

If your key is:

```sql
PRIMARY KEY (
    bucket,
    service,
    level
)
```

both tenants target:

```text
10:00 / checkout / error
```

Result:

```text
150
```

Now Tenant A queries its dashboard and potentially sees a count influenced by Tenant B.

That's a cross-tenant leak.

Instead:

```sql
PRIMARY KEY (
    tenant_id,
    bucket,
    service,
    level
)
```

Now:

```text
A | 10:00 | checkout | error | 100
B | 10:00 | checkout | error |  50
```

They are physically separate aggregate states.

For a multi-tenant observability system, `tenant_id` needs to participate in **both filtering and aggregation identity**, not just be something your controller remembers to filter later.

---

# 20. Tenant-aware indexing

A very natural index is:

```text
(tenant_id, bucket)
```

because queries commonly look like:

```sql
WHERE tenant_id = ?
  AND bucket >= ?
  AND bucket < ?
```

With the proposed primary key:

```text
(tenant_id, bucket, service, level)
```

you already get a B-tree backing that key.

PostgreSQL's multicolumn B-tree documentation notes that indexes are generally most efficient when conditions constrain their leading columns. ([PostgreSQL][7])

If an extremely common query is:

```sql
WHERE tenant_id = ?
  AND service = ?
  AND bucket BETWEEN ? AND ?
```

this may justify:

```sql
CREATE INDEX ...
ON tenant_log_minute_rollups (
    tenant_id,
    service,
    bucket
);
```

Don't create every conceivable index.

Each index makes ingestion more expensive.

---

# 21. Write-path architecture A: asynchronous rollups

```text
POST /logs
    │
    ▼
insert raw logs
    │
    ▼
COMMIT
    │
    ▼
return response

later...

background worker
    │
    ▼
read new raw logs
    │
    ▼
update rollups
```

Advantages:

```text
+ lower API write latency
+ raw ingestion path stays simpler
+ rollup CPU can be controlled independently
+ easier to batch huge amounts of rollup work
+ rollups can be rebuilt
```

Disadvantages:

```text
- rollups lag behind raw logs
- eventual consistency
- worker checkpoints are required
- retries must be idempotent
- harder failure recovery
```

Example:

```text
raw data current through 10:00:30

rollup worker processed through 10:00:20
```

Your aggregation layer needs to know:

```text
10 seconds not yet rolled up
```

Potential query:

```text
materialized rollup through watermark
+
raw after watermark
```

Interestingly, Timescale's real-time continuous aggregate approach embodies a related idea: stored materialized aggregate data can be combined with more recent underlying data. ([Timescale Documentation][8])

---

# 22. Write-path architecture B: same transaction

```text
POST /logs
    │
    ▼
BEGIN
    │
    ├──── insert raw
    │
    ├──── update second rollup
    │
    └──── update minute rollup
    │
    ▼
COMMIT
    │
    ▼
response
```

Advantages:

```text
+ strong consistency
+ successful request means raw + rollups committed
+ simpler query semantics
+ no background catch-up watermark
```

Disadvantages:

```text
- more ingestion latency
- more database work per request
- more WAL
- longer transaction
- rollup contention is in request path
- a rollup failure can reject otherwise-valid raw ingestion
```

PostgreSQL transactions are atomic: either the entire set of operations commits or none does. That's exactly what makes Architecture B attractive when raw and aggregate state must remain synchronized. ([PostgreSQL][9])

---

# 23. What if raw insert succeeds and rollup update fails?

Without a transaction:

```text
INSERT raw
    ✅

UPSERT rollup
    ❌

response?
```

Your database now contains:

```text
raw = correct
rollup = missing counts
```

Aggregation results are wrong.

With one transaction:

```text
BEGIN

INSERT raw
    ✅

UPSERT rollup
    ❌

ROLLBACK
```

Now:

```text
raw     = unchanged
rollup  = unchanged
```

Consistency is preserved.

The cost is that ingestion failed and must be retried.

---

# 24. A third possibility: raw is authoritative, rollups rebuildable

You can explicitly define:

```text
RAW LOGS
=
source of truth

ROLLUPS
=
derived index-like representation
```

Then rollup corruption/loss can be repaired:

```text
raw
 ↓
GROUP BY time/service/level
 ↓
rebuild rollups
```

This changes your failure strategy considerably.

For example, you can tolerate:

```text
rollup worker crash
```

as long as:

```text
raw ingestion remains durable
+
you can determine which ranges need rebuilding
```

This model is particularly relevant when considering `UNLOGGED` rollup tables later.

---

# 25. The fundamental trade-off: read time → write time

Without rollups:

```text
WRITE:

insert raw
→ cheap-ish


READ:

scan 1,000,000 rows
→ group
→ expensive

scan 1,000,000 rows again
→ group
→ expensive

scan 1,000,000 rows again
→ group
→ expensive
```

With rollups:

```text
WRITE:

insert raw
+
increment aggregate
→ more expensive


READ:

read 2,000 aggregate rows
→ cheap
```

This is exactly the trade that ClickHouse's incremental materialized-view documentation describes: computation is shifted from query time to insert time in return for faster reads. ([ClickHouse][4])

So rollups make sense when:

```text
aggregate reads are frequent/expensive
```

enough to justify:

```text
additional write cost
```

---

# 26. Write amplification

One incoming log may cause:

```text
1 raw row
+
raw table indexes
+
1 second rollup change
+
1 minute rollup change
+
possibly hour rollup
+
indexes on every rollup table
```

Conceptually:

```text
one logical event

        ↓

raw heap
raw idx #1
raw idx #2
second rollup
second rollup PK
minute rollup
minute rollup PK
hour rollup
hour rollup PK
...
```

That's write amplification.

Therefore:

> Don't add rollup levels merely because they sound useful.

Every level must pay for itself.

---

# 27. Choosing rollup granularity

## Seconds

Useful if queries frequently operate over:

```text
very short windows
fine-grained charts
sub-minute analysis
```

But:

```text
86,400 time buckets/day
```

per dimension combination.

Potentially large.

## Minutes

Often a strong compromise for application logs.

```text
1,440 buckets/day
```

It provides good compression while still supporting:

```text
1m
5m
10m
15m
30m
1h
1d
```

through re-aggregation.

## Hours

Excellent for long-range dashboards.

But useless for preserving exact high-resolution short-range answers.

A common architecture may therefore be:

```text
raw
+
1m
```

first.

Only introduce:

```text
1s or 1h
```

if benchmarks demonstrate the need.

---

# 28. Rollup cardinality

Suppose theoretical dimensions are:

```text
100 tenants
50 services
4 levels
1,440 minutes/day
```

The maximum dense combination is:

```text
100 × 50 × 4 × 1,440
=
28,800,000 rows/day
```

That would be terrible.

But real data is usually sparse.

Tenant 1 might only use:

```text
3 services
```

and a minute may only contain:

```text
info
error
```

So you don't pre-create all combinations.

You only create rows that actually occur.

Perhaps the real average is:

```text
6 active combinations per tenant/minute
```

rather than:

```text
50 × 4 = 200
```

The design implication is more important than the arithmetic:

> Cardinality of rollup dimensions determines whether pre-aggregation truly compresses your data.

If every raw event has almost a unique dimension combination:

```text
user_id
request_id
trace_id
random attribute
```

then:

```text
raw rows ≈ rollup rows
```

and you've gained very little.

---

# 29. Retention

Suppose:

```text
raw retention = 30 days
```

There are three legitimate policies.

### Policy A

```text
raw:     30 days
rollup:  30 days
```

Historical detail and aggregates disappear together.

### Policy B

```text
raw:      30 days
rollups: 365 days
```

You intentionally offer:

```text
30 days detailed logs
365 days historical metrics
```

That's perfectly reasonable **if it is the intended product/data-retention policy**.

### Policy C

```text
raw and rollups have independently configurable retention
```

More flexible, more complexity.

The dangerous case is accidental retention.

If the user's logs are supposed to be deleted after 30 days for privacy/compliance but rollups remain:

```text
raw deleted
rollup still records activity
```

you may still be retaining derived customer information.

Another problem is deleting raw records inside a partially aggregated bucket. If your retention cutoff bisects a minute but the minute rollup still represents the entire minute, you need an explicit policy: delete/rebuild/subtract that bucket, use aligned retention boundaries, or ensure queries never reuse the invalid part.

---

# 30. Partitioning raw logs

For very large log tables you might have:

```text
logs_2026_08_12
logs_2026_08_13
logs_2026_08_14
...
```

Partitioning makes sense because most log queries contain time ranges and retention becomes easier to manage.

PostgreSQL's partition pruning can eliminate partitions that provably cannot contain matching timestamps, avoiding unnecessary scans. Importantly, pruning is driven by partition bounds rather than by an index existing on the partition key. ([PostgreSQL][10])

---

# 31. Does the rollup table also need partitioning?

Not necessarily.

Consider:

```text
raw:
2 billion rows

minute rollups:
8 million rows
```

The rollup might already be manageable as one ordinary table.

Benefits of partitioning rollups may include:

```text
fast retention management
partition pruning
smaller per-partition indexes
operational isolation
```

Costs include:

```text
more schema objects
more management
more planning complexity
partition maintenance
```

Therefore:

> Partition raw and rollup tables independently based on their own size and access patterns.

Do not say:

```text
raw is partitioned
therefore rollup must be partitioned
```

---

# 32. PostgreSQL implementation choices

## Normal logged table

Usually the default recommendation.

```sql
CREATE TABLE tenant_log_minute_rollups (...);
```

Benefits:

```text
durable
WAL protected
replicated normally
normal crash semantics
```

---

## UNLOGGED table

```sql
CREATE UNLOGGED TABLE ...
```

PostgreSQL does not write regular table changes to WAL for an `UNLOGGED` table, which can make writes faster, but those tables are not crash-safe: after a crash or unclean shutdown PostgreSQL truncates them, and their contents are not replicated to standby servers. ([PostgreSQL][11])

This creates an interesting architecture:

```text
logged raw logs
+
unlogged rollups
```

If PostgreSQL crashes:

```text
raw logs          ✅ survive
rollups           ❌ may disappear
```

If your system can do:

```text
aggregate endpoint:
fallback to raw / unavailable temporarily

background:
rebuild rollups from raw
```

then this may be acceptable.

But it is a conscious durability trade.

Do not treat `UNLOGGED` as a free performance switch.

---

# 33. PostgreSQL materialized views

You could write:

```sql
CREATE MATERIALIZED VIEW minute_logs AS
SELECT
    date_bin(...),
    tenant_id,
    service,
    level,
    COUNT(*)
FROM logs
GROUP BY ...;
```

This stores the query result.

The issue is maintenance.

Plain PostgreSQL:

```sql
REFRESH MATERIALIZED VIEW ...
```

replaces the materialized view's contents using its defining query. `CONCURRENTLY` can allow reads during refresh, subject to requirements such as a suitable unique index, but PostgreSQL still describes refresh as replacing the contents rather than automatically incrementing the view on every new source row. ([PostgreSQL][12])

For:

```text
massive continuously growing logs table
```

repeated full refreshes can be unattractive.

A manually incremented table:

```text
new batch
→ calculate delta
→ UPSERT delta
```

does not need to recalculate yesterday's millions of events.

That's a major reason manual rollup tables can be preferable for high-volume ingestion.

---

# 34. Triggers vs application-maintained rollups

A trigger could do:

```text
INSERT log
    ↓
PostgreSQL trigger
    ↓
update rollup
```

PostgreSQL triggers automatically execute configured logic when operations occur. ([PostgreSQL][13])

Advantage:

```text
all writers automatically maintain rollups
```

Disadvantage:

```text
hidden write-path work
harder performance visibility
per-row trigger designs can be disastrous
more DB coupling
batch optimization becomes harder
```

For a high-throughput log ingestion service, I would generally prefer explicit **batch-aware application maintenance or batch SQL** over naïve row triggers.

---

# 35. CTEs

CTEs can be especially useful for correctness.

A powerful pattern is:

```text
insert only genuinely new raw rows
         ↓
RETURNING inserted rows
         ↓
aggregate those rows
         ↓
increment rollup
```

Why?

Retries.

Suppose event:

```text
event_id = abc
```

is submitted twice.

If the raw table deduplicates it:

```text
first insertion  ✅
second insertion ❌ duplicate
```

but your application increments rollup both times:

```text
raw count    = 1
rollup count = 2
```

Wrong.

The safer conceptual pattern is:

```text
proposed events
      ↓
raw INSERT with idempotency constraint
      ↓
actual newly inserted events
      ↓
rollup delta
```

This is one place writable CTEs and `RETURNING` can be useful.

---

# 36. Redis cache vs PostgreSQL rollup

```text
Redis architecture

request
   ↓
Redis lookup
   ├─ hit ─────► return
   │
   └─ miss
       ↓
   PostgreSQL
       ↓
    calculate
       ↓
  populate cache
```

versus:

```text
Rollup architecture

incoming events
     ↓
PostgreSQL
 ├ raw
 └ aggregate state

request
     ↓
query aggregate state
```

Important differences:

| Rollup                                                                     | Redis cache                                |
| -------------------------------------------------------------------------- | ------------------------------------------ |
| Data-centric                                                               | Request/result-centric                     |
| Incrementally maintained                                                   | Usually populated by reads                 |
| Supports unseen query combinations that can be derived from its dimensions | Normally requires corresponding cached key |
| No TTL required for correctness                                            | TTL commonly involved                      |
| No classic cache-hit/miss                                                  | Explicit hit/miss                          |
| Part of relational query model                                             | Separate data system                       |
| Usually transactionally maintainable with raw data                         | Cross-system atomicity is harder           |
| Derived but durable if logged                                              | Cache often disposable                     |
| No separate network service                                                | Adds Redis infrastructure                  |

Redis documentation itself emphasizes invalidation and stale-data considerations in cache-aside/client-side caching patterns. ([Redis][14])

The two approaches aren't mutually exclusive.

You could have:

```text
raw
+
rollups
+
Redis caching hottest dashboard responses
```

if justified.

---

# 37. TimescaleDB continuous aggregates

TimescaleDB provides a database feature specifically designed around this problem.

Continuous aggregates store precomputed rollups so queries avoid continually rescanning raw data. Timescale's real-time aggregation capability can combine materialized data with more recent underlying raw data, and hierarchical continuous aggregates can build higher-level aggregates from lower-level ones. ([Timescale Documentation][15])

Conceptually this is very close to what you're designing manually:

```text
raw
+
incrementally refreshed materialization
+
recent/raw region
```

Why implement manually?

Potential reasons:

```text
pure PostgreSQL requirement
custom semantics
learning/project requirement
full control
avoiding extension dependency
special multi-tenant rules
```

Why use Timescale?

```text
less custom machinery
purpose-built time-series functionality
automatic refresh/materialization behavior
```

---

# 38. ClickHouse-style analytical storage

PostgreSQL is a general-purpose relational/transactional database.

ClickHouse is architected primarily around analytical workloads.

Its incremental materialized views explicitly process blocks as they are inserted and write results into a target table, thereby shifting compute from SELECT to INSERT. ([ClickHouse][4])

In a mature telemetry system an architecture could become:

```text
Applications
      ↓
ingestion pipeline
      ↓
ClickHouse
      ↓
analytical queries
```

Then efficient columnar analytical scans and native aggregation-oriented structures may reduce your dependence on handcrafted PostgreSQL rollups.

But adopting another analytical datastore brings:

```text
new infrastructure
new operational model
data movement
schema duplication
backup/monitoring requirements
consistency decisions
```

For a project whose primary database is PostgreSQL, manual rollups are a reasonable architecture to explore before introducing an entire additional analytical database.

---

# 39. Correctness issue #1: double counting

Imagine:

```text
batch arrives
rollup increment happens
process crashes
client retries
rollup increment happens again
```

Result:

```text
should be 100
becomes 200
```

Solution:

```text
idempotent event IDs
+
unique raw constraint
+
only roll up successfully inserted events
```

Don't base aggregate updates merely on:

```text
what the client submitted
```

Base them on:

```text
what was actually accepted as new data
```

---

# 40. Missing counts

Possible sequence:

```text
raw commit
worker never processes row
```

Now:

```text
raw = 100
rollup = 99
```

For async architecture use:

```text
durable processing cursor/watermark
idempotent batches
reconciliation jobs
ability to rebuild
```

For synchronous architecture use:

```text
same transaction
```

---

# 41. Incorrect bucket boundaries

Never implement one code path as:

```text
backend rounding
```

another as:

```text
PostgreSQL date_trunc
```

and another as:

```text
JavaScript arithmetic
```

without ensuring they use precisely identical alignment semantics.

Define:

```text
bucket width
origin
timezone semantics
half-open boundaries
```

globally.

PostgreSQL `date_bin(stride, source, origin)` specifically defines bins relative to the provided origin, which is useful for keeping alignment deterministic. ([PostgreSQL][2])

---

# 42. Time-zone problems

For machine-generated logs, a strong default is:

```text
store timestamptz
normalize conceptual time boundaries to UTC
```

Then display local time later.

Be particularly cautious about:

```text
calendar days
DST changes
local midnight
```

A "1-day bucket" could mean:

```text
24-hour fixed interval
```

or:

```text
local calendar day
```

Those aren't universally identical across daylight-saving transitions.

Also, PostgreSQL documents that `date_trunc` behavior on `timestamptz` can depend on time-zone context, whereas `date_bin` aligns timestamps according to stride and origin. ([PostgreSQL][2])

Define your API semantics explicitly.

---

# 43. Retention bugs

Suppose you delete:

```text
raw logs older than 30d
```

but aggregation still queries:

```text
rollups older than 30d
```

You could accidentally expose data that the rest of your API considers expired.

Retention policy therefore belongs in:

```text
raw cleanup
rollup cleanup
query planner
rebuild logic
```

not merely in one cron job.

---

# 44. Concurrent UPSERTs and hot buckets

Suppose 100 ingestion requests simultaneously produce:

```text
tenant=A
minute=10:00
service=checkout
level=info
```

They all want one row:

```text
A | 10:00 | checkout | info
```

PostgreSQL can safely perform concurrent `ON CONFLICT DO UPDATE` operations; under Read Committed, each proposed row resolves to either an insert or update, and concurrent updates to the same tuple serialize appropriately. ([PostgreSQL][16])

But correctness doesn't mean zero waiting.

You have created a:

> **hot row**

Conceptually:

```text
writer A ─┐
writer B ─┤
writer C ─┤
writer D ─┼──► one aggregate row
writer E ─┤
writer F ─┘
```

PostgreSQL data-modifying commands acquire the appropriate write locks, and competing modifications of the same rows can wait on one another. ([PostgreSQL][17])

At extreme ingestion rates that single aggregate key may become a serialization point.

---

# 45. Why batching reduces hot-row contention

Without aggregation:

```text
1000 checkout/info events

1000 attempts to modify:
A|10:00|checkout|info
```

With batch aggregation:

```text
1000 events
    ↓
one delta:

A|10:00|checkout|info|1000
    ↓
one UPSERT
```

Much better.

This is why request coalescing/batching can matter almost as much as the rollup idea itself.

---

# 46. Can rollups make performance worse?

Absolutely.

This pattern is not automatically an optimization.

Imagine:

```text
ingestion:
100,000 events/sec

aggregation queries:
one query/hour
```

You're spending enormous effort maintaining data almost nobody reads.

Or:

```text
90% queries contain arbitrary JSON filters
```

Then:

```text
90% → raw fallback
```

but you still pay rollup maintenance on every write.

Or:

```text
rollup dimensions include user_id
```

where almost every log has a different user.

Now:

```text
raw rows ≈ rollup rows
```

plus extra updates and indexes.

So:

> Rollups must be benchmarked against the real workload.

Measure at least:

```text
ingestion throughput
p50/p95/p99 write latency
aggregation p50/p95/p99
DB CPU
DB memory
WAL throughput
disk I/O
table/index size
lock waits
buffer-cache hit rate
connection usage
```

Then compare:

```text
baseline raw-only

vs

raw + minute rollup

vs

raw + minute + second

etc.
```

---

# 47. A complete architecture

I'd think about your system like this:

```text
                  APPLICATIONS
                       │
                       ▼
                  POST /logs
                       │
                       ▼
                   Validation
                       │
                       ▼
            Batch / Request Coalescing
                       │
                       ▼
             ┌───────────────────┐
             │ Database TX       │
             │                   │
             │ ┌───────────────┐ │
             │ │ Raw Logs      │ │
             │ └───────────────┘ │
             │        +          │
             │ ┌───────────────┐ │
             │ │ Rollup UPSERT │ │
             │ └───────────────┘ │
             └─────────┬─────────┘
                       │
                     COMMIT
```

Read side:

```text
GET /logs
    │
    ▼
raw logs
```

because it wants events.

Aggregation:

```text
GET /logs/aggregate
          │
          ▼
parse filters
          │
          ▼
Can rollups represent all requested predicates?
          │
     ┌────┴─────┐
     │          │
    YES         NO
     │          │
     ▼          ▼
choose       raw aggregation
rollup
strategy
     │
     ▼
split exact range
     │
     ├─ raw / fine rollup left edge
     │
     ├─ coarse rollup middle
     │
     └─ raw / fine rollup right edge
     │
     ▼
UNION ALL
     │
     ▼
final grouping
     │
     ▼
response
```

That's essentially your entire architecture in one picture.

---

# 48. Simple PostgreSQL schema

## Raw logs

```sql
CREATE TABLE logs (
    id          bigserial PRIMARY KEY,
    event_id    uuid NOT NULL UNIQUE,
    tenant_id   uuid NOT NULL,
    timestamp   timestamptz NOT NULL,
    service     text NOT NULL,
    level       text NOT NULL,
    message     text NOT NULL,
    attributes  jsonb
);

CREATE INDEX idx_logs_tenant_timestamp
ON logs (tenant_id, timestamp DESC);
```

If your most common raw query also filters by service, benchmark whether another index is justified rather than automatically adding it.

---

## Second rollup

```sql
CREATE TABLE tenant_log_second_rollups (
    tenant_id   uuid NOT NULL,
    bucket      timestamptz NOT NULL,
    service     text NOT NULL,
    level       text NOT NULL,
    count       bigint NOT NULL,

    PRIMARY KEY (
        tenant_id,
        bucket,
        service,
        level
    )
);
```

---

## Minute rollup

```sql
CREATE TABLE tenant_log_minute_rollups (
    tenant_id   uuid NOT NULL,
    bucket      timestamptz NOT NULL,
    service     text NOT NULL,
    level       text NOT NULL,
    count       bigint NOT NULL,

    PRIMARY KEY (
        tenant_id,
        bucket,
        service,
        level
    )
);
```

Optional if service-filtered queries are extremely common:

```sql
CREATE INDEX idx_minute_rollup_tenant_service_bucket
ON tenant_log_minute_rollups (
    tenant_id,
    service,
    bucket
);
```

Don't add this without evidence.

The primary key already provides an index beginning with:

```text
tenant_id, bucket
```

which is excellent for tenant + time-range access.

---

# 49. Ingestion pseudocode

```text
receive batch

validate batch

deduplicate / determine accepted events

group accepted events by:
    tenant
    second bucket
    service
    level

group accepted events by:
    tenant
    minute bucket
    service
    level

BEGIN

bulk insert accepted raw rows

bulk UPSERT second deltas

bulk UPSERT minute deltas

COMMIT

return success
```

A more correctness-oriented formulation is:

```text
receive proposed events
        ↓
insert raw with event-id uniqueness
        ↓
identify rows actually inserted
        ↓
aggregate ONLY those inserted rows
        ↓
UPSERT rollups
```

That prevents retries from incrementing aggregate state twice.

---

# 50. Aggregation planner pseudocode

```text
function aggregate(request):

    validate tenant
    validate since < until

    if filters not supported by rollup:
        return aggregateRaw(request)

    choose best available rollup resolution

    calculate exact aligned ranges

    parts = []

    if left partial region exists:
        parts += query finer rollup / raw

    if full rollup region exists:
        parts += query rollup

    if right partial region exists:
        parts += query finer rollup / raw

    union all parts

    re-bin to requested output bucket

    group by requested dimensions

    return result
```

A more advanced planner:

```text
raw
 ↓
seconds
 ↓
minutes
 ↓
hours

pick coarsest representation
that preserves the requested semantics
for each sub-range
```

---

# 51. Complete worked example

Let's walk through everything.

Assume:

```text
Tenant = A
```

Batch 1:

```text
10:00:01.100 checkout error
10:00:02.200 checkout error
10:00:03.300 auth     info
10:00:20.000 checkout error
```

Raw:

```text
logs

A 10:00:01.100 checkout error
A 10:00:02.200 checkout error
A 10:00:03.300 auth     info
A 10:00:20.000 checkout error
```

Before writing minute rollup, group batch:

```text
A | 10:00 | checkout | error = 3
A | 10:00 | auth     | info  = 1
```

UPSERT:

```text
minute_rollup

A | 10:00 | checkout | error | 3
A | 10:00 | auth     | info  | 1
```

---

Another batch arrives:

```text
10:00:45 checkout error
10:00:50 checkout error
10:01:02 checkout error
10:01:10 auth     info
```

Batch aggregation:

```text
A | 10:00 | checkout | error = +2

A | 10:01 | checkout | error = +1
A | 10:01 | auth     | info  = +1
```

UPSERT.

Result:

```text
A | 10:00 | checkout | error | 5
A | 10:00 | auth     | info  | 1

A | 10:01 | checkout | error | 1
A | 10:01 | auth     | info  | 1
```

Notice:

```text
3 + 2 = 5
```

No historical recount occurred.

---

# 52. Now an aggregation request arrives

Request:

```text
since  = 10:00:15
until  = 10:01:30
bucket = 1 minute
group  = service
```

Minute rollup cannot use:

```text
10:00 full minute
```

because query begins at:

```text
10:00:15
```

It also cannot use:

```text
10:01 full minute
```

because query stops at:

```text
10:01:30
```

There is actually no complete minute inside this tiny request.

So:

```text
raw fallback for whole range
```

might be optimal.

This highlights something important:

> Using a rollup is a planner decision, not a religion.

---

# 53. Larger request

Now request:

```text
since = 10:00:15
until = 10:05:30
```

Split:

```text
LEFT
10:00:15 → 10:01:00
raw

MIDDLE
10:01:00 → 10:05:00
minute rollup

RIGHT
10:05:00 → 10:05:30
raw
```

Visual:

```text
10:00:15                                         10:05:30
    |------------------------------------------------|
    | RAW |============= MINUTE =================|RAW|
          10:01                               10:05
```

Now you get exact semantics while scanning only two partial minutes of raw data.

---

# 54. One subtle improvement: cost-based choice

Imagine:

```text
query duration = 75 seconds
```

Hybrid plan might require:

```text
two raw edge queries
+
one rollup query
+
UNION
+
final group
```

Maybe simply scanning 75 seconds of raw logs is cheaper.

Therefore a sophisticated planner can consider:

```text
range duration
expected raw row count
rollup row count
filter selectivity
query setup overhead
```

and decide:

```text
raw only
```

for small queries.

You don't need to implement a full optimizer initially.

A simple rule can work:

```text
if range < N minutes:
    raw

else:
    hybrid
```

Then benchmark `N`.

---

# 55. Failure and retry model

A production-quality rollup design must answer:

```text
What identifies an event uniquely?

Can ingestion retry?

Can the same batch arrive twice?

What happens if commit response is lost?

Can rollups be rebuilt?

How do I know rebuilding completed?

How do I detect divergence?
```

Example:

```text
client sends batch
      ↓
DB commits successfully
      ↓
network fails before HTTP response
      ↓
client retries
```

The server cannot assume:

```text
retry = new data
```

Idempotency must exist below HTTP success/failure semantics.

---

# 56. Architecture A vs B summarized

|                           | Async worker             | Same transaction           |
| ------------------------- | ------------------------ | -------------------------- |
| Ingestion latency         | Lower                    | Higher                     |
| Aggregate freshness       | Eventual                 | Immediate                  |
| Raw/rollup consistency    | More complex             | Strong                     |
| Failure handling          | Worker/checkpoint        | Transaction rollback       |
| Write-path complexity     | Lower API, higher worker | Higher API                 |
| Batching opportunities    | Excellent                | Good                       |
| Database transaction size | Smaller ingest TX        | Larger                     |
| Rollup rebuild model      | Natural                  | Optional                   |
| Hot-row effect on API     | Reduced                  | Direct                     |
| Operational complexity    | Higher                   | Often conceptually simpler |

For your kind of project, I would start by benchmarking Architecture B with **batch-level rollup updates**, because it gives a very understandable consistency model.

If throughput suffers significantly, then Architecture A becomes much more attractive.

---

# 57. Common multi-tenant trap

Don't merely write:

```sql
WHERE tenant_id = :tenant
```

in your final rollup SELECT while using non-tenant-aware aggregate rows.

Isolation has to exist at storage identity:

```text
PRIMARY KEY
tenant + bucket + dimensions
```

and preferably throughout:

```text
request authentication
 ↓
resolved tenant
 ↓
raw insert
 ↓
rollup grouping
 ↓
rollup key
 ↓
query predicates
```

Tenant must never be "added at the end."

---

# 58. Another common mistake: storing too many rollups

You might be tempted to create:

```text
second_by_service
second_by_level
second_by_service_level

minute_by_service
minute_by_level
minute_by_service_level

hour_by_service
hour_by_level
hour_by_service_level
```

Usually unnecessary.

If:

```text
minute(service,level)
```

exists, then it can generate:

```text
minute(service)
minute(level)
minute(total)
```

through summation.

Store the most useful **base dimensional state** and aggregate upward.

---

# 59. Another mistake: rollup every attribute

This turns:

```text
compression
```

into:

```text
data duplication explosion
```

Good rollup dimensions often have controlled cardinality:

```text
service
level
status class
region
```

Bad candidates often include:

```text
message
trace_id
request_id
user_id
arbitrary JSON blob
```

unless your business workload specifically justifies them.

---

# 60. Another mistake: assuming rollups remove raw indexes

They don't necessarily.

You still need:

```text
GET /logs
message searches
attribute searches
raw boundary queries
unsupported aggregate filters
```

So rollups complement raw-access optimization rather than replacing it.

---

# 61. Another mistake: implementing rollups before measuring raw aggregation

Before adding this architecture, benchmark:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT ...
```

PostgreSQL's `EXPLAIN` shows how the planner scans relations and executes the query, making it essential for establishing your raw baseline. ([PostgreSQL][18])

Maybe your actual bottleneck is:

```text
bad index
bad partition pruning
unnecessary JSON filter
connection pool saturation
inefficient ORM
huge message GIN index
```

Rollups will not automatically fix those.

---

# 62. When I would use this pattern

Strong indicators:

```text
✓ append-heavy/time-series data
✓ frequent repeated aggregations
✓ natural time buckets
✓ limited set of important grouping dimensions
✓ raw dataset much larger than rollup representation
✓ aggregation latency matters
✓ raw data must still remain available
✓ database CPU is being consumed by repeated GROUP BY work
```

Very appropriate:

```text
logs
metrics
telemetry
events
API request statistics
audit-event dashboards
usage analytics
```

---

# 63. When I would NOT use it

Weak fit:

```text
✗ very few aggregation queries
✗ tiny dataset
✗ almost every query uses arbitrary filters
✗ grouping dimensions are enormous-cardinality fields
✗ ingestion throughput is vastly more important than reads
✗ aggregates change unpredictably because historical events are heavily updated/deleted
✗ raw scans already satisfy latency/CPU targets
```

In those cases the extra write cost may be pointless.

---

# 64. Comparison with your main alternatives

## Raw PostgreSQL

```text
Best:
flexibility
simplicity
arbitrary filtering

Weakness:
repeated large aggregations
```

Use while scale remains manageable.

---

## Rollups

```text
Best:
known repeated aggregate patterns
exact time-series aggregates
PostgreSQL-only architecture

Weakness:
write amplification
fixed dimensional capabilities
custom correctness complexity
```

---

## Redis cache

```text
Best:
repeat identical/hot query responses
extremely fast response reuse

Weakness:
invalidation
staleness
cache misses
additional infrastructure
```

Complementary rather than equivalent.

---

## PostgreSQL materialized view

```text
Best:
read-heavy data
periodically refreshed summaries
refresh latency acceptable

Weakness:
plain PostgreSQL refresh model isn't continuous incremental maintenance
```

PostgreSQL's native refresh replaces materialized-view contents. ([PostgreSQL][12])

---

## Timescale continuous aggregates

```text
Best:
PostgreSQL-compatible time-series workload
want automated continuous aggregate machinery

Weakness:
extension dependency
less custom than hand-built architecture
```

Its real-time and hierarchical aggregate features closely match the ideas you're learning. ([Timescale Documentation][8])

---

## ClickHouse

```text
Best:
very high-volume analytical workloads
large scans
columnar analytics
telemetry at much larger scale

Weakness:
new datastore
additional operating complexity
different data architecture
```

Its incremental materialized views implement the same fundamental read-vs-write compute shift. ([ClickHouse][4])

---

# 65. The definition you should remember

**Incremental Pre-Aggregation with Time-Based Rollup Tables** is:

> A data architecture where aggregate state is stored persistently by time bucket and selected dimensions, and new events incrementally update that state so queries can read compact summaries instead of repeatedly aggregating raw events.

The **hybrid raw + rollup variant** adds:

> Fully covered time buckets are answered from precomputed rollups, while partially covered boundary intervals are calculated from finer-grained rollups or raw events, preserving the exact requested time range.

---

# 66. The mental model

Remember this:

```text
RAW
=
truth/detail

ROLLUP
=
summary/index

HYBRID QUERY
=
use the cheapest representation
that still gives the exact answer
```

Or visually:

```text
               WRITE

event
 │
 ├────────────► RAW
 │
 └────────────► SUMMARY


               READ

requested time range
|-----------------------------------------------|

precise       cheap summaries            precise
| RAW |===============================| RAW |
```

And with multiple resolutions:

```text
RAW
 ↓
SECOND
 ↓
MINUTE
 ↓
HOUR

Query planner:

"use the coarsest safe representation
for each part of the requested range."
```

That's the strongest mental model.

---

# 67. Advantages

```text
+ dramatically fewer rows processed by aggregate queries
+ lower repeated aggregation CPU
+ potentially much lower query latency
+ predictable dashboard performance as raw history grows
+ reusable across many requested bucket sizes
+ exact semantics possible with hybrid edges
+ naturally tenant-aware
+ remains entirely inside PostgreSQL
+ rollups can be rebuildable derived data
```

---

# 68. Disadvantages

```text
- higher write cost
- more WAL/storage
- more schema complexity
- possible hot-row contention
- idempotency becomes critical
- difficult handling of arbitrary filters
- retention must synchronize with aggregates
- rebuild/reconciliation strategy may be required
- high-cardinality dimensions can destroy the benefit
- query planner becomes more complicated
```

---

# 69. Performance trade-off in one diagram

```text
                 RAW ONLY

ingest    ███
query     █████████████████████


                WITH ROLLUPS

ingest    ██████
query     ██
```

The goal isn't:

```text
make everything free
```

It's:

```text
spend a little more once
when data arrives

instead of spending a lot
every time someone reads it
```

---

# 70. Multi-tenant rules to remember

For your project, I would treat these as mandatory invariants:

```text
tenant belongs in rollup primary key

tenant belongs in all rollup queries

tenant belongs in all batch grouping keys

tenant cannot be inferred from service name

tenant cannot be added after aggregation

rebuild jobs must rebuild by tenant correctly

retention must remain tenant-aware
```

Never permit:

```text
Tenant A + Tenant B
        ↓
same aggregate state
```

---

# 71. Decision checklist

Before implementing a rollup, ask:

```text
1. Are aggregations actually a measured bottleneck?

2. Are the same aggregation dimensions requested repeatedly?

3. Is rollup cardinality much smaller than raw cardinality?

4. Can most aggregation filters be represented by the rollup?

5. What granularity provides the best compression/precision balance?

6. Do I need second + minute, or is minute enough?

7. Will writes maintain rollups synchronously or asynchronously?

8. How do I prevent retries from double counting?

9. Is raw data the authoritative source of truth?

10. Can I rebuild rollups?

11. What happens if rebuilds are in progress?

12. How do raw and rollup retention interact?

13. Are all keys tenant-aware?

14. Could hot aggregate rows limit concurrency?

15. How much ingestion throughput does rollup maintenance cost?

16. What is the measured aggregate latency improvement?

17. Do the benefits outweigh the write amplification?
```

The answer to #17 is ultimately determined by benchmarks.

---

# 72. Technical terms worth studying next

Once you're comfortable with this architecture, I'd study these in roughly this order:

1. **Idempotent ingestion**
2. **Write amplification**
3. **Hot-key / hot-row contention**
4. **Request coalescing**
5. **Batch aggregation**
6. **Incremental materialized views**
7. **Continuous aggregates**
8. **Aggregate states / mergeable aggregates**
9. **Partition pruning**
10. **Time-series partitioning**
11. **Late-arriving data**
12. **Watermarks**
13. **Backfill**
14. **Rollup reconciliation**
15. **Cardinality**
16. **Dimensional modeling**
17. **Approximate aggregates**
18. **HyperLogLog**
19. **t-digest**
20. **Count-Min Sketch**
21. **LSM-tree architecture**
22. **Columnar storage**
23. **ClickHouse MergeTree**
24. **MVCC under heavy ingestion**
25. **WAL/write amplification**
26. **PostgreSQL autovacuum under high write rates**

---

## The interview/demo explanation

If somebody asks you:

> "What architecture did you use to speed up log aggregation?"

A strong answer is:

> We maintain tenant-aware incremental time-based rollup tables alongside the raw log store. Incoming batches are first grouped by time bucket and supported dimensions such as service and level, then the aggregate deltas are applied with PostgreSQL UPSERTs rather than updating the rollup once per event. This moves part of the aggregation cost from repeated read time to write time.
>
> Aggregate queries use a hybrid strategy. Fully covered intervals are read from the coarsest rollup that can exactly represent them, while partial boundary intervals are computed from finer rollups or raw logs. The pieces are combined with `UNION ALL` and a final aggregation, so the requested `since`/`until` semantics remain exact rather than being rounded to rollup boundaries.
>
> Rollups only support dimensions represented in their schema, so arbitrary message or JSON-attribute filters fall back to raw aggregation. Every aggregate key contains `tenant_id` to prevent cross-tenant mixing. The architecture therefore trades some write amplification and additional consistency complexity for substantially lower repeated aggregation cost, and that trade is validated with ingestion and query benchmarks rather than assumed.

If you can explain **why each sentence of that paragraph is true**, then you understand the pattern well enough to design and defend it.