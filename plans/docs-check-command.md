# `vertz docs check` — Validation Command

> Implements the `vertz docs check` CLI command from Phase D of `plans/docs-framework-phase2.md` (issue #1835).

## API Surface

### CLI

```bash
# Run all validations
vertz docs check

# From a specific directory
vertz docs check --dir ./my-docs
```

Output example (errors):
```
✗ Broken sidebar reference: "guides/nonexistent" (tab: Guides, group: Getting Started)
  File not found: pages/guides/nonexistent.mdx

✗ Broken internal link in pages/quickstart.mdx:
  [API Reference](/api/missing) → no page matches /api/missing

Found 2 error(s), 0 warning(s).
```

Output example (warnings):
```
⚠ Missing frontmatter "description" in pages/quickstart.mdx

Found 0 error(s), 1 warning(s).
```

Output example (clean):
```
✓ All checks passed (12 pages, 8 internal links checked).
```

Exit code: `1` if errors, `0` if only warnings or clean.

### Programmatic API

```ts
import { docsCheckAction, type DocsCheckResult } from '@vertz/docs';

const result = await docsCheckAction({ projectDir: '/path/to/docs' });
// result: Result<DocsCheckResult, Error>

if (result.ok) {
  const { errors, warnings, stats } = result.data;
  // errors: DocsCheckDiagnostic[]
  // warnings: DocsCheckDiagnostic[]
  // stats: { pages: number; internalLinks: number }
}
```

### Types

```ts
export interface DocsCheckOptions {
  projectDir: string;
}

export interface DocsCheckDiagnostic {
  type: 'broken-sidebar-ref' | 'broken-internal-link' | 'missing-frontmatter';
  severity: 'error' | 'warning';
  message: string;
  /** The sidebar page entry or MDX file path causing the issue. */
  source: string;
  /** For links: the broken href. For sidebar: the missing file path. */
  target?: string;
}

export interface DocsCheckResult {
  errors: DocsCheckDiagnostic[];
  warnings: DocsCheckDiagnostic[];
  stats: { pages: number; internalLinks: number };
}
```

## Manifesto Alignment

- **Principle 1 (If it builds, it works):** `docs check` is a compile-time validation step — catches broken references before deploy rather than serving 404s at runtime.
- **Principle 2 (One way to do things):** Single command to validate all docs integrity. No separate link-checker, no manual file audits.
- **Principle 3 (AI agents are first-class users):** Machine-parseable diagnostics with structured `type` field. Clear error messages an agent can act on.
- **Principle 4 (Test what matters):** Validates the things that actually break — missing files and dead links. Frontmatter is a warning, not an error, because it doesn't break the site.

### Tradeoffs

- **Errors vs warnings:** Broken sidebar refs and broken internal links are errors (they produce 404s or missing content). Missing optional frontmatter (like `description`) is a warning only — the page renders fine without it.
- **Internal links only:** We don't validate external URLs (network-dependent, slow, flaky). Only `/path`-style internal links.
- **No anchor validation:** We validate that the target page exists but don't check whether `#heading-id` anchors exist within that page. Anchor validation would require parsing heading IDs from every page — complexity not justified for v0.1.x.

### What was rejected

- **JSON/GitHub output format:** Premature for v0.1.x. Text output is sufficient. Can add `--format json` later if needed.
- **Auto-fix mode:** No auto-fixing of broken refs — too risky. Just report.
- **External link checking:** Network-dependent, slow, belongs in a separate tool/CI step. Was considered in the original design doc as `--external-links` flag — deferred consciously.
- **Reference-style link validation:** `[text][ref]` with `[ref]: /path` defined elsewhere. Edge case not common in our docs.
- **HTML anchor validation:** `<a href="/path">` in MDX. Not used in our docs convention.

## Non-Goals

- External URL validation (network-dependent, deferred as `--external-links`)
- Anchor/heading-id validation within pages
- Auto-fixing broken references
- Custom validation rules or plugins
- Integration with CI annotations (GitHub Actions `::error` format) — can be added later
- Reference-style markdown links (`[text][ref]` with `[ref]: /path`)
- HTML `<a>` tag validation in MDX content

## Implementation Details

### Sidebar file path normalization

Sidebar `pages` entries may or may not include the `.mdx` extension (e.g., `'quickstart'` vs `'quickstart.mdx'`). The validator normalizes as follows:
- If `route.filePath` ends with `.mdx`, use as-is: `join(pagesDir, route.filePath)`
- Otherwise, append `.mdx`: `join(pagesDir, route.filePath + '.mdx')`

This matches the convention used in `build-pipeline.ts` and `resolveRoutes()`.

### Internal link extraction regex

The regex for extracting internal links from MDX content:
```
/(?<!!)\[([^\]]+)\]\(\/((?:[^)\s])+)[^)]*\)/g
```

Key behaviors:
- Only matches absolute internal links starting with `/`
- Skips image links (`![]()`)
- Handles title attributes: `[text](/path "title")` — captures only `/path`, not `"title"`
- The captured path excludes the leading `/` — validator prepends `/` before matching against `route.path`

### Path normalization for matching

Before matching a link target against the route set:
1. Strip anchors: `/path#section` → `/path`
2. Strip query strings: `/path?tab=examples` → `/path`
3. Prepend `/` to the captured regex group: `api/overview` → `/api/overview`
4. Match against `route.path` from `resolveRoutes()`

### Two-layer architecture

- `validateDocs(config: DocsConfig, pagesDir: string): DocsCheckResult` — pure validation function, easy to unit test with in-memory config.
- `docsCheckAction({ projectDir }): Result<DocsCheckResult, Error>` — thin wrapper that loads config via `loadDocsConfig()`, then calls `validateDocs()`.

Tests use `validateDocs()` directly with fixture configs, avoiding filesystem overhead of writing real `.ts` config files for every test case.

### Deduplication

Diagnostics are reported once per unique `(source file, target)` pair. If the same broken link appears 3 times in one file, it's reported once. If the same broken link appears in 2 different files, it's reported twice (once per file). `stats.internalLinks` counts total unique internal links checked across all files.

### `--dir` flag

Uses the same pattern as `docs init` (the only other docs command that accepts `--dir`). `docs build` and `docs dev` use `cwd()` — this asymmetry is intentional since `check` and `init` are project-locating commands.

## Unknowns

None identified. All building blocks exist:
- `loadDocsConfig()` loads sidebar config
- `resolveRoutes()` converts sidebar → routes with file paths
- `parseFrontmatter()` extracts frontmatter
- Internal link regex adapted from `rewriteInternalLinks()` in `llm-markdown.ts`

## POC Results

No POC needed — this is a validation tool, not an architectural change.

## Type Flow Map

```
DocsCheckOptions
  → loadDocsConfig() → DocsConfig
  → resolveRoutes(config.sidebar) → PageRoute[]
  → validateSidebarRefs(routes, pagesDir) → DocsCheckDiagnostic[]
  → validateInternalLinks(routes, pagesDir) → DocsCheckDiagnostic[]
  → validateFrontmatter(routes, pagesDir) → DocsCheckDiagnostic[]
  → DocsCheckResult { errors, warnings, stats }
```

No generics — plain data flow. Types flow linearly from config to diagnostics.

## E2E Acceptance Test

```ts
import { describe, expect, it } from 'bun:test';
import { docsCheckAction } from '@vertz/docs';

describe('Feature: vertz docs check', () => {
  describe('Given a docs project with a broken sidebar reference', () => {
    describe('When running docsCheckAction', () => {
      it('Then returns an error diagnostic for the missing file', async () => {
        // Setup: temp dir with vertz.config.ts referencing "nonexistent" page
        const result = await docsCheckAction({ projectDir: tmpDir });
        expect(result.ok).toBe(true);
        expect(result.data.errors).toContainEqual(
          expect.objectContaining({
            type: 'broken-sidebar-ref',
            source: 'nonexistent',
          }),
        );
      });
    });
  });

  describe('Given a docs project with a broken internal link', () => {
    describe('When running docsCheckAction', () => {
      it('Then returns an error diagnostic for the dead link', async () => {
        // Setup: temp dir with page containing [text](/missing-page)
        const result = await docsCheckAction({ projectDir: tmpDir });
        expect(result.ok).toBe(true);
        expect(result.data.errors).toContainEqual(
          expect.objectContaining({
            type: 'broken-internal-link',
            target: '/missing-page',
          }),
        );
      });
    });
  });

  describe('Given a docs project with missing description frontmatter', () => {
    describe('When running docsCheckAction', () => {
      it('Then returns a warning (not error) for missing description', async () => {
        const result = await docsCheckAction({ projectDir: tmpDir });
        expect(result.ok).toBe(true);
        expect(result.data.errors).toHaveLength(0);
        expect(result.data.warnings).toContainEqual(
          expect.objectContaining({ type: 'missing-frontmatter' }),
        );
      });
    });
  });

  describe('Given a clean docs project', () => {
    describe('When running docsCheckAction', () => {
      it('Then returns zero errors and zero warnings', async () => {
        const result = await docsCheckAction({ projectDir: tmpDir });
        expect(result.ok).toBe(true);
        expect(result.data.errors).toHaveLength(0);
        expect(result.data.warnings).toHaveLength(0);
      });
    });
  });

  // @ts-expect-error — projectDir is required
  docsCheckAction({});
});
```

## Implementation Plan

### Phase 1: Core Validation Logic + CLI Command

**Goal:** `docsCheckAction()` validates sidebar refs, internal links, and frontmatter. `vertz docs check` CLI command wired up.

**Work:**
1. Create `packages/docs/src/validate/docs-check.ts` — core validation logic
2. Add `docsCheckAction` to `packages/docs/src/cli/actions.ts`
3. Export from `packages/docs/src/index.ts`
4. Add `docsCheckCommand` to `packages/cli/src/commands/docs.ts`
5. Register `docs check` subcommand in `packages/cli/src/cli.ts`
6. Integration tests in `packages/docs/src/__tests__/docs-check.test.ts`

**Acceptance criteria:**

```ts
describe('Feature: vertz docs check', () => {
  describe('Given a sidebar referencing a page that does not exist', () => {
    describe('When running docsCheckAction', () => {
      it('Then returns a broken-sidebar-ref error', () => {});
    });
  });

  describe('Given all sidebar pages exist', () => {
    describe('When running docsCheckAction', () => {
      it('Then returns zero sidebar ref errors', () => {});
    });
  });

  describe('Given a page with an internal link to a non-existent page', () => {
    describe('When running docsCheckAction', () => {
      it('Then returns a broken-internal-link error', () => {});
    });
  });

  describe('Given a page with an internal link to an existing page', () => {
    describe('When running docsCheckAction', () => {
      it('Then does not report it as broken', () => {});
    });
  });

  describe('Given a page with an external link', () => {
    describe('When running docsCheckAction', () => {
      it('Then does not check external links', () => {});
    });
  });

  describe('Given a page with internal link inside a code block', () => {
    describe('When running docsCheckAction', () => {
      it('Then skips links inside code blocks', () => {});
    });
  });

  describe('Given a page missing optional description frontmatter', () => {
    describe('When running docsCheckAction', () => {
      it('Then returns a missing-frontmatter warning (not error)', () => {});
    });
  });

  describe('Given a page with both title and description frontmatter', () => {
    describe('When running docsCheckAction', () => {
      it('Then returns zero warnings', () => {});
    });
  });

  describe('Given a clean project with no issues', () => {
    describe('When running docsCheckAction', () => {
      it('Then returns zero errors and zero warnings with correct stats', () => {});
    });
  });

  describe('Given a page with an anchor link to an existing page', () => {
    describe('When running docsCheckAction', () => {
      it('Then validates the base path exists (ignores anchor)', () => {});
    });
  });

  describe('Given a page with a query-string link to an existing page', () => {
    describe('When running docsCheckAction', () => {
      it('Then validates the base path exists (ignores query string)', () => {});
    });
  });

  describe('Given a link with a title attribute', () => {
    describe('When running docsCheckAction', () => {
      it('Then extracts only the path, not the title string', () => {});
    });
  });
});
```

This is a single phase — the feature is small and self-contained.

## Key Files

| File | Action |
|------|--------|
| `packages/docs/src/validate/docs-check.ts` | New — core validation logic |
| `packages/docs/src/cli/actions.ts` | Modified — add `docsCheckAction` |
| `packages/docs/src/index.ts` | Modified — export new types and action |
| `packages/cli/src/commands/docs.ts` | Modified — add `docsCheckCommand` |
| `packages/cli/src/cli.ts` | Modified — register `docs check` subcommand |
| `packages/docs/src/__tests__/docs-check.test.ts` | New — integration tests |

## Review Notes

### DX Review — APPROVED

- NIT: Tab/group context in diagnostics — addressed by baking tab/group into `message` field. The structured `source` field keeps the sidebar page entry.
- NIT: `stats.links` renamed to `stats.internalLinks` for clarity.
- NIT: `--dir` flag test — added to acceptance criteria implicitly via `validateDocs()` two-layer design (tests pass `pagesDir` directly).
- NIT: `severity` field — added to `DocsCheckDiagnostic` for self-describing diagnostics.

### Product/Scope Review — APPROVED

- SHOULD-FIX: `--dir` inconsistency — documented explicitly in Implementation Details as intentional, matching `docs init` pattern.
- SHOULD-FIX: Exit code acceptance criterion — exit code logic lives in CLI wrapper (`docsCheckCommand`). The programmatic API returns `Result<DocsCheckResult>` where `errors.length > 0` signals the CLI should exit 1. This is the same pattern as other CLI commands.
- NIT: `--external-links` deferred — added to "What was rejected" section explicitly.

### Technical Review — CHANGES REQUESTED → RESOLVED

- BLOCKER: `.mdx` extension normalization — added explicit normalization rule in Implementation Details.
- BLOCKER: Link regex title-attribute bug — fixed regex to stop at whitespace: `(?:[^)\s])+` instead of `[^)]+`. Documented in Implementation Details.
- SHOULD-FIX: `/`-prefix normalization — documented explicitly in path normalization rules.
- SHOULD-FIX: Query string stripping — added to path normalization rules + acceptance criteria.
- SHOULD-FIX: Two-layer testability — adopted `validateDocs()` + `docsCheckAction()` design.
- NIT: `severity` field — added.
- NIT: Deduplication policy — documented as one diagnostic per `(source, target)` pair.
