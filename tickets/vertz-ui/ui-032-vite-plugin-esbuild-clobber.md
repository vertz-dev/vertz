# ui-032: Fix Vite plugin — esbuild clobbers compiler output

- **Status:** 🔴 Todo
- **Assigned:** ben
- **Phase:** v0.2.0
- **Priority:** P0 — blocks demo
- **Estimate:** 4-8h
- **Blocked by:** none
- **Blocks:** ui-033 (compiler diagnostics), all demos
- **PR:** —

## Description

The `@vertz/ui-compiler` Vite plugin's compiled output is silently overwritten by Vite's built-in esbuild JSX transform. The compiler correctly transforms `let` → `signal()` and JSX → `__element()/__conditional()/__list()`, but esbuild runs **after** the plugin and converts everything back to `jsxDEV()` calls. The result: zero compiler transforms survive to the browser.

### Root causes

**Bug 1: Plugin priority.** The Vite plugin does not set `enforce: 'pre'`, so it runs at normal priority. Vite's esbuild transform (which handles JSX → `jsxDEV()`) runs after and overwrites the compiler's DOM API output.

**Bug 2: Untransformed JSX in imperative code.** The compiler transforms JSX in the component's return statement into `__element()` calls, but leaves JSX in imperative blocks (for-loops, if-blocks, variable assignments outside the return) as raw JSX. This means:
- With esbuild active: those JSX nodes get converted to `jsxDEV()` (wrong runtime)
- With `esbuild.jsx: 'preserve'`: Vite's import-analysis plugin fails to parse the raw JSX syntax

### Evidence

Tested on `examples/task-manager`:
- `compile()` called directly produces correct output with `signal()`, `__element()`, `__conditional()`, `__list()`
- Vite dev server serves untransformed code — all `signal()` calls replaced back to plain `let`, all `__element()` calls replaced back to `jsxDEV()`
- Debug logging confirms the plugin's `transform()` is called and returns transformed code, but esbuild overwrites it downstream

### Reproduction

```bash
cd examples/task-manager
npx vite --port 5173
# Open browser, check console:
# DisposalScopeError: onCleanup() must be called within a disposal scope
# All reactive features broken — signals not created, conditionals not reactive
```

## Fix

### Bug 1 fix: Add `enforce: 'pre'` to the plugin

```typescript
// packages/ui-compiler/src/vite-plugin.ts
return {
  name: 'vertz',
  enforce: 'pre',  // ← Run before esbuild's JSX transform
  // ...
};
```

This ensures the compiler runs first. After the compiler transforms JSX to `__element()` calls, esbuild sees plain function calls (not JSX) and leaves them alone.

### Bug 2 fix: Transform all JSX in components

The compiler's JSX transformer must handle JSX in all positions within a component function, not just the return statement. Specifically:
- JSX assigned to variables (`const el = <div>...</div>`)
- JSX inside for-loops (`for (...) { const btn = <button>...</button> }`)
- JSX in conditional blocks

The `JsxTransformer` and `JsxAnalyzer` need to walk the full function body, not just the return expression.

## Acceptance Criteria

- [ ] Vite plugin has `enforce: 'pre'`
- [ ] `examples/task-manager` loads with no console errors
- [ ] Compiled output in browser contains `signal()`, `__element()`, `__conditional()`, `__list()`
- [ ] No `jsxDEV()` calls in compiled component output
- [ ] JSX in for-loops and imperative blocks is transformed to `__element()` calls
- [ ] All 25 Playwright E2E tests pass in `examples/task-manager`
- [ ] `bun run test` passes (unit tests)
- [ ] `bun run typecheck` passes

## Files

- `packages/ui-compiler/src/vite-plugin.ts` — add `enforce: 'pre'`
- `packages/ui-compiler/src/analyzers/jsx-analyzer.ts` — walk full function body
- `packages/ui-compiler/src/transformers/jsx-transformer.ts` — transform all JSX positions
- `packages/ui-compiler/src/vite-plugin.test.ts` — test that plugin sets enforce
- `examples/task-manager/vite.config.ts` — verify no workarounds needed

## Notes

- The `onCleanup()` scope bug (calling it outside `onMount`/`effect`) is a separate app-level fix already applied to `task-list.tsx` and `task-detail.tsx` — but it was only visible because the compiler wasn't running and the runtime validation caught it.
- This is the #1 blocker for any UI demo working.
