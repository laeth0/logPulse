The project specification defines one required domain object: a log containing a timestamp, level, service, message, and arbitrary flat attributes. It must support filtering, aggregation, cursor pagination, and retention while handling around one million records and high ingestion throughput. The schema below is a proposed PostgreSQL design based on those requirements. 

# 1. Required entities

## Core entity: `Log`

| Field             | PostgreSQL type  | Purpose                                      |
| ----------------- | ---------------- | -------------------------------------------- |
| `id`              | `bigint`         | Unique identifier and pagination tie-breaker |
| `timestamp`       | `timestamptz`    | When the event happened                      |
| `level`           | `log_level` enum | `debug`, `info`, `warn`, or `error`          |
| `service`         | `text`           | Application/service that produced the log    |
| `message`         | `text`           | Log message                                  |
| `attributes`      | `jsonb`          | Original arbitrary attributes                |
| `attributes_text` | `jsonb`          | Internal normalized attributes for searching |
| `ingested_at`     | `timestamptz`    | When the service stored the log              |

Only `Log` is required as a real business entity.

You do **not** need separate entities for:

* Services
* Log levels
* Attributes
* Ingestion batches
* Aggregation buckets

Aggregation buckets are calculated query results, not stored entities.

## Optional configuration: retention policy

Retention can simply be configured through an environment variable:

```env
LOG_RETENTION_DAYS=30
```

A `RetentionPolicy` table is only useful when administrators must change retention while the application is running.

---

# 2. Recommended PostgreSQL schema

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE log_level AS ENUM (
    'debug',
    'info',
    'warn',
    'error'
);

CREATE TABLE logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY,

    timestamp TIMESTAMPTZ NOT NULL,

    level log_level NOT NULL,

    service TEXT NOT NULL,

    message TEXT NOT NULL,

    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,

    attributes_text JSONB NOT NULL DEFAULT '{}'::jsonb,

    ingested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_logs
        PRIMARY KEY (timestamp, id),

    CONSTRAINT chk_logs_service_non_empty
        CHECK (char_length(service) > 0),

    CONSTRAINT chk_logs_message_non_empty
        CHECK (char_length(message) > 0),

    CONSTRAINT chk_logs_attributes_object
        CHECK (jsonb_typeof(attributes) = 'object'),

    CONSTRAINT chk_logs_attributes_text_object
        CHECK (jsonb_typeof(attributes_text) = 'object')
)
PARTITION BY RANGE (timestamp);
```

Example daily partition:

```sql
CREATE TABLE logs_2026_08_02
PARTITION OF logs
FOR VALUES FROM ('2026-08-02 00:00:00+00')
TO ('2026-08-03 00:00:00+00');
```

A default partition can handle timestamps for which no partition exists:

```sql
CREATE TABLE logs_default
PARTITION OF logs DEFAULT;
```

---

# 3. Why use `BIGINT` for the ID?

```sql
id BIGINT GENERATED ALWAYS AS IDENTITY
```

A UUID is possible, but a sequential `BIGINT` is better here because it:

* Uses 8 bytes instead of 16 bytes.
* Produces smaller indexes.
* Is faster to generate.
* Has better B-tree locality.
* Is suitable for high-volume inserts.

Node.js PostgreSQL libraries normally return `BIGINT` as a string, which is acceptable because the API contract allows any unique ID.

The ID is also needed to make ordering deterministic:

```sql
ORDER BY timestamp DESC, id DESC
```

Two logs may have exactly the same timestamp. The ID provides the final tie-breaker.

---

# 4. Why is the primary key `(timestamp, id)`?

```sql
PRIMARY KEY (timestamp, id)
```

Because the table is partitioned by `timestamp`, PostgreSQL requires unique constraints on the partitioned table to include the partition key.

It also matches the cursor pagination design.

A cursor can contain:

```json
{
  "timestamp": "2026-08-02T10:15:00.123Z",
  "id": "72391"
}
```

The next query becomes:

```sql
SELECT *
FROM logs
WHERE (timestamp, id) < ($1, $2)
ORDER BY timestamp DESC, id DESC
LIMIT $3;
```

This is keyset pagination. It remains fast even when the table becomes large.

Do not use:

```sql
OFFSET 900000
```

PostgreSQL would still need to scan and discard hundreds of thousands of rows.

---

# 5. Why use `TIMESTAMPTZ`?

```sql
timestamp TIMESTAMPTZ NOT NULL
```

The API accepts ISO 8601 timestamps, normally including a timezone or `Z`.

`TIMESTAMPTZ` stores the timestamp as an absolute point in time and avoids timezone ambiguity.

There are two timestamps:

### `timestamp`

The event timestamp supplied by the client.

Used for:

* Filtering with `since` and `until`
* Sorting
* Aggregation
* Pagination
* Partitioning
* Retention

### `ingested_at`

The time your service stored the log.

Useful for:

* Measuring ingestion delay
* Debugging delayed logs
* Operational metrics

There is no `updated_at` because logs should be immutable after insertion.

---

# 6. Why use a PostgreSQL enum for level?

```sql
CREATE TYPE log_level AS ENUM (
    'debug',
    'info',
    'warn',
    'error'
);
```

This guarantees that invalid values such as `critical` cannot be stored.

It also makes queries readable:

```sql
WHERE level = 'error'
```

A `SMALLINT` with a check constraint would be slightly smaller, but the four levels are fixed by the contract, so the enum is clearer.

---

# 7. Attribute storage strategy

The specification allows arbitrary flat attributes:

```json
{
  "user_id": "42",
  "region": "eu-west",
  "retries": 3,
  "premium": true
}
```

The best core storage type is `JSONB`.

```sql
attributes JSONB NOT NULL DEFAULT '{}'::jsonb
```

## Why not create a `log_attributes` table?

An alternative would be:

```text
log_attributes
--------------
log_id
key
value
```

But one log containing five attributes would create:

* One row in `logs`
* Five rows in `log_attributes`

At 15,000 logs per second, that could become 75,000 additional attribute rows per second.

That causes:

* More inserts
* Larger indexes
* More foreign-key work
* More joins
* More storage
* More complicated batch ingestion

JSONB keeps each log as one row, which is much better for ingestion.

---

# 8. Why have both `attributes` and `attributes_text`?

The API says attribute equality must be compared **as strings**.

Suppose the database contains:

```json
{
  "retries": 3,
  "active": true,
  "user_id": "42"
}
```

The query:

```text
attr.retries=3
```

must compare against the string representation `"3"` even though the original value is numeric.

Therefore, store two versions.

## Original attributes

```json
{
  "retries": 3,
  "active": true,
  "user_id": "42"
}
```

Used in the API response.

## Search attributes

```json
{
  "retries": "3",
  "active": "true",
  "user_id": "42"
}
```

Used only internally for filtering.

The application creates `attributes_text` during validation:

```ts
function normalizeAttributes(
  attributes: Record<string, string | number | boolean>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(attributes).map(([key, value]) => [
      key,
      String(value),
    ]),
  );
}
```

Then an attribute filter becomes:

```sql
WHERE attributes_text @> jsonb_build_object($1, $2)
```

For:

```text
attr.user_id=42
```

PostgreSQL checks for:

```json
{
  "user_id": "42"
}
```

This preserves original JSON types while providing correct string-based comparison.

---

# 9. Application validation versus database constraints

Some validation belongs in the database, while other validation belongs in the application.

## Database constraints

The database should enforce:

* Required columns
* Valid log levels
* Non-empty service
* Non-empty message
* Attributes must be JSON objects

## Application validation

The application should enforce:

* Timestamp must be valid ISO 8601
* Timestamp cannot be more than five minutes in the future
* Attributes must be flat
* Attribute values must be strings, numbers, or booleans
* Nested arrays and objects are rejected

Do not use a check constraint like:

```sql
CHECK (timestamp <= NOW() + INTERVAL '5 minutes')
```

A check constraint should describe a condition that remains true for the stored row. A condition based on the current clock changes over time and is better checked during request validation.

---

# 10. Recommended indexes

```sql
CREATE INDEX idx_logs_service_timestamp_id
ON logs (
    service,
    timestamp DESC,
    id DESC
);

CREATE INDEX idx_logs_level_timestamp_id
ON logs (
    level,
    timestamp DESC,
    id DESC
);

CREATE INDEX idx_logs_attributes_text_gin
ON logs
USING GIN (
    attributes_text jsonb_path_ops
);

CREATE INDEX idx_logs_message_trigram
ON logs
USING GIN (
    message gin_trgm_ops
);
```

The primary-key index already covers:

```sql
(timestamp, id)
```

Therefore, a separate timestamp index is unnecessary.

---

# 11. Primary-key index

Automatically created by:

```sql
PRIMARY KEY (timestamp, id)
```

It supports:

```sql
WHERE timestamp >= $1
  AND timestamp < $2
ORDER BY timestamp DESC, id DESC
LIMIT 100;
```

It also supports cursor pagination:

```sql
WHERE (timestamp, id) < ($cursorTimestamp, $cursorId)
ORDER BY timestamp DESC, id DESC
LIMIT 101;
```

The service requests `limit + 1` rows:

* Return the first `limit` rows.
* If an extra row exists, create `next_cursor`.
* Otherwise, return `next_cursor: null`.

Although the primary-key index is stored ascending, PostgreSQL can scan a B-tree backwards for descending results.

---

# 12. Service index

```sql
CREATE INDEX idx_logs_service_timestamp_id
ON logs (
    service,
    timestamp DESC,
    id DESC
);
```

Supports:

```text
GET /logs?service=checkout
```

And:

```text
GET /logs?service=checkout&since=...&until=...
```

The query becomes:

```sql
SELECT *
FROM logs
WHERE service = $1
  AND timestamp >= $2
  AND timestamp < $3
ORDER BY timestamp DESC, id DESC
LIMIT $4;
```

## Why is `service` first?

A general composite-index rule is:

> Equality columns first, range and sorting columns afterward.

Here:

* `service = ...` is equality.
* `timestamp >= ...` is a range.
* Results are sorted by timestamp and ID.

Therefore:

```text
service → timestamp → id
```

is the correct order.

---

# 13. Level index

```sql
CREATE INDEX idx_logs_level_timestamp_id
ON logs (
    level,
    timestamp DESC,
    id DESC
);
```

Supports:

```text
GET /logs?level=error
```

And:

```text
GET /logs?level=error&since=...&until=...
```

It also helps aggregation queries filtered by level.

The order follows the same reasoning:

```text
level equality → timestamp range → deterministic ID order
```

---

# 14. Attributes GIN index

```sql
CREATE INDEX idx_logs_attributes_text_gin
ON logs
USING GIN (
    attributes_text jsonb_path_ops
);
```

A normal B-tree index cannot index every possible JSON key because the keys are arbitrary.

GIN is designed for values containing multiple searchable elements, including JSONB.

The query:

```sql
WHERE attributes_text @>
      jsonb_build_object('user_id', '42')
```

can use the GIN index.

## Why `jsonb_path_ops`?

Compared with the default JSONB GIN operator class, `jsonb_path_ops` is generally:

* Smaller
* Faster for containment queries
* Better aligned with `@>` equality filtering

Its limitation is that it supports fewer JSON operators. That is acceptable because the API requires attribute equality, not complex JSON querying.

---

# 15. Message substring index

The API supports:

```text
q=declined
```

Which normally becomes:

```sql
WHERE message ILIKE '%declined%'
```

A regular B-tree index cannot efficiently handle a pattern beginning with `%`.

That is why the schema enables:

```sql
CREATE EXTENSION pg_trgm;
```

And creates:

```sql
CREATE INDEX idx_logs_message_trigram
ON logs
USING GIN (message gin_trgm_ops);
```

The trigram index breaks text into small three-character pieces and helps PostgreSQL find substring matches.

Without this index, PostgreSQL may perform a sequential scan over all matching partitions.

## Trade-off

The trigram index can be large and makes inserts more expensive. Because ingestion performance is critical, benchmark the system both with and without it.

However, it is the index that directly matches the required case-insensitive substring query.

---

# 16. Combining filters

The API allows filters to be freely combined:

```text
service=checkout
level=error
attr.region=eu-west
q=declined
since=...
until=...
```

You should not create an index for every possible combination.

For example, these would quickly become excessive:

```text
(service, level, timestamp)
(service, region, timestamp)
(level, region, timestamp)
(service, level, region, timestamp)
```

PostgreSQL can sometimes combine separate indexes using bitmap operations.

For example:

* Service B-tree index
* Level B-tree index
* Attributes GIN index

The planner may combine their results and then apply the remaining filters.

If load tests show that `service + level` is extremely common, an optional index can be added:

```sql
CREATE INDEX idx_logs_service_level_timestamp_id
ON logs (
    service,
    level,
    timestamp DESC,
    id DESC
);
```

Do not add it before measuring. Every additional index reduces insert throughput.

---

# 17. Why partition by timestamp?

```sql
PARTITION BY RANGE (timestamp)
```

All major operations depend on time:

* Time-range queries
* Sorting
* Aggregation buckets
* Cursor pagination
* Retention

Daily partitions might look like:

```text
logs_2026_08_01
logs_2026_08_02
logs_2026_08_03
```

## Query advantage

For:

```sql
WHERE timestamp >= '2026-08-02'
  AND timestamp < '2026-08-03'
```

PostgreSQL can use partition pruning and scan only:

```text
logs_2026_08_02
```

Instead of checking the entire month.

## Retention advantage

Suppose retention is 30 days.

Without partitioning:

```sql
DELETE FROM logs
WHERE timestamp < NOW() - INTERVAL '30 days';
```

A large delete creates:

* Many dead tuples
* More WAL
* Autovacuum pressure
* Table bloat
* Longer-running transactions

With daily partitions:

```sql
DROP TABLE logs_2026_07_01;
```

Dropping an expired partition is much cheaper than deleting each row individually.

---

# 18. Partition management

A scheduled process should:

1. Create partitions several days ahead.
2. Drop partitions older than the retention cutoff.
3. Check whether unexpected rows entered the default partition.

Example partition creation:

```sql
CREATE TABLE IF NOT EXISTS logs_2026_08_03
PARTITION OF logs
FOR VALUES FROM ('2026-08-03 00:00:00+00')
TO ('2026-08-04 00:00:00+00');
```

Example retention:

```sql
DROP TABLE IF EXISTS logs_2026_07_03;
```

The partition job should run outside the main request path.

---

# 19. Retention policy definition

A simple policy is:

```env
LOG_RETENTION_DAYS=30
```

Retention can be based on the client event timestamp:

```text
expired when timestamp < now - retention period
```

That aligns with partitioning and time-based queries.

The limitation should be documented:

> A delayed log whose event timestamp is already older than the retention period may be removed immediately.

An alternative is retention based on `ingested_at`, but then partitioning by event timestamp does not align perfectly with deletion. For this project, event-time retention is the cleaner choice.

---

# 20. Aggregation query

A basic one-minute aggregation:

```sql
SELECT
    date_bin(
        INTERVAL '1 minute',
        timestamp,
        TIMESTAMPTZ '1970-01-01 00:00:00+00'
    ) AS bucket_start,
    service AS group_value,
    COUNT(*) AS count
FROM logs
WHERE timestamp >= $1
  AND timestamp < $2
GROUP BY bucket_start, service
ORDER BY bucket_start ASC;
```

Without grouping:

```sql
SELECT
    date_bin(
        INTERVAL '1 minute',
        timestamp,
        TIMESTAMPTZ '1970-01-01 00:00:00+00'
    ) AS bucket_start,
    NULL AS group_value,
    COUNT(*) AS count
FROM logs
WHERE timestamp >= $1
  AND timestamp < $2
GROUP BY bucket_start
ORDER BY bucket_start ASC;
```

The bucket interval must come from an application-controlled whitelist:

```ts
const bucketIntervals = {
  '1m': '1 minute',
  '5m': '5 minutes',
  '1h': '1 hour',
  '1d': '1 day',
};
```

Never insert an arbitrary user-provided interval directly into SQL.

---

# 21. Schema relationships

There are no required relationships in the core design:

```text
┌──────────────────────────────┐
│             logs             │
├──────────────────────────────┤
│ timestamp        PK          │
│ id               PK          │
│ level                        │
│ service                      │
│ message                      │
│ attributes                   │
│ attributes_text              │
│ ingested_at                  │
└──────────────────────────────┘
```

Each daily partition contains rows with the same structure:

```text
logs
 ├── logs_2026_08_01
 ├── logs_2026_08_02
 ├── logs_2026_08_03
 └── logs_default
```

No foreign keys are needed for the core API.

---

# 22. Index summary

| Index                         | Purpose                                          |
| ----------------------------- | ------------------------------------------------ |
| Primary key `(timestamp, id)` | Time filtering, sorting, cursor pagination       |
| `(service, timestamp, id)`    | Service filtering with time range and pagination |
| `(level, timestamp, id)`      | Level filtering with time range and pagination   |
| GIN on `attributes_text`      | Arbitrary attribute equality                     |
| Trigram GIN on `message`      | Case-insensitive substring search                |

Avoid indexing:

* `ingested_at`, unless operational queries use it.
* `attributes`, because searches use `attributes_text`.
* Every attribute key separately.
* Every possible filter combination.
* `created_at` and `updated_at` fields that the API does not need.

# Final recommended model

Use one immutable, time-partitioned `logs` table with:

* Sequential `BIGINT` IDs
* `TIMESTAMPTZ` event timestamps
* PostgreSQL enum levels
* Original JSONB attributes
* Normalized JSONB search attributes
* Keyset pagination using `(timestamp, id)`
* Minimal query-specific B-tree indexes
* GIN indexes for attributes and message search
* Daily partitions for efficient retention

This design directly matches the required API while balancing flexible querying, ingestion throughput, deterministic pagination, and manageable retention.
