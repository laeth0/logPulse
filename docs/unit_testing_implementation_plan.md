# Unit Testing Implementation Plan

**Status**: Reviewed against NestJS 11 / Jest 30 / TypeORM 1.1.0 (`@nestjs/typeorm`) testing best practices.
Supersedes the plan discussed in chat — this version corrects the DI-mocking approach and adds a phase the
original plan was missing (module-wiring smoke tests).

**Layout** (unchanged, per explicit user choice): `test/unit/` mirrors `src/`'s structure —
`test/unit/logs/services/log-ingestion.service.spec.ts` for `src/logs/services/log-ingestion.service.ts`, etc.
`test/` stays home to `app.e2e-spec.ts`/`jest-e2e.json` for e2e, untouched by this plan.

---

## Testing philosophy: when to use `Test.createTestingModule` vs plain instantiation

This is the one place the original plan needed correcting. NestJS's own testing recipe defaults to
`Test.createTestingModule`, but that default exists to resolve providers **through Nest's DI container** —
which only matters when the *container itself* (module wiring, injection tokens, decorators read via
`Reflector`) is what's under test. None of this project's services, guards, or the repository read metadata
via `Reflector`, and every one of them takes its dependencies as plain constructor parameters. Decorators like
`@InjectRepository(Log, 'read')` and `@InjectDataSource()` are **only consumed by Nest's injector** — they are
inert to a plain `new ClassUnderTest(...)` call, so bypassing the container and passing hand-built mocks
positionally is both correct and the lighter-weight option.

| Use plain instantiation (`new Foo(mockA, mockB)`) when... | Use `Test.createTestingModule` when... |
|---|---|
| The class only has constructor-injected collaborators | You need to verify the *module itself* wires correctly (provider missing, wrong export, wrong token) |
| No `Reflector`/`@SetMetadata` reads, no request-scoped (`REQUEST`) providers | The class depends on something only the container can produce (a dynamically-registered provider, a scoped instance) |
| You're testing business logic (a service, guard, filter, repository method) | You're specifically testing cross-module DI wiring (see Phase 6 below) |

**Applies to**: every service in Phase 4, every guard/filter in Phase 3, and the repository/retention classes in
Phase 5 — all plain instantiation. **Does not apply to**: the new Phase 6, which exists specifically to catch
the failure mode plain instantiation cannot ("Nest can't resolve dependencies of X" — the single most common
NestJS issue class in the wild, and one this codebase has already hit once: see the `TenancyModule` gotcha in
the Findings section below).

---

## Phase 0 — Tooling

`package.json`'s `jest` block currently only resolves specs inside `src/`. Update it to look in `test/unit/`
while still compiling `src/` and resolving the `@/` path alias:

```jsonc
"jest": {
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testRegex": "test/unit/.*\\.spec\\.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" },
  "moduleNameMapper": { "^@/(.*)$": "<rootDir>/src/$1" },
  "collectCoverageFrom": ["src/**/*.(t|j)s"],
  "coveragePathIgnorePatterns": [
    "src/migrations/",
    "src/scripts/",
    "src/main.ts",
    "src/.*\\.entity\\.ts$",
    "src/.*\\.dto\\.ts$"
  ],
  "coverageDirectory": "./coverage",
  "testEnvironment": "node"
}
```

No new dependencies needed — `jest`, `ts-jest`, `@nestjs/testing` are already devDependencies, and
`@nestjs/testing` is only pulled in by Phase 6. Deliberately **not** adding `@golevelup/ts-jest` for its
`createMock()` helper: every fake object this plan needs (`ExecutionContext`, `ArgumentsHost`, `Repository`,
`QueryRunner`) only needs 1-3 methods stubbed, and this project's own convention (CLAUDE.md: "don't introduce
abstraction beyond what the task requires") favors small hand-written fakes over a new dependency for that.

**Shared test support** (`test/unit/support/`):
- `mock-query-builder.ts` — a chainable jest-mock `SelectQueryBuilder`: every `where`/`andWhere`/`orderBy`/
  `limit`/`getRawMany`/`getRawOne` call records itself and returns `this`. Reused by Phase 2 and by
  `log.repository.ts`'s `findPage()`/`aggregate()` tests in Phase 5.
- `mock-repository.ts` — factory returning `{ createQueryBuilder: jest.fn(), insert: jest.fn(), delete: jest.fn() }
  as unknown as Repository<T>`.
- `mock-data-source.ts` — factory returning a `DataSource` stub with `.transaction()` (invokes its callback with
  a mock `EntityManager`), `.query()`, `.createQueryRunner()` (returns a mock `QueryRunner`), `.isInitialized`,
  `.migrations`, `.showMigrations()` — covers every method `log.repository.ts`, `retention.service.ts`, and
  `health.service.ts` actually call.

---

## Phase 1 — Pure logic (no mocking, highest value-per-effort)

Unchanged from the original plan — these have zero NestJS-specific concerns, they're plain functions/classes:

`common/utils/rollup-bucket.utils.ts`, `common/validators/zod-validation.utils.ts`,
`logs/validators/{log-entry,log-query,cursor-payload,iso-timestamp}.schema.ts` + `*.validator.ts`,
`logs/mappers/log.mapper.ts`, `logs/cursor/cursor.service.ts`, `tenancy/utils/{password-hasher,api-key-generator}.util.ts`.

---

## Phase 2 — Query builders

Unchanged — mock `Repository.createQueryBuilder()` to return Phase 0's chainable mock, assert the recorded
`andWhere`/`orderBy` calls and params:

`logs/query-builders/{log-filter,log-query,aggregation-query}.builder.ts`.

This is where Phase 5 of the performance-optimization feature's attribute-equality type-branching
(numeric/boolean/string casts) and the `q=`/`ILIKE` predicate get locked down — a real regression safety net if
`message_lower` (from `docs/performance_comparison_with_log_src.md`) is implemented later.

---

## Phase 3 — Guards & filters

Plain instantiation, hand-built fakes for `ExecutionContext`/`ArgumentsHost` (each only needs
`switchToHttp().getRequest()` / `.getResponse()` stubbed — no need for the full interface):

```ts
function fakeContext(request: Partial<RequestWithTenantId>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}) }),
  } as unknown as ExecutionContext;
}
```

- `tenancy/guards/api-key-auth.guard.ts` — both `AUTH_ENABLED` branches (`'true'` vs. unset/anything else —
  note it's a strict string comparison, not a boolean parse), Bearer-vs-`x-api-key`-header extraction, the
  `credential.includes('.')` JWT-shape short-circuit (must throw `ForbiddenException` **without** calling
  `apiKeyService.resolveActiveKey` — assert the mock was never called), revoked/missing key →
  `UnauthorizedException`. This guard is the FR-001/FR-003/FR-005 contract — highest-value guard in the suite.
- `tenancy/guards/tenant-jwt-auth.guard.ts` — mirror shape, plus the explicit rule from its own doc-comment:
  **must never branch on `AUTH_ENABLED`**. Worth a dedicated test asserting the guard still requires a valid
  JWT even when `process.env.AUTH_ENABLED` is unset — this is a documented "hard rule" a future edit could
  accidentally violate by copying `ApiKeyAuthGuard`'s pattern.
- `common/filters/global-exception.filter.ts` — `HttpException` (string body vs. `ValidationPipe`'s
  `{ message: string[] }` body → joined with `'; '`), the `externalClientError` duck-typed branch (any
  `Error & { statusCode: number }` in the 4xx range, not just `HttpException`), and the catch-all 500 path
  (assert `logger.error` is called with the stack, and that the response body never leaks the raw error).

---

## Phase 4 — Services

Plain instantiation with mocked collaborators (see philosophy table above):

`logs/services/{log-ingestion,log-query,log-aggregation}.service.ts`,
`tenancy/services/{api-key,tenant-auth,token,loadgen-key-seeder}.service.ts`, `health/health.service.ts`.

Notes from reading the actual implementations:
- `TokenService` wraps `@nestjs/jwt`'s `JwtService` — mock `signAsync`/`verifyAsync` directly; also cover the
  `type: 'access'` vs `type: 'refresh'` claim-mismatch rejection (an access token presented where a refresh
  token is expected must fail even though the signature verifies).
- `HealthService` — `checkDatabase()` short-circuits on `dataSource.isInitialized === false` *without* querying;
  `checkMigrations()` short-circuits when `dataSource.migrations.length === 0` (returns `'unknown'`, not
  `'applied'`) — both are easy to get backwards when mocking, worth asserting the query mock was never called
  in the short-circuit cases.
- `RetentionScheduler` (in `retention/retention.module.ts`, uses `@nestjs/schedule`'s `@Cron`): don't test the
  cron trigger itself (that's framework wiring, not logic) — just call its handler method directly with a mocked
  `RetentionService` and assert delegation. No `@nestjs/schedule` test utilities needed.

---

## Phase 5 — Repository & retention

Plain instantiation, mocked `DataSource`/`EntityManager`/`QueryRunner` from Phase 0's `mock-data-source.ts`.

### `logs/repositories/log.repository.ts` — needs a specific fake-timer strategy

This is the one class in the codebase where a naive Jest setup will produce **flaky, not just wrong**, tests.
The coalescing path is `insertMany()` → `setTimeout(..., coalesceWindowMs)` → async `runFlushLoop()` →
`dataSource.transaction(async manager => {...})`. Jest 30's **modern fake timers** must be used, and timers must
be advanced with the async-aware API — legacy `jest.runAllTimers()` does not pump the microtask queue between
timer callbacks, so the awaited `dataSource.transaction()` promise inside the flush loop will not have settled
by the time assertions run:

```ts
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('coalesces two calls arriving within the debounce window into one flush', async () => {
  const insertPromise1 = repo.insertMany([logA]);
  const insertPromise2 = repo.insertMany([logB]);

  await jest.advanceTimersByTimeAsync(coalesceWindowMs);
  await Promise.all([insertPromise1, insertPromise2]);

  expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
});
```

Cover: `takeBatch()`'s row-cap-but-never-split-a-caller rule (a single caller's batch that alone exceeds
`coalesceMaxRows` must still go through whole), `groupIntoRollupDeltas()`'s bucket/tenant/service/level grouping
(pure function — extract and test directly, no mocking needed), the transaction rollback path (make the mock
`manager.query()` reject, assert every pending caller's promise rejects with that same error, not a swallowed
one), and `runFlushLoop()`'s drain behavior (arrivals queued *during* an in-flight flush must be picked up by
the same loop, not wait for another debounce window).

### `retention/retention.service.ts`

Mock `DataSource.createQueryRunner()` → mock `QueryRunner`. Cover: the advisory-lock-not-acquired early return
(assert `partitionService` methods are never called), and the boundary-bucket delta math in
`pruneBoundaryRollupBucket` — this one issues raw SQL via `dataSource.query(sql, params, queryRunner)` (not
`queryRunner.query()` — see the Findings section below for why), so the mock's `dataSource.query` must accept
that three-argument shape.

### `retention/partition.service.ts`

Same mocking approach; mostly pure date-boundary math (`startOfUtcDay`, `addUtcDays`) wrapped around
`queryRunner.query()` calls for partition DDL — the date math is easily tested standalone.

---

## Phase 6 — Module DI-wiring smoke tests (new — not in the original plan)

Every unit test above deliberately bypasses Nest's DI container by constructing classes directly. That's
correct for testing *logic*, but it means **nothing in Phases 0-5 would catch a broken module wiring** —
missing provider, wrong export, wrong `@InjectRepository` connection name. This is not a hypothetical: the
`Nest can't resolve dependencies of the [Service] (?)` class of error is the single most common NestJS issue in
the wild (500+ GitHub issues), and this codebase has already hit its own version of it —
`tenancy.module.ts`'s doc comment explains that `ApiKeyService` had to be added to `exports` alongside
`ApiKeyAuthGuard`, because a guard's own constructor dependencies resolve against the *consuming* module's
scope, not the exporting module's internal scope — confirmed by "a live `UnknownDependenciesException`" before
the fix. A future edit to `LogsModule` or `TenancyModule` could silently reintroduce exactly that class of bug,
and no test in Phases 0-5 would notice.

Add one lightweight compile-only test per feature module, using `Test.createTestingModule` with database tokens
overridden (no real connection):

```ts
// test/unit/logs/logs.module.spec.ts
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';

const moduleRef = await Test.createTestingModule({ imports: [LogsModule] })
  .overrideProvider(getDataSourceToken())
  .useValue(mockDataSource)
  .overrideProvider(getRepositoryToken(Log, 'read'))
  .useValue(mockRepository)
  .overrideProvider(getRepositoryToken(LogRollup, 'read'))
  .useValue(mockRollupRepository)
  .compile();

expect(moduleRef.get(LogIngestionService)).toBeDefined();
expect(moduleRef.get(LogQueryService)).toBeDefined();
```

Apply the same pattern to `TenancyModule` (override `getRepositoryToken(Tenant)`, `getRepositoryToken(ApiKey)`,
`getRepositoryToken(TenantRefreshToken)`, all on the default connection — no `'read'` argument, note the
asymmetry with `LogsModule`), `RetentionModule` (override `getDataSourceToken()` only), and `HealthModule`
(same). Each test is ~10 lines and catches the exact failure class the rest of the suite structurally cannot.

This phase is genuinely new work relative to the original plan, not a reclassification of existing phases —
budget it as its own step, after Phase 5, once the individual classes' logic is already covered.

---

## Explicitly not unit-tested (unchanged, still correct)

Migrations, `src/scripts/*`, `main.ts`, `config/{database.config,data-source}.ts` (env wiring, exercised by the
zero-config Docker E2E path per `research.md`/`README.md`), entities (declarative TypeORM metadata, no
behavior), DTOs that are pure zod-inferred types with no methods.

---

## Findings from this review (deviations from the original chat plan)

1. **Corrected**: guard/filter/service testing confirmed as plain instantiation, not `Test.createTestingModule`
   — the original plan already had this right; this doc adds the *why* so the choice doesn't look arbitrary to
   a future reader, and draws the line precisely at Phase 6.
2. **Added**: Phase 6 (module DI-wiring smoke tests) — the original plan had no test anywhere that exercises
   Nest's actual injector, which is the layer this codebase has already had one confirmed bug in
   (`TenancyModule`'s `exports` gotcha).
3. **Corrected**: `log.repository.ts`'s fake-timer strategy needed to be explicit about
   `jest.advanceTimersByTimeAsync()` vs. legacy `jest.runAllTimers()` — the original plan said "fake timers"
   without specifying which API, and the wrong one produces intermittent failures, not a clean fail.
4. **Corrected**: `retention.service.ts`'s `pruneBoundaryRollupBucket` calls `dataSource.query(sql, params,
   queryRunner)`, not `queryRunner.query(sql, params)` — a mock that only stubs `queryRunner.query` will report
   false negatives (the real call never lands on the mock). This is the project's own established pattern (see
   `.wolf/cerebrum.md`'s decision log: `queryRunner.query()` has no generic overload).
5. **Declined**: adding `@golevelup/ts-jest` for `createMock()`. Every fake object this plan needs is 1-3
   methods; hand-rolled fakes keep the dependency surface flat, consistent with this project's stated preference
   for avoiding abstraction the task doesn't need.
6. **No change needed**: Phase 2's `Repository.createQueryBuilder()` mocking approach was already correct
   NestJS/TypeORM practice — flagged here only to confirm it was reviewed, not overlooked.
