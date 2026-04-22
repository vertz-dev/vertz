# Phase 2: Post Layout (Dark)

**Issue:** [#2947](https://github.com/vertz-dev/vertz/issues/2947)
**Design doc:** [`plans/2947-blog.md`](../2947-blog.md)
**Estimate:** 1.0 day
**Depends on:** Phase 1

## Context

Shapes how every post looks: Nav + Footer reused from landing, cover, typography, reading progress, TOC, code breakout. Dark zinc theme (same as landing). This phase is the single most important for "not looking broken" — per explicit direction from the plan conversation. Skip `HeroGlow`; this is a reading surface, not marketing.

## Outcome

Any `.mdx` in `content/blog/` rendered at `/blog/<slug>` uses the `BlogPostLayout`, with cover, title, metadata, prose typography, sticky TOC (≥1024px), reading progress bar, code breakout, and reused Nav/Footer.

---

## Tasks

### Task 1: BlogPostLayout shell (3-col grid)

**Files:** (3)
- `packages/landing/src/blog/layout/blog-post-layout.tsx` (new)
- `packages/landing/src/blog/layout/blog-post-header.tsx` (new)
- `packages/landing/src/pages/blog/post.tsx` (modified)

**What to implement:**

`BlogPostLayout` — page shell:
- Reuses `Nav` and `Footer` from `packages/landing/src/components/`
- Breadcrumb row with `← Blog` link
- 3-column CSS grid at `>=1024px`: `[empty gutter 200px] [body 640px] [TOC 200px]`
- Single-column below `1024px`: body full-width, 16px horizontal padding
- `post.tsx` wraps `<post.Component />` in `<BlogPostLayout meta={post.meta}>`

`BlogPostHeader` — above the prose body:
- Tag row (`compiler` style, accent color)
- `h1` title (DM Serif Display, 2.75rem, line-height 1.1, `text-wrap: balance`)
- Description paragraph (muted, 17px)
- Author row: avatar + name + date + reading time (joined with `·`)
- Cover image (aspect 16:9, rounded-lg, max-width 800px) — rendered only when `meta.cover` exists

**Acceptance criteria:**
- [ ] BDD: `Given a post rendered in viewport >=1024px, When the layout mounts, Then TOC column appears on the right`
- [ ] BDD: `Given viewport <1024px, When the layout mounts, Then TOC column is hidden and body uses full width with 16px padding`
- [ ] Nav + Footer render identically to landing home
- [ ] `HeroGlow` is NOT present on blog routes

---

### Task 2: Prose typography

**Files:** (2)
- `packages/landing/src/blog/styles/prose.ts` (new)
- `packages/landing/src/blog/styles/prose.test.ts` (new)

**What to implement:**

`css()` scoped style for prose body container. Applies:
- Body: 17px, DM Sans, line-height 1.7, `text-wrap: pretty`
- h2: 1.75rem, weight 600, `margin-top: 3rem`, `scroll-margin-top: 80px`
- h3: 1.25rem, weight 600, `margin-top: 2rem`, `scroll-margin-top: 80px`
- h4: 1.05rem, weight 600
- Inline `code`: 0.9em, JetBrains Mono, `background: bg.muted`, `padding: 0 0.25rem`, `border-radius: sm`
- `ul`/`ol`: list spacing 0.5rem, custom bullet color accent
- `blockquote`: border-left 3px accent, padding-left 1.5rem, italic, text.muted
- `hr`: renders as three dots `· · ·` centered with `color: muted`
- `a`: internal underline on hover (zinc.200); external rendered elsewhere (see Phase 4)

**Acceptance criteria:**
- [ ] Test: body container computed styles match token values
- [ ] Test: heading hierarchy selectors resolve the scale above
- [ ] Visual: snapshot of a post in a viewport test renders readably

---

### Task 3: Reading progress bar

**Files:** (2)
- `packages/landing/src/blog/components/reading-progress.tsx` (new)
- `packages/landing/src/blog/components/reading-progress.test.tsx` (new)

**What to implement:**

Fixed-position 2px bar at the top of the viewport (below Nav). Tracks scroll position relative to the post body container (not viewport). Width of filled portion updates via signal on scroll.

```tsx
<ReadingProgress bodyRef={ref} />
```

**Acceptance criteria:**
- [ ] Test: Given body scrollTop = 0, Then progress width = 0%
- [ ] Test: Given scroll reaches end of body, Then progress width = 100%
- [ ] Test: throttled via rAF (no direct scroll listener setState)
- [ ] Visual: bar is sticky below Nav, not overlapping it

---

### Task 4: Table of contents (reused from docs)

**Files:** (2)
- `packages/landing/src/blog/components/toc.tsx` (new, thin wrapper)
- `packages/landing/src/blog/layout/blog-post-layout.tsx` (modified)

**What to implement:**

Reuse `extract-headings.ts` from `packages/mdx/src` or `packages/docs/src/mdx/` (whichever is exported) to produce TOC entries from the rendered post. Render h2 and h3 only (skip h4). Current entry highlighted via IntersectionObserver on headings.

Hidden on `<1024px`. Sticky at top-offset `120px` (Nav height + gap) on `>=1024px`.

**Acceptance criteria:**
- [ ] BDD: `Given a post with h2 and h3 headings, When viewport is >=1024px, Then TOC lists h2 entries with h3 children indented`
- [ ] BDD: `Given user scrolls past a heading, Then its TOC entry becomes active`
- [ ] Clicking a TOC entry scrolls with `scroll-margin-top: 80px` preserved

---

### Task 5: Code block breakout + Shiki base theme

**Files:** (2)
- `packages/landing/src/blog/mdx/shiki-config.ts` (new)
- `packages/landing/src/blog/styles/code-breakout.ts` (new)

**What to implement:**

`shiki-config.ts` — single export:
```ts
export const shikiOptions = {
  theme: 'vitesse-dark',
  transformers: [],   // transformers added in Phase 4
};
```

`code-breakout.ts` — CSS applied to `pre` inside prose container:
- Base: `max-width: 100%` (respects body 640px width)
- At `>=1024px`: `margin-left: -80px; margin-right: -80px; max-width: 800px`

Apply to compiled code blocks (wrapper `div` around `pre`). Phase 4 enhances with title/linenumbers/etc; this phase just establishes width behavior and applies the single theme.

**Acceptance criteria:**
- [ ] Test: at viewport `>=1024px`, code block `pre` renders with computed width `800px`
- [ ] Test: at viewport `<1024px`, code block `pre` stays within body width
- [ ] Visual: code block reads clearly in `vitesse-dark`; no FOUC

---

## Phase Definition of Done

- [ ] All tasks complete, BDD acceptance criteria checked
- [ ] Quality gates: `vtz test && vtz run typecheck && vtz run lint` green
- [ ] Visual QA using JamExt or Chrome DevTools MCP at 3 viewports: 375px, 768px, 1440px
- [ ] Sample post renders with cover, typography, TOC (≥1024), reading progress, code breakout
- [ ] Phase review file at `reviews/2947-blog/phase-02-post-layout.md`
