# Phase 0: Prerequisites

## Context

The first adversarial review caught a hidden dependency: the strategy references blog-related files (`packages/landing/src/blog/seo/json-ld.ts`, `packages/landing/src/pages/blog/post.tsx`, RSS feed, `llms.txt` dynamic renderer) that do NOT exist on `main`. They live unmerged on `feat/2947-blog`.

Phase 1 Task 2 (SSR `<head>` injection) assumes these files exist. It does not. Without Phase 0 declared, the plan silently blocks the moment Phase 1 starts.

**Main design doc:** `plans/geo-seo-strategy.md`

**Duration:** 3 days max. If more, the strategy doesn't start.

---

## Tasks

### Task 1: Merge #2947 (blog infrastructure) to main

**Why:** Everything in Phase 1 Task 2 + Phase 2 Tasks 1–5 depends on these files existing on `main`.

**Scope:** Land the entire `feat/2947-blog` branch to `main`:
- MDX blog pipeline (Phase 1-6 of #2947)
- RSS feed at `/blog/feed.xml`
- Dynamic `llms.txt` at `/llms.txt`
- Static `/public/sitemap.xml`
- `BlogPosting` JSON-LD helper module
- First published post ("Blog runs on Vertz")
- 90 blog tests

**Acceptance criteria:**
- [ ] `feat/2947-blog` merged to `main` via standard PR flow
- [ ] `main` has `packages/landing/src/blog/seo/json-ld.ts` present
- [ ] `main` has `packages/landing/content/blog/` directory with ≥1 published post
- [ ] `main` has `/blog`, `/blog/<slug>`, `/blog/feed.xml`, `/llms.txt` routes serving correctly
- [ ] CI green on `main` after merge

---

### Task 2: Verify deferred blog items are tracked

**Why:** Phase 7 review of #2947 explicitly deferred: per-post OG image generation, SSR `<head>` injection, responsive viewport screenshots. These become Phase 1 dependencies. Confirm they are tracked so the GEO plan doesn't re-invent them.

**Acceptance criteria:**
- [ ] Issue exists for per-post OG image generation (deferred from #2947) OR ticketed as part of Phase 1 Task 2
- [ ] Issue exists for SSR `<head>` injection hook wire-up OR ticketed as part of Phase 1 Task 2
- [ ] `plans/geo-seo-strategy/phase-01-foundation-infra.md` Task 2 updated to reference these as in-scope (not "deferred")

---

## Dependencies

None. This is Phase 0 — everything depends on it.

## Done when

- [ ] Both tasks' acceptance criteria checked
- [ ] `git log main` shows #2947 commits present
- [ ] A dry-run of Phase 1 Task 2's acceptance criteria (SSR head test) can be started without missing-file errors
