# Cross-File Reactivity Analysis -- Technical Feasibility Review

**Reviewer:** ben (Core Engineer, packages/compiler/, packages/ui-compiler/)
**Date:** 2026-03-07
**Design Doc:** plans/cross-file-reactivity-analysis.md
**Verdict:** Not approved -- 3 blocking issues, 7 non-blocking issues, 5 questions

---

## 1. Layer 1 Correctness: "Arrow functions and function expressions should never be wrapped in computed()"

### 1.1 The rule is too broad for IIFEs -- BLOCKING

The design says: if the initializer is an `ArrowFunction` or `FunctionExpression`, classify as `static`. This breaks IIFEs (Immediately Invoked Function Expressions):

```tsx
function TaskList() {
  let count = 0;
  const result = (() => count * 2)();
  return <div>{result}</div>;
}
```

The initializer of `result` is a `CallExpression` whose callee is a `ParenthesizedExpression` wrapping an `ArrowFunction`. The AST node kind of the initializer is `CallExpression`, not `ArrowFunction`, so the `isFunctionDefinition` check would NOT skip it. `result` would still be classified as `computed`. So this case is actually fine under the proposed implementation -- the check inspects the **initializer** node kind, and an IIFE's initializer is a `CallExpression`.

However, the design doc's wording ("Arrow functions and function expressions should never be wrapped in `computed()`") is imprecise. It should say: "When a `const` declaration's **initializer AST node** is an `ArrowFunction` or `FunctionExpression`, classify as `static`." The IIFE case works by accident because the AST check naturally excludes it, but the prose does not make this clear. Someone implementing from the prose alone could check whether an `ArrowFunction` appears *anywhere* in the initializer subtree, which would break IIFEs.

**Recommendation:** Clarify the prose. Add an IIFE test case to section 7.1 to pin this behavior.

### 1.2 Higher-order functions returning closures -- NON-BLOCKING

```tsx
function TaskList() {
  let count = 0;
  const createHandler = (multiplier: number) => () => count * multiplier;
  const double = createHandler(2);
  return <div>{double()}</div>;
}
```

Under the proposed rule, `createHandler` is an `ArrowFunction` initializer, so it is classified `static`. The signal transformer still inserts `.value` inside its body: `() => count.value * multiplier`. This is correct -- the inner arrow captures `count.value` at call time.

`double` is a `CallExpression` (calling `createHandler`), so it stays in the normal classification path. Its deps include `createHandler` (a static const) and nothing else, so it is classified `static`. This is also correct -- `double` is a function reference, and calling it in JSX (`{double()}`) is handled by the literal/non-literal strategy.

No issue here. The rule is safe for higher-order functions.

### 1.3 Function expressions used as comparators -- NON-BLOCKING

```tsx
function TaskList() {
  let sortOrder = 'asc';
  const comparator = function(a: Task, b: Task) {
    return sortOrder === 'asc' ? a.id - b.id : b.id - a.id;
  };
  const sorted = items.sort(comparator);
  return <div>{sorted}</div>;
}
```

Under the proposed rule: `comparator` is a `FunctionExpression` initializer, classified `static`. The signal transformer inserts `.value` inside its body (`sortOrder.value`). `sorted` depends on `comparator` (static) and `items` (external, not tracked), so it is classified `static`. This means `sorted` is NOT wrapped in `computed()`.

Is this correct? The answer depends on whether the runtime tracks `.sort()` reentering the comparator function. Since `sorted` appears in JSX as `{sorted}`, PR #926's literal/non-literal strategy wraps it in `__child(() => sorted)`. But `sorted` is a one-shot evaluation -- `items.sort(comparator)` runs once at component init, not reactively. When `sortOrder` changes, `sorted` is NOT recomputed.

This is a **pre-existing bug**, not introduced by this design. Today, `comparator` would be classified as `computed` (because `collectDeps` walks into the function body and finds `sortOrder`), and `sorted` would then be classified as `computed` (because it depends on a computed). After the Layer 1 fix, `comparator` is `static`, so `sorted` is also `static`, and the reactivity chain is broken.

But the pre-existing behavior (wrapping `comparator` in `computed()`) is also wrong -- it produces `const comparator = computed(() => function(...) { ... })`, which means `comparator.value` is a function, not the sort result. So neither the old nor the new behavior is correct for this pattern.

**Recommendation:** Document this as a known limitation. The correct pattern is:

```tsx
const sorted = computed(() => [...items].sort((a, b) =>
  sortOrder === 'asc' ? a.id - b.id : b.id - a.id
));
```

Or, more idiomatically in Vertz:

```tsx
const sorted = sortOrder === 'asc'
  ? [...items].sort((a, b) => a.id - b.id)
  : [...items].sort((a, b) => b.id - a.id);
```

### 1.4 Existing test contradicts the proposed rule -- BLOCKING

The existing test at `reactivity-analyzer.test.ts` line 392-402:

```typescript
it('classifies nested closure reading signal property as computed', () => {
  const [result] = analyze(`
    import { query } from '@vertz/ui';
    function TaskList() {
      const tasks = query('/api/tasks');
      const fn = () => { if (tasks.loading) return; tasks.refetch(); };
      return <div>{fn}</div>;
    }
  `);
  expect(findVar(result?.variables, 'fn')?.kind).toBe('computed');
});
```

This test explicitly asserts that an arrow function capturing a signal API property IS classified as `computed`. The proposed Layer 1 rule would change `fn` to `static`, breaking this test.

Is the test wrong, or is the rule wrong? I believe the test is wrong and the rule is right -- `fn` is a callback, and wrapping it in `computed()` produces `const fn = computed(() => () => { ... })`, which is the exact bug the design is trying to fix. But **this must be explicitly acknowledged.** The design doc should:

1. List this test as one that will be changed (not just broken).
2. Explain why the current test expectation is incorrect.
3. Show what the correct compiled output should be for this pattern.

The concern: if `fn` is used directly in JSX as `{fn}` (not `{fn()}`), the runtime sees a function reference. It won't call it. The function reference itself is stable (doesn't change), so making it `static` is correct. If used as `{fn()}`, the JSX transformer wraps it in `__child(() => fn())`, and the runtime tracks signal reads during execution. Both cases are safe.

### 1.5 `collectDeps` walks into function bodies -- NON-BLOCKING

The `collectDeps` function at line 315-348 of `reactivity-analyzer.ts` recursively walks ALL children of the initializer node, including arrow function bodies and function expression bodies. It does not stop at function boundaries. This means that for:

```tsx
const handler = () => { count++; };
```

`collectDeps` returns `['count']` as a dependency. Under the current system, this makes `handler` a computed (if `count` is a signal). Under the proposed system, the `isFunctionDefinition` check short-circuits before the deps are even evaluated.

The concern: `collectDeps` still does unnecessary work -- it walks into the function body, collects deps, and then the result is thrown away because `isFunctionDefinition` returns `true`. This is not a correctness issue, but it is wasted computation.

**Recommendation:** Consider adding an early return in `collectDeps` when the node is an `ArrowFunction` or `FunctionExpression`, or (better) check `isFunctionDefinition` before calling `collectDeps`. This is an optimization, not a correctness fix.

---

## 2. Layer 2 Integration: Manifest System and ReactivityAnalyzer

### 2.1 Where manifest data needs to be injected -- NON-BLOCKING (but needs design detail)

The current flow:

1. `buildImportAliasMap(sourceFile)` scans imports from `@vertz/ui` only (line 362-381).
2. For each import, it checks `isSignalApi(originalName)` and `isReactiveSourceApi(originalName)` against the hardcoded registry.
3. These aliases drive `signalApiVars` and `reactiveSourceVars` population in the analysis loop.

For manifests to work, `buildImportAliasMap` needs to:

- Accept a `Map<filePath, ReactivityManifest>` parameter.
- For imports from ANY module (not just `@vertz/ui`), resolve the module specifier to a file path, look up the manifest, and check if the imported name has a `signal-api` or `reactive-source` reactivity shape.
- Return the same `signalApiAliases` and `reactiveSourceAliases` structures, but populated from manifests instead of (or in addition to) the hardcoded registry.

The design doc says manifests replace the `SIGNAL_API_REGISTRY`, but the integration point is actually `buildImportAliasMap`, not the registry itself. The registry could remain as a fallback (framework manifest not found), but the primary path should be manifest-based.

**Missing detail:** The design does not show what happens to `getSignalApiConfig()` calls. Today, when a signal API var is detected, its config (signalProperties, plainProperties, fieldSignalProperties) comes from `getSignalApiConfig(originalName)`. With manifests, this config comes from the manifest's `ExportReactivityInfo.reactivity` field. But the manifest schema only has `signalProperties: string[]` and `plainProperties: string[]` -- it does NOT have `fieldSignalProperties`. This means `form()` field-level auto-unwrapping (`taskForm.title.error.value`) cannot be expressed in the manifest schema.

**Recommendation:** Add `fieldSignalProperties?: string[]` to the manifest's `signal-api` shape, or document that field-level properties are framework-only and not supported in user manifests.

### 2.2 SignalApiConfig uses `Set<string>`, manifest uses `string[]` -- NON-BLOCKING

The internal `SignalApiConfig` type uses `Set<string>` for O(1) lookup. The manifest schema uses `string[]` (JSON-serializable). The design must specify the conversion point -- when loading a manifest, convert `string[]` to `Set<string>` before passing to the analyzer. The `VariableInfo` type already has a comment warning about this (types.ts line 64-66).

### 2.3 Manifest-sourced signal APIs and the SignalTransformer -- QUESTION

The `SignalTransformer` at line 24-36 builds `signalApiVars`, `plainPropVars`, and `fieldSignalPropVars` from the `VariableInfo[]` array. It does NOT know or care where the signal API classification came from -- it just reads the `signalProperties`, `plainProperties`, and `fieldSignalProperties` fields on `VariableInfo`.

This means: as long as the `ReactivityAnalyzer` populates these fields correctly (from manifests instead of the hardcoded registry), the `SignalTransformer` should work unchanged. This is good -- the integration surface is limited to the analyzer.

But confirm: does the `ComputedTransformer` also just read from `VariableInfo`? Yes -- it reads `v.kind === 'computed'` and `v.destructuredFrom` (line 17, 27). So it also works unchanged.

**The integration is clean.** The manifest data flows: manifest -> `buildImportAliasMap` -> `signalApiVars`/`reactiveSourceVars` population in analyzer loop -> `VariableInfo[]` output -> transformers consume `VariableInfo[]`. Only `buildImportAliasMap` and the analyzer loop need changes.

---

## 3. Parser Mismatch Risk

### 3.1 Two parsers, one truth -- NON-BLOCKING

The design proposes:

- **Manifest generation:** `ts.createSourceFile()` (raw TypeScript compiler API, no ts-morph).
- **Component compilation:** ts-morph `Project` + `SourceFile` (wraps the TypeScript compiler API).

ts-morph is a wrapper around the TypeScript compiler API. `ts.createSourceFile()` is the same parser that ts-morph uses internally. The AST node kinds (`SyntaxKind.ArrowFunction`, etc.) are identical. There is no risk of AST representation mismatch.

However, there is a **maintenance burden**: developers working on manifest generation write raw TypeScript AST traversal code (`node.forEachChild`, `ts.isXxx()` type guards), while developers working on the analyzer write ts-morph code (`node.getChildrenOfKind()`, `node.isKind()`). These are different APIs for the same operations. If a pattern needs to be recognized in both places (e.g., detecting a `query()` call), the logic is written twice in different styles.

**Recommendation:** Consider whether the manifest generator could use ts-morph with `useInMemoryFileSystem: true` and no `Program`. The POC showed ts-morph was 10x slower (~700ms vs ~78ms), but that was likely because the POC created a `Program` (type checker). A ts-morph `Project` with `skipFileDependencyResolution: true` and `skipAddingFilesFromTsConfig: true` would be much closer to raw `ts.createSourceFile()` performance. Worth a quick benchmark before committing to two codebases.

If the raw API is chosen, document a clear mapping between ts-morph patterns and raw TS patterns so that changes to one can be mirrored in the other.

---

## 4. HMR Interaction

### 4.1 Bun plugin processes files one at a time -- BLOCKING

The Bun plugin's `onLoad` hook (plugin.ts line 60) processes files individually and synchronously within each load. The design proposes a "Phase 1" pre-pass that generates manifests for ALL files before any component compilation.

But the Bun plugin has no "pre-pass" hook. `build.onLoad` is called lazily -- Bun resolves imports and calls `onLoad` for each file as it encounters them during bundling. There is no `build.onStart` or `build.onBefore` hook that runs before all loads.

The design says "The Bun plugin gains a `manifests` option" (section 3.3), implying manifests are computed externally and passed in. But the plugin is created once at server startup (plugin.ts line 40-57), and `onLoad` is called per-file. Who computes the manifests, and when?

**Options the design does not address:**

1. **Compute manifests before plugin registration.** The `createVertzBunPlugin()` function could accept pre-computed manifests. But this means scanning all files at server startup, before Bun's bundler runs. The manifest map would need to be mutable so that HMR updates can modify it.

2. **Compute manifests inside `onLoad` lazily.** On the first `onLoad` call, scan all files and build manifests. Cache them. On subsequent calls (HMR), only rebuild the changed file's manifest. This works but the first `onLoad` blocks for ~78ms while manifests are generated. Since Bun calls `onLoad` per-file sequentially, this adds 78ms to the initial build.

3. **Compute manifests at server startup, before `Bun.serve()`.** The `createBunDevServer()` function could run manifest generation before registering the plugin. But the `createVertzBunPlugin` is created separately and passed to the dev server -- the coupling is not there today.

**Recommendation:** The design must specify the exact integration point. My suggestion: compute manifests in `createVertzBunPlugin()` at construction time (synchronously or via an async init). Store them as a closure-scoped `Map<string, ReactivityManifest>` accessible to `onLoad`. For HMR, the file watcher callback regenerates the changed file's manifest and updates the map before Bun re-evaluates the module.

### 4.2 HMR manifest invalidation cascading -- QUESTION

The design says (section 2.2.6): "If the manifest changed (export shapes differ), recompile dependents."

How? When a file changes:

1. The file watcher fires.
2. The changed file's manifest is regenerated.
3. If it changed, all files that import from the changed file need recompilation.

But Bun's HMR system controls which files are re-evaluated. The Vertz plugin cannot force Bun to re-evaluate a dependent file. Bun uses `import.meta.hot.accept()` (self-accepting modules) -- each module handles its own update. There is no mechanism for "file A changed, so force re-evaluate file B."

This means manifest-dependent recompilation only works on the next full page refresh, not during HMR. Is this acceptable? In practice, changing the reactivity shape of an export is rare (you'd have to add/remove a `query()` call from a hook's return value), so this may be fine. But the design should state this limitation explicitly rather than claiming HMR cascade works.

### 4.3 Fast Refresh interaction -- NON-BLOCKING

Fast Refresh (plugin.ts line 132-143) detects components and injects wrappers. It uses `componentAnalyzer.analyze(hydrationSourceFile)` -- the pre-hydration source file. Manifests do not affect component detection, only reactivity classification. Fast Refresh should be unaffected.

### 4.4 Context stable IDs -- NON-BLOCKING

Context stable IDs (plugin.ts line 82-85) inject `__stableId` strings into `createContext()` calls. This is independent of reactivity analysis. No interaction with manifests.

---

## 5. Import Resolution

### 5.1 Relative import resolution -- QUESTION

The design says "follow re-export chains" but does not specify how relative imports are resolved to absolute file paths.

Given: `import { useTasks } from '../hooks/use-tasks'`

The compiler needs to:

1. Resolve `../hooks/use-tasks` relative to the current file's directory.
2. Try extensions: `.ts`, `.tsx`, `.js`, `.jsx`.
3. Try index files: `../hooks/use-tasks/index.ts`, etc.

This is standard Node/Bun resolution. But who does it? Options:

- **`path.resolve()` + manual extension probing.** Simple but fragile -- misses `tsconfig.json` paths, package.json `exports`, etc.
- **`Bun.resolve()` or `import.meta.resolve()`.** Uses Bun's native resolver. Accurate but requires a Bun runtime context -- won't work in tests that use Node.
- **TypeScript's `ts.resolveModuleName()`.** Requires a `CompilerHost`, which the design explicitly avoids (no `Program`).
- **A custom lightweight resolver.** More work but fully portable.

**Recommendation:** Specify the resolver. For the POC, `path.resolve()` + extension probing is sufficient. For production, consider Bun's resolver for the plugin path and a portable resolver for tests.

### 5.2 TypeScript path aliases -- NON-BLOCKING

If `tsconfig.json` has:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

Then `import { useTasks } from '@/hooks/use-tasks'` needs to be resolved to `src/hooks/use-tasks.ts`. The manifest resolver must read `tsconfig.json` paths. This is not mentioned in the design.

**Recommendation:** Document tsconfig paths support as a requirement. The resolver needs to read `tsconfig.json` once at startup and apply path mappings during resolution.

### 5.3 Package imports (`@vertz/ui`) -- NON-BLOCKING

The design handles this correctly: `@vertz/ui` gets a pre-built framework manifest. No resolution needed -- it is looked up by package name directly. Third-party packages either ship `.reactivity.json` or default to `unknown`.

### 5.4 Dynamic imports -- NON-BLOCKING

```tsx
const module = await import('../hooks/use-tasks');
const tasks = module.useTasks();
```

Dynamic imports are rare in components and the design's non-goal of "full program analysis" covers this. The manifest system would not track dynamic imports -- they default to `unknown`. This is fine.

---

## 6. Signal Transformer Impact

### 6.1 `.value` insertion for manifest-sourced signal APIs -- analysis

Today's flow for a signal API var:

1. ReactivityAnalyzer detects `const tasks = query(...)` and populates `signalApiVars.set('tasks', config)`.
2. The `VariableInfo` for `tasks` gets `signalProperties`, `plainProperties`, `fieldSignalProperties`.
3. `SignalTransformer.transformSignalApiProperties()` walks the AST, finds `tasks.data`, sees `data` is in `signalProperties`, appends `.value`.

With manifests, step 1 changes: the analyzer detects `const tasks = useTasks()`, looks up `useTasks` in the manifest for `../hooks/use-tasks.ts`, finds it returns `signal-api` with known properties, and populates `signalApiVars.set('tasks', config)`.

Steps 2 and 3 are unchanged. The `SignalTransformer` does not care where the config came from.

**This integration is clean.** No changes needed in the signal transformer.

### 6.2 Manifest-sourced `reactive-source` APIs -- NON-BLOCKING

Same pattern: if a manifest says `useSettings` returns `reactive-source`, the analyzer adds the variable to `reactiveSourceVars`. The JSX analyzer then treats property accesses on it as reactive. No transformer changes needed.

---

## 7. Performance

### 7.1 Total overhead -- QUESTION

The POC shows 78ms for manifest generation (203 files). But the total overhead includes:

| Step | Estimated Time | Notes |
|------|---------------|-------|
| File scanning (glob) | ~5-10ms | `Bun.glob` or `fs.readdirSync` recursive |
| Manifest generation | ~78ms | POC-validated |
| Import graph construction | ??? | Not benchmarked -- requires parsing import statements from all 203 files |
| Reactivity propagation | ??? | Not benchmarked -- topological sort + propagation through the graph |
| Manifest lookup per `onLoad` | ~0.01ms | Map lookup, negligible |

The import graph construction could be significant. For 203 files, each with ~5-10 imports, that is 1000-2000 edges to resolve. If each resolution requires file system probing (checking `.ts`, `.tsx`, `/index.ts` existence), that is 3000-6000 `fs.existsSync` calls. Bun's FS is fast, but this could add 20-50ms.

**Recommendation:** Benchmark the full pipeline (scan + manifest + import graph + propagation), not just manifest generation in isolation. The 100ms budget is for the total pre-pass, not just the parsing step.

### 7.2 Memory overhead -- NON-BLOCKING

Storing a `ReactivityManifest` per file in memory. For 203 files with ~3-5 exports each, this is ~800 entries. Each entry is a small object. Total memory: negligible (< 1MB). Not a concern.

---

## 8. Test Strategy

### 8.1 Cross-file test infrastructure -- NON-BLOCKING (but needs planning)

The existing test pattern (reactivity-analyzer.test.ts) creates a single in-memory `SourceFile` and analyzes it. For cross-file tests, we need:

1. Create multiple in-memory files (hook file + component file).
2. Generate the manifest for the hook file.
3. Pass the manifest to the analyzer when analyzing the component file.

The `ReactivityAnalyzer.analyze()` method currently takes `(sourceFile, component)`. It needs a new parameter: `manifests: Map<string, ReactivityManifest>`. Similarly, `compile()` needs a `manifests` option in `CompileOptions`.

**Proposed test structure:**

```typescript
function analyzeWithManifest(
  files: Record<string, string>,  // path -> source
  targetFile: string,             // which file to analyze
) {
  // 1. Generate manifests for all files
  const manifests = new Map<string, ReactivityManifest>();
  for (const [path, source] of Object.entries(files)) {
    manifests.set(path, generateManifest(source, path));
  }

  // 2. Analyze the target file with manifests
  const project = new Project({ ... });
  const sf = project.createSourceFile(targetFile, files[targetFile]);
  const components = new ComponentAnalyzer().analyze(sf);
  const analyzer = new ReactivityAnalyzer();
  return components.map(c => ({
    component: c.name,
    variables: analyzer.analyze(sf, c, manifests),
  }));
}
```

**Recommendation:** Design the test helper API before implementing. The helper should handle import resolution between the in-memory files (e.g., `'../hooks/use-tasks'` from `'src/pages/task-list.tsx'` resolves to `'src/hooks/use-tasks.ts'`).

### 8.2 E2E tests in section 7 -- NON-BLOCKING

The E2E tests in section 7.2 are pseudo-tests -- they show the expected behavior but not the actual assertions. This is fine for a design doc, but the implementation must produce real assertions. In particular:

- The manifest generation test should assert on the manifest structure (not just that compilation succeeds).
- The auto-unwrap test should assert on specific `.value` insertions in the compiled output.
- The barrel file test should assert that the manifest is correctly inherited through re-export chains.

---

## Summary

### BLOCKING Issues (must resolve before approval)

1. **Section 1.4 -- Existing test contradicts the proposed rule.** The test "classifies nested closure reading signal property as computed" explicitly expects arrow functions to be classified as `computed`. The design must acknowledge this test will change and explain why the new behavior is correct.

2. **Section 4.1 -- No Bun plugin pre-pass hook.** The design does not specify HOW manifests are computed before `onLoad` runs. The Bun plugin has no "before all" hook. The design must specify the integration point -- either at plugin construction time, lazily on first `onLoad`, or externally before plugin creation.

3. **Section 2.1 -- `fieldSignalProperties` missing from manifest schema.** The `ReactivityManifest` schema has `signalProperties` and `plainProperties` but NOT `fieldSignalProperties`. This means `form()` field-level auto-unwrapping (`taskForm.title.error.value`) cannot be expressed through manifests. Either add it to the schema or document it as a framework-only feature.

### NON-BLOCKING Issues (should be addressed)

1. Section 1.1 -- IIFE wording imprecision. The prose should clarify it checks the initializer node kind, not whether an arrow function exists anywhere in the subtree.
2. Section 1.3 -- Function expressions as comparators. Document as a known limitation.
3. Section 1.5 -- `collectDeps` does unnecessary work for function definitions. Consider an optimization.
4. Section 2.2 -- `Set<string>` vs `string[]` conversion point needs specification.
5. Section 3.1 -- Two parser codebases create maintenance burden. Consider ts-morph without `Program`.
6. Section 5.2 -- tsconfig path aliases not mentioned.
7. Section 8.1 -- Cross-file test helper API needs design.

### QUESTIONS (need clarification)

1. **Section 2.3:** Confirm that `ComputedTransformer` and `SignalTransformer` need zero changes -- they only consume `VariableInfo[]`.
2. **Section 4.2:** When a file's manifest shape changes during HMR, can the plugin force Bun to recompile dependent files? Or does this only work on full page refresh?
3. **Section 5.1:** What resolver will be used for relative imports? `path.resolve()` + extension probing, Bun's native resolver, or a custom resolver?
4. **Section 7.1:** What is the total overhead including import graph construction and reactivity propagation, not just AST parsing?
5. **Section 1.4:** Is the intent to change the existing test expectation from `'computed'` to `'static'` for arrow functions that capture signal API properties? If so, what is the correct compiled output for `{fn}` in JSX where `fn` is an arrow reading `tasks.loading`?
