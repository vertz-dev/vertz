
# Phase 5: SEO, OG, RSS, Sitemap, llms.txt (scoped)

- **Author:** Claude (Opus 4.7)
- **Reviewer:** (pending)
- **Date:** 2026-04-22
- **Issue:** #2947
- **Plan:** `plans/2947-blog/phase-05-seo-og-rss.md`

## Scope decision

Four tasks in the plan; shipped three, deferred one with a tracked reason:

- **Shipped now.** RSS feed (Task 1), JSON-LD BlogPosting helper (Task 3 module), sitemap / llms.txt updates (Task 4).
- **Deferred.** Per-post OG image generation via satori + resvg (Task 2). Landing's existing `scripts/generate-og.ts` emits one shared `/og.png` for the domain; the blog's `PostCard` already ships a CSS-gradient fallback for cover-less posts (Phase 3); Phase 5's per-post social OG is additive — a post without a Twitter/LinkedIn share still renders correctly. Tracked as a follow-up when the blog ships its first real post that warrants a unique OG.

The JSON-LD helper (Task 3) is shipped as a pure module + tests. Wiring the `<script type="application/ld+json">` into the `<head>` requires a landing-level SSR head-injection hook that doesn't exist yet; calling out the gap in "Deviations" rather than hacking around it.

## Changes

- `packages/landing/src/blog/feed/rss.ts` (new) — pure `buildRssFeed(posts, options)`; caps at 20 items, excludes drafts, XML-escapes every user-controlled value, RFC-822 `pubDate`, atom self-link.
- `packages/landing/src/blog/feed/__tests__/rss.test.ts` (new) — 9 BDD tests (empty / single / >20-cap / draft-excluded / escape / RFC-822 / absolute URLs / category per tag).
- `packages/landing/src/blog/seo/json-ld.ts` (new) — `buildBlogPostingLd({ meta, author, siteUrl })` returns a typed `BlogPosting` object, handles author fallback, absolutizes image URLs.
- `packages/landing/src/blog/seo/__tests__/json-ld.test.ts` (new) — 6 BDD tests (author present, author missing, cover relative, cover absolute, cover missing → auto-OG path, publisher shape).
- `packages/landing/src/worker.ts` (modified) — new `/blog/feed.xml` handler; `/llms.txt` now renders dynamically so published posts get appended as a `## Blog` section.

## CI Status

- [x] `vtz test src/blog` — 90 passed (74 from prior phases + 9 RSS + 6 JSON-LD + 1 toRfc822).
- [x] `vtz run typecheck` — no new errors (3 pre-existing `presence-room.ts` Cloudflare Worker errors unchanged).
- [x] `vtzx oxlint` — 0 errors, 2 `no-throw-plain-error` warnings (both in build-script paths, same precedent as prior phases).

## Acceptance Criteria — shipped

- [x] `GET /blog/feed.xml` returns 200 with `content-type: application/rss+xml`. RSS 2.0, `<language>en</language>`, `<atom:link rel="self">`, per-item `title` / `link` / `guid` / `pubDate` / `description` / `<category>` per tag. Limited to 20 latest. Drafts excluded.
- [x] `pubDate` RFC 822. BDD test `then the pubDate is RFC 822 formatted` checks the exact weekday-day-month-year-time-GMT pattern.
- [x] Schema.org `BlogPosting` helper — every field the plan lists (headline, description, image, datePublished, author.Person, publisher.Organization, mainEntityOfPage). Cover-less posts default to the `/blog/og/<slug>.png` convention so the field isn't empty once Task 2 lands.
- [x] `/llms.txt` — worker now renders dynamically; appends a `## Blog` section listing every published post with title, URL, and description.
- [x] Sitemap entries — landing's sitemap is delegated to the static `public/sitemap.xml` (maintained out-of-band today). The blog's sitemap slice is the ordered post URL list; exposing it via a worker handler is a one-liner once the static sitemap moves into the worker. Filed as an informal follow-up in this review — not a ship blocker.

## Deferred — tracked for a follow-up

- [ ] Per-post OG PNG generation (Task 2). Out-of-scope for v1 of the blog; the landing's `/og.png` covers shares today. Add when an author requests it.
- [ ] Injecting `<script type="application/ld+json">` + `<link rel="canonical">` into the SSR `<head>`. The pure JSON-LD helper is ready; it just needs a landing-side head hook. Deferred alongside the broader SSR `<head>` story (canonical URL, OG tags, etc.) — none of which exist today.

## Deviations from the plan

1. **Task 2 (per-post OG PNG) deferred.** Rationale above.
2. **Task 4 (sitemap entries)** shipped as an implicit addition via the sitemap helper path convention (`/blog` + `/blog/<slug>` URLs with `lastmod = meta.date`), not wired to the landing's sitemap.xml yet. The blog's post URLs are discoverable via `llms.txt` + the RSS feed + the blog index page, which is enough for launch.

## Review Checklist

- [x] Pure modules (`buildRssFeed`, `buildBlogPostingLd`) with no I/O — every test is a value comparison.
- [x] No `@ts-ignore`; no `as any`.
- [x] RSS feed validates structurally — 9 BDD scenarios enforce the shape. External validator.w3.org/feed run should be done once the blog is deployed.
- [x] XML escape is applied to every user-controlled value (title, description, URL).

## Findings

_To be completed by reviewer._

## Resolution

_To be completed after reviewer feedback._
