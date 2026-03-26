# Phase 8: Integration + Bun Plugin Swap + Benchmarks

- **Author:** claude-code
- **Reviewer:** review-agent
- **Commits:** ac748cd69
- **Date:** 2026-03-26

## Changes

- `packages/ui-server/src/bun-plugin/native-compiler-loader.ts` (new) — Loads native .node binary with two-strategy resolution
- `packages/ui-server/src/bun-plugin/plugin.ts` (modified) — Adds native compiler branch in compile step
- `packages/ui-server/src/__tests__/native-compiler-loader.test.ts` (new) — Loader unit tests
- `packages/ui-server/src/__tests__/native-compiler-plugin-integration.test.ts` (new) — Plugin integration tests
- `native/vertz-compiler/__tests__/cross-compiler-equivalence.test.ts` (new) — Cross-compiler comparison tests
- `native/vertz-compiler/__tests__/benchmark.test.ts` (new) — Performance benchmark tests
- `native/vertz-compiler/package.json` (modified) — Added `@vertz/ui-compiler` devDependency
- `package.json` (modified) — Added `native/*` to workspaces

## CI Status

- [x] Quality gates passed at ac748cd69

## Review Checklist

- [x] Does the loader correctly handle all platforms and failure cases?
- [ ] Is the plugin integration correct? No double-application of transforms? — **ISSUE: manifests gap**
- [x] Are the source maps correctly handled (native returns JSON string, not object)?
- [ ] Are diagnostics correctly adapted between native and TS formats? — **ISSUE: shape mismatch**
- [ ] Do the equivalence tests cover enough scenarios? — **ISSUE: missing cross-file reactivity test**
- [x] Are the benchmark tests meaningful and the assertions reasonable?
- [x] Any security issues (path traversal, command injection, etc.)? — None found
- [ ] Are there test coverage gaps? — **ISSUE: several gaps**
- [x] Does the feature flag work correctly in all edge cases?
- [x] Are there any race conditions or state management issues? — None found

## Findings

### Changes Requested

---

#### BLOCKER 1: Native compiler does not receive `manifests` — cross-file reactivity will silently break

**Files:** `plugin.ts` (line 384), `native-compiler-loader.ts` (NativeCompileOptions interface)

The ts-morph path passes `manifests: getManifestsRecord()` to `compile()`. The native path does not — the `NativeCompileOptions` interface has no `manifests` field at all, and the Rust compiler has no manifest support (confirmed: zero references to "manifest" in `native/vertz-compiler/src/`).

**Impact:** When a user defines a custom hook that returns an object with signal properties (e.g., `useTaskStore()` returning `{ tasks: Signal<Task[]> }`), the ts-morph compiler uses manifests to know which properties need `.value` insertion. The native compiler will NOT insert `.value`, producing silently incorrect code. The reactivity will just... not work. No error, no warning, just broken UI.

**Severity:** This is the most critical issue. Cross-file reactivity is a core feature of the compilation pipeline, and the native compiler silently degrades it.

**Fix options:**
1. (Preferred) Add a `manifests` option to the native compiler's NAPI interface and pass the same manifest data through.
2. (Acceptable if manifests can't be passed yet) Log a warning when the native compiler is used and manifests are non-empty: `[vertz-bun-plugin] WARNING: Native compiler does not support cross-file reactivity manifests. N user modules with exported signal APIs will not be correctly compiled. Falling back to ts-morph for these files, or set VERTZ_NATIVE_COMPILER=0.`
3. (Minimum) Document this limitation clearly in the phase review and create a tracking issue.

---

#### BLOCKER 2: Diagnostic shape mismatch — native adapter drops `code`, `severity`, and `fix` fields

**Files:** `plugin.ts` (lines 395-399), `native-compiler-loader.ts` (NativeCompileResult interface)

The ts-morph `CompilerDiagnostic` interface (`ui-compiler/src/types.ts:48-61`) has these fields:
```ts
interface CompilerDiagnostic {
  code: string;       // Unique diagnostic code
  message: string;    // Human-readable message
  severity: DiagnosticSeverity;  // 'error' | 'warning' | 'info'
  line: number;       // 1-based
  column: number;     // 0-based
  fix?: string;       // Optional fix suggestion
}
```

The native adapter maps diagnostics to only `{ message, line, column }`, dropping `code`, `severity`, and `fix`. While `compileResult.diagnostics` is currently unused in the plugin pipeline (not logged, not surfaced), this creates a latent type mismatch: any future consumer expecting the full `CompilerDiagnostic` shape will get incomplete data from the native path.

**Fix:** Either:
- Extend the native compiler's diagnostic output to include `code` and `severity` (at minimum), OR
- Type the native adapter's diagnostics as a distinct narrower type and update the return shape accordingly, making it explicit that the native path returns fewer diagnostic fields.

---

#### SHOULD-FIX 1: No test coverage for platform/arch branching in loader

**File:** `native-compiler-loader.ts` (lines 56-58)

The platform mapping silently collapses all non-darwin platforms to `'linux'` and all non-arm64 architectures to `'x64'`:
```ts
const platform = process.platform === 'darwin' ? 'darwin' : 'linux';
const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
```

This means on Windows (`win32`), the loader looks for `vertz-compiler.linux-x64.node` — which will fail to load. The code handles this gracefully (returns null), but there are no tests verifying the platform/arch logic, and no warning that Windows is not supported.

**Fix:** Add a test that verifies the binary name construction for at least darwin-arm64 and linux-x64. Consider logging a debug-level message when the binary is not found after both strategies fail, mentioning the platform/arch that was tried.

---

#### SHOULD-FIX 2: Cross-compiler equivalence tests don't cover cross-file reactivity

**File:** `cross-compiler-equivalence.test.ts`

All 14 test scenarios use single-file components. None tests what happens when a component imports a custom hook or barrel re-export that the manifest system would classify as having signal properties. This is exactly the scenario where BLOCKER 1 would cause divergent behavior.

**Fix:** Add at least one equivalence test that demonstrates the manifest gap:
```ts
describe('Given a component importing a custom hook with signal properties', () => {
  it('Then both compilers handle signal property access', () => {
    // This test would currently FAIL, proving the manifests gap
    const source = `import { useTaskStore } from './stores';
function TaskList() {
  const store = useTaskStore();
  return <div>{store.tasks}</div>;
}`;
    // TS compiler with manifests: inserts store.tasks.value
    // Native compiler without manifests: leaves store.tasks as-is
  });
});
```

This test would serve as documentation of the known limitation and a regression test for when manifest support is added.

---

#### SHOULD-FIX 3: Loader test coverage gaps

**File:** `native-compiler-loader.test.ts`

Missing test scenarios:
1. **`VERTZ_NATIVE_COMPILER` set to values other than '0' and '1'** (e.g., `'true'`, `'yes'`, empty string `''`). The loader checks `!== '1'`, so `'true'` returns null — is this intentional?
2. **Strategy fallback order** — No test verifies that Strategy 1 (npm resolution) is tried before Strategy 2 (directory walk).
3. **Binary exists but `require()` throws** — Strategy 2 has a `catch` returning null (line 77-78), but there's no test for corrupt binaries.
4. **Environment cleanup** — The `afterEach` uses `originalEnv` captured once at describe-block level, not per-test. If tests run in parallel or the describe block is nested differently, this could leak state.

---

#### SHOULD-FIX 4: Plugin integration test uses `runPluginOnLoad` that may miss the native handler

**File:** `native-compiler-plugin-integration.test.ts` (line 51)

The `runPluginOnLoad` helper captures the first handler whose `filter` string includes `'tsx'`. This is fragile — if another `onLoad` handler is registered first (e.g., the `.ts` route-splitting handler), or if the filter regex representation changes, the test would capture the wrong handler.

**Fix:** Make the handler selection more robust by checking the filter matches `.tsx` files explicitly, or capture all handlers and find the one whose filter matches the test file path.

---

#### NICE-TO-HAVE 1: Benchmark tests hardcode `darwin-arm64` binary path

**File:** `benchmark.test.ts` (line 15), `cross-compiler-equivalence.test.ts` (line 18)

Both test files hardcode the binary path as `vertz-compiler.darwin-arm64.node`. This means these tests can only run on macOS ARM64 machines. While this is acceptable for the current dev setup, it would be cleaner to compute the binary name from `process.platform` and `process.arch` (matching the loader's logic), enabling CI to run these tests on multiple platforms in the future.

---

#### NICE-TO-HAVE 2: Benchmark 5x threshold is conservative relative to documented expectations

**File:** `benchmark.test.ts`

The module docstring says "20-50x faster" and the PR title promises the same, but the assertions only check `> 5x`. While conservative thresholds prevent flaky tests on slow CI runners, the gap between documented performance (20-50x) and tested threshold (5x) is large. Consider adding a softer logged-but-not-asserted check at the 15x level to catch unexpected performance regressions that still pass the 5x bar.

---

#### NICE-TO-HAVE 3: Native compiler loaded once at construction — no hot toggle

**File:** `plugin.ts` (line 215)

`tryLoadNativeCompiler()` is called once when `createVertzBunPlugin()` is invoked. The result is captured as a `const` in the closure. This means:
- Setting `VERTZ_NATIVE_COMPILER=1` after the dev server starts has no effect
- Toggling the env var during development requires a full server restart

This is fine for the feature-flag use case (you'd restart the server anyway), but it's worth documenting.

---

## Summary

| # | Type | Finding | Severity |
|---|------|---------|----------|
| B1 | Correctness | Native compiler has no manifest support — cross-file reactivity silently broken | BLOCKER |
| B2 | Type safety | Diagnostic adapter drops `code`, `severity`, `fix` fields | BLOCKER |
| S1 | Coverage | No tests for platform/arch logic in loader | SHOULD-FIX |
| S2 | Coverage | No cross-file reactivity equivalence test | SHOULD-FIX |
| S3 | Coverage | Multiple loader test gaps | SHOULD-FIX |
| S4 | Robustness | Plugin integration test handler selection is fragile | SHOULD-FIX |
| N1 | Portability | Hardcoded darwin-arm64 in test binary paths | NICE-TO-HAVE |
| N2 | Benchmarks | 5x threshold vs 20-50x documented expectation gap | NICE-TO-HAVE |
| N3 | Documentation | Native compiler not hot-toggleable | NICE-TO-HAVE |

**Verdict: Changes Requested** — B1 (manifests gap) is a silent correctness issue that will bite any user with custom hooks or barrel exports. B2 is a type contract issue that will cause problems when diagnostics are surfaced. Both need to be addressed before this phase can be considered done.

## Resolution

<To be filled after fixes>
