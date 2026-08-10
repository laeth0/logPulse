Write integration tests for logPulse (NestJS 11 + TypeORM + PostgreSQL,
Zod for validation). test/jest-e2e.json is already configured for this;
the only existing spec is the default Nest boilerplate at
test/app.e2e-spec.ts (tests GET / → "Hello World!", unrelated to this
project) — treat this as a from-scratch suite.

Use @nestjs/testing + supertest against a real PostgreSQL instance — this
project's evaluation criteria explicitly require Postgres as the source of
truth, so do not mock the database. Run real migrations against a real
instance (e.g. the docker-compose `database` service or a disposable test
database) before each suite.

Cover the required API contract from docs/Final_Project.md end to end:

- GET /health — 200 only once DB connected + migrations applied.
- POST /logs — 200 with accepted count when ≥1 entry valid; 400 when all
  entries rejected, body isn't {logs: [...]}, or JSON is malformed; rejected
  entries carry correct index + reason for each documented validation rule
  (bad timestamp / >5min future, bad level, empty service/message, nested
  attribute values).
- GET /logs — every filter (service, level, since/until, attr.<key>, q
  case-insensitive substring) individually and combined; descending
  timestamp order with deterministic tie-break; cursor pagination walks the
  full result set with no gaps/dupes; next_cursor null on the last page;
  400 + {"error": "..."} for invalid timestamps, until<since, bad level,
  non-numeric/out-of-range limit, malformed cursor.
- GET /logs/aggregate — bucket correctness for 1m/5m/1h/1d, group_by
  service/level producing one row per bucket×group, group null when
  ungrouped, ascending bucket order, required since/until/bucket enforced,
  same 400 contract as GET /logs.

Constraints:
- Don't alter the cursor's opaque Base64URL format or its single generic
  error message (established convention — see .wolf/cerebrum.md
  Do-Not-Repeat).
- Don't touch the COPY-based ingestion path's public behavior
  (src/logs/repositories/log.repository.ts) — test its observable
  contract, not its internals.
- Confirm `npm run test:e2e` passes locally against docker-compose's
  Postgres.
- Note in your final summary whether .github/workflows/ci.yml's `quality`/
  `build`/`smoke` jobs should gain a `test` job — don't add it yourself
  without confirming, since CI scope has intentionally been kept minimal
  in prior sessions (see .wolf/cerebrum.md).
