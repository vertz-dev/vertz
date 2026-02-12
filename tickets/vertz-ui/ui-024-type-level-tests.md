# ui-024: Add type-level tests for core types

- **Status:** 🔴 Todo
- **Assigned:** nora
- **Phase:** v0.1.x patch
- **Estimate:** 6h
- **Blocked by:** none
- **Blocks:** none
- **PR:** —
- **Source:** mike review on PR #199 (should-fix #2), follow-up #4

## Description

Core types have zero `.test-d.ts` type-level tests. This violates the mandatory Type Flow Verification rule from `.claude/rules/tdd.md`. Types that need coverage:

- `Signal<T>`, `ReadonlySignal<T>`, `Computed<T>` — generic parameter flows
- `QueryResult<T>` — return type correctness
- `FormInstance<T>` — schema type threading
- `Context<T>` — createContext/useContext type flow
- `RouteConfig` — loader/component type constraints
- `css()`, `variants()` — property type safety

Each type needs both positive (compiles correctly) and negative (`@ts-expect-error` on invalid usage) tests.

**Files:** New `.test-d.ts` files in respective `__tests__/` directories

## Acceptance Criteria

- [ ] `.test-d.ts` for Signal/ReadonlySignal/Computed with positive + negative cases
- [ ] `.test-d.ts` for QueryResult type flow
- [ ] `.test-d.ts` for FormInstance schema type threading
- [ ] `.test-d.ts` for Context createContext/useContext
- [ ] `.test-d.ts` for RouteConfig loader/component types
- [ ] `.test-d.ts` for css()/variants() property types
- [ ] Every `.test-d.ts` includes at least one `@ts-expect-error` negative test
- [ ] `bun run typecheck` passes with all new type tests

## Progress

- 2026-02-12: Ticket created from mike's review (S2) and follow-up #4
