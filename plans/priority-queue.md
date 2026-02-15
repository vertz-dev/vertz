# Priority Queue

Updated: 2026-02-15 06:15 UTC

## 🔄 In Progress
- [ ] **PR #302** — DX issues batch (enum dedup, query params, reusable enums) — CI fix pending
- [ ] **PR #303** — Design docs (entity API, access system, Phase 1 spec) — CI pending
- [ ] **CLI/TUI split** — ready to assign

## 🟢 Ready to Start (no CTO input needed)
1. [ ] **Entity Phase 1 implementation** — all decisions locked, spec written
2. [ ] **CLI/TUI split** — `@vertz/cli` + `@vertz/tui`, CTO approved
3. [ ] **DB client codegen** — `.vertz/generated/`, Prisma-style `db.user.list()`
4. [ ] **ORM verb rename** — `findMany`→`list`, `findOne`→`get` across `@vertz/db`

## 📋 Backlog
- [ ] Errors-as-values migration (public APIs)
- [ ] `createAuth()` module design
- [ ] Pre-commit hooks for quality gates
- [ ] ink → vertz primitives migration
- [ ] `vertz publish` MVP + Vertz Cloud architecture doc
- [ ] LLM-queryable entities implementation
- [ ] `@vertz/canvas` package — waiting on Kai bot
- [ ] Git history scrub — remove demo-toolkit traces

## ✅ Done (Feb 15)
- [x] PRs #293-#301 merged (SSR fix, CLI README, DX improvements, meta-package, tree-shaking, task-manager tests, audits)
- [x] Entity-aware API design doc (18 sections, comprehensive)
- [x] Unified access system design doc (Blimu model, closure tables, ctx.can())
- [x] Phase 1 implementation spec (all decisions locked)
- [x] Expert debate (5 architects, 7 topics)
- [x] BetterAuth research (backstage)
- [x] All naming decisions: `domain()`, explicit types, `list`/`get` verbs, errors-as-values
- [x] Discord #ci channel, PR monitor → #ci delivery
- [x] Pre-push quality gates added to git-as.sh
