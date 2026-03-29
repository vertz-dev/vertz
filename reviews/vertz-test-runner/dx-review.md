# DX Review: Vertz Test Runner

- **Reviewer:** DX Agent
- **Date:** 2026-03-28
- **Document:** plans/vertz-test-runner.md Rev 1

## Review Checklist

- [x] API is intuitive and follows familiar patterns
- [ ] Migration path is clear and incremental
- [ ] Error messages are developer-friendly
- [x] Configuration is minimal and sensible defaults
- [x] CLI flags are consistent with other vertz commands
- [ ] No unnecessary cognitive overhead

## Findings

### Blockers

#### B1: `vertz:test` import specifier is a discoverability hazard

The design uses `vertz:test` as the import path. This is a protocol-style specifier (like `node:test`, `bun:test`), which makes sense conceptually but creates a real discoverability problem:

1. **Developers will try `@vertz/test` first.** The codebase already has `@vertz/testing` as a package. The natural muscle memory for anyone in the Vertz ecosystem is `@vertz/<thing>`. An LLM prompted with "write a Vertz test" will try `@vertz/test` or `import from '@vertz/testing'` before guessing a protocol specifier.

2. **TypeScript needs a declaration file or `paths` mapping.** Protocol specifiers like `vertz:test` don't resolve through `node_modules`. The doc says nothing about how TypeScript will resolve this. Will there be a `@types/vertz__test` package? A `paths` entry in `tsconfig.json`? A global `.d.ts` bundled with `@vertz/cli`? Without this, every developer's IDE will show red squiggles on `import { describe } from 'vertz:test'` until they figure out the magic incantation.

3. **Principle 3 violation: "Can an LLM use this correctly on the first prompt?"** An LLM has trained on millions of files importing from `vitest`, `jest`, `@jest/globals`, `bun:test`, `node:test`. The `vertz:test` specifier has zero training data. The LLM will hallucinate `@vertz/test` or `@vertz/testing`.

**Recommendation:** Either (a) make `@vertz/test` a real thin package that re-exports the runtime globals, OR (b) specify exactly how TypeScript resolution works for `vertz:test` and ensure `create-vertz-app` scaffolds include it. Option (a) is strongly preferred -- it follows the existing `@vertz/*` pattern and requires zero TypeScript configuration magic.

#### B2: Three mocking APIs violates "One way to do things" (Principle 2)

The design exports `mock()`, `spyOn()`, AND `vi.fn()` / `vi.spyOn()` from the same module. This is three ways to create a mock function:

```typescript
const a = mock(() => 42);              // vertz:test mock()
const b = vi.fn(() => 42);             // vitest-style
const c = vi.fn().mockReturnValue(42); // vitest-style variant
```

And two ways to spy:
```typescript
spyOn(obj, 'method');    // top-level
vi.spyOn(obj, 'method'); // namespace
```

The codebase audit shows `vi` is imported in only ~8 files (CLI package), while `mock` is imported in 64 files. The `vi` namespace is the minority pattern.

**Recommendation:** Pick ONE mocking API. Since the codebase overwhelmingly uses `mock()` + `spyOn()`, make those the primary API. Drop `vi` entirely, or make it a deprecated compat alias. The codemod should rewrite `vi.fn()` to `mock()` and `vi.spyOn()` to `spyOn()`.

### Should Fix

#### S1: Migration codemod scope is underspecified

Missing:
1. `vi` to `mock`/`spyOn` rewriting (if B2 accepted)
2. `Bun.file()` in preload scripts -- the example uses it but it won't work
3. Rollback path -- migration is one-way per file, should be explicit
4. Custom matcher migration -- 8 custom matchers not addressed

**Recommendation:** Add a "Migration Checklist" section with before/after examples for each transformation.

#### S2: Error message format is unspecified

The doc never specifies what a human sees when a test fails. Needs:
- Diff coloring for expected vs received
- Source code context (show the failing line)
- Stack trace with mapped source positions
- Structured diff for `toEqual` deep comparison

**Recommendation:** Add a "Terminal Reporter Output Format" section with concrete examples.

#### S3: Watch mode UX needs more detail

Missing: terminal layout, keyboard shortcuts (q to quit, a to run all), new file detection, debounce/batching for multi-file saves.

#### S4: `concurrency: 0` as sentinel for "CPU cores" is unintuitive

A developer reading `concurrency: 0` without the comment will think "no concurrency" (sequential).

**Recommendation:** Use `'auto'` or `undefined` for the default. Type: `number | 'auto'`.

#### S5: Preload section given equal weight to core API -- demote it

Preloads are transitional. New projects won't need them. Move to appendix or "Migration" section with bold note.

#### S6: Performance target of "within 1.5x of bun test" is underwhelming

For a project whose Vision says "Performance is not optional," accepting 50% slower is a significant concession. Tighten the DoD or add a follow-up optimization phase.

### Nice to Have

#### N1: `it.skip`, `it.only`, `describe.skip`, `describe.only` not mentioned

Critical for development workflow. Should arguably be promoted to should-fix.

#### N2: `it.todo` for TDD workflow

Natural fit for Vertz's strict TDD mandate.

#### N3: `--only-changed` flag for CI optimization

Git-aware test selection via module graph.

#### N4: `expect.soft()` for non-fatal assertions

Continue test after failure, collect all failures.

#### N5: Structured JSON error output schema should be specified

For LLM-native design (Principle 3): file path, line, column, expected, received, matcher name, assertion expression.

#### N6: Snapshot testing noted as non-goal but may matter for external users

Note as potential future phase.

#### N7: `vertz test --typecheck` to run only `.test-d.ts` files

Fast feedback on type changes without waiting for runtime tests.

## Verdict: Changes Requested

The design is solid architecturally. Two blockers must be addressed:

1. **B1**: `vertz:test` import specifier needs a TypeScript resolution story AND LLM discoverability. Simplest fix: make `@vertz/test` a real package.
2. **B2**: Three-way mocking API violates Principle 2. The codebase already voted: `mock()` + `spyOn()`.
