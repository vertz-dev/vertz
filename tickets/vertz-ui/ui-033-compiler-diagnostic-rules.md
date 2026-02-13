# ui-033: Compiler diagnostic rules — catch runtime bugs at build time

- **Status:** 🔴 Todo
- **Assigned:** ben
- **Phase:** v0.2.0
- **Priority:** P1
- **Estimate:** 16-24h
- **Blocked by:** ui-032 (plugin must work first)
- **Blocks:** none
- **PR:** —

## Description

Add compiler-time diagnostic rules that catch common @vertz/ui mistakes before they reach the browser. The compiler already has diagnostic infrastructure (`MutationDiagnostics`, `PropsDestructuringDiagnostics`, `CSSDiagnostics`). This ticket expands it with rules that enforce correct usage of lifecycle, reactivity, and DOM APIs.

**Philosophy:** "If it builds, it works." Every rule here catches a bug that would otherwise silently fail or throw at runtime. This is a competitive advantage — no other framework has a compiler that validates lifecycle correctness.

### Rules to implement

#### Rule 1: `lifecycle-scope` (Error)
Detect `onCleanup()` and `onMount()` called outside a valid disposal scope.

```tsx
// ❌ Error: onCleanup() called outside a disposal scope
function MyComponent() {
  const q = query(() => fetch('/api'));
  onCleanup(() => q.dispose());  // ← not inside effect/onMount
  return <div />;
}

// ✅ OK
function MyComponent() {
  const q = query(() => fetch('/api'));
  onMount(() => {
    onCleanup(() => q.dispose());
  });
  return <div />;
}
```

**Detection:** Walk the component function body. `onCleanup()` calls must be inside an `effect()`, `watch()`, `onMount()`, or `pushScope()/popScope()` block. Top-level calls are errors.

#### Rule 2: `untransformed-jsx` (Warning)
Warn when JSX appears in a position the compiler doesn't transform.

```tsx
// ⚠️ Warning: JSX in for-loop may not be reactively tracked
for (const item of items) {
  const el = <div>{item.name}</div>;  // ← compiler might miss this
}
```

**Detection:** After the JSX analyzer runs, check for any JSX expressions in the AST that weren't processed by the transformer. Emit a warning with the position.

#### Rule 3: `missing-cleanup` (Warning)
Warn when `query()` or `effect()` is created without a cleanup path.

```tsx
// ⚠️ Warning: query() created without onCleanup — may leak
function MyComponent() {
  const q = query(() => fetch('/api'));
  // No onCleanup(() => q.dispose())
  return <div />;
}
```

**Detection:** Track `query()` and `effect()` return values. If the return value is stored but never passed to `onCleanup` or `.dispose()` within the same component, emit a warning.

#### Rule 4: `raw-dom-mutation` (Warning)
Warn when a component uses direct DOM mutations that bypass the reactive system.

```tsx
// ⚠️ Warning: direct innerHTML assignment bypasses reactivity
function MyComponent() {
  const el = <div />;
  el.innerHTML = '<p>hello</p>';  // ← bypasses compiler transforms
  return el;
}
```

**Detection:** Look for assignments to `.innerHTML`, `.textContent`, `.innerText` on variables that hold JSX elements.

#### Rule 5: `signal-outside-component` (Error)
Detect `signal()` usage outside a component function.

```tsx
// ❌ Error: signal() called at module level — will be shared across components
const count = signal(0);

function MyComponent() {
  return <div>{count.value}</div>;
}
```

**Detection:** `signal()` calls at module scope (not inside a function that returns JSX) are errors.

### Diagnostic output format

Diagnostics should integrate with:
1. **Vite dev overlay** — show as red error screen (errors) or console warnings
2. **CLI output** — `vertz check` command (future)
3. **Build failures** — errors fail the build, warnings are logged

```
error[lifecycle-scope]: onCleanup() called outside a disposal scope
  --> src/pages/task-list.tsx:116:3
   |
116|   onCleanup(() => {
   |   ^^^^^^^^^ must be inside effect(), onMount(), or pushScope() block
   |
   = help: wrap in onMount(() => { onCleanup(...) })
```

## Acceptance Criteria

- [ ] `lifecycle-scope` rule detects bare `onCleanup()` and `onMount()` calls — emits error
- [ ] `untransformed-jsx` rule detects JSX the compiler skipped — emits warning
- [ ] `missing-cleanup` rule detects `query()` without disposal — emits warning
- [ ] `raw-dom-mutation` rule detects `.innerHTML`/`.textContent` assignments — emits warning
- [ ] `signal-outside-component` rule detects module-level signals — emits error
- [ ] Diagnostics show in Vite dev overlay with file/line/column
- [ ] Diagnostics include actionable help text
- [ ] Errors fail the Vite build in production mode
- [ ] Unit tests for each rule: true positive + true negative cases
- [ ] No false positives on existing codebase (examples + tests)

## Files

- `packages/ui-compiler/src/diagnostics/lifecycle-diagnostics.ts` — Rule 1
- `packages/ui-compiler/src/diagnostics/jsx-diagnostics.ts` — Rule 2
- `packages/ui-compiler/src/diagnostics/cleanup-diagnostics.ts` — Rule 3
- `packages/ui-compiler/src/diagnostics/dom-mutation-diagnostics.ts` — Rule 4
- `packages/ui-compiler/src/diagnostics/signal-diagnostics.ts` — Rule 5
- `packages/ui-compiler/src/diagnostics/index.ts` — barrel + runner
- `packages/ui-compiler/src/compiler.ts` — wire diagnostics into compile pipeline
- `packages/ui-compiler/src/vite-plugin.ts` — surface diagnostics in Vite overlay
- Tests for each diagnostic file

## Notes

- Start with rules 1 and 2 (highest impact — would have caught today's bugs). Rules 3-5 can be follow-ups.
- The diagnostic infrastructure already exists — `MutationDiagnostics` is a good pattern to follow.
- This becomes a major selling point: "The vertz compiler catches bugs that other frameworks only find at runtime."
- Long term, these rules feed into a `vertz check` CLI command and potentially an LSP for IDE integration.
