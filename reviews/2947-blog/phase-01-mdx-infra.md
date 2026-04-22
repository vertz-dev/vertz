# Phase 1: MDX Infrastructure + Minimal Routes

- **Author:** Claude (Opus 4.7)
- **Reviewer:** (pending)
- **Date:** 2026-04-22
- **Issue:** #2947
- **Plan:** `plans/2947-blog/phase-01-mdx-infra.md`

## Changes

- `packages/landing/content/blog/2026-04-22-hello-world.mdx` (new) — dev fixture post
- `packages/landing/content/blog/authors/matheus.json` (new)
- `packages/landing/package.json` (modified) — `@vertz/mdx` dep + `build:blog` script, typecheck/dev/build wired
- `packages/landing/scripts/compile-blog-posts.ts` (new) — pre-build compiler using `@vertz/mdx`
- `packages/landing/src/app.tsx` (modified) — register `/blog` and `/blog/:slug` routes
- `packages/landing/src/blog/.generated/manifest.ts` (new, generated — stub committed)
- `packages/landing/src/blog/.generated/posts.d.ts` (new) — ambient wildcard shim
- `packages/landing/src/blog/__tests__/load-posts.test.ts` (new) — 15 BDD tests
- `packages/landing/src/blog/load-posts.ts` (new) — pure helpers + runtime loaders
- `packages/landing/src/blog/types.ts` (new) — PostMeta / Author / LoadedPost / GeneratedPost
- `packages/landing/src/pages/blog/index.tsx` (new) — minimal listing page
- `packages/landing/src/pages/blog/post.tsx` (new) — post detail page (404-style fallback)

## CI Status

- [x] `vtz test src/blog/__tests__` — 15 passed
- [x] `vtz test` (landing) — 46 passed
- [x] `vtz run typecheck` — no new errors (3 pre-existing `presence-room.ts` Cloudflare Worker errors unchanged from `main`)
- [x] `vtzx oxlint packages/landing/...` — 0 errors, 3 warnings (all `no-throw-plain-error` in build scripts; matches the existing precedent in `scripts/generate-og.ts`)
- [x] `vtzx oxfmt ...` — clean

Monorepo-wide `vtz test` on this branch: **15473 passed / 85 failed / 175 skipped** — identical to `main` baseline (verified by `git stash && vtz test`). All 85 pre-existing failures are unrelated packages (build, og, docs, dev-orchestrator, ...) carrying environment/install issues, not regressions from this phase. `@vertz/landing` is excluded from the monorepo CI filters (see `package.json#ci:test`).

## Acceptance Criteria

Task 1 — Register MDX plugin:
- [x] `@vertz/mdx` wired into landing (via a pre-build script, see Deviations)
- [x] Build emits a compiled JS module per `.mdx` file
- [x] `bun run build:blog` produces `.generated/posts/*.js` and `.generated/manifest.ts`

Task 2 — Post loader + types:
- [x] Given a `.mdx` file with frontmatter, `getAllPosts()` returns `LoadedPost` with typed `meta`
- [x] Given `draft: true` + `NODE_ENV=production`, the post is filtered out (test: `filterDrafts runs with env="production"`)
- [x] Given `draft: true` + `NODE_ENV=development`, the post is included (test: `filterDrafts runs with env="development"`)
- [x] `readingTime` computed from word count @ 220 wpm (test: `a 440-word post maps to 2 minutes`)
- [x] Posts sort by `date` descending (test: `sortByDateDesc`)

Task 3 — Routes `/blog` and `/blog/:slug`:
- [x] Routes registered in `app.tsx`
- [x] `BlogListPage` renders an unordered list of titles linked to slugs
- [x] `BlogPostPage` reads slug via `useParams<'/blog/:slug'>()` and renders compiled MDX
- [x] Unknown slug renders a "post not found" message

Task 4 — Sample fixture + author:
- [x] `2026-04-22-hello-world.mdx` exists and loads via `getAllPosts()`
- [x] `authors/matheus.json` lookup returns "Matheus Poleza"

## Deviations from the plan

1. **MDX plugin registration mechanism.** The plan prescribes adding
   `createMdxPlugin()` to a `build.config.ts` in `packages/landing/`. In
   reality, `vtz build` (the UI app build pipeline — `packages/cli/src/production-build/ui-build-pipeline.ts`)
   does not expose a user-plugin extension point; plugins are only configurable
   for _library_ builds via `@vertz/build` (`vertz-build`). To honor the spirit
   of the plan (dogfood `@vertz/mdx`) without altering CLI internals, this
   phase adds a small pre-build script that invokes `compileMdx()` from
   `@vertz/mdx` on every `content/blog/*.mdx` file and emits JS modules plus a
   typed manifest. `vtz build` and `vtz dev` then consume the manifest like
   any other source. This is a concrete follow-up opportunity: expose a
   plugin hook in the UI app build pipeline so users can register Bun-style
   plugins from `vtz.config.ts`.

2. **Manifest shape.** The plan describes `import.meta.glob('content/blog/*.mdx')`.
   vtz does not implement `import.meta.glob` today, so the generator emits a
   static manifest (`.generated/manifest.ts`) with explicit imports. This is
   pragmatically equivalent: the compiler sees a fully typed module graph.

3. **Typed `.js` imports.** Because `packages/.gitignore` excludes `*.js` and
   `*.d.ts` under `src/`, the generator writes companion `.d.ts` files
   alongside each compiled post so `tsgo --noEmit` can resolve the modules.
   `typecheck` now runs `build:blog` first to guarantee those files exist.

## Review Checklist

- [x] Delivers what the ticket asks for (Phase 1 scope)
- [x] TDD compliance — test file written first (RED → GREEN → REFACTOR)
- [x] No type gaps — `PostComponent` returns `HTMLElement | SVGElement | DocumentFragment`, verified via `tsgo`
- [x] No security issues — pure filesystem reads, no user-input surface
- [x] Public API — none changed (landing is private)

## Findings

_To be completed by reviewer._

## Resolution

_To be completed after reviewer feedback._
