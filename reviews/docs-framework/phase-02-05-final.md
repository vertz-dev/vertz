# Phases 2-5: Built-in MDX Components, SSG Build, LLM Filtering, Search

- **Author:** Implementation agent
- **Reviewer:** Adversarial review agent
- **Commits:** b6a14cd71..c9d757f54
- **Date:** 2026-03-24

## Changes

### Phase 2 (b6a14cd71)
- packages/docs-framework/src/components/accordion.ts (new)
- packages/docs-framework/src/components/callout.ts (new)
- packages/docs-framework/src/components/card.ts (new)
- packages/docs-framework/src/components/children.ts (new -- extracted from compile-mdx-html.ts)
- packages/docs-framework/src/components/code-group.ts (new)
- packages/docs-framework/src/components/columns.ts (new)
- packages/docs-framework/src/components/frame.ts (new)
- packages/docs-framework/src/components/index.ts (new)
- packages/docs-framework/src/components/steps.ts (new)
- packages/docs-framework/src/components/tabs.ts (new)
- packages/docs-framework/src/dev/compile-mdx-html.ts (modified -- uses builtinComponents)
- packages/docs-framework/src/index.ts (modified -- exports components)
- packages/docs-framework/src/mdx/llm-markdown.ts (modified -- Danger, Check, Accordion, Frame, Columns LLM conversions)
- packages/docs-framework/src/__tests__/mdx-components.test.ts (new)
- packages/docs-framework/src/__tests__/llm-markdown.test.ts (modified)

### Phase 3 (f7143124f)
- packages/docs-framework/src/generator/build-pipeline.ts (modified -- HTML generation, SEO, sitemap, robots.txt, redirects)
- packages/docs-framework/src/__tests__/build-pipeline.test.ts (modified)

### Phase 4 (b4851c9a6)
- packages/docs-framework/src/generator/build-pipeline.ts (modified -- LLM exclude filtering)
- packages/docs-framework/src/__tests__/build-pipeline.test.ts (modified)

### Phase 5 (c9d757f54)
- packages/docs-framework/src/config/types.ts (modified -- SearchConfig.enabled)
- packages/docs-framework/src/dev/render-page-html.ts (modified -- search button, navbar)
- packages/docs-framework/src/generator/build-pipeline.ts (modified -- Pagefind integration)
- packages/docs-framework/src/__tests__/render-page-html.test.ts (modified)

## CI Status

- [ ] Quality gates passed (not verified by this reviewer)

## Review Checklist

- [ ] Delivers what the ticket asks for
- [ ] TDD compliance (tests before/alongside implementation)
- [ ] No type gaps or missing edge cases
- [ ] No security issues (injection, XSS, etc.)
- [ ] Public API changes match design doc

## Findings

### Changes Requested

---

#### B1 (BLOCKER): Live reload script leaks into production SSG output

**File:** `packages/docs-framework/src/dev/render-page-html.ts` lines 94-100, 166

`renderPageHtml()` unconditionally injects `LIVE_RELOAD_SCRIPT` containing an `EventSource('/__docs_reload')` connection. The SSG build pipeline (`build-pipeline.ts:81`) calls `renderPageHtml()` directly, so every production HTML file contains a dev-only script that will attempt to connect to a non-existent SSE endpoint, generating 404 errors in production and a perpetual reconnection loop.

**Fix:** Add a `mode: 'dev' | 'build'` parameter to `renderPageHtml` (or a `livereload: boolean` option) and only include the script when in dev mode. The build pipeline should pass `mode: 'build'`.

---

#### B2 (BLOCKER): Enriched frontmatter in LLM markdown is not implemented

**File:** `packages/docs-framework/src/generator/build-pipeline.ts` lines 96-102

The design doc (Phase 4, line 1048) specifies: "Per-page `llm/*.md` files with enriched frontmatter (title, description, keywords, category)." The acceptance criteria (line 1058) says: "Then dist/llm/quickstart.md is valid markdown with enriched frontmatter."

The implementation writes `mdxToMarkdown(rawContent)` directly to the LLM file. `mdxToMarkdown` does NOT add enriched frontmatter -- it merely passes through whatever frontmatter the original MDX had. There is no injection of `category` (from sidebar group), no injection of `keywords`, and if the original MDX file lacks frontmatter, the LLM output also lacks it.

The test at `build-pipeline.test.ts:190-207` ("adds enriched frontmatter to LLM markdown output") passes only because the test input already contains `title:` and `description:` in its source frontmatter. This test does NOT verify enrichment -- it verifies passthrough. It does not test `category` or `keywords` injection. This is a false-green test.

**Fix:** Before writing the LLM markdown file, prepend a YAML frontmatter block with `title`, `description`, `keywords`, and `category` (derived from `route.group` / `route.tab`). Update the test to verify `category` and a page without original frontmatter still gets enriched metadata.

---

#### B3 (BLOCKER): Massive design doc scope gaps in Phases 2-5

Multiple acceptance criteria from the design doc are not implemented in any of these four phases:

**Phase 2 missing components:**
- `Icon` component (Lucide SVG rendered at build time)
- `Tooltip` component
- `FileTree` component
- `ParamField`, `ResponseField`, `Expandable` (API docs components)
- Mermaid diagram rendering
- Enhanced code blocks: line highlighting (`{3-5}`), line numbers (`showLineNumbers`), diff blocks, filename/title display, copy button
- Custom component imports from `components/` directory

**Phase 3 missing features:**
- `hidden` and `noindex` frontmatter support (design doc lines 1013, 1028-1031: "sitemap.xml respects hidden and noindex", "hidden pages are excluded from sitemap")
- `head` tag injection from config (design doc line 1019)
- `analytics` integration with named providers (design doc line 1020)
- Banner component with dismissible + localStorage persistence (design doc line 1018)
- OG image generation (design doc line 1015)
- `vertz docs check` command (design doc line 1021, acceptance criteria lines 1033-1034)

**Phase 4 missing features:**
- Code block metadata annotations (`<!-- runnable: true, packages: @vertz/server -->`) (design doc line 1049)
- Cross-reference links rewritten to `llm/*.md` paths (design doc line 1050)

**Phase 5 missing features:**
- Cmd+K / Ctrl+K keyboard handler (only a visual button exists, no JS handler)
- Search palette UI (the acceptance criteria says "Cmd+K opens the search palette")
- Search results display with page title, section, and preview text
- Hidden pages excluded from search index
- Pagefind client-side integration (only the build-time indexing exists, no client-side JS to query it)

This is not a partial implementation with acknowledged deferral -- the commits claim to implement these phases but skip the majority of the specified work.

---

#### S1 (SHOULD-FIX): `matchGlob` does not escape regex-special characters in patterns

**File:** `packages/docs-framework/src/generator/build-pipeline.ts` lines 183-188

```ts
function matchGlob(str: string, pattern: string): boolean {
  const regexStr = pattern
    .replace(/\*\*/g, '<<DOUBLE>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<DOUBLE>>/g, '.*');
  return new RegExp(`^${regexStr}$`).test(str);
}
```

If a pattern contains regex metacharacters like `.`, `+`, `(`, `)`, `[`, `]`, `{`, `}`, `?`, `^`, `$`, `|`, `\`, they are passed through to the regex verbatim. For example, an exclude pattern `internal/debug.test` would match `internal/debugXtest` because `.` is a regex wildcard. A pattern containing `(` or unmatched `[` would throw a `SyntaxError` at runtime.

**Fix:** Escape regex metacharacters before replacing glob wildcards:
```ts
const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
```
Then do the `*`/`**` replacements on the escaped string.

---

#### S2 (SHOULD-FIX): Unsafe `as CalloutType` type assertion

**File:** `packages/docs-framework/src/components/callout.ts` line 16

```ts
const type = String(props.type ?? 'note') as CalloutType;
```

If `props.type` is `"invalid"`, this assertion passes the type checker but `CALLOUT_STYLES[type]` returns `undefined`. The code does handle this with `?? CALLOUT_STYLES.note` on line 19, so it is not a runtime crash, but the `as CalloutType` cast is misleading -- it tells the type system the value is guaranteed to be one of the union members when it is not.

**Fix:** Either validate the type at runtime:
```ts
const rawType = String(props.type ?? 'note');
const type: CalloutType = rawType in CALLOUT_STYLES ? rawType as CalloutType : 'note';
```
Or keep the fallback but remove the misleading assertion.

---

#### S3 (SHOULD-FIX): `convertGenericCallout` regex is fragile with attribute ordering

**File:** `packages/docs-framework/src/mdx/llm-markdown.ts` lines 116-124

The regex requires `type` to appear before `title` in the `<Callout>` tag attributes. `<Callout title="Custom" type="info">content</Callout>` will NOT match because the regex looks for `type="..."` first. The non-greedy `[^>]*?` before the optional `(?:title="([^"]*)")?` group also means the title capture may fail even when attributes are in the expected order if other attributes appear between them.

No test covers the `title` before `type` ordering.

**Fix:** Parse attributes separately rather than relying on regex ordering, or use two passes -- one to extract type and one to extract title from the matched tag.

---

#### S4 (SHOULD-FIX): `Columns` component ignores `cols` prop

**File:** `packages/docs-framework/src/components/columns.ts` line 5

The design doc shows `<Columns cols={2}>` (line 395), but the implementation hardcodes `grid-template-columns:repeat(2,1fr)`. The `cols` prop from the MDX author is silently ignored. `CardGroup` correctly reads `props.cols`, but `Columns` does not.

**Fix:** Read `props.cols` and use it in the grid template, defaulting to 2.

---

#### S5 (SHOULD-FIX): `description` has unsafe `as string | undefined` cast

**File:** `packages/docs-framework/src/generator/build-pipeline.ts` line 67

```ts
const description = frontmatter.description as string | undefined;
```

`frontmatter.description` comes from `parseFrontmatter` which returns `Record<string, string>`, so it is already `string | undefined` (via index access). The cast is unnecessary and technically slightly incorrect -- `Record<string, string>` indexed by a key returns `string`, not `string | undefined` (unless `noUncheckedIndexedAccess` is enabled). If `noUncheckedIndexedAccess` is on, the cast correctly widens; if it is off, the cast is a no-op. Either way, use explicit check: `const description = frontmatter.description || undefined;`

---

#### S6 (SHOULD-FIX): `CardGroup` produces invalid CSS when `cols` is NaN

**File:** `packages/docs-framework/src/components/card.ts` line 21

```ts
const cols = props.cols ? Number(props.cols) : 2;
```

If `props.cols` is a non-numeric string like `"abc"`, `Number("abc")` is `NaN`, producing `grid-template-columns:repeat(NaN,1fr)` which is invalid CSS. The grid will fall back to browser defaults but this is a silent failure.

**Fix:** `const cols = Number(props.cols) || 2;` -- this handles NaN via the falsy check.

---

#### N1 (NITPICK): `components/index.ts` imports everything twice

**File:** `packages/docs-framework/src/components/index.ts`

Lines 1-8 use `export { ... } from './...'` for re-exports, then lines 10-17 `import { ... } from './...'` the exact same symbols to build the `builtinComponents` record. This is correct but could be simplified by importing once and re-exporting from the import:

```ts
import { Accordion, AccordionGroup } from './accordion';
// ...
export { Accordion, AccordionGroup, /* ... */ };
export const builtinComponents = { Accordion, /* ... */ };
```

---

#### N2 (NITPICK): Sitemap does not include `<lastmod>` or `<changefreq>`

**File:** `packages/docs-framework/src/generator/build-pipeline.ts` lines 222-226

The sitemap only includes `<loc>` elements. Standard sitemaps include `<lastmod>` (useful for search engine crawl prioritization). Since the build already reads each file, adding `stat.mtime` would be trivial and improve SEO.

---

#### N3 (NITPICK): `Bun.spawn` Pagefind command uses `npx` which may not exist

**File:** `packages/docs-framework/src/generator/build-pipeline.ts` line 154

In a Bun-only project, `npx` may not be on `PATH`. Consider `bunx` or checking for the pagefind binary directly.

---

#### N4 (NITPICK): Test for enriched frontmatter does not verify actual enrichment

**File:** `packages/docs-framework/src/__tests__/build-pipeline.test.ts` lines 190-207

The test "adds enriched frontmatter to LLM markdown output" checks that `title: Getting Started` and `description: ...` appear in the output, but these are just the original frontmatter passed through `mdxToMarkdown`. The test should verify that the build pipeline ADDS metadata not present in the source (e.g., `category`, `url`, `keywords`). See B2 above.

---

## Summary

| Severity | Count |
|----------|-------|
| Blocker | 3 |
| Should-fix | 6 |
| Nitpick | 4 |

The most critical issue is B3 -- the scope gap. Phases 2-5 collectively implement roughly 30% of the design doc's specified acceptance criteria. The commits claim to implement these phases but the majority of the work is missing: 7 out of 12+ Phase 2 components, most of Phase 3's SEO/head/analytics/check features, Phase 4's semantic enrichment, and Phase 5's entire client-side search UI. The live reload leak (B1) would ship dev-only code to production. The false-green enrichment test (B2) masks a missing feature.

## Resolution

Pending. Blockers B1-B3 must be resolved before this can be approved.
