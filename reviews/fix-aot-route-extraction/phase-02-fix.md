# Phase 2: AOT Helper Imports and Query Scope Leaks Fix

- **Author:** Claude Opus 4.6
- **Reviewer:** Claude Opus 4.6 (adversarial)
- **Commits:** c8da71672..b2d35b096
- **Date:** 2026-03-25

## Changes

- packages/ui-compiler/src/transformers/aot-string-transformer.ts (modified)
- packages/ui-compiler/src/__tests__/aot-compiler.test.ts (modified)
- packages/ui-server/src/aot-manifest-build.ts (modified)
- packages/ui-server/src/__tests__/aot-manifest-build.test.ts (modified)

## CI Status

- [x] Quality gates passed at b2d35b096

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests before/alongside implementation)
- [ ] No type gaps or missing edge cases (see findings)
- [x] No security issues (injection, XSS, etc.)
- [x] Public API changes match design doc (no public API changes)

## Findings

### Should-Fix: Derived alias regex can match property accesses (#S1)

**Severity:** should-fix

The word-boundary regex `\b${alias}\b` used for derived alias replacement (line 272 of `aot-string-transformer.ts`) will incorrectly replace property access chains where the property name matches the alias.

Example: if `const d = q.data` creates alias `d`, and the JSX contains `{someObj.d}`, the string expression `someObj.d` would be replaced with `someObj.__q0` because `\b` treats `.` as a non-word character, so `\bd\b` matches the `d` in `someObj.d`.

**Fix:** Use a negative lookbehind to exclude property access positions:

```ts
stringExpr = stringExpr.replace(new RegExp(`(?<!\\.)\\b${alias}\\b`, 'g'), localVar);
```

**Risk assessment:** Low probability in practice (property names rarely collide with local variable aliases), but a correctness issue that could produce silent incorrect HTML output at runtime. Worth fixing to be safe.

### Nit: Helper import added unconditionally (#N1)

**Severity:** nit

`generateAotBarrel` adds the `import { __esc, __esc_attr, ... }` line even when the `routeMap` is empty (no functions to export). An unused import won't cause a bundle failure (tree-shaking removes it), but it's slightly wasteful.

Not blocking since this only occurs in a degenerate case (no routes at all), and Bun's bundler handles it.

### Nit: No test for alias-as-property-access false positive (#N2)

**Severity:** nit

Related to #S1. There is no test verifying that `\bd\b` does NOT match inside property access expressions like `obj.d`. Adding such a test would both document the expected behavior and catch the regression described in #S1.

### Nit: No test for multiple derived aliases (#N3)

**Severity:** nit

There is no test for a component with multiple derived aliases from the same query variable, e.g.:
```ts
const d = q.data;
const d2 = q.data;
```

The implementation handles this correctly (the `aliases` array collects all such declarations), but a test would prevent regression.

### Nit: Strategy 1 vs Strategy 2 precedence (#N4)

**Severity:** nit (pre-existing)

When `query(api.games.list(), { key: 'home-games' })` is used, Strategy 1 (api chain) wins and extracts `games-list`, ignoring the explicit `{ key: 'home-games' }`. Whether the explicit key should take precedence is a design question, but the current behavior silently ignores the user's intent. This is pre-existing and not introduced by this commit.

## Summary

The commit delivers all three fixes described in issue #1880:

1. **Helper imports** -- `generateAotBarrel` now correctly includes `import { __esc, __esc_attr, __ssr_spread, __ssr_style_object } from '@vertz/ui-server'` in the barrel source. Test added.

2. **Cache key extraction** -- `_extractQueryVars` now extracts cache keys from `{ key: '...' }` options objects as a fallback when the `api.entity.operation()` pattern is not present. Test added for both the happy path and the runtime-fallback case.

3. **Derived alias replacement** -- `const d = q.data` aliases are tracked in `derivedAliases` and replaced with `__q{N}` using word-boundary regex in the emitted AOT function. Existing tests updated to use `createMockCtx` for runtime correctness verification.

The runtime-fallback detection (line 117-128) correctly handles the case where a signal API variable with `data` (e.g., `createLoader`) can't be resolved by `_extractQueryVars`.

**One should-fix finding** (#S1): the word-boundary regex for alias replacement can false-positive on property accesses (e.g., `obj.d` when alias is `d`). Fix with negative lookbehind `(?<!\\.)`.

## Resolution

Pending resolution of #S1.
