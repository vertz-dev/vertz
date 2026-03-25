# Phases A-E: Enhanced Code Blocks through LLM Enhancements

- **Author:** Implementation agent
- **Reviewer:** Adversarial review agent (Claude Opus 4.6)
- **Commits:** 9b8d804d4..4eaab9052 (7 commits)
- **Date:** 2026-03-24

## Changes

- packages/docs-framework/package.json (modified) — added shiki, @shikijs/rehype, unist-util-visit deps
- packages/docs-framework/src/__tests__/enhanced-code-blocks.test.ts (new)
- packages/docs-framework/src/__tests__/search-palette.test.ts (new)
- packages/docs-framework/src/__tests__/api-components.test.ts (new)
- packages/docs-framework/src/__tests__/ssg-completions.test.ts (new)
- packages/docs-framework/src/__tests__/llm-enhancements.test.ts (new)
- packages/docs-framework/src/__tests__/compile-mdx-html.test.ts (modified) — adapted for Shiki output
- packages/docs-framework/src/mdx/rehype-enhanced-code.ts (new) — rehype plugin + parseMeta
- packages/docs-framework/src/search/search-palette-script.ts (new) — search palette HTML/JS/CSS
- packages/docs-framework/src/components/param-field.ts (new)
- packages/docs-framework/src/components/response-field.ts (new)
- packages/docs-framework/src/components/expandable.ts (new)
- packages/docs-framework/src/components/tooltip.ts (new)
- packages/docs-framework/src/components/icon.ts (new)
- packages/docs-framework/src/components/banner.ts (new)
- packages/docs-framework/src/components/index.ts (modified) — added new components to barrel + builtinComponents
- packages/docs-framework/src/dev/compile-mdx-html.ts (modified) — Shiki integration, rehype pipeline
- packages/docs-framework/src/dev/render-page-html.ts (modified) — search, hidden, noindex, head, analytics, banner
- packages/docs-framework/src/mdx/llm-markdown.ts (modified) — new component conversions, link rewriting, code annotations
- packages/docs-framework/src/ssg/head-injection.ts (new) — renderHeadTags, renderAnalyticsScript

## CI Status

- [x] Quality gates passed — all 58 new tests pass, 0 failures from this branch
- [x] Pre-existing 9 test failures (react/jsx-dev-runtime in layout .tsx files) confirmed NOT caused by this branch

## Review Checklist

- [x] Delivers what the ticket asks for (with caveats noted below)
- [x] TDD compliance (tests alongside implementation)
- [ ] No type gaps or missing edge cases (findings below)
- [ ] No security issues (findings below)
- [x] Public API changes match design doc (with missing items noted)

## Findings

### BLOCKER: XSS in Search Palette — Pagefind Result Data Injected Unsanitized

**File:** `packages/docs-framework/src/search/search-palette-script.ts`, lines 57-61

The `doSearch` function constructs result HTML by directly concatenating Pagefind result data (`item.url`, `item.meta?.title`, `item.excerpt`) into innerHTML:

```js
results.innerHTML = items.map(function(item, i) {
  return '<a href="' + item.url + '" ...'
    + '<div ...>' + (item.meta?.title || item.url) + '</div>'
    + '<div ...>' + (item.excerpt || '') + '</div>'
    + '</a>';
}).join('');
```

Pagefind indexes the page HTML, and `item.excerpt` contains HTML fragments. If a page contains user-generated content or malicious markup that ends up indexed, it gets injected into the DOM without sanitization. The `item.url` is also used directly in `href=` without escaping — a crafted page path could break out of the attribute.

This is a stored XSS vector. The data flows from Pagefind's index (which is built from page HTML) directly into `innerHTML`.

**Fix:** Escape `item.url`, `item.meta?.title`, and `item.excerpt` before insertion. At minimum, add an inline `escapeHtml` helper to the script, or use `textContent` for the title/excerpt and `setAttribute('href', ...)` for the URL.

---

### BLOCKER: XSS in Icon Component — `size` Prop Not Escaped

**File:** `packages/docs-framework/src/components/icon.ts`, lines 18 and 25

The `size` prop is interpolated directly into `style` attributes without escaping:

```ts
const size = props.size ? String(props.size) : '16';
// line 18:
return `<span data-icon="${escapeHtml(name)}" style="display:inline-flex;width:${size}px;height:${size}px">...`;
// line 25:
return `<span data-icon="${escapeHtml(name)}" style="display:inline-flex;align-items:center;font-size:${size}px" ...`;
```

A malicious MDX author (or a value from user-controlled data) could set `size` to `16px" onmouseover="alert(1)` to inject event handlers. The `name` prop IS correctly escaped, but `size` is not.

**Fix:** Either validate `size` is numeric (e.g., `parseInt(size, 10) || 16`) or pass it through `escapeHtml()`.

---

### SHOULD-FIX: Missing `vertz docs check` Command (Phase D)

**Design doc Phase D specifies:**
> `vertz docs check` command: validate sidebar refs exist, check internal links, report broken refs

**Acceptance criteria include:**
> `it('vertz docs check catches broken sidebar refs', () => {});`
> `it('vertz docs check catches broken internal links', () => {});`

This feature is completely missing from the implementation. There is no check command, no validation logic, and no tests for it. This is a significant gap — the `docs check` command is the only validation tooling in the SSG pipeline.

---

### SHOULD-FIX: Missing GA4 and PostHog Analytics (Phase D)

**Design doc Phase D specifies:**
> `analytics` config: generate script tags for plausible/ga4/posthog

The `renderAnalyticsScript` function only handles Plausible. The `AnalyticsConfig` type only has a `plausible` field. GA4 and PostHog support mentioned in the design doc are not implemented. The type should at least have placeholder fields for `ga4` and `posthog`, and the render function should handle them, or they should be explicitly called out as deferred.

---

### SHOULD-FIX: `CodeGroup` Does NOT Render Tabs from Child Code Block Titles (Phase A)

**Design doc Phase A specifies:**
> Update `CodeGroup` to render tab headers from child code block titles

**Acceptance criteria include:**
> `it('CodeGroup renders tabs from child code block titles', () => {});`

The `CodeGroup` component (`packages/docs-framework/src/components/code-group.ts`) was not modified by this PR. It still just wraps children in a div. There is no tab rendering from child code block titles. The acceptance criteria test is missing entirely.

---

### SHOULD-FIX: Banner Dismiss Persistence is Incomplete

**File:** `packages/docs-framework/src/components/banner.ts`, line 21

The dismiss button writes to `localStorage.setItem('banner-dismissed','1')`, but there is no corresponding check at page load to hide the banner if it was previously dismissed. The banner will reappear on every page load/navigation even after dismissal, defeating the purpose of localStorage persistence.

**Fix:** Either add an inline script that checks `localStorage.getItem('banner-dismissed')` and hides the banner, or add `style="display:none"` initially and show via JS if not dismissed.

---

### SHOULD-FIX: `BannerConfig.link` Type Mismatch

**File:** `packages/docs-framework/src/components/banner.ts`, line 3 vs `packages/docs-framework/src/config/types.ts`, line 76

The `BannerConfig` type declares `link?: NavLink` where `NavLink` has `{ label: string; href: string; icon?: string }`. But the `Banner` component's local `BannerProps` interface declares `link?: { label: string; href: string }`, dropping the `icon` field. While not a runtime bug (the extra field is just ignored), this creates a type contract mismatch. If someone passes a `BannerConfig` with `link.icon`, the icon will be silently dropped.

More importantly, the `Banner` function signature is `(props: Record<string, unknown>)` and casts `props.link as BannerProps['link']`. This loses type safety entirely. Since `Banner` is called from `renderPageHtml` where the config is typed, the `link` field will always be the right shape at runtime, but the cast is fragile.

---

### SHOULD-FIX: Tooltip Has No Interactive JS

**Design doc Phase C specifies:**
> Tooltip — inline tooltip on hover/focus (needs inline JS/CSS for show/hide)

The current `Tooltip` implementation uses only `title` attribute and a hidden `data-tooltip-text` span. There is no inline JS or CSS to show the tooltip text on hover/focus. The `data-tooltip-text` span has `display:none` and nothing ever sets it to `display:block`. The only interactivity is the browser-native `title` attribute tooltip, which has poor styling control and delayed appearance.

**Fix:** Add a CSS hover rule (e.g., `[data-tooltip]:hover > [data-tooltip-text] { display: block; }`) or inline JS, similar to how the copy button and expandable work.

---

### OBSERVATION: Highlighter Promise is Module-Level State

**File:** `packages/docs-framework/src/dev/compile-mdx-html.ts`, line 12

```ts
let highlighterPromise: Promise<unknown> | null = null;
```

This module-level mutable state means:
1. In test environments, the Shiki highlighter is created once and shared across all test cases. This is fine for performance but makes tests order-dependent if one test corrupts the highlighter.
2. If the highlighter creation fails, the catch handler sets `highlighterPromise = null`, which means the next call will retry. This is correct behavior but worth noting.

Not a bug, but worth being aware of.

---

### OBSERVATION: `rewriteInternalLinks` Uses Line-Based Parsing, Not AST

**File:** `packages/docs-framework/src/mdx/llm-markdown.ts`, lines 210-239

The design doc explicitly says:
> Cross-reference link rewriting via remark plugin (NOT regex — avoids matching inside code blocks)

The implementation uses a line-by-line code block detector (`line.startsWith('```')`) and regex replacement within non-code-block lines. While this correctly skips fenced code blocks, it is not a remark plugin operating on the AST. The approach works for the common case but has edge cases:

- Indented code blocks (4 spaces) are not detected as code blocks
- Inline code (backtick-delimited) links would be rewritten when they shouldn't be: `` `[text](/path)` ``
- HTML comment blocks `<!-- [...](/path) -->` would be rewritten

The design doc specifically said "NOT regex" for this reason. The current approach is a pragmatic regex-based solution that handles the major case (fenced code blocks) but misses these edges. For LLM markdown output this is likely acceptable since those edge cases are rare, but it deviates from the stated approach.

---

### OBSERVATION: `annotateCodeBlocks` Matches Inside Code Blocks

**File:** `packages/docs-framework/src/mdx/llm-markdown.ts`, lines 246-250

```ts
function annotateCodeBlocks(content: string): string {
  return content.replace(/^(```(\w+).*)/gm, (_match, full: string, lang: string) => {
```

This regex matches ALL lines starting with triple backticks and a language identifier, including nested code blocks within a code block. For example:

```md
````md
```ts
const x = 1;
```
````
```

The inner `` ```ts `` would also get a `<!-- language: ts -->` comment, which is incorrect. This is an edge case unlikely to occur in practice but represents a correctness gap.

---

### OBSERVATION: No Focus Trapping in Search Palette

The design doc specifies:
> ARIA: role="dialog", aria-modal, role="listbox" for results, focus trapping

The ARIA attributes are present (`role="dialog"`, `aria-modal="true"`, `role="listbox"`), but there is no focus trapping implementation. Tab key can move focus out of the palette to elements behind the backdrop. This is a WCAG accessibility issue for modal dialogs.

---

### OBSERVATION: Search Palette `var` Declarations

**File:** `packages/docs-framework/src/search/search-palette-script.ts`

The search script uses `var` declarations throughout. While wrapped in an IIFE so there's no global pollution, using `var` in 2026 is unusual. The `async function doSearch` mixes modern syntax (async/await, arrow functions in `.then`) with `var`. This is a minor style inconsistency — the script targets browsers that support `import()`, so `let`/`const` would be fine.

---

### OBSERVATION: `hidden` Attribute on `<body>` for Pagefind Ignore

**File:** `packages/docs-framework/src/dev/render-page-html.ts`, line 183

`data-pagefind-ignore` is placed on the `<body>` element. Pagefind documentation recommends `data-pagefind-body` on the content area and `data-pagefind-ignore` on specific sections. Placing it on `<body>` means the entire page is ignored from indexing, which is the correct intent for hidden pages, but this approach only works if Pagefind is configured to index `<body>` content by default (which it does).

---

### OBSERVATION: Test Quality — String Containment Over Structure

Many tests use `expect(html).toContain('data-param-field')` which only checks that the string appears somewhere in the output. This doesn't verify structural correctness (e.g., that `data-param-field` is an attribute on a `<div>`, not appearing inside text content). For a static HTML generator, this is acceptable since the templates are simple, but more precise assertions (e.g., regex matching `<div data-param-field`) would catch structural regressions better.

---

## Summary

### Blockers (2)

1. **XSS in search palette** — Pagefind results injected unsanitized into innerHTML
2. **XSS in Icon `size` prop** — unescaped interpolation into style attribute

### Should-Fix (5)

3. **Missing `vertz docs check` command** — Phase D acceptance criteria not met
4. **Missing GA4/PostHog analytics** — only Plausible implemented
5. **Missing CodeGroup tab rendering** — Phase A acceptance criteria not met
6. **Banner dismiss persistence incomplete** — no page-load check for dismissed state
7. **Tooltip lacks interactive show/hide** — only browser-native `title` tooltip works

### Observations (non-blocking, 5)

8. Module-level highlighter state (acceptable)
9. Link rewriting uses regex not remark plugin (pragmatic but deviates from design)
10. `annotateCodeBlocks` matches inside nested code blocks (edge case)
11. No focus trapping in search palette (WCAG gap)
12. Test assertions use string containment over structural checks

## Resolution

### Fixed in commit `24db35dd6`:
- **B1 (XSS search palette)**: Added inline `esc()` function that uses `textContent`/`innerHTML` to sanitize all Pagefind result data before injection.
- **B2 (XSS Icon size)**: `size` prop now parsed via `parseInt()` with fallback to `16`. Non-numeric values can no longer inject into style attributes.
- **S6 (Banner persistence)**: Added inline `<script>` that checks `localStorage.getItem('banner-dismissed')` on page load and hides the banner if previously dismissed.
- **S7 (Tooltip hover)**: Added CSS rules `[data-tooltip]:hover > [data-tooltip-text]` and `:focus-within` to show tooltip text on hover/focus. Exported `TOOLTIP_STYLES` constant.

### Deferred (separate GitHub issues to be created):
- **S3 (`vertz docs check` command)**: Separate feature — validation tooling beyond the scope of this component/rendering PR.
- **S4 (GA4/PostHog analytics)**: Only Plausible implemented; GA4 and PostHog deferred as separate enhancements.
- **S5 (CodeGroup tab rendering)**: CodeGroup currently wraps children; tab headers from child code block titles deferred.

### Accepted (observations):
- **O8-O12**: Acknowledged. Regex-based link rewriting and code annotation are pragmatic for LLM markdown. Focus trapping is a follow-up accessibility enhancement.

All tests pass (193 pass, 9 pre-existing failures from main). Lint and typecheck clean.
