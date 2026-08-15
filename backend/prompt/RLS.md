# Introduce PostgreSQL Row-Level Security for Multi-Tenancy

I want to strengthen the existing multi-tenancy implementation by introducing PostgreSQL Row-Level Security (RLS) for tenant isolation.

The multi-tenancy feature is already implemented and converged.

Before making changes, thoroughly inspect the actual implementation and read:

* `@docs/Final_Project.md`
* `@CLAUDE.md`
* `specs/001-multi-tenancy/spec.md`
* `specs/001-multi-tenancy/plan.md`
* `specs/001-multi-tenancy/research.md`
* `specs/001-multi-tenancy/data-model.md`
* `specs/001-multi-tenancy/contracts/`
* `specs/001-multi-tenancy/tasks.md`

Also inspect the actual PostgreSQL/TypeORM/`pg` connection and transaction handling, especially the existing `COPY FROM STDIN` ingestion path.

## Goal

Use PostgreSQL RLS as an additional database-level tenant-isolation boundary.

The database itself should prevent one Tenant from reading or writing another Tenant's logs, even if application code accidentally forgets a tenant predicate.

Conceptually:

```text
API Key / Auth
      ↓
Resolve tenant_id
      ↓
Set trusted PostgreSQL tenant context
      ↓
RLS policy
      ↓
Database only allows rows for that tenant
```

RLS must be defense-in-depth and must not weaken or break the current application behavior.

## Critical Compatibility Requirements

The implementation MUST remain fully compatible with `@docs/Final_Project.md`.

Do not change the required API contract.

These endpoints must remain exactly compatible:

* `GET /health`
* `POST /logs`
* `GET /logs`
* `GET /logs/aggregate`

Do not introduce any required:

* `tenantId` body field
* tenant query parameter
* tenant header
* response field

Tenant identity must remain derived internally.

## AUTH_ENABLED=false

Preserve the existing zero-configuration behavior.

When:

```env
AUTH_ENABLED=false
```

the existing required endpoints must continue working without credentials.

The application should transparently operate using the approved internal/default tenant identity.

RLS must still permit those requests by setting the appropriate internal Tenant context.

Do not disable RLS merely because authentication is disabled.

## AUTH_ENABLED=true

When authentication is enabled:

```text
API Key
   ↓
resolve tenant
   ↓
tenant context
   ↓
PostgreSQL RLS
```

The database must only permit access to rows belonging to that Tenant.

The existing authentication and authorization behavior must remain unchanged.

## LOADGEN_API_KEY

Preserve the complete existing `LOADGEN_API_KEY` behavior.

The seeded LoadGen API key must resolve to its existing internal Tenant identity.

Requests made using that key must work normally through RLS without changing the load generator request format.

No manual SQL, Tenant ID, special request parameter, or extra header may be required.

## RLS Design

Design RLS around a trusted PostgreSQL session/transaction setting representing the current Tenant.

For example, evaluate an approach conceptually similar to:

```sql
current_setting('app.tenant_id', true)
```

and policies comparing that value against:

```text
logs.tenant_id
```

Do not blindly use this exact implementation without first verifying it against the current PostgreSQL connection architecture.

The tenant context MUST be set by trusted backend code only.

Never accept the PostgreSQL tenant context directly from:

* request body
* query parameter
* arbitrary client header

## Connection Pool Safety

This is CRITICAL.

The application uses pooled PostgreSQL connections.

Ensure Tenant context can never leak from one request to another when a connection is returned to the pool.

Prefer transaction-scoped context, such as an appropriate `SET LOCAL` strategy, if it is compatible with the existing implementation.

The design must guarantee:

```text
Request A → Tenant A
connection returned to pool

Request B → Tenant B
same connection reused

Tenant B MUST NOT inherit Tenant A context
```

Do not use session-scoped state that can remain accidentally attached to a pooled connection unless it is explicitly and safely reset.

## COPY FROM STDIN

The current high-performance ingestion path uses PostgreSQL:

```text
COPY FROM STDIN
```

This is performance-critical.

Inspect exactly how the COPY connection is acquired and used.

RLS must work correctly with COPY ingestion.

The Tenant context must be set on the SAME PostgreSQL connection that performs the COPY operation.

Do not introduce:

* one database query per log
* one transaction per log
* one Tenant lookup per log
* N+1 queries

Tenant resolution should remain once per request/batch.

Conceptually:

```text
POST /logs
   ↓
API key lookup once
   ↓
tenantId
   ↓
acquire DB connection
   ↓
begin transaction if required
   ↓
set transaction-local tenant context
   ↓
COPY batch
   ↓
commit
```

Evaluate the actual performance implications before finalizing the design.

## Querying and Aggregation

RLS must protect:

```text
GET /logs
GET /logs/aggregate
```

including:

* no filters
* service filter
* level filter
* time filters
* attribute filters
* message search
* aggregation
* group_by
* pagination

Tenant A must never be able to read or aggregate Tenant B's logs.

## Existing Application-Level Tenant Predicate

The current implementation already explicitly filters using:

```text
tenant_id
```

in the query layer.

Do not automatically remove this application-level predicate simply because RLS is being added.

Evaluate whether keeping both is preferable:

```text
Application tenant predicate
        +
PostgreSQL RLS
```

for:

* defense in depth
* predictable query plans
* index usage
* clarity

Only remove existing tenant predicates if there is strong technical justification and evidence that doing so does not harm correctness or performance.

My preference is to keep application-level tenant scoping and use RLS as a second security boundary unless there is a compelling reason not to.

## PostgreSQL Roles and RLS Bypass

Inspect which PostgreSQL role the application currently uses.

Ensure the runtime application role cannot unintentionally bypass RLS.

Explicitly review:

* table ownership
* superuser privileges
* `BYPASSRLS`
* whether `FORCE ROW LEVEL SECURITY` is necessary
* migration role versus runtime application role

Do not claim RLS provides isolation if the actual application database role bypasses the policies.

If the current Docker/database setup uses the same owner/superuser role for everything, propose the simplest safe adjustment that keeps `docker compose up` working automatically.

Do not introduce unnecessary operational complexity.

## Partitioned Logs Table

The `logs` table is partitioned by timestamp.

Verify the exact PostgreSQL RLS behavior with the existing partitioned-table design.

Ensure policies protect reads and writes regardless of which physical partition contains the row.

Also validate the existing retention/partition-management operations.

## Retention and Maintenance

The existing retention system performs maintenance and moves/reinserts rows while managing partitions.

RLS must not accidentally break these internal maintenance operations.

Explicitly inspect:

* future partition creation
* default-partition row movement
* reinsertion
* retention deletion
* expired partition dropping

Determine whether maintenance should:

* operate using a privileged maintenance context, or
* explicitly set the appropriate Tenant context, or
* use an intentional role that can perform system-wide retention

The choice must be deliberate and secure.

Do not allow normal application requests to obtain this privileged maintenance behavior.

## API-Key Management and Tenant Account Tables

The main RLS target is the shared tenant-owned data.

Evaluate whether RLS should also be applied to:

* `api_keys`
* `tenant_refresh_tokens`
* other Tenant-owned tables

Do not add RLS everywhere blindly.

For each table, explain whether RLS provides meaningful additional protection or whether the existing Tenant-scoped service queries are sufficient.

Keep the solution simple.

## Migrations

Implement RLS through proper migrations.

The database setup must still work automatically through:

```bash
docker compose up
```

No manual SQL commands may be required.

Migrations should define the required:

* policies
* role configuration if needed
* RLS enablement
* FORCE RLS behavior if justified

Keep migration rollback behavior correct.

## Performance

Performance is a first-class project requirement.

The system must still satisfy the targets in `@docs/Final_Project.md`, especially:

* ≥15,000 logs/sec sustained ingestion
* aggregation <1 second p95
* query performance during ingestion
* approximately 1,000,000 rows

Evaluate RLS overhead on both reads and writes.

Pay special attention to whether the RLS predicate can use the existing Tenant-leading indexes.

Avoid policies containing expressions that prevent PostgreSQL from effectively using:

```text
tenant_id
```

indexes.

Use `EXPLAIN` / `EXPLAIN ANALYZE` where useful.

Do not add indexes blindly.

## Security Validation

Explicitly validate attempts such as:

```text
Tenant A credential
        ↓
attempt to query Tenant B row
        ↓
Database rejects/prevents access
```

Also validate database-level protection against accidental application bugs.

For example, verify what happens if a repository query accidentally omits:

```text
WHERE tenant_id = ...
```

The RLS policy should still prevent cross-Tenant visibility.

For writes, verify that a Tenant cannot insert a row carrying another Tenant's `tenant_id`.

Use appropriate:

```text
USING
```

and:

```text
WITH CHECK
```

policies where necessary.

## Clean Code

Keep the implementation simple and explicit.

Follow:

* clean-code principles
* existing architecture
* proper separation of concerns
* strong typing
* minimal abstractions
* existing project conventions

Avoid scattering raw:

```text
SET tenant...
```

commands throughout unrelated repositories.

Prefer one clear abstraction responsible for executing database work under a Tenant context if the existing architecture makes that appropriate.

Do not over-engineer it.

## Required Process

Before modifying production code:

1. Inspect the complete current implementation.
2. Research/verify the PostgreSQL RLS behaviors relevant to:

   * pooled connections
   * transactions
   * COPY FROM STDIN
   * partitioned tables
   * table ownership / BYPASSRLS
3. Identify the safest minimal architecture.
4. Explain the expected impact on ingestion/query performance.
5. Identify all affected files.

Then implement the approved RLS design.

Update the relevant Spec Kit artifacts to reflect this architectural change where appropriate.

Do not create `.test` or `.spec` files.

Use the existing project validation approach instead.

## Final Validation

After implementation, verify:

```text
AUTH_ENABLED=false
    → required API works normally
    → default Tenant context works through RLS

AUTH_ENABLED=true
    → Tenant API key resolves Tenant
    → RLS enforces isolation

LOADGEN_API_KEY
    → still works transparently

Tenant A
    → cannot read Tenant B

Tenant A
    → cannot write rows as Tenant B

COPY FROM STDIN
    → still works

Retention
    → still works

GET /health
    → remains unauthenticated
```

Run:

* build
* lint
* existing smoke validation
* Docker startup validation
* tenant-isolation validation
* representative `EXPLAIN` / `EXPLAIN ANALYZE`

Do not fabricate external load-test results.

## Final Report

When complete, report:

1. RLS architecture chosen
2. PostgreSQL policies created
3. How Tenant context is safely propagated
4. How connection-pool leakage is prevented
5. How COPY works with RLS
6. How retention works with RLS
7. Runtime DB-role / RLS-bypass strategy
8. Application-level Tenant filtering strategy
9. Files changed
10. Build/lint/smoke results
11. Security validation results
12. Query-plan/performance observations
13. Remaining risks or trade-offs
14. Whether the project is ready for the external load test
