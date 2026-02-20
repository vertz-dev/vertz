# Decision: Entity-First Architecture — One Way to Build APIs

**Date:** 2026-02-20
**Decision by:** Vinicius (CTO)
**Documented by:** Mika (VP Engineering)
**Status:** Approved

---

## Context

vertz currently has two ways to define API endpoints:

1. **Legacy:** `module()` → `router()` → route definitions, with `service()` for business logic
2. **Entity-Driven (EDA):** `entity()` → auto-CRUD + custom actions + access rules + hooks

Both are supported in the compiler and codegen pipeline. The legacy path uses `ModuleIR → RouterIR → RouteIR`. The entity path is being added via `EntityAnalyzer → EntityIR`.

The CTO directive is clear: **there should be ONE way to build things.**

## Decision

### 1. Entities are the primary and only programming model for APIs

- `entity()` is how developers define data-backed endpoints
- `action()` (standalone, from EDA design) handles non-entity workflows (webhooks, health checks, OAuth callbacks, cron jobs)
- `service()` remains for internal cross-entity business logic (not exposed as routes)
- `module()`, `router()`, and manual route definitions are **deprecated**

### 2. Deprecation timeline

| Phase | When | What happens |
|-------|------|-------------|
| **Now (v0.1)** | Current | EntityAnalyzer ships. Entities are the documented path. Legacy still works. |
| **Prove it (v0.1.x)** | After demo | Build the demo app end-to-end with entities only. Update all examples. Confirm no gaps. |
| **Deprecate (v0.2)** | After confirmation | Legacy module/router/service emits compiler warnings. Docs removed. Migration guide published. |
| **Remove (v0.3)** | After deprecation period | Legacy code removed from compiler, codegen, and server packages. |

### 3. What replaces what

| Legacy | Replacement | Notes |
|--------|------------|-------|
| `module()` | Gone — no grouping boilerplate needed | Entities self-register. `domain()` provides optional grouping in v0.2. |
| `router()` | `entity()` auto-CRUD | Routes auto-generated from entity definition |
| Manual route definitions | `entity()` custom actions | `actions: { archive: { input, output, handler } }` |
| `service()` (exposed as routes) | `entity()` custom actions or `action()` | Business logic lives in hooks/actions, not separate service classes |
| `service()` (internal logic) | `service()` stays | Internal cross-entity logic that's not exposed as an endpoint |
| Webhook/health/OAuth endpoints | `action()` standalone | From EDA design — standalone workflows not tied to an entity |

### 4. The "one way" principle

For any given task, there is exactly one way to do it in vertz:

- **Define a data model** → `schema()` + `d.model()`
- **Expose it as an API** → `entity()`
- **Add business logic** → entity hooks (before/after) or custom actions
- **Handle non-data workflows** → `action()`
- **Share logic between entities** → `service()` (internal only)
- **Group related entities** → `domain()` (v0.2)

No shorthand syntax. No alternative paths. No "you can also do it this way."

### 5. Compiler portability — Zig/Bun native compiler planned

The current compiler uses ts-morph (TypeScript AST analysis). This is a **temporary implementation**. The plan is to move to a native compiler (Zig or Bun's native toolchain) for performance.

**Implications for EntityAnalyzer design:**
- **IR is the contract** — `EntityIR`, `AppIR`, and `CodegenIR` types define the interface. The analyzer is an implementation detail.
- **Don't couple to ts-morph internals** — Keep analyzer logic in pure functions where possible. ts-morph is the I/O layer, not the brain.
- **Entity detection semantics must be simple** — If a Zig parser can't replicate the detection logic, it's too clever. Prefer explicit patterns over implicit resolution.
- **Schema resolution via types is the hard part** — When moving to native compiler, type resolution is the biggest challenge. Design the fallback path (`resolved: false`) to be graceful so the native compiler can incrementally add type resolution.
- **Test against IR output, not ts-morph internals** — Tests should verify "given this source, produce this IR." The analyzer implementation can be swapped without changing tests.

## Rationale

- **LLM-native:** One way to do things means LLMs generate correct code on the first prompt. No "which pattern should I use?" ambiguity.
- **Smaller surface area:** Less code to maintain, test, document, and teach.
- **Entity model is strictly better:** It provides CRUD, access rules, hooks, typed SDK, OpenAPI — all for free. Manual routes provide none of that.
- **Consistency:** Every endpoint in a vertz app looks the same. Every SDK method is predictable.
- **Compiler simplification:** When we move to Zig/Bun, we only need to implement one analysis path (entities), not two (entities + modules).

## What This Means for the EntityAnalyzer

The EntityAnalyzer is not "another analyzer alongside module/schema/middleware." It is **the primary analyzer** for the entity-first world. The module analyzer becomes legacy.

- EntityAnalyzer does NOT need to harmonize with ModuleIR
- Entity routes do NOT need to avoid collisions with module routes (modules are going away)
- The synthetic `__entities` module for OpenAPI/route-table generators is a **temporary bridge**, not a permanent design
- When modules are removed, generators consume `EntityIR` directly

## Risks

1. **Edge cases we haven't found** — Some use case might genuinely need raw routes. Mitigated by `action()` as escape hatch.
2. **Migration burden** — Existing codebases using modules need a migration path. Mitigated by phased deprecation.
3. **action() not yet implemented** — Standalone actions are EDA v0.2. Until then, legacy routes are the only escape hatch for non-entity endpoints. Acceptable for v0.1.
