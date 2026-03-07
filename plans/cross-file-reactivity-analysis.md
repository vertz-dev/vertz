# Cross-File Reactivity Analysis

**Status:** Approved (CTO approved 2026-03-07)
**Date:** 2026-03-07
**Author:** mike (tech-lead), with CTO input
**Branch:** `plan/cross-file-reactivity`
**Reviews:** josh (DX), pm (scope), ben (technical feasibility) -- all received 2026-03-07

---

## 1. Problem Statement

The UI compiler processes each `.tsx` file independently via the Bun plugin's `onLoad` hook. The `ReactivityAnalyzer` performs a two-pass taint analysis within a single file to classify variables as `signal`, `computed`, or `static`. This single-file boundary creates three categories of failures:

### 1.1 Callback vs Thunk Ambiguity

The analyzer collects all identifier references from a `const` initializer via `collectDeps()`. It walks recursively into arrow functions and function expressions, finding signal references inside them. This causes **callbacks that capture signals to be incorrectly wrapped in `computed()`**:

```tsx
// User writes:
let count = 0;
const handleClick = () => { count++; };

// Compiler produces (WRONG):
const count = signal(0);
const handleClick = computed(() => () => { count.value++; });
// handleClick.value is now a function-returning-function
```

The problem is nuanced. Some arrow functions ARE thunks whose return values are reactive:

```tsx
let filter = 'all';
const getFiltered = () => items.filter(i => i.status === filter);
// {getFiltered()} in JSX -- the invocation result depends on `filter`
```

But this thunk should NOT be wrapped in `computed()` either. The function definition is static -- it's the **call site** that needs reactive tracking. PR #926 already solved this for JSX: all non-literal expressions get reactive wrappers (`__child(() => expr)` for children, `__attr(() => expr)` for attributes), and the runtime (`domEffect`) tracks actual signal reads during execution. So `{getFiltered()}` works correctly regardless of whether `getFiltered` is classified as computed or static.

**The fix:** Arrow functions and function expressions should **never** be wrapped in `computed()`. The signal transformer still inserts `.value` inside the function body. The JSX transformer already handles call-site reactivity via the literal/non-literal strategy.

### 1.2 Hardcoded Signal API Registry

The `SIGNAL_API_REGISTRY` in `signal-api-registry.ts` is a static map of three APIs:

```typescript
{
  query:        { signalProperties: ['data', 'loading', 'error', 'revalidating'], ... },
  form:         { signalProperties: ['submitting', 'dirty', 'valid'], ... },
  createLoader: { signalProperties: ['data', 'loading', 'error'], ... },
}
```

Every new framework API that returns signal properties requires a manual registry update. User-defined APIs that return signal-bearing objects have no way to participate. This has already caused bugs:

- **PR #909:** Signal API vars wrapped in `computed()` because the registry interaction with closures was wrong
- **PR #920:** Signal API vars passed as bare arguments not recognized as reactive

### 1.3 Cross-File Blindness

When a component imports a function from another file, the compiler has zero knowledge of whether:

- The function returns reactive values
- The function expects reactive arguments
- An imported variable is a signal or a plain value
- A component's props are reactive at the call site

Today this is partially mitigated by PR #926's literal/non-literal JSX strategy -- the runtime tracks actual signal reads. But the compiler still needs cross-file knowledge for:

1. **Signal property auto-unwrapping** -- `importedQuery.data` should become `importedQuery.data.value`, but only if the compiler knows `importedQuery` came from `query()`
2. **Computed classification** -- `const x = importedHelper()` is classified as static because the compiler doesn't know the helper returns reactive values
3. **Diagnostics** -- the compiler can't warn about misuse of reactive APIs from other files

**Evidence:** This problem is forward-looking -- no external user bug reports exist (no external users yet). The primary use cases are utility functions that compose reactive values (e.g., a `transitionList` helper, a `queryMatch` pattern) and re-exported framework APIs through barrel files. Pre-v1 is the right time to fix compiler fundamentals.

**Important architectural note:** Wrapping `query()` or `form()` in custom hooks is **discouraged** in Vertz. The generated SDK is the right abstraction for data fetching — it handles typing, filters, and all the verbose parts. `query()` is a primitive meant to be used directly inside components. Wrapping it in a hook like `useTasks()` creates problems:

1. **Duplicate requests** — if two components on the same page use the same hook, they may trigger separate requests. `query()` deduplicates by key, but adding a hook layer obscures this and creates confusion about the abstraction boundary.
2. **Wrong abstraction level** — the SDK already abstracts the request; the hook adds a redundant layer.

The cross-file manifest system still supports this pattern if someone does it (correctness is preserved), but it is not the recommended architecture and should not be the primary motivation for Layer 2.

**Future consideration:** We may enforce that `query()` and `form()` are only valid inside component functions — not in standalone hook files. This is not committed yet; we want to explore more use cases before locking in that rule. But the direction is toward keeping these primitives at the component level.

---

## 2. Proposed Solution

A two-layer approach. **Layer 1 and Layer 2 are independent deliverables** -- Layer 1 can and should ship immediately without waiting for Layer 2.

1. **Layer 1 (single-file fix):** Fix the callback/thunk classification bug by never wrapping function definitions in `computed()`. This is a targeted fix to the `ReactivityAnalyzer` with no architectural changes.

2. **Layer 2 (cross-file analysis):** Introduce a **Reactivity Manifest** -- a per-file metadata artifact that describes the reactivity shape of each export. Layer 2 is broken into independent sub-phases (see Section 2.3).

### 2.1 Layer 1: Never Wrap Function Definitions in computed()

**Rule:** When a `const` declaration's **initializer AST node** is an `ArrowFunction` or `FunctionExpression`, classify it as `static` -- never `computed`. This checks the top-level node kind of the initializer, not whether an arrow function appears anywhere in the initializer's subtree. IIFEs (where the initializer is a `CallExpression` wrapping an arrow) are NOT affected -- they continue through the normal classification path.

**Why this is safe:**

- The signal transformer still inserts `.value` reads inside the function body
- JSX call sites (`{fn()}`) are handled by the literal/non-literal strategy (PR #926) -- the runtime tracks signal reads during execution. This applies to both **JSX children** (`__child(() => expr)`) and **JSX attributes** (`__attr(() => expr)`). Confirmed by existing tests: `signal-unwrap.test.ts` line 181 (`__attr` for signal property in attribute), `integration.test.ts` line 135 (`__attr` for attributes), line 238 (`__attr` for reactive source in attribute).
- Event handlers (`onClick={fn}`) don't need computed wrapping -- they're imperative callbacks
- Thunks used as JSX children (`{fn()}`) get reactive wrappers from the JSX transformer

**Behavioral change acknowledgment:** This is a bugfix, but it changes compiler output. Code that adapted to the buggy behavior may need updating:

```tsx
// Before: fn is classified as computed (BUG)
const tasks = query('/api/tasks');
const fn = () => { if (tasks.loading) return; tasks.refetch(); };
// Compiled to: const fn = computed(() => () => { ... })
// If code used fn.value(), that will break

// After: fn is classified as static (CORRECT)
// Compiled to: const fn = () => { if (tasks.loading.value) return; tasks.refetch(); }
// fn is a plain function -- no .value needed to call it
```

**Blast radius:** All packages are pre-v1 with no external users. The breaking changes policy explicitly encourages fixing these. The existing test at `reactivity-analyzer.test.ts` line 392-402 (`'classifies nested closure reading signal property as computed'`) expects the buggy behavior and will be changed to expect `'static'`. The current test expectation is incorrect -- wrapping an arrow function in `computed()` produces `computed(() => () => { ... })`, which is the exact bug this design fixes. The correct compiled output for `{fn}` in JSX (where `fn` is an arrow reading `tasks.loading`) is: `fn` is a static function reference; the JSX transformer wraps it in `__child(() => fn)` for runtime tracking.

**Known limitation (pre-existing):** Function expressions used as sort comparators that capture signals will not be reactively re-evaluated:

```tsx
let sortOrder = 'asc';
const comparator = (a, b) => sortOrder === 'asc' ? a.id - b.id : b.id - a.id;
const sorted = items.sort(comparator); // NOT reactively re-evaluated when sortOrder changes
```

This is a pre-existing bug (the old behavior also produced incorrect output for this pattern). The correct pattern is to use a value expression: `const sorted = sortOrder === 'asc' ? [...items].sort(...) : [...items].sort(...)`.

**What this changes in the analyzer:**

```typescript
// In ReactivityAnalyzer, when building the computeds set:
// Before:
const dependsOnReactive = info.deps.some((dep) => { ... });
if (dependsOnReactive) {
  computeds.add(name);
}

// After: skip if the initializer's top-level AST node is a function definition
if (dependsOnReactive && !isFunctionDefinition(name, consts)) {
  computeds.add(name);
}
```

The `isFunctionDefinition` check inspects the AST node kind of the initializer (not the subtree). We need to store this information during Pass 1 when collecting declarations.

**Optimization:** Check `isFunctionDefinition` before calling `collectDeps` to avoid unnecessary AST traversal into function bodies that will be skipped anyway.

#### Reactivity classification rules after Layer 1

| Pattern | Classification | Reactive? | Why |
|---------|---------------|-----------|-----|
| `const x = count * 2` | `computed` | Yes — re-evaluates when `count` changes | Value expression depending on signal |
| `const x = tasks.loading ? 'yes' : 'no'` | `computed` | Yes | Value expression depending on signal property |
| `const fn = () => { count++ }` | `static` | Function body has `.value` inserted; call sites tracked by runtime | Function definition — never computed |
| `const fn = () => count > 5 ? 'high' : 'low'` | `static` | Yes, when called in JSX: `{fn()}` → `__child(() => fn())` | Function definition; JSX runtime tracks reads at call site |
| `const fn = function() { ... }` | `static` | Same as arrow functions | Function expression — never computed |
| `const result = (() => count * 2)()` | `computed` | Yes | IIFE — initializer is `CallExpression`, not `ArrowFunction` |
| `<div style={fn()}>{fn()}</div>` | N/A | Yes — both attributes and children get reactive wrappers | JSX transformer wraps non-literal expressions in `__attr`/`__child` |

**What does NOT work — eager API calls outside JSX:**

```tsx
// DOES NOT WORK — .sort() runs once, not reactively
let sortOrder = 'asc';
const comparator = (a, b) => sortOrder === 'asc' ? a.id - b.id : b.id - a.id;
const sorted = items.sort(comparator);  // eager call, runs at init, never re-runs

// WORKS — value expression re-evaluates when sortOrder changes
const sorted = sortOrder === 'asc'
  ? [...items].sort((a, b) => a.id - b.id)
  : [...items].sort((a, b) => b.id - a.id);
```

**The rule:** Reactivity flows through **value expressions** and **JSX call sites**. It does NOT flow through imperative function passing to eager APIs (`.sort()`, `.filter()`, `.forEach()`, `setTimeout()`, etc.) — those run once at the point they're called. If the result needs to update reactively, the entire expression must be a value expression (not a function passed to an eager API).

**The rule:** For a `const` to be reactive, the signal must appear directly in the expression itself — not inside a function the expression happens to call. This is consistent with how `let`/`const` already work everywhere in Vertz:

- `let` → reactive through reassignment
- `const` value expression → reactive because the expression directly references a signal
- `const` function → stable reference; signals inside the body are read when called, not when defined

**IIFE test case** for Section 7.1:

```tsx
let count = 0;
const result = (() => count * 2)(); // IIFE -- initializer is CallExpression, not ArrowFunction
// result should be classified as computed (value depends on signal)
```

### 2.2 Layer 2: Reactivity Manifest

A **Reactivity Manifest** is a per-file JSON metadata object that describes the reactivity shape of each export. It is computed once per file and consumed by other files during compilation.

#### 2.2.1 Manifest Schema

```typescript
interface ReactivityManifest {
  /** Schema version for forward compatibility */
  version: 1;

  /** The source file path (resolved, absolute) */
  filePath: string;

  /** Exports and their reactivity shapes */
  exports: Record<string, ExportReactivityInfo>;
}

interface ExportReactivityInfo {
  /** What kind of export this is */
  kind: 'function' | 'variable' | 'component' | 'class';

  /**
   * For functions: describes the return value's reactivity shape.
   * For variables: describes the variable's reactivity shape.
   */
  reactivity: ReactivityShape;

  /**
   * For components: which props are reactive (signal-backed).
   * Only present when kind === 'component'.
   * DEFERRED -- not abandoned. The manifest schema is forward-compatible.
   * Will be implemented when compile-time prop reactivity is needed
   * (diagnostics, optimizations, or VertzQL field tracking through components).
   */
  reactiveProps?: string[];
}

type ReactivityShape =
  | { type: 'static' }
  | { type: 'signal' }
  | { type: 'signal-api'; signalProperties: string[]; plainProperties: string[]; fieldSignalProperties?: string[] }
  | { type: 'reactive-source' }  // All properties reactive (like useContext)
  | { type: 'unknown' };         // Can't determine -- treat as potentially reactive
```

**Note on `fieldSignalProperties`:** Added to support `form()` field-level auto-unwrapping (e.g., `taskForm.title.error.value`). When present, it indicates that named field access on the result produces objects with their own signal properties (`value`, `error`, `dirty`, etc.). The existing `SignalApiConfig` already supports this via `fieldSignalProperties: Set<string>` -- the manifest exposes it as `string[]` (JSON-serializable) with conversion to `Set<string>` at manifest load time.

**Schema versioning:** The `version` field allows forward compatibility. When loading a manifest with an unknown version, the compiler falls back to treating all exports as `unknown` with a warning: `[vertz:reactivity] Manifest version ${v} not supported (expected 1). Exports treated as unknown.`

#### 2.2.2 How Manifests Are Built

The manifest for a file is generated by analyzing its exports:

1. **Framework APIs** (`@vertz/ui` exports): Manifests are pre-defined -- `query` returns `signal-api` with known properties, `useContext` returns `reactive-source`, etc. These replace the hardcoded `SIGNAL_API_REGISTRY`.

2. **User files**: The compiler analyzes each file's exports:
   - A function that calls `query()` and returns the result -> its return is `signal-api`
   - A function that returns a plain value -> its return is `static`
   - A component function (returns JSX) -> `kind: 'component'`
   - A re-export -> follow the chain to the original
   - **Conditional returns:** If a function has multiple return paths with different reactivity shapes (e.g., sometimes returns `query()`, sometimes returns a plain object), the classifier uses the most reactive shape. This is the safe/conservative choice -- false positives are handled by runtime tracking.

3. **Third-party packages**: Default to `unknown` (treat as potentially reactive). Third-party `.reactivity.json` convention is **explicitly deferred** -- there are zero third-party package authors today. This will be designed when the first external package author asks for it. Defining a convention now would create a backward-compatibility commitment on a contract never tested with real users.

#### 2.2.3 How Manifests Are Consumed

When compiling a component file, the `ReactivityAnalyzer` consults the manifests of imported modules:

```tsx
// file: src/pages/task-list.tsx
import { fetchTasks } from '../api/tasks';  // manifest says: returns { type: 'static' }
import { query } from '@vertz/ui';           // manifest says: returns signal-api

const tasks = query(() => fetchTasks());
// Compiler knows: `tasks` is signal-api with { data, loading, error, ... }
// No hardcoded registry needed -- it comes from @vertz/ui's manifest
```

For user-defined wrappers:

```tsx
// file: src/hooks/use-tasks.ts
import { query } from '@vertz/ui';

export function useTasks() {
  return query(() => fetchTasks(), { key: 'tasks' });
}
// Manifest: useTasks returns signal-api (because query() returns signal-api)
```

```tsx
// file: src/pages/task-list.tsx
import { useTasks } from '../hooks/use-tasks';

const tasks = useTasks();
// Compiler knows: tasks is signal-api -- from the manifest of use-tasks.ts
// Auto-unwrapping works: tasks.data -> tasks.data.value
```

**Integration point with ReactivityAnalyzer:** The manifest data flows through `buildImportAliasMap`. Today this function only scans imports from `@vertz/ui` against the hardcoded registry. With manifests, it accepts a `Map<filePath, ReactivityManifest>` and resolves any import's reactivity shape. The output is the same `signalApiAliases` and `reactiveSourceAliases` structures that feed into `VariableInfo[]`. The `SignalTransformer` and `ComputedTransformer` consume `VariableInfo[]` unchanged -- they don't know or care where the classification came from. The integration surface is limited to the analyzer.

#### 2.2.4 Build Pipeline Integration

The manifest system integrates into the compilation pipeline as a pre-pass. **Manifests are computed at plugin construction time**, before any `onLoad` call:

```typescript
// In createVertzBunPlugin():
function createVertzBunPlugin(options: VertzPluginOptions): BunPlugin {
  // 1. Scan all .ts/.tsx files in src/
  // 2. Generate manifests for all files
  // 3. Build import graph, propagate reactivity
  // 4. Store as closure-scoped Map<string, ReactivityManifest>
  const manifests = generateAllManifests(options.srcDir);

  return {
    name: 'vertz',
    setup(build) {
      build.onLoad({ filter: /\.tsx$/ }, (args) => {
        // manifests is available via closure
        const result = compile(source, { manifests, ... });
        return { contents: result.code };
      });
    },
  };
}
```

This approach works because `createVertzBunPlugin()` runs synchronously before `Bun.serve()` starts, and `build.onLoad` callbacks are called lazily during bundling. The manifest map is mutable so HMR updates can modify it.

**Import resolution strategy:** For the initial implementation, use `path.resolve()` + extension probing (`.ts`, `.tsx`, `/index.ts`, `/index.tsx`) for relative imports, plus tsconfig `paths` mapping loaded once at startup. This is sufficient for Vertz projects. For tests, the same resolver works with in-memory file maps. Package imports (`@vertz/ui`, etc.) are looked up by name directly against pre-built manifests.

```
Phase 1: Manifest Generation (at plugin construction, ~100ms budget)
  |-- Scan all .ts/.tsx files in src/
  |-- For each file: extract exports, analyze return types/shapes
  |-- Build import graph (which file imports what)
  |-- Propagate reactivity through the import graph
  +-- Output: Map<filePath, ReactivityManifest>

Phase 2: Component Compilation (per file, existing pipeline)
  |-- ReactivityAnalyzer now receives manifests for imported modules
  |-- No more hardcoded SIGNAL_API_REGISTRY
  |-- Cross-file signal property auto-unwrapping works
  +-- Diagnostics can reference cross-file information
```

**Performance (validated by POC):** Phase 1 uses `ts.createSourceFile()` (raw TypeScript API, no `Program` or type checker) for AST analysis. Benchmarked at **~78ms for 203 files** -- the per-file analysis itself is ~225us; the cost is parser initialization. Import graph construction and reactivity propagation are not yet benchmarked but estimated at 20-50ms (1000-2000 edges, filesystem probing). **Total pre-pass budget: 150ms for a 200-file project.** No new dependencies required.

#### 2.2.5 Manifest for @vertz/ui (Framework Manifest)

The `@vertz/ui` package ships a pre-built manifest that replaces the hardcoded registry:

```json
{
  "version": 1,
  "filePath": "@vertz/ui",
  "exports": {
    "query": {
      "kind": "function",
      "reactivity": {
        "type": "signal-api",
        "signalProperties": ["data", "loading", "error", "revalidating"],
        "plainProperties": ["refetch", "revalidate", "dispose"]
      }
    },
    "form": {
      "kind": "function",
      "reactivity": {
        "type": "signal-api",
        "signalProperties": ["submitting", "dirty", "valid"],
        "plainProperties": ["action", "method", "onSubmit", "reset", "setFieldError", "submit"],
        "fieldSignalProperties": ["value", "error", "dirty", "touched"]
      }
    },
    "createLoader": {
      "kind": "function",
      "reactivity": {
        "type": "signal-api",
        "signalProperties": ["data", "loading", "error"],
        "plainProperties": ["refetch"]
      }
    },
    "useContext": {
      "kind": "function",
      "reactivity": { "type": "reactive-source" }
    },
    "signal": {
      "kind": "function",
      "reactivity": { "type": "signal" }
    }
  }
}
```

This manifest can be:
- Generated from the signal API registry during the `@vertz/ui` build
- Or hand-maintained alongside the registry (single source of truth)
- Or generated from JSDoc/TSDoc annotations on the source functions

**Framework manifest staleness during `@vertz/ui` development:** When working on `@vertz/ui` itself and simultaneously using it in an example app, the manifest could be stale. The framework manifest is regenerated as a build step (`bun run build` in `@vertz/ui`). During development, the existing registry serves as the source of truth; the manifest is a build artifact derived from it.

#### 2.2.6 Incremental Updates (HMR)

In dev mode (HMR), when a file changes:

1. The file watcher fires and triggers manifest regeneration for the changed file
2. The manifest map is updated in place (mutable closure)
3. Bun re-evaluates the changed module via `onLoad`, which uses the updated manifest

**Limitation:** If a file's manifest shape changes (e.g., a hook starts returning `query()` where it previously returned a plain value), files that import from it are NOT automatically recompiled during HMR. Bun's HMR system uses `import.meta.hot.accept()` for self-accepting modules -- there is no mechanism to force Bun to re-evaluate a dependent file. The dependent files will get the updated manifest on the next full page refresh. In practice, changing the reactivity shape of an export is rare (you'd have to add/remove a `query()` call from a hook's return value). This limitation is acceptable for the initial implementation.

### 2.3 Layer 2 Sub-Phases

Layer 2 is broken into independent sub-phases, each delivering value on its own:

| Sub-Phase | Description | Effort | Deliverable |
|-----------|-------------|--------|-------------|
| **2a** | Replace hardcoded `SIGNAL_API_REGISTRY` with framework manifest (`@vertz/ui/reactivity.json`) | 2-3 days | Eliminates registry, establishes manifest contract. No cross-file analysis -- just loading a JSON file instead of a hardcoded map. |
| **2b** | Manifest generation for user files (pre-pass, AST analysis, import resolver) | 5-8 days | Full cross-file reactivity. Custom hooks get correct auto-unwrapping. |
| **2c** | Incremental HMR manifest updates | 2-3 days | Optimization for dev experience. Should not block initial implementation. |
| **2d** | Third-party package convention (`.reactivity.json`) | Deferred | Zero current users. Design when the first external package author asks. **Rejected from this design scope entirely.** |

**Independent deliverability:** Each sub-phase can ship and provide value independently. Layer 2a is a small refactor. Layer 2b is the large piece. Layer 2c is an optimization. Layer 2d is rejected from scope.

---

## 3. Success Metrics

| # | Metric | Target | How We Measure |
|---|--------|--------|----------------|
| 1 | **Correctness (Layer 1)** | Zero false-positive `computed()` wrappings of function definitions | Run compiler on `examples/entity-todo` and `examples/canvas-whiteboard`. No arrow function or function expression is wrapped in `computed()`. |
| 2 | **Correctness (Layer 2)** | Imported utility functions returning reactive values get correct auto-unwrapping | E2E test: utility function returning `query()` or composing signals produces same `.value` insertions as inline usage. |
| 3 | **Coverage (Layer 2b)** | >= 95% manifest classification rate on user code | Measure on example apps. The POC reports 96% (72/75 exports). Exports that fall through are classified as `unknown` and handled by runtime tracking. |
| 4 | **Performance** | Total pre-pass < 150ms for a 200-file project | CI-enforced benchmark. POC shows 78ms for parsing alone; 150ms budget includes import graph + propagation. |
| 5 | **Zero new developer API** | No new config, annotations, or file conventions required | Verified by: example apps compile correctly with zero configuration changes. |
| 6 | **Abstraction transparency** | Reactive utility in separate file = same logic inline | Test: utility function composing reactive values produces identical compiled output to inline usage. |

---

## 4. API Surface

### 4.1 Developer-Facing (Zero New API)

Developers write the same code they write today. The compiler gets smarter:

```tsx
// Before (today): callbacks wrongly wrapped in computed()
let count = 0;
const handleClick = () => { count++; };
// Compiled to: const handleClick = computed(() => () => { count.value++; });  // WRONG

// After: callbacks stay static, .value inserted inside body
let count = 0;
const handleClick = () => { count++; };
// Compiled to: const handleClick = () => { count.value++; };  // CORRECT
```

```tsx
// Before (today): custom hooks don't get auto-unwrapping
import { useTasks } from '../hooks/use-tasks';
const tasks = useTasks();
// tasks.data is NOT auto-unwrapped (compiler doesn't know useTasks returns signal-api)

// After: cross-file manifest tells the compiler about useTasks
import { useTasks } from '../hooks/use-tasks';
const tasks = useTasks();
// tasks.data -> tasks.data.value (auto-unwrapped, same as inline query())
```

### 4.2 Compiler Plugin Configuration

The Bun plugin gains a `manifests` option for pre-built package manifests:

```typescript
// In bun-plugin/plugin.ts
interface VertzPluginOptions {
  // ... existing options
  /** Pre-built reactivity manifests for external packages */
  manifests?: Record<string, ReactivityManifest>;
}
```

For most users, this is never configured -- the framework manifest is built-in and user code manifests are auto-generated.

---

## 5. Diagnostics and Debugging

### 5.1 Unknown Classification Diagnostics

When the manifest system classifies an export as `unknown`, the compiler behavior is: **treat property accesses as potentially reactive in JSX contexts only** (wrap in `__child`/`__attr` thunks). The compiler does NOT insert `.value` on `unknown` exports -- that would crash at runtime for genuinely static values. Instead, the runtime's `domEffect` tracking handles it.

In dev mode, the compiler emits a diagnostic warning for `unknown` classifications:

```
[vertz:reactivity] Cannot determine reactivity shape of 'useTasks' imported from '../hooks/use-tasks'.
Signal properties will not auto-unwrap. If this returns a signal API, ensure the source file
is included in the compilation scope.
```

For circular dependencies causing `unknown`, the warning is specific:

```
[vertz:reactivity] Circular dependency detected: src/hooks/a.ts <-> src/hooks/b.ts.
Exports involved in the cycle are treated as unknown.
```

**Expected false-positive rate:** The POC shows 96% classification on user code (72/75 exports). The 4% that falls through (3 items) were all server-side utilities (DB/email) -- not UI-relevant. In practice, the false-positive rate for UI-relevant code is near zero. When false positives do occur, the cost is: (1) extra `__child`/`__attr` thunk wrappers in compiled output (one function allocation per expression), and (2) no auto-unwrapping of signal properties (developer must use `.value` manually or the runtime handles it). This is NOT zero-cost -- it adds function allocation overhead per render for affected expressions and produces noisier compiled output. However, correctness is preserved by the runtime tracking.

### 5.2 Manifest Debugging

Integrated with the existing `VERTZ_DEBUG` diagnostic logging system:

```bash
VERTZ_DEBUG=manifest    # Log manifest generation (file path, export shapes, timing)
VERTZ_DEBUG=manifest,plugin  # Combine with plugin logging
```

When enabled, logs each manifest as NDJSON to `.vertz/dev/debug.log`:

```json
{"category":"manifest","file":"src/hooks/use-tasks.ts","exports":{"useTasks":{"kind":"function","reactivity":{"type":"signal-api","signalProperties":["data","loading","error"]}}},"ms":0.23}
```

Additionally, manifest data is added to the existing `/__vertz_diagnostics` endpoint in dev mode, showing all generated manifests and their classification results.

---

## 6. Manifesto Alignment

### "If it builds, it works" (Principle 1)

Cross-file reactivity analysis moves more correctness checks to compile time. Today the compiler silently produces wrong output for callbacks (wrapping in `computed()`) and cross-file imports (missing auto-unwrapping). After this change, the compiler has enough information to generate correct code across file boundaries.

### "One way to do things" (Principle 2)

The manifest system means reactive utilities work correctly regardless of which file they're defined in. A `transitionList()` helper or a `queryMatch()` pattern that returns reactive values will get correct auto-unwrapping and computed classification, whether defined inline or imported from a utility file. Today, extracting reactive logic into a shared utility silently breaks the compiler. After this change, the abstraction is transparent.

### "Compile-time over runtime" (Principle 3)

PR #926 shifted JSX reactivity detection to runtime (literal vs non-literal). This design complements that by keeping the compile-time analysis for what it's good at -- `computed()` wrapping and `.value` insertion -- while fixing the cases where single-file analysis produced wrong results.

### "AI agents are first-class users" (Principle 3)

An LLM extracting reactive logic into a utility function is a natural refactoring. Today, this can break the compiler silently — the imported utility's reactivity shape is invisible. After this change, the manifest propagates the reactivity shape through the import chain. The LLM doesn't need to know about compiler internals.

### Tradeoff: Explicit over implicit

The manifest system is implicit -- reactivity shapes are inferred, not declared. We accept this tradeoff because:

1. Declaring reactivity explicitly would be a new API surface that violates "one way to do things"
2. The inference is deterministic and auditable (manifests can be inspected via `VERTZ_DEBUG=manifest`)
3. The fallback is safe: `unknown` shapes are treated as potentially reactive with a diagnostic warning

---

## 7. Non-Goals

1. **TypeScript type checking** -- This system does NOT use the TypeScript type checker. It analyzes AST structure (return statements, function calls, re-exports) not types. The question is "does this function call `query()`?" not "does this function return `Signal<T>`?".

2. **Runtime reactivity tracking replacement** -- PR #926's literal/non-literal strategy for JSX stays. The manifest system improves compile-time analysis (computed wrapping, auto-unwrapping) but does not replace runtime tracking.

3. **Full program analysis** -- We don't need to understand every possible code path. The manifest system tracks reactivity at the export boundary -- what goes in and what comes out. Internal implementation details are not propagated.

4. **Third-party package analysis** -- We don't analyze `node_modules` source code. Third-party packages default to `unknown`. The `.reactivity.json` convention for third-party packages is **explicitly deferred** from this design (see Section 2.3, Layer 2d).

5. **Prop reactivity from parent** -- Determining whether a specific prop is reactive at the call site (parent component) is deferred, not abandoned. PR #926's runtime tracking already handles this for JSX expressions. The manifest schema's `reactiveProps?: string[]` field is forward-compatible for when compile-time prop reactivity is needed (diagnostics, optimizations, or VertzQL field tracking through component boundaries).

---

## 8. Unknowns

### 8.1 Manifest Generation Performance -- RESOLVED (POC)

**Question:** How fast can we generate manifests for a typical Vertz project (50-200 component files)?

**POC Results (poc-manifest-perf.ts, poc-parser-bench.ts):**

| Parser | Time (203 files) | Accuracy |
|--------|------------------|----------|
| ts-morph | ~700ms | 100% |
| **Raw TypeScript API** (`ts.createSourceFile`) | **~78ms** | **100%** |
| SWC (`@swc/core`) | ~90ms | 100% |
| Bun `scan()` + regex | ~22ms | 93% (false positives on `useContext`) |
| Regex-only | ~3.5ms | ~95% (misses edge cases) |

**Finding:** ts-morph was the bottleneck, not TypeScript. Using `ts.createSourceFile()` directly (no `Program`, no type checker) achieves **~78ms for 203 files** -- well under the 150ms total budget. The actual AST analysis per file is ~225us after warmup; the cost is parser initialization.

**Decision:** Use the raw TypeScript Compiler API for manifest generation. Zero new dependencies (TypeScript is already in the monorepo). Full AST accuracy. If we later need to scale to 1000+ files, the Bun `scan()` hybrid (22ms) is a fallback with tightened regex.

**Note on two parsers:** The manifest generator uses raw `ts.createSourceFile()` while the component compilation uses ts-morph. These use the same underlying parser (ts-morph wraps TypeScript's API). AST node kinds are identical. The maintenance burden of two API styles is acknowledged -- if it becomes problematic, we can evaluate ts-morph with `skipFileDependencyResolution: true` (which should be closer to raw API performance since it skips `Program` creation).

### 8.2 Return Shape Inference Accuracy -- RESOLVED (POC)

**Question:** Can we reliably infer the reactivity shape of a function's return value from its AST alone?

**POC Results (poc-return-shape.ts):**

| Scope | Classification Rate |
|-------|-------------------|
| **User code** (examples/) | **96.0%** (72/75 exports) |
| Combined (functions + const values) | 71.7% (205/286) |
| All functions (including framework internals) | 54.0% |

**What AST-only analysis detects reliably:**
- Direct signal API calls: `return query(...)` -- HIGH confidence
- Variable tracking: `const q = query(...); return q` -- HIGH
- Non-null unwrapping: `return useContext(X)!` -- HIGH
- JSX returns (component identification) -- HIGH
- Exported const values from signal APIs -- HIGH
- Object literals with reactive spreads -- MEDIUM
- Same-file function call resolution -- MEDIUM

**What falls through (and why it's fine):**
- Barrel re-exports (313 items) -> solvable with cross-file import chain resolver
- Cross-file function calls -> needs the import chain (same resolver)
- Framework internals -> compiler never processes these; they use the pre-built manifest
- The 3 "unknown" user-code items were all server-side utilities (DB/email) -- not UI-relevant

**Synthetic pattern test: 16/17 passed.** The one miss was a method call on a parameter (`d.toLocaleDateString()`) -- a server-side utility pattern, not UI-relevant.

**Decision:** AST-only analysis is the right approach. 96% on user code with the remaining gaps closed by the cross-file import resolver. No TypeScript type checker needed.

### 8.3 Circular Dependencies -- Discussion-resolvable

**Question:** What happens when file A imports from file B, and file B imports from file A?

**Resolution:** Build the import graph first, detect cycles, and use `unknown` for any export involved in a cycle. Emit a specific diagnostic warning identifying the cycle (see Section 5.1). This is conservative but safe. Circular dependencies between component files are already an anti-pattern.

### 8.4 Re-exports and Barrel Files -- Discussion-resolvable

**Question:** How do barrel files (`index.ts` that re-exports from multiple modules) affect manifest generation?

**Resolution:** Follow re-export chains to the original source. `export { query } from './query'` inherits the manifest from `./query.ts`. This is straightforward with import resolution. The POC confirmed 313 barrel re-exports in @vertz/ui -- all resolvable with a lightweight chain follower.

---

## 9. E2E Acceptance Test

### 9.1 Layer 1: Callback Classification

```typescript
describe('Cross-file reactivity analysis', () => {
  describe('Layer 1: Callbacks never wrapped in computed()', () => {
    describe('Given a component with a callback that captures a signal', () => {
      const input = `
        import { query } from '@vertz/ui';

        export function TaskList() {
          let count = 0;
          const tasks = query(() => fetchTasks());

          // Callback that reads signal -- should NOT be computed
          const handleRefresh = () => {
            if (tasks.loading) return;
            tasks.refetch();
          };

          // Callback that mutates signal -- should NOT be computed
          const increment = () => { count++; };

          // Value expression -- SHOULD be computed
          const doubled = count * 2;

          // Thunk called in JSX -- should NOT be computed (call site handled by JSX)
          const getLabel = () => count > 5 ? 'high' : 'low';

          // IIFE -- SHOULD be computed (initializer is CallExpression, not ArrowFunction)
          const computed_result = (() => count * 3)();

          return (
            <div>
              <span>{doubled}</span>
              <span>{getLabel()}</span>
              <span>{computed_result}</span>
              <button onClick={increment}>+</button>
              <button onClick={handleRefresh}>Refresh</button>
            </div>
          );
        }
      `;

      it('classifies handleRefresh as static', () => {
        // handleRefresh is an arrow function -- never computed
      });

      it('classifies increment as static', () => {
        // increment is an arrow function -- never computed
      });

      it('classifies doubled as computed', () => {
        // doubled is a value expression depending on signal count
      });

      it('classifies getLabel as static', () => {
        // getLabel is an arrow function -- never computed
        // JSX handles reactivity: __child(() => getLabel())
      });

      it('classifies computed_result as computed', () => {
        // IIFE: initializer is CallExpression, not ArrowFunction
        // isFunctionDefinition returns false
      });

      it('inserts .value inside callback bodies', () => {
        // handleRefresh body: tasks.loading.value, tasks.refetch()
        // increment body: count.value++
        // getLabel body: count.value > 5 ? 'high' : 'low'
      });

      it('wraps function call in JSX attribute with __attr', () => {
        // style={fn()} -> __attr(() => fn())
        // Confirms PR #926 covers attributes, not just children
      });
    });

    describe('Existing test change: nested closure reading signal property', () => {
      it('classifies arrow function capturing signal API as static (was: computed)', () => {
        // This changes the existing test at reactivity-analyzer.test.ts:392
        // Old expectation: fn classified as 'computed' (BUG)
        // New expectation: fn classified as 'static' (CORRECT)
        // Reason: computed(() => () => { ... }) is wrong -- fn should be a plain function
        // with .value inserted inside its body
      });
    });
  });
```

### 9.2 Layer 2: Cross-File Manifest

```typescript
  describe('Layer 2: Cross-file reactivity via manifests', () => {
    describe('Given a custom hook wrapping query()', () => {
      // File: src/hooks/use-tasks.ts
      const hookFile = `
        import { query } from '@vertz/ui';
        import { fetchTasks } from '../api/tasks';

        export function useTasks() {
          return query(() => fetchTasks(), { key: 'tasks' });
        }
      `;

      // File: src/pages/task-list.tsx
      const componentFile = `
        import { useTasks } from '../hooks/use-tasks';

        export function TaskList() {
          const tasks = useTasks();
          const hasError = !!tasks.error;

          return (
            <div>
              {tasks.loading && <span>Loading...</span>}
              {hasError && <span>Error</span>}
              {tasks.data && <span>{tasks.data.title}</span>}
              <button onClick={() => tasks.refetch()}>Refresh</button>
            </div>
          );
        }
      `;

      it('generates a manifest for use-tasks.ts showing signal-api return', () => {
        // useTasks manifest: { kind: 'function', reactivity: { type: 'signal-api', ... } }
      });

      it('auto-unwraps signal properties in task-list.tsx', () => {
        // tasks.loading -> tasks.loading.value
        // tasks.error -> tasks.error.value
        // tasks.data -> tasks.data.value
        // tasks.refetch -> tasks.refetch (plain property, no .value)
      });

      it('classifies hasError as computed', () => {
        // hasError depends on tasks.error (signal property from manifest)
      });
    });

    describe('Given a re-exported hook through a barrel file', () => {
      // File: src/hooks/use-tasks.ts (same as above)
      // File: src/hooks/index.ts
      const barrelFile = `export { useTasks } from './use-tasks';`;

      // File: src/pages/task-list.tsx
      const componentFile = `
        import { useTasks } from '../hooks';
        // ... same usage
      `;

      it('follows re-export chain and applies the correct manifest', () => {
        // tasks.data still auto-unwraps even through barrel file
      });
    });
  });
});
```

---

## 10. Architecture Decisions

| Decision | Choice | Alternative | Rationale |
|----------|--------|-------------|-----------|
| Manifest format | JSON metadata per file | TypeScript type analysis | No type checker dependency; fast; deterministic |
| Inference method | AST pattern matching via `ts.createSourceFile()` | ts-morph / Type inference via tsc | 78ms for 203 files (POC verified); ts-morph was 10x slower; no `Program` needed |
| Unknown handling | Treat as potentially reactive in JSX; emit dev-mode warning | Treat as static / Error on unknown | Safe default with developer visibility. Runtime tracking handles correctness. Not zero-cost (extra thunks, no auto-unwrap), but correctness is preserved. |
| Framework manifest | Pre-built, ships with @vertz/ui | Generated at compile time | Framework APIs are stable; avoids re-analyzing framework code |
| Callback classification | Never wrap ArrowFunction/FunctionExpression in computed() | Analyze whether the function is used as callback vs thunk | Simpler, correct -- JSX call sites (children AND attributes) are handled by runtime tracking |
| Manifest storage | In-memory during build | Always written to disk | Dev builds don't need disk I/O |
| Circular dependency handling | Classify as `unknown` with specific diagnostic | Error on circular reactivity | Conservative and safe; circular deps are already an anti-pattern |
| Manifest pre-pass timing | At plugin construction time (before `onLoad`) | Lazy on first `onLoad` / External pre-computation | Clean integration -- `createVertzBunPlugin()` runs before `Bun.serve()` starts. Manifest map stored as closure-scoped mutable `Map`. |
| HMR cascade on manifest change | Full page refresh required | Force recompile dependents | Bun's HMR has no mechanism to force re-evaluation of dependent files. Manifest shape changes are rare. Acceptable for v1. |
| Schema versioning | `version: 1` field in manifest | No versioning | Forward compatibility. Unknown versions fall back to `unknown` with warning. |

---

## 11. Key File Impacts

| File | Change |
|------|--------|
| `packages/ui-compiler/src/analyzers/reactivity-analyzer.ts` | Skip function definitions in computed classification; accept manifests for imported modules; update `buildImportAliasMap` to resolve against manifests |
| `packages/ui-compiler/src/signal-api-registry.ts` | Refactor to generate/consume manifest format; keep as compatibility layer for Layer 2a transition |
| `packages/ui-compiler/src/compiler.ts` | Accept manifests parameter in `CompileOptions`; pass to ReactivityAnalyzer |
| `packages/ui-compiler/src/manifest-generator.ts` | **New** -- generates ReactivityManifest for a file using `ts.createSourceFile()` |
| `packages/ui-compiler/src/manifest-resolver.ts` | **New** -- resolves import paths to manifests, handles re-exports, tsconfig paths |
| `packages/ui-compiler/src/types.ts` | Add ReactivityManifest types; `string[]` -> `Set<string>` conversion at load time |
| `packages/ui-server/src/bun-plugin/plugin.ts` | Manifest generation in `createVertzBunPlugin()` at construction time; pass manifests to `compile()` via closure; update file watcher to regenerate changed manifests |
| `packages/ui/reactivity.json` | **New** -- pre-built manifest for @vertz/ui exports |
| `packages/ui-compiler/src/analyzers/__tests__/reactivity-analyzer.test.ts` | Line 392-402: change expected classification from `'computed'` to `'static'` for arrow functions capturing signal properties |

---

## 12. Relationship with Field Access Analyzer (VertzQL)

The backend compiler has existing research code (`packages/compiler/src/analyzers/field-access-analyzer.ts` and `cross-component-analyzer.ts`) that tracks which fields are accessed on query results across components -- this powers the future VertzQL automatic field selection (querying only used fields, like GraphQL does automatically).

The field access analyzer and the reactivity manifest system are **complementary but distinct**:

| | Field Access Analyzer | Reactivity Manifest |
|---|---|---|
| **Question answered** | "Which fields of `.data` are actually used?" | "Does this function return a signal-api?" |
| **Abstraction level** | Field-level (`.data.title`, `.data.author.name`) | Export-level (function returns `signal-api`) |
| **Direction** | Usage tracking (consumer -> producer) | Shape propagation (producer -> consumer) |
| **Compiler** | Backend compiler (`packages/compiler/`) | UI compiler (`packages/ui-compiler/`) |
| **Status** | Research code, not integrated | This design (new) |

**Shared infrastructure opportunity:** Both systems need a **cross-file import resolver** that follows import chains and barrel re-exports. This resolver should be built as a shared utility that both analyzers can consume. The manifest system builds it first; the field access analyzer adopts it when integrated.

**Future convergence:** When VertzQL is implemented, the manifest system provides the foundation -- the field access analyzer can consult manifests to know which variables are `signal-api` before tracking their field access. The manifest is the "what is it?" layer; field access is the "how is it used?" layer.

### 12.1 Future Opportunity: Smarter JSX Wrapping

Today, PR #926's literal/non-literal strategy wraps ALL non-literal JSX expressions in reactive thunks (`__child(() => expr)` for children, `__attr(() => expr)` for attributes). This creates a `domEffect` boundary for every expression, even when the expression is provably static. The overhead: one function allocation per expression, plus a wrapper DOM element per reactive child.

With the manifest system in place, the compiler gains cross-file knowledge about what is and isn't reactive. This creates the foundation to make the JSX transformer smarter:

- If the manifest says `formatDate` is a static function and its argument is static, `{formatDate(task.name)}` could skip the `__child` wrapper entirely and use direct DOM insertion — no `domEffect`, no wrapper element.
- If the manifest says an imported variable is `static`, `<div class={importedStyle}>` could use direct attribute setting instead of `__attr`.

This optimization is **not in scope for this design** — it requires changes to the JSX transformer, not just the reactivity analyzer. But it is a natural follow-up once Layer 2b ships, and it would reduce the runtime overhead of the literal/non-literal strategy for projects with many static utility imports.

---

## 13. Risks

1. **Performance regression in dev startup** -- Manifest generation adds a pre-pass before any component compilation. Mitigated by: lightweight analysis (no type checking), 150ms total budget with POC showing 78ms for parsing, incremental updates in HMR.

2. **Inference accuracy** -- AST pattern matching may miss complex patterns (dynamic returns, conditional signal API usage). Mitigated by: `unknown` fallback with diagnostic warning (Section 5.1), runtime tracking preserves correctness, POC shows 96% on user code.

3. **Maintenance burden** -- Framework manifest must stay in sync with actual API behavior. Mitigated by: generating the manifest from the existing signal API registry, or from source annotations.

4. **Two AST API styles** -- Manifest generator uses raw TypeScript API; component compiler uses ts-morph. Mitigated by: both use the same underlying parser (identical AST nodes); can evaluate ts-morph without `Program` if maintenance burden grows. **CTO note:** If ts-morph becomes a performance bottleneck for the component compiler, we should replace it with the same raw TypeScript API used for manifest generation. The manifest work establishes the pattern; migrating the compiler would be a natural follow-up.

5. **Unknown-as-reactive overhead** -- False positives add function allocation per expression in JSX (`__child`/`__attr` thunks) and produce noisier compiled output. Mitigated by: expected false-positive rate near zero for UI code (POC: 3 unknowns were all server-side utilities); diagnostic warnings help developers identify and resolve.

---

## 14. Timeline

| Phase | Effort | Confidence | Priority |
|-------|--------|------------|----------|
| Layer 1: Callback fix | 1-2 days | High | **Ship immediately** -- straightforward bugfix |
| Layer 2a: Framework manifest (replace registry) | 2-3 days | High | **Ship soon** -- small refactor, establishes contract |
| Layer 2b: Manifest generator + import resolver | 5-8 days | Medium | **After cloud platform PoC ships**, unless concrete use case surfaces earlier |
| Layer 2c: HMR incremental updates | 2-3 days | Medium | After Layer 2b |
| Layer 2d: Third-party convention | Deferred | N/A | **Rejected from scope** |

**Total for full system (Layer 1 + 2a-c): ~2-3 weeks.**

Layer 1 is a bug fix with no debate needed. Layer 2a is low-risk infrastructure. Layer 2b-c is a significant investment that competes with cloud platform delivery. The trigger to prioritize Layer 2b should be a concrete case where cross-file blindness causes developer pain, not theoretical completeness.

---

## 15. Review Resolution Log

All blocking items from the three reviews (josh, pm, ben) have been addressed:

| # | Reviewer | Blocking Item | Resolution |
|---|----------|---------------|------------|
| 1 | josh | Error experience for `unknown` classifications | Added Section 5.1: dev-mode diagnostic warnings with actionable messages |
| 2 | josh | Breaking change analysis for Layer 1 | Added to Section 2.1: behavioral change acknowledgment, blast radius, existing test change |
| 3 | josh | Manifest debugging story | Added Section 5.2: `VERTZ_DEBUG=manifest` + `/__vertz_diagnostics` endpoint |
| 4 | josh | JSX attribute coverage by PR #926 | Confirmed in Section 2.1 with specific test references (`__attr` for attributes) |
| 5 | pm | Layer 2 sub-phases | Added Section 2.3: 2a/2b/2c/2d with independent deliverability |
| 6 | pm | Success metrics | Added Section 3: 6 measurable criteria |
| 7 | pm | "Zero cost" claim for unknown-as-reactive | Qualified in Section 5.1 and Architecture Decisions table: not zero-cost (extra thunks, no auto-unwrap), but correctness preserved |
| 8 | ben | Existing test contradicts Layer 1 | Acknowledged in Section 2.1 and Section 11: test at line 392-402 will change, with explanation of why old expectation was incorrect |
| 9 | ben | No Bun plugin pre-pass hook | Specified in Section 2.2.4: manifests computed at `createVertzBunPlugin()` construction time, stored as closure-scoped mutable Map |
| 10 | ben | `fieldSignalProperties` missing from manifest schema | Added to `signal-api` shape in Section 2.2.1 with explanation of form() field-level support |

Key non-blocking items also addressed:
- IIFE wording clarification (ben 1.1): Clarified in Section 2.1 + IIFE test case in Section 9.1
- Layer 1/2 independence (pm): Explicitly stated in Section 2
- `reactiveProps` deferred not abandoned (pm): Noted in Section 2.2.1 and Section 7
- Third-party convention rejected from scope (pm): Section 2.2.2 and 2.3
- ts-morph vs raw TS API coexistence (pm/ben): Acknowledged in Section 8.1 and Risk #4
- Framework manifest staleness (pm): Addressed in Section 2.2.5
- Manifest format versioning (josh): Added `version` field to schema
- tsconfig paths support (ben): Mentioned in Section 2.2.4 import resolution
- Function-as-comparator known limitation (ben): Documented in Section 2.1
- `collectDeps` optimization (ben): Noted in Section 2.1
