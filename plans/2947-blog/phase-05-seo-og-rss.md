# Phase 5: SEO, OG per post, RSS, Sitemap, llms.txt

**Issue:** [#2947](https://github.com/vertz-dev/vertz/issues/2947)
**Design doc:** [`plans/2947-blog.md`](../2947-blog.md)
**Estimate:** 0.5 day
**Depends on:** Phase 3

## Context

Discovery layer. Without RSS, blog is invisible to the technical audience that reads via feed readers. Without Schema.org, it's invisible to Google as a "blog" (shows up as generic article). Without sitemap + llms.txt, it won't surface for LLM crawlers.

## Outcome

Search engines and feed readers discover and index every post with proper metadata. `/blog/feed.xml`, sitemap entries, and `llms.txt` include every post.

---

## Tasks

### Task 1: RSS feed at `/blog/feed.xml`

**Files:** (2)
- `packages/landing/src/blog/feed/rss.ts` (new)
- `packages/landing/src/worker.ts` (modified — add route handler)

**What to implement:**

`rss.ts` — `buildRssFeed(posts: LoadedPost[]): string`:
- RSS 2.0 channel: `title`, `link: https://vertz.dev/blog`, `description`, `language: en`, `atom:link` self-reference
- Per-item: `title`, `link`, `guid`, `pubDate` (RFC 822), `description` (from frontmatter), `category` (per tag)
- Limit to latest 20 posts
- Pre-generated at build time via worker fetch handler returning cached string

`worker.ts` — add handler for `GET /blog/feed.xml`: returns RSS with `content-type: application/rss+xml; charset=utf-8` and cache headers.

**Acceptance criteria:**
- [ ] BDD: `When GET /blog/feed.xml, Then response is 200 with content-type application/rss+xml`
- [ ] Feed validates on [validator.w3.org/feed](https://validator.w3.org/feed)
- [ ] Every published post appears in feed; drafts excluded in prod
- [ ] `pubDate` is valid RFC 822

---

### Task 2: Per-post OG image at build time

**Files:** (2)
- `packages/landing/scripts/generate-post-og.ts` (new)
- `packages/landing/package.json` (modified — `build` script prepends this)

**What to implement:**

For every post, render a 1200×630 OG image (different template from the cover fallback from Phase 3 — this one has more visual weight for social preview): `title + author avatar + tag + vertz.dev/blog` footer.

Output: `public/blog/og/<slug>.png`.

Referenced from post head via `<meta property="og:image">` injected by layout head logic.

**Acceptance criteria:**
- [ ] Build generates one `.png` per post under `public/blog/og/`
- [ ] `vertz.dev/blog/<slug>` HTML `<head>` contains `og:image` pointing to the generated file
- [ ] Twitter card validator renders the image correctly
- [ ] Facebook sharing debugger renders the image correctly

---

### Task 3: Schema.org `BlogPosting` JSON-LD + canonical

**Files:** (2)
- `packages/landing/src/blog/seo/json-ld.tsx` (new)
- `packages/landing/src/blog/layout/blog-post-layout.tsx` (modified — inject JSON-LD in head)

**What to implement:**

`json-ld.tsx` — `BlogPostingLd({ meta, author })`:
```ts
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": meta.title,
  "description": meta.description,
  "image": `https://vertz.dev/blog/og/${meta.slug}.png`,
  "datePublished": meta.date,
  "author": { "@type": "Person", "name": author.name, "url": `https://twitter.com/${author.twitter}` },
  "publisher": { "@type": "Organization", "name": "Vertz", "logo": { "@type": "ImageObject", "url": "https://vertz.dev/logo.png" } },
  "mainEntityOfPage": `https://vertz.dev/blog/${meta.slug}`
}
```
Renders inside `<script type="application/ld+json">`.

Also emits `<link rel="canonical" href="https://vertz.dev/blog/<slug>" />`.

**Acceptance criteria:**
- [ ] BDD: `Given a post /blog/foo, When HTML is rendered, Then head contains valid BlogPosting JSON-LD and canonical link`
- [ ] JSON-LD validates on [Rich Results Test](https://search.google.com/test/rich-results)
- [ ] No duplicate canonical tags

---

### Task 4: Sitemap + llms.txt updates

**Files:** (3)
- `packages/landing/src/blog/seo/sitemap-entries.ts` (new)
- `packages/landing/src/worker.ts` (modified — merge blog entries into existing sitemap)
- `packages/landing/src/llms-txt.ts` (modified — append posts section)

**What to implement:**

`sitemap-entries.ts` — `getBlogSitemapEntries(): SitemapEntry[]` returns `/blog` + `/blog/<slug>` for every published post with `lastmod = meta.date`.

Worker merges these with existing landing entries into `/sitemap.xml`.

`llms-txt.ts` — append a `## Blog` section listing every post as `- [Title](/blog/<slug>) — description`.

**Acceptance criteria:**
- [ ] Test: `sitemap-entries.ts` returns expected entries given fixture posts
- [ ] `/sitemap.xml` contains `/blog` and all post URLs
- [ ] `/llms.txt` contains `## Blog` with all posts listed

---

## Phase Definition of Done

- [ ] All tasks complete, BDD criteria checked
- [ ] Quality gates green
- [ ] Feed validates, JSON-LD validates, OG preview works on X and Facebook
- [ ] Phase review at `reviews/2947-blog/phase-05-seo-og-rss.md`
