# STATUS — log-pulse

> Single source of truth for resuming work. Read this FIRST when starting a session.
> Update this file at the end of every work phase so the next `/clear` resumes in 1 read.
> Last updated: 2026-08-13

---

## ✅ Done

<!-- Move items here from "🚀 Next phase" when finished. Group by area. -->

- OpenWolf integrations narrowed to Claude and Codex only.
- Removed generated Cursor, OpenCode, and Gemini adapters.
- Added project-wide engineering quality and performance principles to `AGENTS.md` and `CLAUDE.md`.
- Removed the original suggestion §1a from `docs/suggestions_to_increase_the_performance.md` and corrected the remaining subsection numbering.
- Reverted the attempted implementation of performance suggestion §1a at the user's request; the index and original multi-tenancy plan remain unchanged.

---

## 🚀 Next phase

**Goal:** Await the next requested project task.

### Acceptance criteria
1. User provides the next objective.

### Files to create / edit
| Type | File | Content |
|---|---|---|
| — | — | No files planned yet. |

### Closed decisions
- OpenWolf supports only Claude and Codex because those are the user's active agents.

### Open decisions
- None.

---

## 📁 Active architecture

- **Stack:** _<frameworks, libraries, runtime>_
- **Key tables / modules:** _<list>_
- **Patterns:** _<conventions enforced project-wide>_

---

## ⚠️ External blockers (don't block coding)

- _<env vars, secrets, external accounts, manual steps>_

---

## 🔧 Useful commands

```bash
# add the most-used commands here so the next session has them ready
```

---

## 📚 References (read IF needed)

- `.wolf/cerebrum.md` — User Preferences + Do-Not-Repeat + Decision Log
- `.wolf/anatomy.md` — token-efficient file index
- `.wolf/buglog.json` — known bugs + fixes
