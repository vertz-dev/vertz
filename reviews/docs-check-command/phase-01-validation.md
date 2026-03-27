# Phase 1: Core Validation Logic + CLI Command

- **Author:** Claude Opus 4.6
- **Reviewer:** Adversarial Review Agent (Claude Opus 4.6)
- **Commits:** 5b769f8f6 (single commit)
- **Date:** 2026-03-27

## Changes

- `packages/docs/src/validate/docs-check.ts` (new) — core validation: sidebar ref checks, internal link extraction, frontmatter warnings
- `packages/docs/src/__tests__/docs-check.test.ts` (new) — 16 tests covering validateDocs + docsCheckAction
- `packages/docs/src/cli/actions.ts` (modified) — added `docsCheckAction` wrapper
- `packages/docs/src/index.ts` (modified) — barrel exports for new types and functions
- `packages/cli/src/commands/docs.ts` (modified) — added `docsCheckCommand` CLI wrapper with console output
- `packages/cli/src/cli.ts` (modified) — registered `docs check` subcommand
- `plans/docs-check-command.md` (new) — design doc with reviews

## CI Status

- [x] Quality gates passed at 5b769f8f6 (tests pass, typecheck clean, lint clean)

## Review Checklist

- [x] Delivers what issue #1835 asks for
- [x] TDD compliance (tests alongside implementation)
- [x] No security issues
- [x] Public API matches design doc at `plans/docs-check-command.md`
- [ ] No type gaps or missing edge cases (see findings)
- [ ] Test coverage is adequate (see findings)
- [x] Code follows existing patterns in the codebase
- [x] No regressions to existing functionality

## Findings

### Changes Requested

---

#### 1. BLOCKER: Missing changeset

The commit does not include a `.changeset/*.md` file. Per project policy (`.claude/rules/policies.md`), every change needs a changeset with `patch` severity. Both `@vertz/docs` and `@vertz/cli` are affected.

**Fix:** Add a changeset:

```md
---
'@vertz/docs': patch
'@vertz/cli': patch
---

feat(docs): implement `vertz docs check` validation command (#1835)
```

---

#### 2. SHOULD-FIX: No CLI wrapper tests for `docsCheckCommand`

The existing test file `packages/cli/src/commands/__tests__/docs.test.ts` tests `docsInitCommand`, `docsBuildCommand`, and `docsDevCommand` — but has zero tests for the new `docsCheckCommand`. The CLI wrapper in `packages/cli/src/commands/docs.ts` (lines 48-84) contains non-trivial logic:

- Console output formatting with unicode symbols
- Error/warning iteration
- Summary message logic (clean vs errors/warnings)
- Error-as-Result return when `errors.length > 0`

All of this is untested. This violates the 95%+ coverage target.

**Fix:** Add tests to `packages/cli/src/commands/__tests__/docs.test.ts` covering:
1. Clean project: prints checkmark + stats
2. Project with errors: prints errors, returns `err()`
3. Project with warnings only: prints warnings, returns `ok()`
4. Action failure: returns `err()`
5. Import failure: returns `err()`

---

#### 3. SHOULD-FIX: Trailing-slash links produce false-positive broken-link errors

A link like `[text](/quickstart/)` (with trailing slash) extracts to basePath `/quickstart/`, which does NOT match the knownPaths entry `/quickstart`. This produces a false-positive broken-link error for a link that would work fine in the browser (most static site servers strip trailing slashes).

**Fix:** Normalize trailing slashes before matching:

```ts
const basePath = `/${rawPath.split('#')[0]!.split('?')[0]!}`.replace(/\/$/, '') || '/';
```

---

#### 4. SHOULD-FIX: Links to root `/` are silently ignored

The regex `(?<!!)\[([^\]]+)\]\(\/((?:[^)\s])+)[^)]*\)` requires at least one character after the leading `/` in the capture group `((?:[^)\s])+)`. This means `[Home](/)` never matches and is never validated.

If the `index` page is removed from the sidebar but a link to `/` exists, the validator will NOT report it as broken. This contradicts the design goal of catching broken internal links.

**Fix:** Make the path capture optional or handle the `/` case separately. One approach:

```ts
const INTERNAL_LINK_RE = /(?<!!)\[([^\]]+)\]\(\/((?:[^)\s])*)[^)]*\)/g;
//                                                          ^ * instead of +
```

Then handle the empty-path case: when `rawPath` is empty, `basePath` becomes `/`.

---

#### 5. SHOULD-FIX: Duplicate `node:fs` imports

Lines 1-2 of `docs-check.ts`:

```ts
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
```

Should be consolidated into a single import statement. While not a bug, it violates the "one way to do things" principle and is inconsistent with every other file in the codebase.

**Fix:**

```ts
import { existsSync, readFileSync } from 'node:fs';
```

---

#### 6. NIT: Indented fenced code blocks not detected

The code-block detection (`line.startsWith('```')`) fails for indented fenced code blocks (e.g., inside a list item or blockquote: `  ```ts`). Links inside indented code blocks would be incorrectly flagged.

This is unlikely in practice because MDX docs rarely have indented fences. Documenting as NIT — acceptable to defer.

---

#### 7. NIT: Inline code containing links is matched

A line like `` Check `[Docs](/missing)` for details `` will extract `/missing` as an internal link, even though it's inside inline backticks and not a real link. Low probability in real docs content.

---

#### 8. NIT: `docsCheckAction` test uses dynamic `import()` for module loading

The test at line 351 uses `await import('../cli/actions')` instead of a static import. This is because the test file also tests `validateDocs` directly (static import from `../validate/docs-check`), and the action test needs `loadDocsConfig` to resolve against the temp directory. The dynamic import pattern works but is unusual — the other CLI action tests in the repo use `vi.mock` to mock the underlying action. This inconsistency is minor but worth noting.

---

#### 9. NIT: Missing test for `validateDocs` with pages in subdirectories

The design doc mentions sidebar pages can have paths like `guides/advanced`. No test exercises this case — all tests use flat page names (`index`, `quickstart`, `nonexistent`). A test with `pages: ['guides/getting-started']` and corresponding `pagesDir/guides/getting-started.mdx` would verify the `join(pagesDir, toFilePath(page))` logic works with nested directories.

---

## Summary

The core validation logic is sound and well-structured. The two-layer architecture (`validateDocs` pure function + `docsCheckAction` wrapper) is clean. Test coverage on `docs-check.ts` is 100%. The design doc is thorough.

**Blockers:** 1 (missing changeset)
**Should-fix:** 4 (CLI wrapper tests, trailing slash, root link, duplicate import)
**Nits:** 4

## Resolution

Pending — awaiting fixes for blocker and should-fix items.
