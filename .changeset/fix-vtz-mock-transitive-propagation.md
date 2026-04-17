---
'@vertz/runtime': patch
---

fix(vtz): vi.mock propagates through transitive imports (resolves #2731)

When a test file did `vi.mock('m', () => ({ fn: ... }))` and then drove
production code that itself called `await import('m')`, the production code
got the REAL frozen module namespace — `spyOn` mutations from the test
didn't propagate. Static imports of mocked modules were fine; only the
dynamic-import path leaked the real module.

Three concrete fixes, all needed together:

1. **Wrap dynamic `import()` in non-test files when the test runner is
   active.** The mock-hoisting compiler pass already wrapped dynamic imports
   in test files via `__vertz_unwrap_module` so frozen ES module namespaces
   become mutable; this PR extends the same wrap to every module compiled
   while `spy_exports` is on (i.e., the entire dependency graph during a
   `vtz test` run). Without it, `cli.ts → await import('@vertz/compiler')`
   bypassed the spy installed by `cli.test.ts`.

2. **Restore initial impl on `mockRestore()` for `mock(impl)`.** vtz had
   `mockRestore = mockReset` for plain mocks, which dropped the
   factory-supplied implementation to `null`. This broke the common pattern
   `vi.mock('m', () => ({ fn: mock(() => obj) }))` + `vi.restoreAllMocks()`
   in `afterEach` — the first cleanup nuked `fn`'s impl for every following
   test. Now matches vitest: "for `vi.fn(impl)`, `mockRestore` reverts to
   `impl`". `mockReset` still clears, as documented.

3. **Union synthetic-polyfill exports into the mock proxy.** When mocking a
   bare specifier with a vtz polyfill (esbuild, `node:*`), the proxy module
   only exported names declared on disk + names returned by the factory.
   CJS modules like esbuild expose nothing the regex-based extractor can see,
   so transitive imports of unmocked exports (`import { transformSync } from
   'esbuild'` in `@vertz/ui-server/bun-plugin`) failed at import time with
   "module does not provide an export named transformSync" — even when the
   call path never reached `transformSync()` at runtime. The proxy now
   advertises the full polyfill surface (values are `undefined` unless the
   factory supplied them), preserving spec-compliant import resolution.

Unskipped 3 test blocks that had been parked on this:
`packages/cli/src/__tests__/cli.test.ts` (codegen command action),
`packages/cli/src/production-build/__tests__/orchestrator.test.ts`
(BuildOrchestrator), and
`packages/cli/src/production-build/__tests__/ui-build-pipeline.test.ts`
(buildUI). 133/134 tests pass; one buildUI assertion that expects an actual
Brotli `.br` sidecar remains skipped because vtz's `node:zlib` polyfill is a
passthrough — tracked separately as a runtime polyfill gap, not a mock issue.
