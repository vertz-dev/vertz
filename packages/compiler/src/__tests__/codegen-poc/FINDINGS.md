# Codegen POC Spike Findings

## Summary

All 3 unknowns were validated successfully. 36 tests pass, including an end-to-end test that writes generated TypeScript files to a temp directory and runs `tsc --noEmit` to verify they compile.

---

## Unknown 1: JSON Schema to TypeScript Converter

### What worked as expected

- **Primitives, nullable, arrays, tuples, enums, const** — all straightforward. The `type` field maps directly to TS types, `integer` maps to `number`, type arrays like `['string', 'null']` become `string | null`.
- **Objects with required/optional properties** — the `required` array cleanly determines which properties get `?`.
- **Unions and intersections** (`oneOf`/`anyOf` -> `|`, `allOf` -> `&`) — direct mapping.
- **`$ref` resolution** — extracting the last path segment from `#/$defs/Name` or `#/components/schemas/Name` gives us the type name trivially.
- **Record types** (`additionalProperties` as schema without `properties`) — maps cleanly to `Record<string, T>`.
- **Discriminated unions** — the `discriminator` metadata doesn't change the TypeScript union type, so it's just a regular `oneOf` mapping.
- **Formats, defaults, descriptions** — all safely ignored for type generation (they don't affect the TS type).

### What was harder than anticipated

- **Recursive schemas** (`$defs` with circular `$ref`). Required a `resolving` Set to track which types are currently being resolved, so we don't infinite-loop. The solution works: when processing `$defs`, we mark a name as "resolving" before recursing into its schema, and `$ref` resolution just returns the name string without expanding it. However, the ordering matters — `$defs` must be processed before the main `$ref`.

- **`$defs` extraction into named types**. The `namedTypes` Map that gets populated as a side effect is a somewhat awkward API. In production, this should probably return a structured result `{ mainType: string; extractedTypes: Map<string, string> }` instead of mutating a parameter.

- **Inline object types become verbose**. The converter produces `{ name: string; age?: number }` inline. For deeply nested schemas, this will produce very long type strings. Production code should detect when an inline type exceeds a complexity threshold and extract it as a named type alias.

### Recommended approach

- The recursive descent approach works well. Keep it as a single function with pattern matching on schema properties.
- Add a `Context` object instead of separate `namedTypes` and `resolving` parameters — cleaner API.
- For production: consider generating multiline formatted output instead of single-line strings (use an AST builder or template approach).
- The `$ref` resolution assumes local references only (`#/...`). External `$ref` URLs are not supported and should error clearly.

---

## Unknown 2: IR Adapter (Module Flattening & Schema Collision)

### What worked as expected

- **Module/Router/Route flattening** — the 3-level nesting (`ModuleIR` -> `RouterIR` -> `RouteIR`) flattens cleanly into `{ modules: [{ name, operations }] }`. Each operation carries its `operationId`, `method`, `fullPath`, and schema references.
- **Schema reference collection** — iterating over `body`, `query`, `params`, `headers`, `response` and collecting `kind: 'named'` refs is simple and covers all cases.
- **Shared schema detection** — tracking which modules reference each schema name and flagging those with 2+ modules as "shared" works well. The implementation is a straightforward `Map<string, Set<string>>`.

### What was harder than anticipated

- **Schema ownership detection**. The IR stores schemas in a flat `schemas[]` array on `AppIR`, not nested inside modules. Determining which module "owns" a schema required a heuristic: find a module whose routes reference that schema name from the same source file. This is fragile — it relies on `sourceFile` matching between `SchemaRef` and `SchemaIR`.

- **Schema collision detection**. The same-name-different-schema scenario requires comparing schemas across modules. The current IR doesn't explicitly track which module a schema belongs to (schemas are top-level on `AppIR`). We had to infer ownership through route references. This is the biggest design gap.

- **Inline schemas**. Routes can have `kind: 'inline'` schemas that have no name. These are invisible to the shared/collision detection logic. For codegen, inline schemas need to be given generated names (e.g., `CreateUserQuery` derived from `operationId + slot`).

### What needs to change in the design plan

- **Add `moduleName` to `SchemaIR`**. The IR should track which module defined each schema. This eliminates the fragile source-file heuristic for ownership detection.
- **Schema collision resolution strategy**: when two modules define `CreateBody`, the recommended approach is module-prefixed naming: `UsersCreateBody` and `OrdersCreateBody`. This should be done in the adapter, not the emitter.
- **Inline schema naming convention**: derive names from `operationId` + position (e.g., `listUsersQuery`, `createUserBody`). This keeps names predictable and LLM-friendly.

### Recommended approach

- The adapter should produce a fully resolved `AdaptedIR` where every schema has a unique name, all collisions are resolved, and shared schemas are identified. The emitters should not need to do any schema resolution.
- Consider making `adaptIR` a pipeline: flatten -> collect refs -> detect shared -> resolve collisions -> assign names to inline schemas.

---

## Unknown 3: Per-Module File Generation & Cross-Module Imports

### What worked as expected

- **Types file generation** — converting JSON schemas to `export type X = ...` declarations works end-to-end. The `jsonSchemaToTS` converter produces valid TypeScript that compiles.
- **Module file generation** — the `createXxxModule(client)` factory pattern works well. Each operation becomes a method that delegates to `client.request(method, path, options)`.
- **Client file generation** — composing modules via imports and a `createClient` factory is clean. The generated code compiles on the first try.
- **tsc compilation verification** — writing files to a temp dir and running `tsc --noEmit` works reliably. Test completes in ~155ms including file I/O and tsc invocation.

### What was harder than anticipated

- **Cross-module type imports**. In this POC, the module files don't actually import types — they use `unknown` for all request/response types. In production, we need module files to import specific types from the types files. This means the emitter needs to know which types each operation uses, and whether they come from the module's own types file or from `shared.ts`. This is the key complexity.

- **tsc binary location**. Using `npx tsc` fails in temp directories that don't have TypeScript installed. We had to resolve the tsc binary path relative to the compiler package's `node_modules`. For production, the codegen tool should either bundle tsc or require it as a peer dependency.

- **HttpClient interface duplication**. The POC duplicates the `HttpClient` interface in both module files and the client file. In production, this should be emitted once in a `common.ts` or `client-types.ts` file and imported everywhere.

### What needs to change in the design plan

- **Type-safe operation methods**: the generated module methods should have typed parameters and return types, not `unknown`. This requires wiring the adapted schema information through to the emitter. Each operation method should look like:
  ```typescript
  createUser(body: CreateUserBody): Promise<ReadUserResponse>
  ```
  not:
  ```typescript
  createUser(options?: { body?: unknown }): Promise<unknown>
  ```

- **Import graph**: the emitter needs an import resolution step that determines, for each generated file, what it needs to import and from where. This is a graph problem: `modules/users.ts` imports from `types/users.ts` and `types/shared.ts`; `client.ts` imports from all `modules/*.ts`.

- **File structure decisions**: the POC validated the `types/`, `modules/`, `client.ts` structure. This works well. Consider also generating a barrel `index.ts` that re-exports everything.

### Recommended approach

- Use a two-pass approach: (1) generate all type declarations and determine the import graph, (2) emit files with correct imports.
- The `emitModuleFile` function should accept a map of `operationId -> { params, query, body, response }` type names so it can generate typed methods.
- Consider using a code builder abstraction (array of lines with indent tracking) rather than raw string concatenation. The POC's line-by-line approach works but gets unwieldy for complex output.

---

## Overall Recommendations

1. **The JSON Schema to TS converter is production-ready in concept**. The recursive descent approach handles all patterns we need. Needs polish (multiline formatting, context object, better error handling for unsupported schemas) but the core algorithm is validated.

2. **The IR needs a small extension**: add `moduleName` to `SchemaIR` to make schema ownership explicit. This unblocks clean collision detection and shared schema identification.

3. **The adapter should be the "brains"** — it resolves all naming, detects all collisions, builds the import graph. Emitters should be dumb template engines that take fully resolved data and produce strings.

4. **The file generation approach works**. Per-module files with a composing client is a clean architecture. The tsc compilation test gives high confidence. The main gap is type-safe operation methods, which requires wiring schemas through the adapter to the emitters.

5. **Performance is not a concern**. All 36 tests complete in ~155ms, including tsc compilation. Schema conversion is essentially free. The bottleneck in production will be reading the IR and writing files, not the conversion logic.
