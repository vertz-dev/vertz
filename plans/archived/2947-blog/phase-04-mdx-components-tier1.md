# Phase 4: MDX Components — Tier 1 (Essential)

**Issue:** [#2947](https://github.com/vertz-dev/vertz/issues/2947)
**Design doc:** [`plans/2947-blog.md`](../2947-blog.md)
**Estimate:** 1.5 days
**Depends on:** Phase 2

## Context

The heaviest phase. Without Tier 1 components the blog looks generic; with them the first post is publishable. HTML overrides (h2-h4, p, a, ul/ol/li, blockquote, hr, table, inline code) define the prose baseline. Code block enhancements (title, line numbers, highlight, diff, copy) define the technical authority. Custom components (`Callout`, `Figure`, `CodeGroup`, `Steps`) define the editorial toolkit — three of four are reused from `packages/docs`.

## Outcome

Any `.mdx` in `content/blog/` uses the blog's MDX provider to style every HTML element and custom component. Code blocks support full Shiki meta (`title="..."`, `{1,3-5}`, `showLineNumbers`, `diff`, `wrap`). Writers have a complete essential toolkit.

---

## Tasks

### Task 1: HTML overrides — headings, links, lists

**Files:** (5)
- `packages/landing/src/blog/mdx/overrides/heading.tsx` (new)
- `packages/landing/src/blog/mdx/overrides/link.tsx` (new)
- `packages/landing/src/blog/mdx/overrides/list.tsx` (new)
- `packages/landing/src/blog/mdx/overrides/heading.test.tsx` (new)
- `packages/landing/src/blog/mdx/overrides/link.test.tsx` (new)

**What to implement:**

`heading.tsx` — `H2`, `H3`, `H4` components: emit anchor `<a>` child with `#` symbol, `id` auto-generated from text (slugified). Hover state reveals anchor. `scroll-margin-top: 80px`.

`link.tsx` — `A` component:
- Internal link (relative or starts with `vertz.dev`): `underline on hover`, zinc.200 color
- External link: adds `ExternalLink` icon from `@vertz/icons`, `target="_blank"`, `rel="noopener noreferrer"`

`list.tsx` — `UL`, `OL`, `LI` components: custom bullet color accent, generous spacing (0.5rem between items).

**Acceptance criteria:**
- [ ] Test: `<H2>Title here</H2>` → `<h2 id="title-here">Title here <a href="#title-here">#</a></h2>`
- [ ] Test: internal `<A href="/foo">` renders plain; external `<A href="https://x.com">` renders with icon + target+rel
- [ ] Test: `<A href="https://vertz.dev/docs">` treated as internal (no external icon)
- [ ] Test: id generated from heading text with non-ASCII handled (`"Why é cool"` → `"why-e-cool"`)

---

### Task 2: HTML overrides — blockquote, hr, table, inline code

**Files:** (5)
- `packages/landing/src/blog/mdx/overrides/blockquote.tsx` (new)
- `packages/landing/src/blog/mdx/overrides/hr.tsx` (new)
- `packages/landing/src/blog/mdx/overrides/table.tsx` (new)
- `packages/landing/src/blog/mdx/overrides/code-inline.tsx` (new)
- `packages/landing/src/blog/mdx/overrides/table.test.tsx` (new)

**What to implement:**

`blockquote.tsx` — border-left 3px accent, padding-left 1.5rem, italic, text.muted.

`hr.tsx` — renders as three dots `· · ·` centered, not a horizontal line. ~10 lines.

`table.tsx` — wraps `<table>` in `<div class="table-scroll">` with `overflow-x: auto`. Styled scrollbar. Zebra rows via `tr:nth-child(even)`. Header bold + border-bottom.

`code-inline.tsx` — `<code>` (not inside `<pre>`) styled with 0.9em, JetBrains Mono, `background: bg.muted`, `padding: 0 0.25rem`, `border-radius: sm`.

**Acceptance criteria:**
- [ ] Test: `<Table>` renders with scroll wrapper div
- [ ] Test: inline `code` has muted background; `pre > code` does not (distinction via selector)
- [ ] `hr` visually differs from a horizontal line

---

### Task 3: Code block wrapper with title + line numbers + highlight + diff

**Files:** (4)
- `packages/landing/src/blog/mdx/shiki-config.ts` (modified)
- `packages/landing/src/blog/mdx/code-block.tsx` (new)
- `packages/landing/src/blog/mdx/transformers.ts` (new)
- `packages/landing/src/blog/mdx/code-block.test.tsx` (new)

**What to implement:**

`transformers.ts` — adds Shiki transformers:
- `transformerNotationHighlight()` — `// [!code highlight]` comment support
- `transformerNotationDiff()` — `// [!code ++]` / `// [!code --]` support
- Meta parser: extracts `title="..."`, `{1,3-5}` line ranges, `showLineNumbers`, `wrap` from the language meta string

`code-block.tsx` — wrapper rendered around compiled `pre`:
- Header bar (when `title` provided): filename + language label
- Line numbers column (when `showLineNumbers`)
- Copy button (top-right of pre, appears on hover)
- `wrap` attribute toggles `white-space: pre-wrap`

Shiki config now passes `parseMetaString` to extract meta into transformer options.

**Acceptance criteria:**
- [ ] BDD: ` ```ts title="task.ts" ` → header with "task.ts" label + "TS" language
- [ ] BDD: ` ```ts {2,4-6} ` → lines 2, 4, 5, 6 rendered with highlight background
- [ ] BDD: ` ```ts showLineNumbers ` → line numbers column visible
- [ ] BDD: ` ```diff ` → `+` lines green background, `-` lines red background
- [ ] BDD: copy button copies raw code (not including header, numbers, or whitespace of the wrapper)

---

### Task 4: Copy button

**Files:** (2)
- `packages/landing/src/blog/mdx/copy-button.tsx` (new)
- `packages/landing/src/blog/mdx/copy-button.test.tsx` (new)

**What to implement:**

`<CopyButton text={string} />` — button with `Copy` icon from `@vertz/icons`; on click copies `text` to clipboard and briefly swaps icon to `Check` for 1.5s. Accessible label `"Copy code"`. Positioned absolutely when used inside `code-block.tsx`.

**Acceptance criteria:**
- [ ] Test: clicking the button calls `navigator.clipboard.writeText` with the `text` prop
- [ ] Test: icon swaps to check for 1.5s and back
- [ ] Test: accessible label present
- [ ] Works on keyboard focus (Enter/Space triggers copy)

---

### Task 5: Custom components — Figure + reexports

**Files:** (4)
- `packages/landing/src/blog/mdx/custom/figure.tsx` (new)
- `packages/landing/src/blog/mdx/custom/figure.test.tsx` (new)
- `packages/landing/src/blog/mdx/custom/index.ts` (new — reexports Callout, CodeGroup, Steps from `packages/docs`)
- `packages/landing/package.json` (modified — workspace dep on `@vertz/docs` or copy specific components — confirm strategy in phase kickoff)

**What to implement:**

`figure.tsx`:
```tsx
interface FigureProps {
  src: string;
  alt: string;
  caption?: string;
  width: number;   // required to prevent CLS
  height: number;  // required to prevent CLS
}
```
Renders `<figure>` with `<img loading="lazy" width={width} height={height} />` and optional `<figcaption>`. Max-width 800px (breakout width). Caption styled muted, 0.875rem.

If `packages/docs` components are not exported via a public package, copy the minimal `callout.ts`, `code-group.ts`, `steps.ts` sources into `packages/landing/src/blog/mdx/custom/`. Confirm at phase kickoff. Prefer reexport if available.

**Acceptance criteria:**
- [ ] Type test: `<Figure src="..." alt="..." />` without `width`/`height` — compile error
- [ ] Test: `Figure` with caption renders `<figcaption>`
- [ ] Test: `Callout type="warn"` renders with warning style
- [ ] Test: `CodeGroup` with 2 `Tab` renders tab headers + first tab active

---

### Task 6: MDX provider wire-up

**Files:** (2)
- `packages/landing/src/blog/mdx/components.tsx` (new — default export: components map)
- `packages/landing/src/blog/layout/blog-post-layout.tsx` (modified — wraps content in MDXProvider)

**What to implement:**

`components.tsx`:
```tsx
export const blogMdxComponents = {
  h2: H2, h3: H3, h4: H4,
  a: A,
  ul: UL, ol: OL, li: LI,
  blockquote: Blockquote,
  hr: Hr,
  table: Table,
  code: CodeInline,  // inline only; pre replaces block
  pre: CodeBlock,
  // custom
  Callout, Figure, CodeGroup, Tab, Steps, Step,
};
```

Layout wires this via `<MDXProvider components={blogMdxComponents}>` around rendered post component.

**Acceptance criteria:**
- [ ] BDD: `Given a post using <Callout>, When rendered in /blog/<slug>, Then Callout styled component renders (not raw element)`
- [ ] BDD: any inline `` `code` `` renders with muted background
- [ ] BDD: every heading has an id and anchor link
- [ ] BDD: external links show `ExternalLink` icon

---

## Phase Definition of Done

- [ ] All tasks complete, BDD criteria checked
- [ ] Quality gates green (`vtz test && vtz run typecheck && vtz run lint`)
- [ ] Test coverage ≥95% for every new file
- [ ] Sample post updated to exercise every Tier 1 component (becomes visual test fixture)
- [ ] Visual QA at 3 viewports
- [ ] Phase review at `reviews/2947-blog/phase-04-mdx-components-tier1.md`
