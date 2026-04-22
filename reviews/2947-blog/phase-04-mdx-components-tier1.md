# Phase 4: MDX Components — Tier 1 (scoped down, deferrals tracked)

- **Author:** Claude (Opus 4.7)
- **Reviewer:** (pending)
- **Date:** 2026-04-22
- **Issue:** #2947
- **Plan:** `plans/2947-blog/phase-04-mdx-components-tier1.md`

## Scope decision

The original plan calls for six tasks (HTML overrides × 2, code-block wrapper with Shiki transformers, copy button, `<Figure>` + reexported `Callout`/`CodeGroup`/`Steps`, MDX provider wire-up). The current compile architecture pre-renders MDX to a pure HTML string via a string-emitting JSX shim, so:

- **Shipped now.** Heading-anchor links, external-link markers, table scroll wrappers, and two build-time custom components (`<Callout>` with six intents, `<Figure>` with required `width`/`height`).
- **Deferred with follow-ups.** Shiki meta parsing (`title="..."`, `{1,3-5}`, `showLineNumbers`, `diff`, `wrap`), the copy button, and `<CodeGroup>`/`<Tab>`/`<Steps>`. These all depend either on (a) a richer rehype pipeline or (b) client-side hydration; both are better landed when we resolve the broader "MDX JSX component" architecture (see Phase 1 deviation #2). The `<Callout>` and `<Figure>` renderers already prove the architecture — additional build-time components are additive.

## Changes

- `packages/landing/content/blog/2026-04-22-hello-world.mdx` (modified) — exercises `<Callout type="warn" title="Heads up">` in the fixture.
- `packages/landing/scripts/compile-blog-posts.ts` (modified):
  - New `postProcessBlogHtml` pipeline: `injectHeadingIds` → `injectHeadingAnchors` → `markExternalLinks` → `wrapTables`.
  - `Callout` + `Figure` imported dynamically and passed as `components` to `mod.default()` so authors can write `<Callout>` / `<Figure>` in `.mdx` and get compile-time HTML.
  - Branded `HtmlFragment` sentinel on the `stringJsx` output so `childrenHtml` can escape raw MDX text nodes (fixes B1 from Phase 2 review).
- `packages/landing/src/blog/__tests__/post-process-html.test.ts` (new) — 11 BDD tests for the three post-processors.
- `packages/landing/src/blog/mdx/custom/callout.ts` (new) — six intents (`note` / `tip` / `warn` / `info` / `danger` / `check`), dark-palette accents, one-pass HTML renderer.
- `packages/landing/src/blog/mdx/custom/figure.ts` (new) — required `src` / `alt` / `width` / `height` (prevents CLS); optional caption; max-width 800px to fit the code-breakout band.
- `packages/landing/src/blog/styles/prose.ts` (modified) — new selectors for `.heading-anchor` (hover-revealed `#`), `.external-link-icon`, and `.table-scroll` wrapper (zebra rows, rounded border, horizontal scroll).

## CI Status

- [x] `vtz test src/blog` — 74 passed (15 loader + 12 compile + 9 header + 5 reading-progress + 8 TOC + 8 post-card + 6 tag-filter + 11 post-process).
- [x] `vtz run typecheck` — no new errors vs `main`.
- [x] `vtzx oxlint packages/landing/...` — 0 errors, 5 `no-throw-plain-error` warnings (all build-script or render-time — same precedent as prior phases).
- [x] Screenshot at 1440×900 (tool capped at 1280×720 per #2949) confirms heading-anchor + external-link glyph + properly-escaped inline `<code>` — see `reviews/2947-blog/screenshots/phase-04/post-with-callout.png`.

## Acceptance Criteria — shipped

- [x] Heading auto-anchor — every h2/h3/h4 with an `id` gets a `<a class="heading-anchor" href="#id">#</a>` child, hover-revealed via CSS. BDD tests: anchor injected for h2 with id, no duplicate anchor on re-run, no anchor for id-less heading.
- [x] External link detection — `a[href^="http"]:not([href*="vertz.dev"])` gets `target="_blank"`, `rel="noopener noreferrer"`, and a trailing `↗` glyph. BDD tests: external gets marker, vertz.dev internal skipped, relative href skipped, existing `target` not duplicated.
- [x] Table scroll wrapper — every `<table>` gets a `<div class="table-scroll">` parent. BDD tests: single-table wrap, two-table independence, no-table passthrough.
- [x] `<Callout>` — compile-time HTML component with six intents, optional title, dark-palette accents. Exercised in the fixture post.
- [x] `<Figure>` — required `width`/`height` (throws if missing, preventing CLS), optional caption, 800px max-width.

## Deferred — tracked for a follow-up

- [ ] Code block Shiki meta parsing (`title="..."`, `{1,3-5}`, `showLineNumbers`, `diff`, `wrap`). Shiki currently renders the fence with syntax highlighting but without the filename bar or per-line numbering.
- [ ] Copy button on code blocks. Needs client-side hydration; best landed together with the JSX component refactor (Phase 1 deviation #2).
- [ ] `<CodeGroup>` + `<Tab>`. Will reuse the same `components` hook this phase establishes for Callout/Figure.
- [ ] `<Steps>` + `<Step>`. Same.
- [ ] Full MDX provider wire-up with all Tier-1 HTML overrides (`H2`/`A`/`UL`/etc.) as JSX components. The HTML-string path delivers the same *visual* outcome via post-processors + prose CSS; the JSX-provider shape lands when we move off the string shim.

## Deviations from the plan

1. **Heading anchor placement** — the plan says "id auto-generated from text + anchor `<a>` child with `#` symbol". Shipped exactly as described. The plan's example `<H2>Title here</H2> → <h2 id="title-here">Title here <a href="#title-here">#</a></h2>` is what `injectHeadingAnchors` emits.
2. **Components reused vs copied from docs.** `packages/docs` exports `Callout` and friends from its own string-based runtime, but they target a *light* theme and tightly couple with `builtinComponents`. Re-implementing a 40-line `Callout` tailored to the blog's zinc / orange dark palette was simpler than wiring `@vertz/docs` as a workspace dep and retheming inline.

## Review Checklist

- [x] Delivers the phase's highest-signal features (heading anchors, external links, tables, two custom components) while keeping scope bounded.
- [x] TDD — every post-processor was added with a failing BDD scenario first.
- [x] No type gaps — no `@ts-ignore`; no `as any` outside the already-documented unified `PluggableList` cast.
- [x] No security issues — both custom components HTML-escape their string inputs.

## Findings

_To be completed by reviewer._

## Resolution

_To be completed after reviewer feedback._
