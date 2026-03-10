# Technical Review: VertzQL Automatic Field Selection

- **Reviewer:** ben (Technical)
- **Date:** 2026-03-10
- **Verdict:** Changes Requested

## Feasibility Assessment

The overall concept is sound: a pre-pass produces a manifest, the per-file compilation reads it and injects `select` parameters. This mirrors the existing reactivity manifest pattern and is a proven architecture in this codebase. The server-side VertzQL parser already handles `select` correctly. The pieces exist.

However, the design doc glosses over several hard integration problems that will block or significantly delay implementation. The gap between "standalone analyzers work" and "injected into the live compilation pipeline" is larger than the doc suggests.

## Architecture Concerns

### Blocking

#### B1. `@vertz/ui-server` does NOT depend on `@vertz/compiler` -- new dependency required

The design doc says Phase 1 adds a `generateFieldSelectionManifest()` call in the Bun plugin (`packages/ui-server`) that uses `FieldAccessAnalyzer` and `CrossComponentAnalyzer` from `packages/compiler`. But `@vertz/ui-server`'s `package.json` has **no dependency on `@vertz/compiler`**. Its dependencies are: `@vertz/core`, `@vertz/ui`, `@vertz/ui-compiler`, `magic-string`, `ts-morph`, and `@ampproject/remapping`.

`@vertz/compiler` is the **server-side** compiler (entity analyzers, route analyzers, codegen, OpenAPI generation). It depends on `ts-morph` and has a `ResolvedConfig` that expects server-side config (`sourceDir`, `outputDir`, `entryFile`, `schemas`, `openapi`, `validation`). The `BaseAnalyzer` constructor requires this config object.

**Options the implementer must choose from:**
1. Add `@vertz/compiler` as a dependency of `@vertz/ui-server`. This creates a cross-concern coupling: the UI build tool now depends on the server compiler package. Every user who installs `@vertz/ui-server` pulls in the full server compiler. This is architecturally wrong.
2. Extract `FieldAccessAnalyzer` and `CrossComponentAnalyzer` into `@vertz/ui-compiler` (which `@vertz/ui-server` already depends on). This is cleaner but requires moving the analyzers and their `BaseAnalyzer` base class.
3. Create a new shared package (e.g., `@vertz/analysis`) for cross-cutting analyzers. More packages = more overhead, but cleanest separation.

**The design doc must specify which option is chosen.** This affects Phase 1's scope significantly.

#### B2. `BaseAnalyzer` requires a `ResolvedConfig` with server-side fields

Both `FieldAccessAnalyzer` and `CrossComponentAnalyzer` extend `BaseAnalyzer`, which takes a `ResolvedConfig`. This config type is defined in `packages/compiler/src/config.ts` and includes `compiler.sourceDir`, `compiler.outputDir`, `compiler.entryFile`, `schemas`, `openapi`, and `validation` -- all server-side concerns.

When running these analyzers from the UI build pipeline, you'd need to construct a `ResolvedConfig` with dummy/default values for irrelevant server fields. This is a code smell. The analyzers should either:
- Accept a narrower config interface (just `sourceDir`)
- Or be refactored to not require `ResolvedConfig` at all

The existing test code calls `resolveConfig()` with no arguments (getting defaults), which works but obscures the dependency. This needs a design decision before implementation.

#### B3. The `select` injection location in compiled output is underspecified

The design says the Bun plugin injects `select` into `api.users.list()` calls "after compilation." But look at what compilation does:

1. Hydration transform adds `data-hid` attributes
2. Context stable IDs are injected
3. `compile()` runs reactive signal transforms + JSX transforms

After step 3, the code is heavily rewritten. The signal transformer inserts `.value` calls. The JSX transformer rewrites JSX into `createElement` calls with getter-backed props. The source code `query(api.users.list())` becomes something like:

```js
const users = query(api.users.list());
// After compilation, JSX using users.data is rewritten:
createElement("div", null, () => users.data.value.items.map(...))
```

The design says a new `field-selection-inject.ts` MagicString transform "finds `api.<entity>.<method>()` calls within `query()`." But **at what stage in the pipeline does this run?** If it runs after `compile()`, the MagicString positions from the original source no longer correspond to the compiled output -- `compile()` returns a new `code` string with its own MagicString, not the original one.

The design needs to specify exactly where in the pipeline the injection happens:
- **Before compilation (on the hydrated source):** The `api.users.list()` pattern is still intact. But you'd need to create a new MagicString, apply the injection, then pass the result to `compile()`. This is the cleanest option.
- **After compilation (on the compiled output):** You'd need to parse the compiled output to find the injection point. The `api.users.list()` call may not be syntactically transformed by the compiler (it's not reactive), so it might still be findable. But this is fragile -- any future compiler change could break it.
- **During compilation (as a new compiler pass):** This would require modifying `@vertz/ui-compiler`'s `compile()` function.

**Recommendation:** Inject before compilation, right after the hydration transform (step 1). The `api.X.Y()` call expression is untouched by hydration, and the manifest is already available. Create a new MagicString pass between hydration and compilation.

#### B4. SDK codegen currently generates `list()` with `query?: Record<string, unknown>` -- no `select` support

Looking at the actual SDK codegen (`packages/codegen/src/generators/entity-sdk-generator.ts` line 108):

```ts
(query?: Record<string, unknown>) => createDescriptor('GET', '${op.path}', () => client.get<...>('${op.path}', { query }), query, ...)
```

The `list()` method takes a `query` parameter that is passed directly to `client.get()`. The `createDescriptor` signature is `createDescriptor(method, path, fetchFn, query, entity)` where `query` is `Record<string, unknown>` used for cache key derivation.

The design says the compiler rewrites `api.users.list()` to `api.users.list({ select: { id: true, name: true } })`. This means the `query` parameter would become `{ select: { id: true, name: true } }`, which flows to `client.get('/users', { query: { select: { id: true, name: true } } })`.

But **the server expects `select` to be inside a base64-encoded `q=` parameter**, not as a top-level query param. The SDK's `client.get` would need to serialize this correctly. The design mentions an `encodeVertzQL()` helper but doesn't specify where it goes or how the SDK codegen changes.

The `get()` method has a different signature: `(id: string) => createDescriptor(...)` with no options parameter at all. Adding `select` to `get()` requires changing the codegen template.

**This is a Phase 2 prerequisite that needs to be clearly scoped.** The SDK codegen changes are non-trivial and affect `@vertz/codegen`, `@vertz/fetch`, and potentially `@vertz/ui`.

### Should Fix

#### S1. `resolveComponentPath` in `CrossComponentAnalyzer` is O(n*m) and fragile

The `resolveComponentPath` method (line 371-401 of `cross-component-analyzer.ts`) iterates ALL source files in the ts-morph project to find a component by name. For a project with 200 components:
- Each JSX element triggers a scan of all files
- A file with 10 child components triggers 10 full scans
- Total: O(components * files) = O(n^2) in the worst case

Worse, it matches by **function name only** -- it doesn't follow import declarations. If two files export components with the same name (e.g., `Card` in `UserCard.tsx` and `Card` in `TaskCard.tsx`), it returns the first match it finds. This is a correctness bug, not just a performance issue.

The design doc should acknowledge this limitation and either:
- Fix `resolveComponentPath` to follow the actual import graph (using import declarations in the parent file)
- Or document that same-named components across files produce incorrect results

#### S2. ts-morph Project creation in `onLoad` is already expensive -- adding another is worse

Look at the existing Bun plugin pipeline (line 181-190 of `plugin.ts`):

```ts
const hydrationProject = new Project({ useInMemoryFileSystem: true, ... });
const hydrationSourceFile = hydrationProject.createSourceFile(args.path, source);
```

A **new ts-morph Project** is created for every single file load. This is already expensive. The field selection pre-pass creates yet another ts-morph Project (a full one, not in-memory) for the entire source tree.

The design should clarify: is the field selection Project created once at startup and reused? Or recreated on every file change? If reused, how are files updated incrementally in the Project?

The existing reactivity manifest system avoids ts-morph entirely -- it uses `ts.createSourceFile` (the raw TypeScript compiler API) which is much lighter. This is a deliberate performance decision documented in `manifest-generator.ts` line 6-7: "Uses the raw TypeScript Compiler API (ts.createSourceFile) for performance. Pure AST pattern matching -- no Program, no type checker."

**The field access analyzers use the FULL ts-morph Project with type checker.** This is orders of magnitude slower. Unknown #1 in the design doc acknowledges this but proposes it as a POC. It should be a hard requirement to benchmark before committing to the architecture.

#### S3. Incremental update strategy is hand-waved

The design says "re-analyze the changed file, update its entry in the manifest, notify parent files that pass data to it via props." But:

1. **How do you know which parent files pass data to the changed file?** The prop flow graph is built by scanning ALL files. You'd need to maintain a reverse dependency map (child -> parents). The current `CrossComponentAnalyzer` doesn't build or maintain this.

2. **The entire cross-component analysis is a single `analyze()` call.** There's no `analyzeIncremental(changedFile)` method. The analyzer creates a fresh `FieldAccessAnalyzer`, runs it on all files, then builds the prop flow graph. There's no way to update a single file's analysis without re-running the entire thing.

3. **The file watcher in `bun-dev-server.ts` updates one file at a time** (line 1503-1516). The `updateServerManifest()` call takes a single file path and source text. The field selection equivalent would need to:
   - Re-analyze the changed file's field access
   - Look up all prop flow edges involving this file
   - Re-aggregate fields for all affected queries (potentially in ancestor files)
   - Update the manifest entries for all affected files

   None of this infrastructure exists yet.

#### S4. HMR ordering: manifest update races with SSR re-import

Looking at the file watcher handler (line 1499-1580 of `bun-dev-server.ts`), the sequence is:

1. Discover HMR assets
2. Proactive build check
3. **Regenerate manifest** for changed file
4. Clear require cache
5. Re-import SSR module

The field selection manifest update would need to happen at step 3 (before SSR re-import). But the reactivity manifest update is already there, and it's a single-file operation. The field selection update potentially needs to re-analyze multiple files (parent files whose aggregated fields changed).

If the field selection re-analysis takes longer than the debounce timeout (100ms), a second file change could arrive before the first analysis completes. The design should specify whether field selection updates are synchronous (blocking SSR re-import) or asynchronous (with potential for stale manifests during the gap).

#### S5. The `undefined` gap is more dangerous than the doc suggests

The design acknowledges that non-selected fields are `undefined` at runtime but typed as present. The mitigation is "Phase 2+." But consider this scenario during development:

1. Developer writes `UserCard` using `user.name`
2. Compiler selects `{ id: true, name: true }`
3. Developer adds `console.log(user.bio)` in an event handler for debugging
4. `user.bio` is `undefined` because it wasn't selected
5. Developer is confused -- "why is bio undefined? The API returns it when I test in Postman"

This will be a common developer experience issue. The Phase 1 acceptance criteria should include at minimum a dev-mode runtime warning when accessing a non-selected field from the entity store. Otherwise the feature will generate more confusion than it saves in bandwidth.

### Risk Areas

#### R1. The analyzer doesn't handle `items` in `users.data.items.map()`

Looking at `FieldAccessAnalyzer.extractFieldsFromScope()` (line 301-438), it tracks `varName.data.field` access. But `QueryResult.data` for a list query returns a `ListResponse<T>` which has an `items` property. The typical access pattern is:

```tsx
users.data.items.map(u => <UserCard user={u} />)
```

The analyzer's `buildPropertyPath` (line 567-580) strips `data` from the path, but does it strip `items`? Looking at the code, it filters out `data` and array method names (`map`, `filter`, etc.) but NOT `items`. So the field path for `users.data.items[0].name` would be `items.name`, not `name`.

This means the generated `select` would be `{ items: { name: true } }` instead of `{ name: true }`. The server-side `applySelect` function expects flat field names at the entity level.

**This is a correctness issue that needs verification.** The analyzer tests may only use `data[0]` (direct array index) and not `data.items.map(...)`.

#### R2. Multiple queries in one component

The design's manifest format lists `queries` as an array per file. But what if a component has two queries?

```tsx
const users = query(api.users.list());
const tasks = query(api.tasks.list());
```

The analyzer correctly tracks these separately. But the injection step needs to know which `api.X.list()` call corresponds to which query variable. The MagicString transform needs to match the `queryVar` from the manifest to the actual `query()` call in the source -- not just find any `api.*` call.

#### R3. Conditional query patterns

What about:
```tsx
const users = enabled ? query(api.users.list()) : query(api.users.search({ term }));
```

Or:
```tsx
const source = isAdmin ? api.users.list() : api.users.listPublic();
const users = query(source);
```

The analyzer finds `query()` calls by looking for `query` identifier calls with variable declarations. The second pattern would create a `queryVar: 'users'` entry, but the actual descriptor call (`api.users.list()`) is on a different line and may not be inside the `query()` call syntactically.

#### R4. Re-exported components and barrel files

The `resolveComponentPath` method doesn't handle barrel re-exports:
```tsx
// components/index.ts
export { UserCard } from './UserCard';
```

If the parent imports from the barrel file, `resolveComponentPath` scans all files looking for a function named `UserCard`. It might find it in `UserCard.tsx`, but the resolution is coincidental (scanning all files) rather than following the import graph. This works by accident for simple cases but breaks if:
- The component is renamed in the re-export (`export { UserCard as Card }`)
- Multiple files export the same component name

## Implementation Notes

1. **The reactivity manifest system is the correct pattern to follow.** It uses `ts.createSourceFile` (lightweight, no type checker) and runs at plugin construction time. The field access analyzer should ideally be rewritten to use the same approach -- pure AST pattern matching without ts-morph's full Project. This would address the performance concern.

2. **The injection point should be a new step between hydration and compilation.** The existing pipeline has clear stages. Add "Step 2.5: Field selection injection" that reads the manifest and uses MagicString to inject `select` options into `api.X.list()` and `api.X.get()` calls. This runs on the pre-compilation source where the SDK call patterns are still intact.

3. **The `list()` SDK method's signature needs a backward-compatible change.** Currently it's `(query?) => createDescriptor(...)`. The new signature should be `(options?) => createDescriptor(...)` where options can include both query params and VertzQL params. The `encodeVertzQL()` step should happen inside the SDK method, not at the compiler level. The compiler injects `{ select: ... }` and the SDK handles serialization.

4. **Consider a lighter alternative to the full cross-component ts-morph analysis:** Since the reactivity manifest already tracks exports and their shapes, and the Bun plugin already has the source code of every file it processes, you could build the field tracking incrementally: each file's field access is analyzed during `onLoad` (on the original source, before compilation), and the prop flow graph is updated incrementally as files are processed. This avoids the startup cost of a full ts-morph Project.

5. **The `id` always-include rule should be configurable per entity.** Some entities might use `uuid` or `_id` as their primary key. The entity config already knows the primary key field -- use that instead of hardcoding `id`.

## Questions for the Author

1. **Which package should own the field access analyzers?** They currently live in `@vertz/compiler` (server-side) but need to be consumed by `@vertz/ui-server` (client-side build). Moving them to `@vertz/ui-compiler` seems cleanest. What's the plan?

2. **Have you benchmarked the ts-morph pre-pass?** The existing reactivity manifest avoids ts-morph deliberately for performance. A ts-morph Project with 200+ source files and the type checker enabled could easily take 5-10 seconds to initialize. This would add 5-10 seconds to every dev server startup. Is this acceptable?

3. **How does `data.items.map()` interact with field extraction?** The analyzer's `buildPropertyPath` strips `data` but not `items`. For list queries, the typical access is `query.data.items.map(u => u.name)`. Does the analyzer correctly resolve this to field `name` (not `items.name`)?

4. **What happens when the user provides their own `select` at the call site?** The design says "user-provided select takes precedence" via shallow merge. But the SDK's `list()` method currently takes `query?: Record<string, unknown>`, not a typed options object. How does the compiler distinguish a user-provided `select` from other query params?

5. **Open question #1 (porting to MagicString-based pipeline) should be a Phase 0 decision, not an open question.** The performance characteristics of ts-morph vs. raw AST parsing are dramatically different. This choice affects every subsequent phase. Decide before implementation begins.
