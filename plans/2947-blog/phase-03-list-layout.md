# Phase 3: List Layout (Grid with Covers)

**Issue:** [#2947](https://github.com/vertz-dev/vertz/issues/2947)
**Design doc:** [`plans/2947-blog.md`](../2947-blog.md)
**Estimate:** 0.5 day
**Depends on:** Phase 1, Phase 2

## Context

Replaces the Phase 1 minimal listing with the final grid: 2-col ≥768px, 1-col below, each card showing cover + tag + title + date + reading time. Tag filter toggles visibility client-side (no route change). Posts without a `cover` in frontmatter receive an auto-generated OG image to keep the grid visually consistent.

## Outcome

`/blog` shows a 2-col grid of post cards. Tag filter pills at the top toggle card visibility. Every card has a cover — real or auto-generated.

---

## Tasks

### Task 1: BlogListPage grid layout

**Files:** (3)
- `packages/landing/src/pages/blog/index.tsx` (modified)
- `packages/landing/src/blog/components/post-card.tsx` (new)
- `packages/landing/src/blog/components/blog-list-header.tsx` (new)

**What to implement:**

`BlogListHeader` — title "Blog" + subtitle "Notes from building an agent-native framework." Max-width 720px.

`PostCard` — single card:
- Cover image wrapper (aspect-ratio 16:9, rounded-lg, `object-fit: cover`)
- Tag row below cover (accent color)
- Title (DM Sans, 1.25rem, weight 600, `text-wrap: balance`)
- Date (YYYY · MM · DD) + reading time (`·` separated, muted)
- Entire card is a single `<a>` wrapping everything

`BlogListPage` — grid container:
- Reuses `Nav` and `Footer`
- Grid: `grid-template-columns: 1fr 1fr` at `>=768px`, single column below
- Gap: 2rem
- Container max-width: 1040px (fits 2 cards + gap)

**Acceptance criteria:**
- [ ] BDD: `Given 4 posts, When user opens /blog at >=768px viewport, Then 4 cards render in a 2-col grid`
- [ ] BDD: `Given viewport <768px, Then cards stack in a single column with 2rem gap`
- [ ] Clicking any part of a card navigates to `/blog/<slug>`
- [ ] No `HeroGlow` on list page

---

### Task 2: Tag filter (client-side)

**Files:** (2)
- `packages/landing/src/blog/components/tag-filter.tsx` (new)
- `packages/landing/src/blog/components/tag-filter.test.tsx` (new)

**What to implement:**

Tag pills above grid: `[All] [framework] [compiler] [ai] [dx]` (derived from union of all post tags).

- `let activeTag: string | null = null` (signal via compiler)
- Clicking a tag toggles it; clicking `All` resets
- Filter is pure CSS (`:not([data-tag~="compiler"])`) or JSX conditional render — pick JSX conditional for simplicity
- Tag pills use `Badge` from `@vertz/ui/components` (or inline if the styling clashes)

**Acceptance criteria:**
- [ ] BDD: `Given posts tagged [framework, ai], When user clicks "framework" filter, Then only framework-tagged posts are visible`
- [ ] BDD: `Given filter "framework" active, When user clicks "All", Then all posts are visible`
- [ ] URL does not change on filter toggle (no route change, no history entry)
- [ ] Active tag has visually distinct styling (filled vs outlined)

---

### Task 3: Cover fallback — auto-generated OG

**Files:** (3)
- `packages/landing/scripts/generate-blog-covers.ts` (new)
- `packages/landing/scripts/generate-og.ts` (modified to reuse template)
- `packages/landing/package.json` (modified — `build` script prepends `bun scripts/generate-blog-covers.ts`)

**What to implement:**

Node script executed during `build`:
1. Reads all posts via `load-posts.ts`
2. For each post with no `cover`: render a 1200×630 PNG using satori + resvg (already dependencies), template `title + tag + gradient zinc→accent`
3. Write to `packages/landing/public/blog/covers/auto/<slug>.png`
4. Set `meta.cover = /blog/covers/auto/<slug>.png` in memory at load time (loader checks for auto file if frontmatter omits)

Dev server: on first request for a missing cover, generate and cache in-process to avoid rebuild loops.

**Acceptance criteria:**
- [ ] BDD: `Given a post without "cover" in frontmatter, When build runs, Then /public/blog/covers/auto/<slug>.png exists`
- [ ] BDD: `Given a post with "cover" in frontmatter, Then auto-generation is skipped for that slug`
- [ ] Generated cover contains title, tag, correct aspect ratio
- [ ] Build does not fail if `@resvg/resvg-js` is missing (friendly error, but it's already a landing dep)

---

## Phase Definition of Done

- [ ] All tasks complete, BDD criteria checked
- [ ] Quality gates green (`vtz test && vtz run typecheck && vtz run lint`)
- [ ] Visual QA at 3 viewports with 2+ posts (one with cover, one without)
- [ ] No broken cards — every card shows a cover
- [ ] Phase review at `reviews/2947-blog/phase-03-list-layout.md`
