# Phase 5: Compatibility + Quality Gates

## Context

Issue #2004: BaseContext exposes auth/tenancy fields regardless of app configuration. Phases 1-4 implemented all the types and the `typed()` factory. This final phase verifies structural compatibility with `@vertz/agents`, runs the full quality gates across the monorepo, adds the changeset, and ensures everything is clean.

Design doc: `plans/2004-base-context-conditional-types.md` (Rev 3, Unknowns #3, Impact on Existing Code)

## Tasks

### Task 1: @vertz/agents structural compatibility test

**Files:** (1)
- `packages/agents/src/__tests__/base-context-compat.test-d.ts` (new)

**What to implement:**

1. Add a type-level test asserting `BaseContext<FullFeatures>` is assignable to the structural `BaseContextLike` used in `@vertz/agents`:

```typescript
import type { BaseContext } from '@vertz/server';

// Mirror of the structural type used in create-agent-runner.ts
interface BaseContextLike {
  readonly userId: string | null;
  readonly tenantId: string | null;
  readonly tenantLevel?: string | null;
  authenticated(): boolean;
  tenant(): boolean;
  role(...roles: string[]): boolean;
}

// Default BaseContext (FullFeatures) must be assignable to BaseContextLike
const _compat: BaseContextLike = {} as BaseContext;
```

2. Verify `AgentRunnerFn` in `packages/server/src/agent/types.ts` compiles unchanged (it uses `BaseContext` default = `FullFeatures`).

**Acceptance criteria:**
- [ ] `BaseContext<FullFeatures>` is assignable to `BaseContextLike`
- [ ] `AgentRunnerFn` compiles unchanged
- [ ] `@vertz/agents` typecheck passes

---

### Task 2: Full quality gates + changeset

**Files:** (2)
- `.changeset/<generated>.md` (new)
- Verify all quality gates

**What to implement:**

1. Run full quality gates:
   - `vtz test` — all tests pass
   - `vtz run typecheck` — all packages type-clean
   - `vtz run lint` — no lint errors

2. Create changeset:

```markdown
---
'@vertz/server': patch
---

feat(server): conditional BaseContext types via typed() factory (#2004)

BaseContext is now generic over ContextFeatures. Auth/tenancy fields only
appear on ctx when configured. Use typed(auth) to get narrowed entity()
and service() factories. Existing code is unaffected — BaseContext without
a type parameter defaults to FullFeatures (all fields present).
```

3. Verify that no files outside the expected impact set were modified unintentionally.

**Acceptance criteria:**
- [ ] `vtz test` passes (all packages)
- [ ] `vtz run typecheck` passes (all packages)
- [ ] `vtz run lint` passes
- [ ] Changeset created with `patch` severity
- [ ] No unintended file modifications
- [ ] Coverage meets 95%+ threshold for all changed/new files
