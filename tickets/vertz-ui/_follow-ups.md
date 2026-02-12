# Follow-Ups — @vertz/ui

Non-blocking observations from reviews that need attention in future phases.

## Promoted to Tickets

The following follow-ups were promoted to v0.1.x tickets:

- Follow-up #4 (type-level tests) → **ui-024**
- Follow-up #5 (AbortSignal in loader context) → **ui-026**
- Follow-up #6 (CSS lookup table duplication) → **ui-025**
- Follow-up #7 (hydrate .catch()) → **ui-017** (combined with Suspense error handling)
- Follow-up #8 (lazyStrategy fallback test) → **ui-021** (combined with missing hydration strategies)
- Follow-up #9 (double hydration guard) → **ui-021** (combined with missing hydration strategies)
- Follow-up #10 (Tooltip destroy) → still open (see below)
- Follow-up #12 (controlled mode) → still open (see below)

---

## From PR #153 (ava, 2026-02-11)

### 1. __conditional could cache branch nodes for reuse
- **Phase:** backlog (optimization)
- **Severity:** low
- **Description:** `__conditional` creates a fresh DOM node on every branch switch. A future optimization could cache branch nodes so toggling back reuses the previously rendered node instead of recreating it.
- **Resolved:** not yet

### 2. Computed interface redundantly re-declares ReadonlySignal members
- **Phase:** any (cleanup)
- **Severity:** low
- **Description:** `Computed<T>` interface redundantly re-declares `.value` and `.peek()` already present on `ReadonlySignal<T>`. Not a bug but unnecessary duplication.
- **Resolved:** not yet

### 3. insert.ts exports thin wrappers over native DOM methods
- **Phase:** any (cleanup)
- **Severity:** low
- **Description:** `insertBefore()`, `removeNode()`, `clearChildren()` in `insert.ts` are thin wrappers over native DOM methods with no added value. Could be removed if not needed for testability. Note: these were moved to `@vertz/ui/internals` during the DX cleanup, so they no longer pollute the public API.
- **Resolved:** partially (moved to internals, not removed)

## From PR #197 (ben, 2026-02-11)

### 10. Tooltip lacks destroy() method
- **Phase:** v0.1.x
- **Severity:** low
- **Description:** Tooltip event listeners (mouseenter/mouseleave/focus/blur) cannot be cleaned up if the component is removed from a long-lived UI. Add a `destroy()` method.
- **Resolved:** not yet

### 11. Document that Popover is non-modal (no focus trap)
- **Phase:** v0.1.x (docs)
- **Severity:** low
- **Description:** Popover has no focus trap, which is correct behavior for a non-modal popover, but should be documented to set expectations.
- **Resolved:** not yet

### 12. Add controlled mode to primitives
- **Phase:** backlog
- **Severity:** low
- **Description:** All primitives currently only support uncontrolled mode (defaultValue + callbacks). Controlled mode (value prop overrides internal state) should be added for more advanced use cases.
- **Resolved:** not yet

---

## From PR #199 — ben review (noting items)

### N1. Module-level varCounter in JSX transformer
- **Phase:** any (awareness)
- **Severity:** low
- **Description:** `varCounter` is module-level state in the JSX transformer. Not an issue now (Bun is single-threaded), but would be a thread-safety concern if the compiler ever needs concurrent transforms.
- **Resolved:** not yet (awareness only)

### N2. Computed circular dependency detection
- **Phase:** backlog (robustness)
- **Severity:** low
- **Description:** No guard against computed re-entry. A circular computed dependency would stack overflow. Consider adding a `computing` flag to detect cycles and throw a meaningful error.
- **Resolved:** not yet

### N4. __conditional first-render invariant is fragile
- **Phase:** any (documentation)
- **Severity:** low
- **Description:** The first-render code path in `__conditional` has an invariant that isn't well-documented. Could confuse future contributors.
- **Resolved:** not yet

### N5. Missing dispose tests for __attr, __show, __classList
- **Phase:** v0.1.x (test coverage)
- **Severity:** low
- **Description:** No tests verify that reactive effects from `__attr`, `__show`, `__classList` are properly disposed when the associated DOM element is removed.
- **Resolved:** not yet

---

## From PR #199 — mike review (noting items)

### M1. Compiler has no peer dep on runtime
- **Phase:** any (packaging)
- **Severity:** low
- **Description:** `@vertz/ui-compiler` doesn't declare `@vertz/ui` as a peer dependency. Consider adding it to ensure version alignment.
- **Resolved:** not yet

### M2. onMount runs synchronously, not after DOM insertion
- **Phase:** any (documentation)
- **Severity:** low
- **Description:** `onMount` fires synchronously during component initialization, not after the DOM is inserted. This is a valid design choice but should be explicitly documented to set expectations.
- **Resolved:** not yet

### M3. Computed propagation may fire effects for unchanged values
- **Phase:** backlog (optimization)
- **Severity:** low
- **Description:** Known push-pull trade-off. Computed values use push-based propagation which may fire downstream effects even when the computed result hasn't changed. A future optimization could add equality checks.
- **Resolved:** not yet (known trade-off)

---

## From PR #199 — josh DX review (follow-up items)

### J1. create-vertz-app scaffolding CLI
- **Phase:** backlog (standalone)
- **Severity:** medium
- **Description:** No `npx vertz init` or `create-vertz-app` scaffolding. Developers need to manually install 4 packages and configure the compiler. This is a significant onboarding friction point.
- **Resolved:** not yet

### J2. @vertz/primitives naming
- **Phase:** any (naming review)
- **Severity:** low
- **Description:** `@vertz/primitives` breaks the `@vertz/ui-*` naming pattern used by other UI packages. Consider renaming to `@vertz/ui-primitives` for discoverability. Note: this would be a breaking change.
- **Resolved:** not yet (naming discussion pending)
