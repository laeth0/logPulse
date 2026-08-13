# Memory

> Chronological action log. Hooks and AI append to this file automatically.
> Old sessions are consolidated by the daemon weekly.

| 22:59 | Restricted OpenWolf to Claude and Codex; removed Cursor, OpenCode, and Gemini adapters; refreshed anatomy | `.wolf/config.json`, `.cursor/`, `.opencode/`, `GEMINI.md`, `.wolf/anatomy.md` | verified only Claude and Codex remain configured | ~900 |
| 23:23 | Added engineering quality and performance guidance to both agent instruction files and synchronized OpenWolf context. | AGENTS.md, CLAUDE.md, .wolf/cerebrum.md, .wolf/STATUS.md | Completed | ~900 |
| 09:02 | Removed performance suggestion §1a while preserving the remaining section numbering. | docs/suggestions_to_increase_the_performance.md | Completed | ~250 |
| 09:04 | Corrected subsection numbering after removing the original §1a. | docs/suggestions_to_increase_the_performance.md | Completed | ~150 |
| 09:24 | Reverted only the immediately preceding §1a implementation and its documentation/planning changes, preserving all earlier and unrelated worktree edits. | src/migrations/1785684350115-CreateLogsTableBtreeIndexes.ts, src/logs/entities/log.entity.ts, projectSchema.dbml, README.md, docs/suggestions_to_increase_the_performance.md, specs/001-multi-tenancy/{plan,research,data-model,tasks}.md | Completed | ~1200 |

## Session: 2026-08-13 13:54

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 19:16 | Reproduced the health-check socket reset and traced it to a stale app image whose obsolete TypeORM migration crashes the container against the current database schema. | `requests/health.check.rest`, Docker app/database state, `.wolf/buglog.json`, `.wolf/cerebrum.md` | Root cause confirmed; runtime left unchanged | ~1200 |
| 16:15 | Inspected the complete Prisma schema and migration chain in LogIngestion-majed and reconstructed its current tables, indexes, and logical rollup relationships as DBML. | `LogIngestion-majed/prisma/schema.prisma`, `LogIngestion-majed/prisma/migrations/*/migration.sql` | Completed; no source schema files changed | ~900 |

## Session: 2026-08-13 14:52

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-08-13 19:10

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
