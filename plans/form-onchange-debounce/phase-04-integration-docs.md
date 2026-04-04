# Phase 4: Integration Test + Docs + Changeset

## Context

This is the final phase of the form-level onChange with per-input debounce feature (#2151). This phase delivers the end-to-end acceptance test using only public imports, documentation, and a changeset for release.

Phases 1-3 must be complete before this phase.

Design doc: `plans/form-onchange-debounce.md`

## Tasks

### Task 1: E2E acceptance test (developer walkthrough)

**Files:**
- `packages/ui/src/dom/__tests__/form-on-change-e2e.test.ts` (new)

**What to implement:**

An integration test that exercises the full feature using only public package imports (`@vertz/ui`, `@vertz/ui/internals`). This is the developer walkthrough test — it proves the feature works end-to-end as a user would experience it.

The test must cover:
1. **Debounced text input + immediate select** — the core search/filter pattern
2. **Rapid typing** — debounce coalesces into one callback
3. **Mixed interaction** — type in debounced input, then change select → one callback (pending timer canceled)
4. **form.reset()** — handler fires with reset values
5. **Cleanup on unmount** — no handler fires after cleanup
6. **No onChange** — debounce attributes set but nothing fires without onChange

Use `vi.useFakeTimers()` for debounce timing control. Use DOM APIs to create form elements and dispatch `input`/`reset` events.

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { __formOnChange } from '@vertz/ui/internals';
import type { FormValues } from '@vertz/ui';

describe('Feature: Form-level onChange with per-input debounce (E2E)', () => {
  // Tests from design doc section 7 — all scenarios
});
```

**Acceptance criteria:**
- [ ] All test scenarios from the design doc pass
- [ ] Uses only public imports (`@vertz/ui`, `@vertz/ui/internals`)
- [ ] Uses fake timers for deterministic debounce testing
- [ ] Verifies FormValues type at the call site

---

### Task 2: Documentation update

**Files:**
- `packages/docs/` (new or modified pages for form onChange + debounce)

**What to implement:**

Check if `packages/docs/` exists and contains form-related documentation. If it does:
1. Add a section on `<form onChange={handler}>` — what it does, how it works
2. Add a section on `debounce={N}` — per-input debounce configuration
3. Include the search/filter example from the design doc
4. Document the `FormValues` type and its limitations (checkbox absence, no multi-value, string-only)
5. Document the escape hatch for raw DOM `change` events (ref + addEventListener)
6. Document interaction with `form()` API

If `packages/docs/` doesn't contain form docs yet, create a minimal form guide page.

**Acceptance criteria:**
- [ ] New API is documented with concrete examples
- [ ] Limitations are clearly noted
- [ ] Escape hatch is documented

---

### Task 3: Changeset

**Files:**
- `.changeset/<generated-name>.md` (new)

**What to implement:**

Create a changeset file:

```markdown
---
'@vertz/ui': patch
'@vertz/ui-primitives': patch
'@vertz/native-compiler': patch
---

feat(ui): add form-level onChange with per-input debounce

`<form onChange={handler}>` fires when any child input changes, receiving all current form values as a `FormValues` object. Per-input `debounce={ms}` delays the callback for text inputs.

**Breaking:** `onChange` on `<form>` now receives `FormValues` instead of a DOM `Event`. Use `ref` + `addEventListener` for the raw DOM event.
```

**Acceptance criteria:**
- [ ] Changeset covers all modified packages
- [ ] All versions are `patch` (per policy)
- [ ] Breaking change is noted

---

### Task 4: Full quality gates

**Files:** (no changes — validation only)

**What to do:**
```bash
# TypeScript quality gates
vtz test && vtz run typecheck && vtz run lint

# Rust quality gates (if native/ was changed in phase 2)
cd native && cargo test --all && cargo clippy --all-targets --release -- -D warnings && cargo fmt --all -- --check
```

**Acceptance criteria:**
- [ ] All tests pass across the monorepo
- [ ] Typecheck clean
- [ ] Lint clean
- [ ] Rust tests pass, clippy clean, fmt clean
