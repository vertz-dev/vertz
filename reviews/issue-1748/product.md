# Product/Scope Review: Server-Side Query Cache for `@vertz/db`

**Reviewer:** Product Review  
**Date:** 2026-04-04  
**Verdict:** ✅ APPROVED with should-fix items

---

## Summary

The design doc addresses a real, validated pain point (63% throughput improvement in benchmark) and fits squarely within Vertz's vision of "the only stack you need — from database to browser." The proposal is well-scoped, opt-in, and aligns with the manifesto principles (Explicit Over Implicit, One Way to Do Things, LLM-First). **This should proceed.**

---

## Roadmap Fit

**Does it fit?** ✅ Yes.

The `@vertz/db` package is explicitly on the critical path — the VISION.md states:
> "We'll build the database layer — because an ORM that doesn't share your schema language is just another seam to maintain."

A query cache is a natural evolution of `@vertz/db` as a best-in-class database layer. The motivating benchmark (rinha-de-backend URL shortener) represents exactly the kind of hot-path read scenario that server-side Vertz apps face. This is not speculative — it's validated performance work.

The phased implementation plan is appropriate:
- Phase 1: MVP with core cache mechanics
- Phase 2: Invalidation + statistics  
- Phase 3: Production hardening

This matches the pattern used by other `@vertz/db` features (e.g., `1742-groupby-expressions`, `1743-db-update-expressions`).

---

## Scope Appropriateness

**Is the scope right?** ✅ Yes, with one clarification needed.

### What's right

1. **Opt-in is correct.** The design requires `cache: { enabled: true }` at `createDb()` level. This is the only acceptable approach — automatic caching would violate "Explicit Over Implicit" and risk stale reads.

2. **Single-instance in-memory only for v1.** Distributed cache (Redis) is correctly scoped out. The Non-Goals section is honest about this. Developers needing Redis can add it on top.

3. **Non-Goals are well-chosen:**
   - Client-side caching (handled by `@vertz/ui` EntityStore)
   - HTTP-level caching (separate layer)
   - Query pagination caching (complex, secondary use case)

4. **Per-query override API (`cache: { ttl: ... }`, `cache: false`)** is the right granularity. This gives developers escape hatches without compromising the defaults.

### Items needing clarification

| Item | Issue | Recommendation |
|------|-------|----------------|
| **Unknown #1: Automatic invalidation** | Phase 1 defers automatic invalidation on writes. But the E2E test in Section 7 expects update to invalidate cache: `await db.urls.update(...)` followed by `findUnique` returns fresh data. This is a contradiction. | **Must clarify:** Does Phase 1 include automatic invalidation or not? If not, the E2E test is wrong. If yes, Phase 1 scope is larger than stated. |
| **Unknown #3: Multi-tenant isolation** | Cache keys don't include tenant context. If tenants share a cache, stale data leaks between tenants. The proposal acknowledges this but defers resolution. | **Should-fix:** Add `tenantId` to cache key derivation in Phase 1, even if tenants don't share a cache instance. Otherwise, this becomes a breaking change later. |
| **Phase 1 acceptance criteria** | Missing `db.getCache()` in acceptance criteria, though API Section 1.2 and E2E test use it. | Add `db.getCache()` returns the configured cache instance to Phase 1 acceptance criteria. |

---

## Manifesto Alignment

| Principle | Alignment | Notes |
|----------|-----------|-------|
| Explicit Over Implicit | ✅ Strong | `cache: { enabled: true }` is required. No magic. |
| One Way to Do Things | ✅ Strong | Single `QueryCache` mechanism. No hot/cold path split. |
| If It Builds, It Works | ✅ Strong | Type-safe `cache` options. `@ts-expect-error` tests included. |
| LLM-First | ✅ Strong | `QueryCache`, `ttl`, `invalidate` — obvious naming. |
| Performance is Not Optional | ✅ Strong | 63% improvement is the motivation, not a side effect. |

---

## Risks and Open Questions

1. **🔴 Blocker: E2E test contradiction** — The E2E test (Section 7) expects automatic invalidation on `update()`, but Unknown #1 defers this. Either the test is wrong, or Phase 1 scope is larger than stated. **Resolution required before implementation.**

2. **🟡 Should-fix: Tenant isolation** — Cache key derivation must include tenant context to prevent cross-tenant data leakage. This should be specified now, even if not enabled by default.

3. **🟢 Non-issue: Soft deletes** — Correctly scoped to "explicit user configuration" (Non-Goal #6). This is the right call.

4. **🟢 Non-issue: Serverless memory** — `maxSize` with LRU eviction is a reasonable bound. Default of 1000 entries is conservative.

---

## Recommendations

1. **Resolve the automatic invalidation contradiction immediately.** This is a blocking ambiguity that will cause scope creep or broken tests.

2. **Add tenant context to cache key derivation in the Type Flow Map (Section 6).** Even if the default is single-tenant, the type should reflect the requirement.

3. **Add `db.getCache()` to Phase 1 acceptance criteria.**

4. **Consider a Phase 1.5 for automatic invalidation** if it's needed for the demo. The 63% benchmark improvement likely depends on it.

---

## Verdict

**Proceed with the following pre-conditions:**

1. Resolve the automatic invalidation ambiguity (Section 4, Unknown #1) — state explicitly whether Phase 1 includes it.
2. Add tenant-aware cache key derivation to the API design.
3. Add `db.getCache()` to Phase 1 acceptance criteria.

Once these are addressed, this is a well-scoped, well-motivated feature that belongs on the roadmap.