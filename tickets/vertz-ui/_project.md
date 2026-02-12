# @vertz/ui

- **Status:** 🟢 Complete (v0.1 shipped, v0.1.x follow-ups in progress)
- **Owner:** nora
- **Design doc:** plans/ui-design.md
- **Implementation plan:** plans/ui-implementation.md
- **Roadmap:** /app/backstage/roadmaps/vertz-ui.md
- **Main PR:** #199 (merged 2026-02-12)
- **Retrospective:** plans/post-implementation-reviews/vertz-ui-v1.md

## v0.1 Delivery Summary

- **Packages:** 4 (@vertz/ui, @vertz/ui-compiler, @vertz/ui-server, @vertz/primitives)
- **Phases:** 8 (15 phase PRs, 0 rework)
- **Tests:** 700+
- **Reviewers:** josh (DX), ben (compiler), mike (architecture)

## v0.1.x Follow-Up Tickets

### Priority 1 — Correctness Bugs

| ID | Title | Assigned | Estimate | Status |
|----|-------|----------|----------|--------|
| ui-016 | Fix query() cache key reactivity | nora | 4h | 🔴 Todo |
| ui-017 | Fix Suspense error handling + hydrate .catch() | nora | 4h | 🔴 Todo |
| ui-018 | Fix context for async reads (watch/query) | nora | 6h | 🔴 Todo |
| ui-019 | Fix __list effect leak on child removal | nora | 3h | 🔴 Todo |
| ui-020 | Fix compiler replaceAll + missing import gen | ben | 4h | 🔴 Todo |

### Priority 2 — Feature Gaps (Design Doc Deviations)

| ID | Title | Assigned | Estimate | Status |
|----|-------|----------|----------|--------|
| ui-021 | Add missing hydration strategies (idle/media/visible) | nora | 6h | 🔴 Todo |
| ui-022 | Add CSP nonce to renderToStream | nora | 3h | 🔴 Todo |
| ui-023 | Add fillForm/submitForm test utilities | ava | 4h | 🔴 Todo |
| ui-026 | Add AbortSignal to loader context type | nora | 2h | 🔴 Todo |

### Priority 3 — Quality & DX

| ID | Title | Assigned | Estimate | Status |
|----|-------|----------|----------|--------|
| ui-024 | Add type-level tests for core types | nora | 6h | 🔴 Todo |
| ui-025 | Extract shared CSS token tables | ben | 6h | 🔴 Todo |
| ui-027 | Clean up duplicate test files | nora | 1h | 🔴 Todo |
| ui-028 | Fix Vite plugin hydration source map | nora | 2h | 🔴 Todo |
| ui-029 | Add subpath exports (router/form/query/css) | nora | 4h | 🔴 Todo |

**Total v0.1.x estimate:** 55 hours (14 tickets)

## v0.1 Phase History (Completed)

| ID | Title | Phase | Status |
|----|-------|-------|--------|
| ui-001 | Reactivity Runtime | 1A | 🟢 Done |
| ui-002 | Compiler Core | 1B | 🟢 Done |
| ui-003 | Component Model | 1C | 🟢 Done |
| ui-004 | css() Compile-Time Style Blocks | 2A | 🟢 Done |
| ui-005 | variants() API | 2B | 🟢 Done |
| ui-006 | defineTheme() and Theming | 2C | 🟢 Done |
| ui-007 | Zero-Runtime CSS Extraction | 2D | 🟢 Done |
| ui-008 | Forms | 3 | 🟢 Done |
| ui-009 | Data Fetching (query) | 4 | 🟢 Done |
| ui-010 | Server-Side Rendering (SSR) | 5A | 🟢 Done |
| ui-011 | Atomic Hydration | 5B | 🟢 Done |
| ui-012 | Router | 6 | 🟢 Done |
| ui-013 | @vertz/primitives | 7 | 🟢 Done |
| ui-014 | Testing Utilities | 8A | 🟢 Done |
| ui-015 | Vite Plugin Complete | 8B | 🟢 Done |

## Health Updates

### 2026-02-12
v0.1 shipped. PR #199 merged to main. 14 follow-up tickets created from reviewer feedback (5 correctness bugs, 4 feature gaps, 5 quality/DX improvements). Josh building demo app.

### 2026-02-10
All 15 tickets created from implementation plan. Each ticket is self-contained with full description, acceptance criteria, and integration test code. Dependency graph mapped across all tickets.

### 2026-02-10
Project created. Design doc and implementation plan approved. Roadmap committed. Ready to create tickets from implementation plan.
