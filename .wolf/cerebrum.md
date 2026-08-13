# Cerebrum

> OpenWolf's learning memory. Updated automatically as the AI learns from interactions.
> Do not edit manually unless correcting an error.
> Last updated: 2026-08-13

## User Preferences

<!-- How the user likes things done. Code style, tools, patterns, communication. -->

- Use OpenWolf integrations for Claude and Codex only; do not generate Cursor, OpenCode, or Gemini adapters.
- Treat performance as a first-class requirement while preserving simple, maintainable code, existing architecture and API contracts, correctness, security, and tenant isolation; justify index changes with actual query patterns or measurements.

## Key Learnings

- **Project:** log-pulse
- **Description:** A high-throughput log ingestion and query service — a simplified version of Datadog / Grafana Loki. Applications send structured logs to the API; the service validates, stores, and makes them searchab
- `LogIngestion-majed` uses PostgreSQL/Prisma with three current tables (`Log`, `LogRollup`, `LogSecondRollup`) and no foreign-key constraints. The two rollup tables are unlogged, derived aggregates of `Log` keyed by `(bucket, service, level)` at minute and second granularity.
- A published Docker port can accept a connection and still yield `socket hang up` when the Nest app container is restarting before `app.listen()`. On 2026-08-13 the cause was an outdated `logpulse-app` image containing obsolete compiled tenancy migrations; compare the image's `/app/dist/migrations` with current `src/migrations` and rebuild the app image without deleting the PostgreSQL volume.

## Do-Not-Repeat

<!-- Mistakes made and corrected. Each entry prevents the same mistake recurring. -->
<!-- Format: [YYYY-MM-DD] Description of what went wrong and what to do instead. -->

- [2026-08-13] After removing a numbered section, check and correct the numbering of all subsequent sibling sections.
- [2026-08-13] When asked to revert a previous prompt, reverse only that prompt's assistant-authored delta and preserve all earlier or unrelated worktree changes.
- [2026-08-13] Do not put Markdown backticks inside double-quoted shell command strings; use a simpler pattern or single-quoted shell syntax to avoid command-parsing failures.

## Decision Log

<!-- Significant technical decisions with rationale. Why X was chosen over Y. -->

- **2026-08-13:** Removed performance suggestion §1a (dropping the duplicate `attributes_text` column) from the recommendations document at the user's request.
- **2026-08-13:** Reverted the implementation of performance suggestion §1a at the user's request; `idx_logs_level_timestamp_id` and the pending three-index multi-tenancy design remain in place.
