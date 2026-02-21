# @vertz/ui

- **Status:** 🟡 In Progress
- **Owner:** nora
- **Design doc:** plans/ui-design.md
- **Implementation plan:** plans/ui-implementation.md
- **Roadmap:** /app/backstage/roadmaps/vertz-ui.md

## Milestones

### Phase 1: Reactivity & Compiler Foundation
- **Target:** TBD
- **Status:** 🟢 Done
- **Estimate:** 128 hours
- Tickets: ui-001 (Reactivity Runtime, 40h), ui-002 (Compiler Core, 56h), ui-003 (Component Model, 32h)

### Phase 2: CSS Framework
- **Target:** TBD
- **Status:** 🟢 Done
- **Estimate:** 128 hours
- **Blocked by:** Phase 1
- Tickets: ui-004 (css() Styles, 48h), ui-005 (variants(), 24h), ui-006 (defineTheme(), 24h), ui-007 (Zero-Runtime Extraction, 32h)

### Phase 3: Forms
- **Target:** TBD
- **Status:** 🟢 Done
- **Estimate:** 32 hours
- **Blocked by:** Phase 1
- Tickets: ui-008 (Forms, 32h)

### Phase 4: Data Fetching
- **Target:** TBD
- **Status:** 🟢 Done
- **Estimate:** 32 hours
- **Blocked by:** Phase 1
- Tickets: ui-009 (Data Fetching, 32h)

### Phase 5: SSR & Hydration
- **Target:** TBD
- **Status:** 🔴 Not Started
- **Estimate:** 72 hours
- **Blocked by:** Phase 1
- Tickets: ui-010 (SSR, 40h), ui-011 (Atomic Hydration, 32h)

### Phase 6: Router
- **Target:** TBD
- **Status:** 🟢 Done
- **Estimate:** 40 hours
- **Blocked by:** Phase 1
- Tickets: ui-012 (Router, 40h)

### Phase 7: @vertz/primitives
- **Target:** TBD
- **Status:** 🔴 Not Started
- **Estimate:** 80 hours
- **Blocked by:** Phase 1 + Phase 2
- Tickets: ui-013 (Primitives, 80h)

### Phase 8: Testing & DX
- **Target:** TBD
- **Status:** 🔴 Not Started
- **Estimate:** 72 hours
- **Blocked by:** Phases 1-6
- Tickets: ui-014 (Testing Utilities, 40h), ui-015 (Vite Plugin, 32h)

## v0.1.x Patch — Bug Fixes from DX Review

Post-merge bug fixes discovered during josh's task-manager demo (PR #210).

| ID | Title | Priority | Assigned | Estimate | Status |
|----|-------|----------|----------|----------|--------|
| ui-016 | onCleanup() silently no-ops without disposal scope | P1 | nora | 3h | 🟢 Done |
| ui-017 | globalCss() does not auto-inject like css() does | P1 | nora | 1h | 🟢 Done |
| ui-018 | compileTheme() not exported from public API | P1 | nora | 30m | 🟢 Done |
| ui-019 | Compiler conditional & list transforms with disposal scopes | P1 | ben+nora | 12h | 🟡 In Progress |
| ui-020 | E2E testing infrastructure with Playwright | P2 | ava+edson | 6h | 🟡 In Progress |

## v0.1.x Patch — Bug Fixes from DX Review (PR #199)

Post-merge bug fixes discovered during ben's code review (PR #199).

| ID | Title | Priority | Assigned | Estimate | Status |
|----|-------|----------|----------|----------|--------|
| ui-034 | Fix query() cache key reactivity | P1 | nora | 4h | 🟢 Done |
| ui-035 | Fix Suspense error handling | P1 | nora | 4h | 🟢 Done |
| ui-036 | Fix context for async reads | P1 | nora | 6h | 🟢 Done |
| ui-037 | Fix __list effect leak | P1 | nora | 3h | 🟢 Done |
| ui-038 | Fix compiler bugs | P1 | ben | 4h | 🟢 Done |

## Ticket Index (v1.0 Roadmap)

| ID | Title | Phase | Assigned | Estimate | Status |
|----|-------|-------|----------|----------|--------|
| ui-001 | Reactivity Runtime | 1A | nora | 40h | 🟢 Done |
| ui-002 | Compiler Core | 1B | ben | 56h | 🟢 Done |
| ui-003 | Component Model | 1C | nora | 32h | 🟢 Done |
| ui-004 | css() Compile-Time Style Blocks | 2A | nora | 48h | 🟢 Done |
| ui-005 | variants() API | 2B | nora | 24h | 🟢 Done |
| ui-006 | defineTheme() and Theming | 2C | nora | 24h | 🟢 Done |
| ui-007 | Zero-Runtime CSS Extraction | 2D | nora | 32h | 🟢 Done |
| ui-008 | Forms | 3 | nora | 32h | 🟢 Done |
| ui-009 | Data Fetching (query) | 4 | nora | 32h | 🟢 Done |
| ui-010 | Server-Side Rendering (SSR) | 5A | nora | 40h | 🔴 Todo |
| ui-011 | Atomic Hydration | 5B | nora | 32h | 🔴 Todo |
| ui-012 | Router | 6 | nora | 40h | 🟢 Done |
| ui-013 | @vertz/primitives | 7 | nora | 80h | 🔴 Todo |
| ui-014 | Testing Utilities | 8A | ava | 40h | 🔴 Todo |
| ui-015 | Vite Plugin Complete | 8B | nora | 32h | 🔴 Todo |

**Total estimate:** 584 hours

## Parallelization

Once Phase 1 (ui-001, ui-002, ui-003) is complete, Phases 2-6 can all run in parallel:
- Phase 2 (ui-004 through ui-007) — CSS framework
- Phase 3 (ui-008) — Forms
- Phase 4 (ui-009) — Data fetching
- Phase 5 (ui-010, ui-011) — SSR & Hydration
- Phase 6 (ui-012) — Router

Phase 7 (ui-013) waits on Phase 2. Phase 8 (ui-014, ui-015) waits on Phases 1-6.

## Health Updates

### 2026-02-10
Project created. Design doc and implementation plan approved. Roadmap committed. Ready to create tickets from implementation plan.

### 2026-02-10
All 15 tickets created from implementation plan. Each ticket is self-contained with full description, acceptance criteria, and integration test code. Dependency graph mapped across all tickets.
