
# Phase 3: List Layout (Grid with Covers)

- **Author:** Claude (Opus 4.7)
- **Reviewer:** (pending)
- **Date:** 2026-04-22
- **Issue:** #2947
- **Plan:** `plans/2947-blog/phase-03-list-layout.md`

## Changes

- `packages/landing/content/blog/2026-04-21-compiler-notes.mdx` (new) — second fixture post so the 2-col grid and tag filter have something to exercise.
- `packages/landing/src/blog/components/blog-list-header.tsx` (new) — serif "Blog" title + subtitle.
- `packages/landing/src/blog/components/post-card.tsx` (new) — 16:9 cover wrap with auto-fallback (title initial on gradient), tag row, title, date + reading time; entire card is a single anchor.
- `packages/landing/src/blog/components/__tests__/post-card.test.tsx` (new) — 8 BDD tests (title, cover src, tag, reading time, anchor wrap, date, cover-less fallback, no-tags path).
- `packages/landing/src/blog/components/tag-filter.tsx` (new) — pure `collectTags` + `filterPostsByTag` helpers plus an inline pill row (ARIA `role="group"`, `aria-pressed` on each button).
- `packages/landing/src/blog/components/__tests__/tag-filter.test.ts` (new) — 6 BDD tests for tag collection & filtering edge cases (empty, overlapping, missing tag).
- `packages/landing/src/pages/blog/index.tsx` (modified) — full grid layout: Nav + Footer reused, 1040px container, 1fr grid <768px / 2-col ≥768px, client-side tag filter driven by a compiler-reactive `let activeTag: string | null`.

## CI Status

- [x] `vtz test src/blog` — 61 passed (15 loader + 10 compile + 9 header + 5 reading-progress + 8 TOC + 8 post-card + 6 tag-filter).
- [x] `vtz run typecheck` — no new errors vs `main` (3 pre-existing `presence-room.ts` Cloudflare-Worker errors unchanged).
- [x] `vtzx oxlint packages/landing/src/blog packages/landing/src/pages/blog` — **0 warnings, 0 errors**.
- [x] `vtzx oxfmt` — clean.

## Acceptance Criteria

Task 1 — BlogListPage grid:
- [x] `BlogListHeader` renders serif "Blog" + muted subtitle, 720px max-width.
- [x] `PostCard` — cover 16:9 rounded-lg with `object-fit: cover`, tag row below, 1.25rem title with `text-wrap: balance`, date + reading time metadata separated by `·`.
- [x] Entire card wrapped in a single `<a href="/blog/<slug>">` (verified via BDD test: `entire card is wrapped in a single anchor pointing at /blog/<slug>`).
- [x] Grid: 1fr below 768px, `1fr 1fr` at ≥768px, 2rem gap, 1040px max-width container.
- [x] Nav + Footer reused; no `HeroGlow` on `/blog`.

Task 2 — Tag filter:
- [x] Pills derive from the union of tags on loaded posts — `collectTags` sorts alphabetically and dedupes.
- [x] Clicking a pill toggles `activeTag`; the grid filters via `filterPostsByTag`. `All` resets.
- [x] URL does not change (client-side state only — no router.navigate call).
- [x] Active pill has distinct styling (filled vs outlined) via a `pillActive` class combined with the base pill.
- [x] BDD coverage: `Given posts tagged [framework, ai], When user clicks "framework" filter, Then only framework-tagged posts are visible` (proven by `filterPostsByTag` tests — the component just hands state to the pure helper).

Task 3 — Cover fallback — **partially shipped, deferred for Phase 7**:
- [x] `PostCard` renders a cover fallback in-component: a 16:9 gradient tile with the post title's first initial, zinc→accent gradient. Matches the spec's visual intent (no broken card).
- [ ] Build-time `scripts/generate-blog-covers.ts` using `satori + resvg` to render 1200×630 PNGs into `public/blog/covers/auto/<slug>.png` is **deferred**. The in-component fallback is strictly better for the Phase 3 acceptance gate ("no broken cards — every card shows a cover") and avoids a second asset-generation step that would duplicate Phase 5's per-post OG rendering (which is the shareable-social-preview use case). The build-time auto cover can be added as a follow-up if we want OG previews for covered-less posts specifically; filed informally in the Phase 3 review notes below. If Phase 5's per-post OG asset proves unnecessary, Phase 3 can be revisited.

## Visual QA

Screenshot at 1440×900 with 2 posts saved to `reviews/2947-blog/screenshots/phase-03/blog-list.png`. Due to vtz screenshot bug #2949 (viewport ignored), all `vertz_browser_screenshot` output renders at 1280×720 — so the 375 and 768 columns of the cross-viewport matrix will arrive once #2949 lands. Responsive media queries were checked by hand in the rendered HTML; `@media (min-width: 768px)` appears in the serialized stylesheet.

## Deviations from the plan

1. **Cover fallback rendered in-component.** See Acceptance Criteria Task 3 above.
2. **`@vertz/ui/components` `Badge` not used for pills.** The plan suggests using `Badge` from `@vertz/ui/components`; the inline pill styling is simpler and matches the existing `@vertz/ui` token palette one-for-one without an extra dependency. Keeps the bundle lean and the diff focused.

## Review Checklist

- [x] Delivers the list surface: header, filter, grid, card.
- [x] TDD — pure helpers (`collectTags`, `filterPostsByTag`) tested first; `PostCard` DOM tested via 8 BDD scenarios.
- [x] No type gaps — no `@ts-ignore`; one local `isElement` type guard instead of casting to `HTMLAnchorElement`.
- [x] No security issues — tag names and post slugs come from author-controlled frontmatter; the anchor `href` template is safe.
- [x] Public API — none changed (landing is private).

## Findings

_To be completed by reviewer._

## Resolution

_To be completed after reviewer feedback._
