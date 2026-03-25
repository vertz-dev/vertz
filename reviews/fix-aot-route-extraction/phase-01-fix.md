# Phase 1: Fix AOT Route Extraction

- **Author:** claude-opus-4-6
- **Reviewer:** claude-opus-4-6 (adversarial review)
- **Commits:** f0e1e3538
- **Date:** 2026-03-25

## Changes

- `packages/ui-compiler/src/prefetch-manifest.ts` (modified) -- added dynamic import, function call, and bare identifier handling to `extractComponentName` / `extractComponentNameFromExpr`; added `componentNameFromPath` helper
- `packages/ui-compiler/src/__tests__/prefetch-manifest.test.ts` (modified) -- 3 new test describe blocks (dynamic imports, function calls, bare identifiers)
- `packages/cli/src/production-build/ui-build-pipeline.ts` (modified) -- improved AOT bundle error logging with per-line output and stack traces

## CI Status

- [x] Quality gates passed (39 tests pass, 0 fail, typecheck clean)

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests before/alongside implementation)
- [ ] No type gaps or missing edge cases -- **findings below**
- [x] No security issues
- [x] Public API changes match design doc (N/A -- internal-only change)

## Findings

### Should-Fix #1: Missing test for `() => HomePage` (arrow returning bare identifier)

**Severity:** should-fix

The issue mentions `component: () => HomePage` as a pattern (bare identifier). The implementation handles this in `extractComponentNameFromExpr` at lines 205-206. However, the test only covers `component: HomePage` (no arrow function), which hits the path in `extractComponentName` (line 176-177), not `extractComponentNameFromExpr`.

The `() => HomePage` pattern (arrow body returning an identifier without calling it) is never tested. Coverage confirms lines 205-206 are uncovered (from the `90.57%` report: uncovered lines include `205-208`).

Add a test case:
```ts
describe('Given routes with arrow returning bare identifier', () => {
  const source = `
    import { defineRoutes } from '@vertz/ui';
    import { HomePage } from './pages/home-page';
    export const routes = defineRoutes({
      '/': { component: () => HomePage },
    });
  `;
  // ...expect componentName === 'HomePage'
});
```

### Should-Fix #2: `componentNameFromPath` returns empty string for edge cases

**Severity:** should-fix

`componentNameFromPath` produces empty strings for several plausible inputs:
- `'./'` or `'./pages/'` (trailing slash) -- `split('/').pop()` returns `''`
- `'.'` (relative current dir) -- returns `'.'` after PascalCase, which is not a valid component name

While these are unlikely in practice (nobody writes `import('.')`), the function has a return type of `string` (not `string | undefined`), and an empty-string component name would produce a route entry with `componentName: ''`. Downstream, `generatePrefetchManifest` calls `importMap.get('')` which would fail silently.

Recommendation: return `undefined` from `componentNameFromPath` when the result is empty or nonsensical, and have `extractComponentNameFromExpr` propagate the `undefined`. Alternatively, add a guard: `if (!name || name === '.') return undefined;` and change the return type to `string | undefined`.

### Should-Fix #3: `componentNameFromPath` does not handle underscored names

**Severity:** should-fix

`componentNameFromPath` only splits on `-` for PascalCase conversion. A path like `./pages/home_page` produces `Home_page` (lowercase `p`, underscore preserved). While kebab-case is the dominant convention, snake_case is common enough that this could surprise users.

Recommendation: split on `[-_]` instead of just `-`:
```ts
return name
  .split(/[-_]/)
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join('');
```

### Nit #1: `import('./pages/home').then(m => m.default)` silently falls through

**Severity:** nit

The `import().then()` chaining pattern (common for lazy loading with default exports) is not handled. The expression is a `CallExpression` with a `PropertyAccessExpression` callee (`.then()`), which doesn't match either the `ImportKeyword` check or the `isIdentifier(expr.expression)` check. It falls through to `return undefined`.

This is acceptable for now (the issue doesn't mention `.then()` chaining), but worth noting as a known gap for a follow-up.

### Nit #2: Block-body arrow functions silently produce no route

**Severity:** nit

`async () => { const m = await import('./pages/home'); return m.default; }` -- the arrow body is a `Block`, not an `Expression`. The `as ts.Expression` cast on line 173 is technically unsound (a `Block` is not an `Expression`). In practice this is safe because all the `ts.is*` checks return `false` for a `Block` node, but it's a type-level lie.

Consider adding an early `if (ts.isBlock(expr.body)) return undefined;` before the cast for clarity, or use `ts.isExpression(expr.body)` as a guard.

### Nit #3: Error logging could use `console.error` instead of `console.log`

**Severity:** nit

In `ui-build-pipeline.ts`, the AOT bundle failure and manifest generation failure messages are logged via `console.log`. Since these are error conditions, `console.error` would be more appropriate and would show up correctly in CI log parsers that filter by stderr.

This is a pre-existing pattern throughout the file (all warnings use `console.log`), so not a regression.

### Approved: Error logging improvement

The change from single-line swallowed errors to multi-line detailed output with stack traces is a clear improvement. The fallback path (`No detailed error info from Bun.build()`) handles the case where `bundleResult.logs` is empty.

## Resolution

**Should-fix #1** (missing test for `() => HomePage`) is the most important finding -- it's a gap in test coverage for code that was explicitly added in this commit.

**Should-fix #2** and **#3** are defensive improvements that prevent surprising behavior for edge-case inputs. They can be addressed in this PR or tracked as a follow-up.

**Nits** are informational and can be deferred.

**Verdict: Changes Requested** -- should-fix #1 must be addressed (uncovered code path added without a test). Should-fix #2 and #3 are recommended.
