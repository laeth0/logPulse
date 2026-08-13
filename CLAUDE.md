# OpenWolf

@.wolf/OPENWOLF.md

This project uses OpenWolf for context management. Read and follow .wolf/OPENWOLF.md every session. Check .wolf/cerebrum.md before generating code. Check .wolf/anatomy.md before reading files.

## Schema Updates

- **CRITICAL RULE**: When you modify database entities, you must also reflect those modifications in `projectSchema.dbml`.
- **Foreign keys go inline on the column**, as `column_name type [ref: > other_table.column]`, not as standalone `Ref:` lines at the bottom of the file. If a delete/update action needs documenting, add it via that column's `note:` setting (e.g. `note: 'ON DELETE CASCADE'`) since DBML's inline `ref:` shorthand doesn't carry those options itself.

## HTTP Request Files

- **RULE**: Every time you create or implement an API endpoint, you MUST create a corresponding `.rest` file inside the `requests/` directory.
- Each endpoint gets its **own dedicated file** — one file per endpoint (separation of concerns).
- **`.rest` files are grouped into subfolders that mirror `src/`'s top-level feature modules** — e.g. `requests/logs/`, `requests/health/`, `requests/admin/`. When adding an endpoint to a new module, create the matching subfolder.
- File naming convention: `<resource>.<action>.rest`
  - Examples: `requests/logs/logs.ingest.rest`, `requests/logs/logs.list.rest`, `requests/admin/admin.tenants.create.rest`
- Each `.rest` file must contain:
  - A descriptive comment explaining the endpoint's purpose.
  - One or more example HTTP requests covering the main use cases (happy path + filters).
  - Use the `REST Client` VS Code extension format (`###` separators between requests).

## Engineering Quality and Performance Principles

When implementing or modifying code:

- Keep the code simple, readable, cohesive, and easy to maintain.
- Follow clean-code principles and established project conventions.
- Prefer clear responsibilities and appropriate abstractions over unnecessary complexity.
- Apply appropriate design patterns only when they genuinely simplify the design; do not introduce patterns for their own sake.
- Follow security and framework best practices.
- Preserve the existing architecture and API contracts unless a requirement explicitly requires a change.

Performance is a first-class requirement for this project.

- Consider CPU, memory, database, and I/O cost when making implementation decisions.
- Avoid unnecessary database queries, joins, allocations, transformations, middleware work, and abstractions on performance-critical paths.
- Design database queries and indexes around the actual query patterns and performance requirements.
- Do not add indexes blindly. Every index increases storage and write cost and may reduce ingestion throughput.
- Add, remove, or modify indexes only when justified by query patterns, execution plans, benchmarks, or measured performance.
- Prefer measured optimization over assumptions.
- Preserve correctness, tenant isolation, and maintainability while optimizing performance.

## Workflow

- **Do not run the linter (`npm run lint`) or formatter (`npm run format` / `npm run format:check`) automatically after implementing a prompt.** Only run them when the user explicitly asks, or immediately before a commit/PR. This avoids unnecessary token consumption on routine changes. (A TypeScript build/compile check is a separate, correctness concern — still fine to run when useful.)

<!-- SPECKIT START -->
Active feature: Performance Optimization (`002-performance-optimization`).
For technologies, project structure, and design decisions for this feature,
read `specs/002-performance-optimization/plan.md` (and its `research.md`,
`data-model.md`, `quickstart.md` siblings — no `contracts/` for this feature,
since it introduces no new/changed external interface; see plan.md's Project
Structure section for why).

Prior feature, implemented: Multi-Tenancy (`001-multi-tenancy`) —
`specs/001-multi-tenancy/plan.md`. Still the reference for the tenancy module,
auth guards, and API-key model this feature's changes must not disturb.
<!-- SPECKIT END -->
