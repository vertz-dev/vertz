# Public API Validation

## Context

Added after the EDA v0.1.0 Developer Walkthrough revealed three type system bugs that were invisible to the internal E2E test. The E2E test used relative imports (`../../create-server`, `../entity`) instead of package imports (`@vertz/server`, `@vertz/db`), so cross-package type issues — duplicate `PhantomType` symbols from bundler inlining, invariant hook types in `EntityDefinition`, and a loose `ServerConfig.entities` type — were never caught. The root `tsconfig.json` excludes `**/*.test.ts`, so tests are never typechecked by the package-level `bun run typecheck`. `bun test` doesn't typecheck at all. The result: runtime worked, types were broken, and nobody knew until the walkthrough was finally written.

## Rules

### 1. Integration tests must use public package imports

Every integration test that validates a feature's public API **must import exclusively from published package names** (`@vertz/server`, `@vertz/db`, etc.). Relative imports (`../`, `../../`) are only acceptable for test utilities within the same package.

**Review gate question:** Does any integration test use a relative import to reach a public API? If yes, the public API surface is untested — the test must be rewritten with package imports.

### 2. Walkthrough test is Phase 1, not Phase N+1

The Developer Walkthrough test (required by `definition-of-done.md`) must be written **at the start of the feature**, not after implementation is complete. Write it as a failing test in `packages/integration-tests/` during Phase 1:

1. Create the walkthrough test file with public package imports
2. It will fail to compile or fail at runtime — that's the RED state
3. Implementation phases make it pass incrementally
4. The feature is done when the walkthrough is GREEN (runtime + typecheck)

This applies the same TDD principle the codebase follows at the function level — but at the feature level. A walkthrough written after the fact is a checkbox exercise. A walkthrough written first is a specification.

### 3. Cross-package typecheck is mandatory

The root `tsconfig.json` excludes `**/*.test.ts`. This means package-level `bun run typecheck` does **not** catch type issues in test files. The `@vertz/integration-tests` package overrides this exclusion so its tests ARE typechecked — but only if its typecheck is explicitly run.

**Before merging any feature branch to main**, run:

```bash
bun run typecheck --filter @vertz/integration-tests
```

This catches type issues that cross package boundaries (bundler-inlined types, mismatched generic constraints, variance problems) which per-package typechecks miss.

### 4. Dependencies that appear in public types must be in `dependencies`

If a package's **public type signatures** reference types from another package, that package must be in `dependencies` (not `devDependencies`). Bundlers like `bunup` externalize `dependencies` but inline `devDependencies`. Inlining types that contain `unique symbol` declarations creates duplicate symbols across package boundaries, breaking type compatibility.

**Check:** For every `import type { X } from '@vertz/foo'` in a package's source, verify `@vertz/foo` is in `dependencies`. If it's in `devDependencies` and any imported type appears in the package's public API (exported types, function signatures, interface properties), move it to `dependencies`.
