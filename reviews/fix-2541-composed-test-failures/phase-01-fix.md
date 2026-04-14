# Phase 1: Fix Composed Component Test Failures (#2541)

- **Author:** fix-2541 implementation agent
- **Reviewer:** adversarial review agent (Claude Opus 4.6)
- **Date:** 2026-04-13

## Changes

- `native/vertz-compiler-core/src/jsx_transformer.rs` (modified) -- static style expression path changed from `setAttribute("style", ...)` to `style.cssText = ...`
- `packages/ui/src/dom/attributes.ts` (modified) -- reactive style object path changed from `setAttribute("style", ...)` to `style.cssText = ...`
- `native/vtz/src/test/dom_shim.rs` (modified) -- added `setAttribute('style', ...)` -> StyleMap sync, `HTMLHeadingElement`, `HTMLParagraphElement`, `PointerEvent`, `HTMLSelectElement.selectedIndex` sync, `HTMLOptionElement.disabled`
- `packages/ui-primitives/src/__tests__/breadcrumb-composed.test.tsx` (modified) -- style assertions changed from `'0px'` to `'0'`
- `packages/ui-primitives/src/scroll-area/__tests__/scroll-area-composed.test.ts` (modified) -- style assertions changed from `'0px'` to `'0'`
- `packages/ui-primitives/src/resizable-panel/__tests__/resizable-panel-composed.test.ts` (modified) -- replaced `Bun.file()` with `readFileSync`
- `packages/ui-primitives/src/hover-card/__tests__/hover-card-composed.test.ts` (modified) -- added `blur` event dispatch to clean up floating-ui rAF loop

## CI Status

- [ ] Quality gates passed (pending verification)

## Review Checklist

- [x] Delivers what the ticket asks for (fixes 14 test failures under vtz test runner)
- [x] TDD compliance (tests were pre-existing; fixes align DOM shim + compiler behavior with assertions)
- [x] No type gaps or missing edge cases (see findings below)
- [x] No security issues
- [x] Public API changes match design doc (no public API changes)

## Findings

### 1. SHOULD-FIX: `removeAttribute('style')` does not clear StyleMap

**File:** `native/vtz/src/test/dom_shim.rs`, line 700-702

The `removeAttribute` method simply does `delete this.attributes[name]` without syncing the StyleMap when removing the `style` attribute. This means:

```js
el.style.color = 'red';
el.removeAttribute('style');
el.style.color; // still returns 'red' -- BUG
```

The `setAttribute('style', ...)` path correctly syncs the StyleMap (clears + re-parses), but `removeAttribute('style')` doesn't clear it. This can bite when `__attr` removes a reactive style by calling `el.removeAttribute('style')` on null/false values.

**Impact:** Low for the current 14 test failures (none exercise this path), but this is a correctness gap that will cause confusing test failures when someone writes a reactive style that toggles between an object value and null.

**Suggested fix:**
```js
removeAttribute(name) {
  delete this.attributes[name];
  if (name === 'style') {
    this._styleMap._styles.clear();
  }
}
```

### 2. SHOULD-FIX: Stale comment in compiler test

**File:** `native/vertz-compiler-core/src/jsx_transformer.rs`, line 3812

The comment says:
```
// Static style expression -> guarded style setAttribute with __styleStr logic
```

But the actual generated code now uses `style.cssText = ...`, not `setAttribute("style", ...)`. The comment should be updated to reflect the new behavior:

```
// Static style expression -> guarded style.cssText assignment with __styleStr logic
```

This is a minor documentation debt but misleading for anyone reading the test.

### 3. INFO: Compiler test assertions are very loose

**File:** `native/vertz-compiler-core/src/jsx_transformer.rs`, lines 3770, 3814

The assertions for style-related compiler tests are extremely loose:
- Line 3770: `result.contains("__attr(") || result.contains("__styleStr")` -- for a reactive style object, this doesn't verify the actual `style.cssText` assignment
- Line 3814: `result.contains("__styleStr") || result.contains("style")` -- `contains("style")` will match literally any output containing the word "style" (including the input JSX itself)

Neither test verifies that `style.cssText` is present in the output, which means a regression back to `setAttribute("style", ...)` would not be caught by these tests.

**Suggested improvement:** Add a targeted assertion:
```rust
assert!(
    result.contains("style.cssText"),
    "static style expression should use style.cssText, got: {result}"
);
```

### 4. INFO: `__attr` reactive string-style path still uses `setAttribute`

**File:** `packages/ui/src/dom/attributes.ts`, line 31

When a reactive style binding returns a **string** (not an object), `__attr` falls through to `el.setAttribute(name, value as string)` at line 31. This works correctly now because the DOM shim's `setAttribute('style', ...)` syncs to the StyleMap (finding #1 in the DOM shim changes). But the two code paths for style are asymmetric:

- Style object -> `el.style.cssText = styleObjectToString(value)` (direct)
- Style string -> `el.setAttribute('style', value)` (indirect, via DOM shim sync)

This is not a bug since both paths now produce correct behavior, but the asymmetry is worth noting. If a future DOM shim change breaks the `setAttribute` sync, only string-style bindings would regress.

### 5. INFO: hover-card blur cleanup is fragile

**File:** `packages/ui-primitives/src/hover-card/__tests__/hover-card-composed.test.ts`, line 91-92

The `blur` event is dispatched to clean up floating-ui's infinite rAF loop:
```ts
// Close to clean up the floating autoUpdate rAF loop
btn.dispatchEvent(new FocusEvent('blur'));
```

This works because the blur handler calls `handleClose()` which presumably cancels the autoUpdate. However, this relies on implementation details of how hover-card-composed responds to blur events. If the internal close logic changes (e.g., debounced close, or close only on pointerleave), the rAF loop would leak again.

A more robust approach would be to use `afterEach` cleanup, consistent with the integration test safety rules in `.claude/rules/integration-test-safety.md`. However, since this is a unit test (no real server), and the rAF loop is synthetic (DOM shim's `requestAnimationFrame` is just `setTimeout`), the current approach is acceptable.

### 6. INFO: `HTMLOptionElement.disabled` getter/setter is consistent

**File:** `native/vtz/src/test/dom_shim.rs`, line 1018-1019

The added `disabled` getter/setter follows the same pattern as `HTMLSelectElement.disabled` and `HTMLButtonElement.disabled` (attribute-backed boolean). Consistent and correct.

### 7. INFO: `HTMLHeadingElement` and `HTMLParagraphElement` are minimal but sufficient

**File:** `native/vtz/src/test/dom_shim.rs`, lines 1104-1105, 1126-1132

These are simple pass-through subclasses with no special behavior, which matches the real DOM API (h1-h6 and p don't have unique IDL properties beyond what HTMLElement provides). The TAG_MAP correctly maps all h1-h6 to `HTMLHeadingElement` and p to `HTMLParagraphElement`.

### 8. INFO: PointerEvent extends MouseEvent correctly

**File:** `native/vtz/src/test/dom_shim.rs`, lines 1202-1212

The `PointerEvent` class correctly extends `MouseEvent` and adds the standard pointer-specific properties (`pointerId`, `width`, `height`, `pressure`, `pointerType`, `isPrimary`). Missing `tiltX`, `tiltY`, `twist`, and `tangentialPressure`, but these are rarely used in tests and can be added when needed.

### 9. INFO: `styleObjectToString` zero-value behavior is correct

**File:** `packages/ui/src/dom/style.ts`, line 69

`formatValue` correctly returns `'0'` (not `'0px'`) for zero values: `if (typeof value !== 'number' || value === 0 || ...)`. But the breadcrumb and scroll-area components pass string `'0'`, not numeric `0`. For string values, `formatValue` returns `String(value)` which is `'0'`. Either way, the result is `'0'` without 'px'. The test assertions `expect(...).toBe('0')` are correct.

### 10. INFO: `readFileSync` migration is correct

**File:** `packages/ui-primitives/src/resizable-panel/__tests__/resizable-panel-composed.test.ts`, line 508-512

The change from `Bun.file().text()` to `readFileSync` is appropriate. The vtz runtime implements Node.js fs compatibility. The `import.meta.url` + `new URL(relative, base).pathname` pattern correctly resolves the relative path to the source file.

## Summary

### Approved with two should-fix items

The fix correctly addresses all 4 root causes across 7 files. The approach is sound:

1. **Compiler + runtime style.cssText alignment** -- ensures style objects go through the StyleMap's `cssText` setter, which properly syncs the internal Map with the DOM attribute. This is the correct fix for the root cause where `setAttribute('style', ...)` wasn't syncing to the StyleMap.

2. **DOM shim `setAttribute('style', ...)` sync** -- adds bidirectional sync so that legacy paths (and string-type reactive styles) also work correctly.

3. **DOM shim type additions** -- `HTMLHeadingElement`, `HTMLParagraphElement`, `PointerEvent`, and `HTMLOptionElement.disabled` are all correct and minimal.

4. **Test fixes** -- assertion corrections (`'0'` vs `'0px'`), `readFileSync` migration, and `blur` cleanup are all appropriate.

**Two should-fix items to address:**
1. `removeAttribute('style')` should clear the StyleMap (finding #1) -- correctness gap that will cause bugs
2. Stale comment in compiler test (finding #2) -- minor but misleading

**One improvement to consider:**
- Tighten compiler test assertions to verify `style.cssText` in output (finding #3)

## Resolution

Pending author response to should-fix items.
