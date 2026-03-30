# Phase 0: Design Product/Scope Review — `@vertz/agents`

- **Author:** Design team
- **Reviewer:** Product/Scope reviewer (Claude Opus 4.6)
- **Document:** `plans/vertz-agents.md` (Rev 1)
- **Date:** 2026-03-30

## Review Summary

**Verdict: Changes Requested** — 3 blockers, 6 should-fix, 4 nits.

---

## Findings

### B1: Priority sequencing [Blocker]

The test runner is documented as "NEXT PRIORITY" but this design doesn't address where agents sit relative to it. Must explicitly state whether this is parallel work, a replacement, or deferred.

### B2: Five open unknowns with zero POC results [Blocker]

U1-U5 are all unvalidated. At minimum U2 (ReAct context window management) and U3 (Workers AI cost model) need POC validation before Phase 1 starts, following the precedent set by the Runtime design doc's gate model.

### B3: No Cloudflare portability strategy [Blocker]

`agents` (Cloudflare SDK) as a hard dependency means every `@vertz/agents` user is locked to Cloudflare. The core `agent()`/`tool()`/`workflow()` definitions should be runtime-agnostic with Cloudflare bindings in a separate adapter.

### S1: Remove Phase 4 from phase list [Should-fix]

It's acknowledged as a separate design doc. Including it inflates scope and muddies the deliverables.

### S2: Restructure phases for vertical slices [Should-fix]

Server integration should be Phase 1, not Phase 3. Following Vertz's own vertical-slice principle.

### S3: Separate model configuration from agent definition [Should-fix]

Model config (provider, API keys) is environment-specific binding. Should not be hardcoded in the definition.

### S4: Add a testing strategy section [Should-fix]

TDD with agents requires mock LLM providers. The design should specify how.

### S5: Pick one sandbox provider for v1 [Should-fix]

Don't abstract over two backends before validating either. Pick Daytona (proven TypeScript SDK) and add Cloudflare Containers later.

### S6: Clarify the `parallel` field semantics on workflow steps [Should-fix]

The current design is ambiguous about dependency resolution.

### N1: Return types for agent definitions [Nit]

Should use `as const` or `Readonly<>` patterns consistently.

### N2: `invoke()` is underspecified [Nit]

Instance routing, auth propagation, timeout behavior not defined.

### N3: Versioning strategy [Nit]

Should start at `0.2.41` to match monorepo or `0.0.1` as a new package.

### N4: "No define prefix" convention correctly applied [Nit]

`agent()`, `tool()`, `workflow()` correctly follow the convention. Good.
