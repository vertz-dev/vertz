# EDA v0.1.0 Post-Implementation Retrospective

**Feature:** Entity-Driven Architecture v0.1.0 — Core Entity + CRUD + Access
**Branch:** `feat/eda-v0.1.0`
**Issues:** #456, #457, #458, #459, #460, #461, #462
**Phases:** 7
**Packages:** `@vertz/db`, `@vertz/core`, `@vertz/server`

---

## What went well

**Strict TDD delivered confidence.** Every phase followed Red-Green-Refactor. By Phase 7, the E2E tests passed on the first run because each layer was already individually tested. Zero regressions across 7 phases.

**Adversarial reviews caught real bugs.** Six reviews across Phases 1-6 surfaced 3 security issues that were fixed before merge:
- After hooks leaking hidden fields (Phase 5, BUG-1)
- Error handler leaking `VertzException.details` to HTTP responses (Phase 6, SEC-1)
- Double route registration in core (Phase 6, BUG-2)

Without the reviews, `passwordHash` would have leaked through after hooks and error responses.

**The design doc was accurate.** The 7-phase plan from `entity-driven-architecture.md` mapped 1:1 to the implementation. No phases were added, removed, or reordered. The acceptance criteria were specific enough to implement against.

**Phase layering worked.** Each phase built cleanly on the previous:
- Phase 1-2 (`@vertz/db`): Schema annotations and `d.model()` — no server dependency
- Phase 3-5 (`@vertz/server`): Entity definition, context, CRUD pipeline — no core changes needed
- Phase 6: Bridge between core and server — minimal core changes (`_entityRoutes` hook)
- Phase 7: E2E validation — no new code, just tests

**Phantom types proved their value.** `$response`, `$create_input`, `$update_input` caught hidden field and readOnly violations at compile time. The E2E type tests confirmed the full flow: `d.table()` → `d.model()` → `entity()` → typed hooks.

---

## What went wrong

**Core resolves to `dist/`, not source.** In Phase 6, all HTTP integration tests returned 404 for ~30 minutes because changes to `@vertz/core` source files weren't picked up — the package resolves to `dist/index.js`. Required `bun run build` in `packages/core` after every core source change. This is a recurring footgun in the monorepo.

**Cross-package type contravariance.** The `EntityRouteEntry` handler type in `@vertz/core` uses `Record<string, unknown>` (broad), but the route generator in `@vertz/server` initially typed handlers with a narrower `EntityRouteHandlerCtx`. Function parameter contravariance made these incompatible. Required removing the local interface and using `Record<string, unknown>` throughout, losing some type safety at the boundary.

**`RequestInfo` global name collision.** TypeScript's Fetch API global `RequestInfo` shadows the entity context's `RequestInfo` import. Required aliasing as `EntityRequestInfo`. A future rename of the entity type would avoid this entirely.

**`ctx.entity` and `ctx.entities` are stubs.** The `EntityRegistry` is never populated and `entityOps` is an empty object cast. Cross-entity access and self-CRUD through the context are broken at runtime. This was accepted for v0.1.0 but was flagged as HIGH in the Phase 6 review. Any hook or access rule that calls `ctx.entity.get()` will crash.

**`createEntityContext` return type drops `TModel` generic.** Phase 4 review (T-1, CRITICAL) found that the factory function returns `EntityContext` instead of `EntityContext<TModel>`, making the generic parameter dead. The type tests pass because they test the interface directly, not the factory return type. This was accepted but is a real type safety gap.

---

## How to avoid it

**Add a `bun run dev` or watch mode for core.** The "core resolves to dist" problem has hit multiple features. Either:
- Add a `tsconfig.paths` mapping that resolves `@vertz/core` to source during development
- Or add a `bun run dev` script that watches and rebuilds core on change
- **Action:** Create a ticket for monorepo dev experience improvement

**Test factory return types, not just interfaces.** The Phase 4 dead generic was caught by the adversarial review but would have been caught earlier if the type test file exercised `createEntityContext()` directly instead of constructing `EntityContext<T>` as a type alias.
- **Action:** Add to the TDD rules: "Type tests MUST exercise factory functions, not just interface types"

**Cross-package type boundaries need explicit tests.** The contravariance issue between core and server types was only caught at compile time. Add cross-package type tests that verify the types are compatible.
- **Action:** Consider a `packages/integration-tests/` type test file that imports from both core and server

**Name entity types to avoid global collisions.** Use `EntityRequestInfo` from the start, not `RequestInfo`.
- **Action:** Rename `RequestInfo` → `EntityRequestInfo` in the entity context module

---

## Process changes adopted

1. **Adversarial reviews are mandatory for every phase.** The 3 security fixes alone justified the cost. Reviews run in background while the next phase starts.

2. **Rebuild core before running server tests.** Added mental checklist item: "Did I change core source? → `bun run build` in `packages/core` first."

3. **Review findings get resolution sections.** Every review file ends with a `## Resolution` table that documents what was fixed, what was accepted, and what was deferred. This creates an audit trail.

---

## Metrics

| Metric | Value |
|--------|-------|
| Total commits | 9 (on feature branch) |
| Files changed | 101 |
| Lines added | ~17,200 |
| Lines removed | ~2,950 |
| Tests added | ~120 (runtime) + ~40 (type-level) |
| Total test count | db: 765, core: 232, server: 189 |
| Adversarial review findings | 80+ across 6 reviews |
| Security fixes from reviews | 3 (BUG-1, SEC-1, BUG-2) |
| Phases | 7 of 7 complete |

---

## Known limitations (v0.1.0)

1. `ctx.entity` (self-CRUD) and `ctx.entities` (cross-entity) are runtime stubs
2. `EntityDbAdapter.list()` has no pagination/filtering
3. `createEntityContext` return type drops `TModel` generic
4. No output schema validation on custom actions
5. Access rules receive raw rows (hidden fields present) — by design for authorization
6. TOCTOU race in update/delete without transaction support
7. `EntityDbAdapter` is untyped (`Record<string, unknown>`)
