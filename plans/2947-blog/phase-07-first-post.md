# Phase 7: First Real Post + Cross-Viewport QA

**Issue:** [#2947](https://github.com/vertz-dev/vertz/issues/2947)
**Design doc:** [`plans/2947-blog.md`](../2947-blog.md)
**Estimate:** 0.5 day
**Depends on:** Phases 1–6

## Context

Everything is ready. Now we write the inaugural post to validate the whole pipeline end-to-end and establish the editorial voice. Dogfood: the first post is about why the blog itself is dogfooded in Vertz. Before publishing, full cross-viewport QA with real content (not fixtures).

## Outcome

`vertz.dev/blog` is live with one published post, valid RSS, valid sitemap, OG rendering correctly on X and LinkedIn preview validators.

---

## Tasks

### Task 1: Write the first post

**Files:** (3)
- `packages/landing/content/blog/2026-04-22-blog-runs-on-vertz.mdx` (new — replaces dev fixture)
- `packages/landing/public/blog/covers/blog-runs-on-vertz.png` (new — custom cover)
- `packages/landing/content/blog/authors/matheus.json` (modified — finalize bio/avatar)

**What to implement:**

Post topic: "Why the Vertz blog runs on Vertz" — a ~1500-word piece covering:
- The dogfood argument (marketing + stress-testing the framework)
- What we rejected and why (Mintlify, Astro, Next)
- Technical walkthrough using `<FileTree>`, `<Compare>`, `<CodeGroup>`, `<Callout>`, `<Terminal>`, `<Figure>`
- Screenshot of the blog being edited in VS Code
- Link back to the issue (#2947) and the design doc

Frontmatter:
```yaml
title: "Why the Vertz blog runs on Vertz"
slug: blog-runs-on-vertz
date: 2026-04-22
author: matheus
tags: [meta, dx, framework]
description: "We could have used Astro or Mintlify. We didn't. Here's what we learned dogfooding @vertz/mdx as our blog engine."
cover: /blog/covers/blog-runs-on-vertz.png
draft: false
```

Content must exercise at least: `<Callout>`, `<Figure>`, `<CodeGroup>`, `<Steps>` (Tier 1) + `<Terminal>`, `<FileTree>`, `<Compare>`, `<Badge>` (Tier 2).

**Acceptance criteria:**
- [ ] Post renders in dev at `/blog/blog-runs-on-vertz`
- [ ] All frontmatter fields valid
- [ ] At least 8 of the 10 Tier 1+2 custom components appear in the post
- [ ] Word count: 1200–2000
- [ ] No lint/format issues in the `.mdx`

---

### Task 2: Cross-viewport QA with JamExt / Chrome DevTools MCP

**Files:** (1)
- `reviews/2947-blog/phase-07-first-post.md` (new — QA notes with screenshots referenced)

**What to implement:**

Using JamExt or Chrome DevTools MCP, load the deployed preview at 3 viewports and validate:

**375px (mobile):**
- Cover scales without crop
- Title wraps with balance, no overflow
- Code blocks horizontal-scroll with shadow hint
- TOC hidden
- Nav and Footer readable
- Reading progress bar visible

**768px (tablet):**
- List grid shows 2 columns
- Post body max-width respected
- TOC still hidden (below 1024px breakpoint)

**1440px (desktop):**
- 3-col post layout (gutter, body, TOC)
- TOC sticky and tracks scroll
- Code blocks break out to 800px
- Reading progress works

Record findings in the review file. If any viewport is broken, flag as blocker, fix, re-verify.

**Acceptance criteria:**
- [ ] Screenshots captured at each viewport (stored as attachments in Jam or saved under `reviews/2947-blog/screenshots/`)
- [ ] Every known edge case from the design doc "Edge Cases" table manually verified
- [ ] Lighthouse score: Performance ≥90, Accessibility ≥95, SEO 100
- [ ] No console errors on any viewport

---

### Task 3: External validators

**Files:** (1)
- `reviews/2947-blog/phase-07-first-post.md` (modified — append validator results)

**What to implement:**

Run these validators against the deployed preview URL and record results:

1. [W3C RSS Validator](https://validator.w3.org/feed/) for `/blog/feed.xml` → must be valid
2. [Google Rich Results Test](https://search.google.com/test/rich-results) for `/blog/blog-runs-on-vertz` → `BlogPosting` detected
3. [X (Twitter) Card Validator](https://cards-dev.twitter.com/validator) → summary_large_image with cover
4. [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/) → preview renders
5. Fetch `/llms.txt` → contains the post
6. Fetch `/sitemap.xml` → contains `/blog` and the post URL

**Acceptance criteria:**
- [ ] All six validators pass
- [ ] Results pasted into the review file with timestamps

---

### Task 4: Changeset (optional — blog is not a published package)

**Files:** (0 or 1)
- None by default.

**What to implement:**

Blog lives in `packages/landing` which is private (`"private": true`). No changeset required. If any published package gained a feature during Phases 1–6 (e.g., `@vertz/mdx` transformers exported), add a patch changeset per policy.

**Acceptance criteria:**
- [ ] Confirm no published package API changed; OR changeset added if it did

---

## Phase Definition of Done

- [ ] All tasks complete, BDD and validator checks passed
- [ ] First post published at `vertz.dev/blog/blog-runs-on-vertz` (after final PR merge)
- [ ] Retrospective at `plans/post-implementation-reviews/2947-blog.md` (per design-and-planning.md)
- [ ] Build-in-public Twitter post drafted at `~/vertz-dev/insights/2947-blog-launch.md` (per build-in-public.md)
- [ ] Issue #2947 moved to Done on project board
- [ ] Wiki archival performed (per local-phase-workflow.md § 6)
