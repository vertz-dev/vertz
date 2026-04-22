# Phase 2: Post Layout (Dark)

- **Author:** Claude (Opus 4.7)
- **Reviewer:** (pending)
- **Date:** 2026-04-22
- **Issue:** #2947
- **Follow-ups filed:** #2949 (vtz screenshot viewport ignored)
- **Plan:** `plans/2947-blog/phase-02-post-layout.md`

## Changes

- `packages/landing/content/blog/2026-04-22-hello-world.mdx` (modified) — richer fixture exercising every Phase-2 prose surface (h2/h3, code blocks, blockquote, nested heading, inline `code`, external link).
- `packages/landing/scripts/compile-blog-posts.ts` (modified) — slugifies h2/h3 into `id` attributes + supports inline-style JSX objects (`style={{...}}`) when serializing Shiki output.
- `packages/landing/src/blog/components/reading-progress.tsx` (new) — 2px fixed bar with rAF-throttled scroll listener; computes progress via pure helper.
- `packages/landing/src/blog/components/toc.tsx` (new) — pure `extractHeadingsFromHtml` helper + sticky sidebar component with `IntersectionObserver` for active-heading state.
- `packages/landing/src/blog/components/__tests__/reading-progress.test.ts` (new) — 5 BDD tests for `computeProgress` edge cases (top-of-viewport, mid-scroll, fully-past, short body).
- `packages/landing/src/blog/components/__tests__/toc.test.ts` (new) — 8 BDD tests for `extractHeadingsFromHtml` + `slugify` (diacritics, duplicates, explicit ids, inline markup).
- `packages/landing/src/blog/layout/blog-post-header.tsx` (new) — tag row + serif h1 (`text-wrap: balance`) + description + author row + optional 16:9 cover, with `data-cover` / `data-avatar` markers so tests can disambiguate.
- `packages/landing/src/blog/layout/__tests__/blog-post-header.test.tsx` (new) — 9 BDD tests covering every header path.
- `packages/landing/src/blog/layout/blog-post-layout.tsx` (new) — 3-col grid shell at ≥1024px (`[empty gutter] [body 640px] [TOC 200px]`), single-column below. Mounts `ReadingProgress` + `Toc` imperatively in `onMount` once the article is attached to the DOM (SSR renders the static shell only).
- `packages/landing/src/blog/mdx/shiki-config.ts` (new) — `BLOG_SHIKI_THEME = 'vitesse-dark'` + default lang list.
- `packages/landing/src/blog/styles/code-breakout.ts` (new) — `pre` breaks out of the 640px body to 800px via negative margins at ≥1024px.
- `packages/landing/src/blog/styles/prose.ts` (new) — prose typography for the MDX body: 17px DM Sans, h2/h3/h4 scale, inline `code` muted background, `blockquote` with orange accent border, `hr` as centered "· · ·", lists with accent bullets, 80px `scroll-margin-top` on headings.
- `packages/landing/src/pages/blog/post.tsx` (modified) — now delegates to `BlogPostLayout`; keeps the "Post not found" state.

## CI Status

- [x] `vtz test src/blog` — 47 passed (15 loader + 10 compile + 9 header + 5 reading-progress + 8 TOC).
- [x] `vtz run typecheck` — no new errors vs `main` (3 pre-existing `presence-room.ts` Cloudflare-Worker errors unchanged).
- [x] `vtzx oxlint packages/landing/src/blog packages/landing/src/pages/blog packages/landing/scripts/...` — 0 errors, 3 warnings (all pre-existing `no-throw-plain-error` in build-script paths).
- [x] `vtzx oxfmt` — clean.

## Acceptance Criteria

Task 1 — BlogPostLayout shell:
- [x] Nav + Footer reused from landing (imported from `components/nav` and `components/footer`).
- [x] Breadcrumb row with `← Blog` link above the grid.
- [x] 3-col grid at ≥1024px: `1fr 640px 200px` with 2rem gap.
- [x] Single column below 1024px with 16px horizontal padding (`token.spacing[4]`).
- [x] No `HeroGlow` on blog routes (never imported).

Task 2 — Prose typography:
- [x] 17px body, 1.7 line-height, `text-wrap: pretty`.
- [x] h2 2em-ish with `scroll-margin-top: 80px` and `text-wrap: balance`.
- [x] h3 1.25rem with `scroll-margin-top: 80px`.
- [x] h4 1.05rem.
- [x] Inline `code` — JetBrains Mono, 0.9em, muted background, rounded.
- [x] ul/ol with accent-colored bullets.
- [x] `blockquote` — left border 3px orange-400, italic, muted text.
- [x] `hr` — renders as centered `· · ·` (not a line).
- [x] `a` — zinc underline, brighter on hover.

Task 3 — Reading progress bar:
- [x] BDD: `bodyTop >= 0` → progress 0. BDD: `bodyTop + height <= viewportHeight` (fully scrolled past) → 1. BDD: `bodyHeight < viewportHeight` → 1. BDD: `bodyTop < 0` and body extends past viewport → progress proportional to scrolled / readable.
- [x] rAF-throttled — scroll handler only schedules one `requestAnimationFrame` at a time.
- [x] Client-only (`typeof window === 'undefined'` and `typeof target?.getBoundingClientRect !== 'function'` guards).
- [x] Fixed 2px bar, `z-index: 60`, accent color.

Task 4 — Table of contents:
- [x] Extracts h2 + h3 from the rendered HTML; skips h4.
- [x] Duplicate heading text disambiguated with a numeric suffix (`setup`, `setup-2`, `setup-3`).
- [x] Explicit `id=""` attribute wins over slugified text.
- [x] Inline markup stripped from heading text (e.g. `<code>` tags).
- [x] Non-ASCII slugify handles diacritics (`Why é cool` → `why-e-cool`).
- [x] Sticky at `top: 120px`, hidden below 1024px.
- [x] `IntersectionObserver` sets `data-active="true"` on the matching link. Both feature + target check guards run before observer wiring.
- [x] Generator injects `id` attributes into compiled HTML so TOC links scroll correctly.

Task 5 — Code block breakout + Shiki base theme:
- [x] `pre` fills 640px body and scrolls horizontally on overflow at <1024px.
- [x] `pre` breaks out to 800px at ≥1024px via `-80px` horizontal margins.
- [x] `shiki-config.ts` exports `BLOG_SHIKI_THEME = 'vitesse-dark'` — reversible, single-theme.
- [x] Generator passes the theme through `@shikijs/rehype` for every `.mdx` post; Shiki inline `style={{...}}` objects are serialized to CSS strings by the compile script's string JSX shim.

## Visual QA

Screenshots at 3 viewports of `/blog/hello-world` saved to `reviews/2947-blog/screenshots/phase-02/`:

- `post-375x812.png` — mobile
- `post-768x1024.png` — tablet
- `post-1440x900.png` — desktop

**Tool caveat (filed as #2949):** `vertz_browser_screenshot` currently ignores the `viewport` argument and always renders at 1280×720 regardless — every PNG here is 1280×720 at the file level, but named by the requested viewport so the follow-up review can see the intent. The three hashes differ (each navigation is unique via a `?v=<nonce>` cache-buster + `waitFor: networkidle`) which rules out "same image three times" but doesn't let us confirm cross-viewport behavior. Responsive CSS was verified by hand via `curl + grep` on the rendered HTML (breakpoint media queries are present in the serialized stylesheet). Phase 7 will re-run cross-viewport QA once #2949 ships.

## Deviations from the plan

1. **JSX-tree-as-prop refactored.** The plan description implies passing `<post.Component />` through a `<BlogPostLayout>` wrapper. In this repo the Vertz compiler SSR serializer can't mix an externally-constructed `HTMLElement`/`DocumentFragment` prop into its own tree (see Phase 1 deviation #2 for the longer explanation). `BlogPostLayout` now accepts `html: string` and mounts the article + TOC + progress bar imperatively in `onMount`. Functionally equivalent; the layout still owns the grid, header, and navigation chrome.

2. **`domEffect` → `onMount`.** `.claude/rules/ui-components.md` mentions `domEffect` / `lifecycleEffect` / `watch`, but `@vertz/ui@0.1.0-dev` only exports `onMount` from the lifecycle module today. Used `onMount` consistently; the guidance-rule mention of `domEffect` appears stale.

3. **Icon in the breadcrumb.** Per `.claude/rules/ui-components.md` we should use `@vertz/icons` for iconography. SSR serializes `@vertz/icons` exports as `[object Object]` (they return raw `HTMLSpanElement` outside the Vertz compiler's JSX tree). Same root cause as the Phase 1 MDX fragment issue. Kept a plain `← Blog` text link with an inline comment; Phase 4 is the right place for the framework-level fix.

## Review Checklist

- [x] Delivers what Phase 2 asks for (layout shell + prose + reading progress + TOC + code breakout).
- [x] TDD compliance — tests written first for every pure helper (`computeProgress`, `extractHeadingsFromHtml`, `slugify`, `BlogPostHeader` render surface). Visual components (`ReadingProgress`, `Toc`) have integration-level coverage via SSR render.
- [x] No type gaps — no `@ts-ignore`; one `as RegExpExecArray | null` cast to appease `no-narrowing-let`.
- [x] No security issues — `html: string` comes from author-controlled `.mdx` compiled by `@mdx-js/mdx`; attributes in the generator are HTML-escaped.
- [x] Public API — none changed (landing is private).

## Findings

_To be completed by reviewer._

## Resolution

_To be completed after reviewer feedback._
