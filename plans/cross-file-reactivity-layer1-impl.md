# Implementation Plan: Layer 1 — Never Wrap Function Definitions in computed()

**Design doc:** `plans/cross-file-reactivity-analysis.md` — Section 2.1
**Issue:** #988
**Feature branch:** `feat/cross-file-reactivity`
**Effort:** 1-2 days
**Author:** mike (tech-lead)

---

## Architecture Decision

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Where to check | Computed classification loop (lines 236-257) | Minimal change surface — one guard clause |
| What to store | `isFunctionDef: boolean` on const entries | Need AST node info from Pass 1 available in Pass 2 |
| Optimization | Check `isFunctionDef` before `collectDeps` | Skip unnecessary AST traversal into function bodies |

---

## Phase 1: Add `isFunctionDef` to const entries + skip in computed loop

### Sub-task 1.1: Write failing tests for the new behavior

**Files to modify:** `packages/ui-compiler/src/analyzers/__tests__/reactivity-analyzer.test.ts`

**Instructions:**
1. Update the test at line 392-402: change expected kind from `'computed'` to `'static'` for arrow function capturing signal API property. Update the test name to reflect the new behavior.
2. Update the test at line 537-547: change expected kind from `'computed'` to `'static'` for callback capturing props. Update the comment (remove the "See #978" note — this IS the fix).
3. Add new test: IIFE depending on signal is still classified as `computed`:
   ```typescript
   it('classifies IIFE depending on signal as computed', () => {
     const [result] = analyze(`
       function Counter() {
         let count = 0;
         const result = (() => count * 2)();
         return <div>{result}</div>;
       }
     `);
     expect(findVar(result?.variables, 'count')?.kind).toBe('signal');
     expect(findVar(result?.variables, 'result')?.kind).toBe('computed');
   });
   ```
4. Add new test: function expression capturing signal is classified as `static`:
   ```typescript
   it('classifies function expression capturing signal as static', () => {
     const [result] = analyze(`
       function Counter() {
         let count = 0;
         const increment = function() { count++; };
         return <button onClick={increment}>{count}</button>;
       }
     `);
     expect(findVar(result?.variables, 'count')?.kind).toBe('signal');
     expect(findVar(result?.variables, 'increment')?.kind).toBe('static');
   });
   ```
5. Add new test: arrow function thunk called in JSX is `static` (JSX handles reactivity):
   ```typescript
   it('classifies arrow thunk called in JSX as static', () => {
     const [result] = analyze(`
       function Counter() {
         let count = 0;
         const getLabel = () => count > 5 ? 'high' : 'low';
         return <div>{getLabel()}</div>;
       }
     `);
     expect(findVar(result?.variables, 'count')?.kind).toBe('signal');
     expect(findVar(result?.variables, 'getLabel')?.kind).toBe('static');
   });
   ```
6. Add regression test: value expression depending on signal is still `computed`:
   ```typescript
   it('still classifies value expression depending on signal as computed', () => {
     const [result] = analyze(`
       function Counter() {
         let count = 0;
         const doubled = count * 2;
         const label = count > 5 ? 'high' : 'low';
         return <div>{doubled} {label}</div>;
       }
     `);
     expect(findVar(result?.variables, 'doubled')?.kind).toBe('computed');
     expect(findVar(result?.variables, 'label')?.kind).toBe('computed');
   });
   ```

**Verification:** `bun test packages/ui-compiler/src/analyzers/__tests__/reactivity-analyzer.test.ts` — the 2 updated tests should FAIL (they now expect `'static'` but the analyzer still returns `'computed'`). The 4 new tests: IIFE + regression should PASS, function expression + arrow thunk should FAIL.

**Commit:** `test(ui-compiler): update tests for Layer 1 callback classification fix [#988]`

### Sub-task 1.2: Store `isFunctionDef` flag during Pass 1

**Files to modify:** `packages/ui-compiler/src/analyzers/reactivity-analyzer.ts`

**Instructions:**
1. Update the `consts` map type to include `isFunctionDef: boolean`:
   ```typescript
   const consts = new Map<
     string,
     {
       start: number;
       end: number;
       deps: string[];
       propertyAccesses: Map<string, Set<string>>;
       isFunctionDef: boolean;
     }
   >();
   ```
2. In the loop where non-destructured const entries are created (around line 152-156), check the initializer's AST node kind:
   ```typescript
   const isFunctionDef = init
     ? init.isKind(SyntaxKind.ArrowFunction) || init.isKind(SyntaxKind.FunctionExpression)
     : false;
   ```
3. If `isFunctionDef` is true, skip `collectDeps` (optimization — avoid unnecessary traversal):
   ```typescript
   const { refs: deps, propertyAccesses } = (init && !isFunctionDef)
     ? collectDeps(init)
     : { refs: [] as string[], propertyAccesses: new Map<string, Set<string>>() };
   const entry = { start: decl.getStart(), end: decl.getEnd(), deps, propertyAccesses, isFunctionDef };
   ```
4. For destructured const entries and synthetic entries, set `isFunctionDef: false` (they're never function definitions).
5. For the `lets` map — no changes needed. `let` declarations are never classified as computed.

**Verification:** `bun test packages/ui-compiler/src/analyzers/__tests__/reactivity-analyzer.test.ts` — all tests should still produce the SAME results (we've stored the flag but aren't using it yet). The failing tests from 1.1 should still fail.

**Commit:** `feat(ui-compiler): store isFunctionDef flag during reactivity Pass 1 [#988]`

### Sub-task 1.3: Skip function definitions in computed classification loop

**Files to modify:** `packages/ui-compiler/src/analyzers/reactivity-analyzer.ts`

**Instructions:**
1. In the computed classification loop (lines 236-257), add the `isFunctionDef` guard:
   ```typescript
   for (const [name, info] of consts) {
     if (computeds.has(name)) continue;
     if (signalApiVars.has(name)) continue;
     if (info.isFunctionDef) continue;  // <-- NEW: never wrap function definitions in computed()
     // ... rest of the loop unchanged
   }
   ```

**Verification:** `bun test packages/ui-compiler/src/analyzers/__tests__/reactivity-analyzer.test.ts` — ALL tests should now pass, including the updated and new tests from sub-task 1.1.

**Commit:** `fix(ui-compiler): never wrap function definitions in computed() [#988]`

### Sub-task 1.4: Run quality gates

**Instructions:**
1. Run typecheck: `bun run --filter @vertz/ui-compiler typecheck`
2. Run lint: `bunx biome check packages/ui-compiler/src/`
3. Run full test suite: `bun test packages/ui-compiler/`
4. Run the full CI pipeline: `turbo run lint typecheck test build`

**Verification:** All gates pass.

**Commit:** Only if lint/format fixes are needed.

### Sub-task 1.5: Verify on example apps

**Instructions:**
1. Compile `examples/entity-todo` and inspect output for any arrow function or function expression wrapped in `computed()` — there should be zero.
2. If possible, run the entity-todo example in the dev server and verify functionality (Playwright MCP for interactive testing).

**Verification:** No false-positive `computed()` wrappings. App works correctly.

**Commit:** No commit needed — this is verification only.

---

## Phase 1 Definition of Done

- [ ] All existing tests pass (with 2 expectations updated)
- [ ] 4 new tests pass (IIFE, function expression, arrow thunk, regression)
- [ ] `isFunctionDef` flag stored during Pass 1
- [ ] Computed classification loop skips function definitions
- [ ] `collectDeps` optimization: skips traversal for function definitions
- [ ] Quality gates pass (lint, typecheck, test, build)
- [ ] Zero false-positive `computed()` wrappings on example apps
- [ ] Code reviewed by a different bot (adversarial review)

---

## Files Changed

| File | Change |
|------|--------|
| `packages/ui-compiler/src/analyzers/reactivity-analyzer.ts` | Add `isFunctionDef` to const entries; skip in computed loop; optimize `collectDeps` |
| `packages/ui-compiler/src/analyzers/__tests__/reactivity-analyzer.test.ts` | Update 2 tests, add 4 new tests |

---

## Risk Assessment

**Low risk.** The change is a single guard clause in a well-tested loop. The `isFunctionDef` check is deterministic (AST node kind). All edge cases are covered by tests (IIFE, function expression, arrow function, value expressions). The blast radius is limited to the reactivity analyzer — no other files change.
