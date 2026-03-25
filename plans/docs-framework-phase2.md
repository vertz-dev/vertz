# @vertz/docs-framework — Follow-up Implementation (Phases 2-5 Completion)

> Completes the remaining work from the original `plans/docs-framework.md` design doc.
> This is NOT a new design — it implements the already-approved features that were deferred from PR #1825.

## Scope

Complete the gaps identified in PR #1825 review to reach Mintlify feature parity.
Ordered by migration-blocking priority.

## Phase A: Enhanced Code Blocks

**Goal:** Code fences support line highlighting, line numbers, filename display, copy button, and diff blocks.

**Prerequisite:** Wire `@shikijs/rehype` into `compileMdxToHtml` — currently has zero rehype plugins. The enhanced code block rehype plugin runs **after** Shiki (operates on Shiki's HAST output, not raw markdown).

**Work:**
- Add `@shikijs/rehype` to `compileMdxToHtml` compile options (dual theme support matching `@vertz/mdx`)
- Rehype plugin (post-Shiki) to parse code fence meta (`title="file.ts"`, `{3-5,8}`, `showLineNumbers`)
- Render line numbers as `<span data-line-number>` elements
- Render highlighted lines with `data-highlighted` attribute (support comma-separated ranges: `{3-5,8,12-14}`)
- Copy button rendered as `<button data-copy>` with inline JS to copy code text
- Diff blocks: `+`/`-` lines get `data-diff-add`/`data-diff-remove` styling
- Filename/title rendered as `<div data-code-title>` header above the code block
- Wire into `compileMdxToHtml` pipeline and SSG build
- Update `CodeGroup` to render tab headers from child code block titles

**Acceptance criteria:**
```ts
describe('Enhanced code blocks', () => {
  it('renders line numbers when showLineNumbers is set', () => {});
  it('highlights lines specified by {3-5} range', () => {});
  it('highlights comma-separated ranges like {3-5,8,12-14}', () => {});
  it('displays filename from title="file.ts"', () => {});
  it('renders a copy button with clipboard JS', () => {});
  it('styles diff +/- lines with add/remove classes', () => {});
  it('CodeGroup renders tabs from child code block titles', () => {});
});
```

## Phase B: Search UI (Cmd+K Palette)

**Goal:** Functional client-side search with Pagefind integration.

**Work:**
- Cmd+K / Ctrl+K keyboard listener injected in page HTML
- Search palette modal (plain HTML + inline JS — no framework dependency needed for static search)
- Pagefind client-side JS loaded lazily only on palette open (not page load — index can be several hundred KB)
- Input debounce (150-200ms) to avoid excessive Pagefind queries
- Results display: page title, section heading, preview text
- Keyboard navigation (arrow keys, Enter to select, Escape to close)
- Empty state message when no results found
- ARIA: `role="dialog"`, `aria-modal`, `role="listbox"` for results, focus trapping
- `hidden` pages excluded from Pagefind index via `data-pagefind-ignore`
- Search script as a `const` template string in a dedicated file (testable separately from page renderer)

**Acceptance criteria:**
```ts
describe('Search', () => {
  it('Cmd+K opens the search palette', () => {});
  it('typing a query calls Pagefind and displays results', () => {});
  it('clicking a result navigates to that page', () => {});
  it('Escape closes the palette', () => {});
  it('hidden pages are excluded from index', () => {});
  it('shows empty state when no results found', () => {});
});
```

## Phase C: API Docs Components + Missing Components

**Goal:** Components needed by existing Mintlify pages.

**Work:**
- `ParamField` — renders parameter name, type, required badge, description (support `path`, `body`, `query`, `header` locations)
- `ResponseField` — renders response field with nested structure support
- `Expandable` — collapsible section for nested fields (needs inline JS for toggle, like Accordion)
- `Tooltip` — inline tooltip on hover/focus (needs inline JS/CSS for show/hide)
- `Icon` — renders Lucide icon by name using `lucide-static` (raw SVG strings, NOT `@vertz/icons` which returns DOM elements)
- Update `builtinComponents` map and barrel exports
- LLM markdown conversions for new components

**Technical note:** `Expandable`, `Tooltip`, and `Banner` (Phase D) are the first interactive components — they need inline JS snippets since the docs-framework has no client-side runtime. Follow the same pattern as the copy button (Phase A) and search palette (Phase B).

**Acceptance criteria:**
```ts
describe('API docs components', () => {
  it('ParamField renders name, type, required badge', () => {});
  it('ResponseField renders nested structure', () => {});
  it('Expandable toggles visibility', () => {});
  it('Tooltip shows tip text', () => {});
  it('Icon renders SVG by name', () => {});
  it('LLM markdown converts ParamField to readable format', () => {});
});
```

## Phase D: SSG Completions (head, analytics, hidden, check)

**Goal:** Remaining SSG features needed for production deployment.

**Work:**
- `hidden` frontmatter: exclude page from sitemap and search index, still accessible by URL
- `noindex` frontmatter: add `<meta name="robots" content="noindex">`, exclude from sitemap
- `head` tag injection from config (script, meta, link tags in every page)
- `analytics` config: generate script tags for plausible/ga4/posthog
- `vertz docs check` command: validate sidebar refs exist, check internal links, report broken refs
- Banner component: dismissible notification bar with localStorage persistence

**Acceptance criteria:**
```ts
describe('SSG completions', () => {
  it('hidden pages are excluded from sitemap but accessible by URL', () => {});
  it('noindex pages have robots noindex meta tag', () => {});
  it('head tags from config appear in every page', () => {});
  it('plausible analytics script is injected', () => {});
  it('vertz docs check catches broken sidebar refs', () => {});
  it('vertz docs check catches broken internal links', () => {});
  it('banner renders with dismiss button', () => {});
});
```

## Phase E: LLM Enhancements

**Goal:** Complete the LLM output quality for AI consumption.

**Work:**
- Cross-reference link rewriting via remark plugin (NOT regex — avoids matching inside code blocks): internal `[text](/path)` → `[text](llm/path.md)`
- Code block metadata annotations: `<!-- language: ts, runnable: true -->` before code blocks in LLM markdown
- LLM conversions for Phase C components (ParamField → readable text, Tooltip → plain text, etc.)

**Acceptance criteria:**
```ts
describe('LLM enhancements', () => {
  it('internal links point to llm/*.md files', () => {});
  it('code blocks have language metadata comments', () => {});
  it('ParamField converts to readable markdown', () => {});
});
```

## Implementation Order

A → B → C → D → E

Phase A (code blocks) and B (search) are the most user-visible. Phase C (API components) blocks migration. Phase D (SSG) and E (LLM) are polish.

## Review Notes (2026-03-24)

- **DX:** Approved. Minor notes: support comma-separated line ranges, add search debounce/empty state.
- **Product:** Approved. Observation: Phase C could swap before B since it technically blocks migration (1 file, 3 usages). Non-blocking.
- **Technical:** Approved. Key notes: (1) Wire Shiki into compileMdxToHtml as Phase A prerequisite, (2) use `lucide-static` not `@vertz/icons` for Icon component, (3) interactive components need inline JS pattern, (4) use remark plugin for LLM link rewriting.

All notes incorporated into the plan above.

## Out of Scope

- FileTree component (nice-to-have, not used in current docs)
- Mermaid diagrams (optional peer dep, can be added later)
- OG image generation (can reuse existing @vertz/og)
- Phase 6 migration (separate PR — operational work, not framework code)
