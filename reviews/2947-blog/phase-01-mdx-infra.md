# Phase 1: MDX Infrastructure + Minimal Routes

- **Author:** Claude (Opus 4.7)
- **Reviewer:** staff-reviewer (Claude Opus 4.7, separate agent)
- **Date:** 2026-04-22
- **Issue:** #2947
- **Follow-up:** #2948 (vtz app build plugin hook)
- **Plan:** `plans/2947-blog/phase-01-mdx-infra.md`

## Changes

- `packages/.gitignore` (exception added via `packages/landing/src/blog/.gitignore`) — track `.generated/**` so fresh clones aren't stuck with dangling imports until `build:blog` runs.
- `packages/landing/content/blog/2026-04-22-hello-world.mdx` (new) — dev fixture post.
- `packages/landing/content/blog/authors/matheus.json` (new).
- `packages/landing/package.json` (modified) — add `@vertz/mdx` workspace dep, add `build:blog` script, chain it before `dev` / `build` / `typecheck`.
- `packages/landing/scripts/compile-blog-posts.ts` (new) — pre-build MDX → pre-rendered HTML string compiler (dogfoods `@vertz/mdx`'s unified pipeline with Shiki for syntax highlighting).
- `packages/landing/src/app.tsx` (modified) — register `/blog` and `/blog/:slug` routes.
- `packages/landing/src/blog/.generated/manifest.ts` (generated, committed).
- `packages/landing/src/blog/__tests__/compile-blog.test.ts` (new) — 10 BDD tests for the compile pipeline.
- `packages/landing/src/blog/__tests__/load-posts.test.ts` (new) — 15 BDD tests for pure loader helpers.
- `packages/landing/src/blog/load-posts.ts` (new) — pure helpers + runtime loaders.
- `packages/landing/src/blog/types.ts` (new) — `PostMeta`, `Author`, `LoadedPost`, `GeneratedPost`.
- `packages/landing/src/pages/blog/index.tsx` (new) — minimal listing page.
- `packages/landing/src/pages/blog/post.tsx` (new) — post detail page, renders body via `innerHTML`.

## CI Status

- [x] `vtz test src/blog/__tests__/` — 25 passed (15 loader + 10 compile).
- [x] `vtz test` (landing) — 56 passed.
- [x] `vtz run typecheck` (runs `build:blog` first, then `tsgo --noEmit`) — only the 3 pre-existing `presence-room.ts` Cloudflare-Worker errors remain (identical to the `main` baseline; verified via `git stash`).
- [x] `vtzx oxlint packages/landing/src/blog packages/landing/src/pages/blog packages/landing/scripts/compile-blog-posts.ts` — 0 errors, 3 warnings (all `no-throw-plain-error` in build-script context — matches the existing precedent in `scripts/generate-og.ts`).
- [x] `vtzx oxfmt` — clean.

Monorepo-wide `vtz test` on this branch: **same counts as `main`** (15473 passed / 85 failed). The 85 failures are pre-existing environment issues in other packages (install, build, docs) and unrelated to this phase. `@vertz/landing` is excluded from the monorepo CI filters (see `package.json#ci:test`).

## Acceptance Criteria

Task 1 — Register MDX plugin:
- [x] `@vertz/mdx` wired into landing (via a pre-build script — see Deviations).
- [x] Build emits compiled artifacts from `.mdx` sources.

Task 2 — Post loader + types:
- [x] Given a `.mdx` file with frontmatter, `getAllPosts()` returns `LoadedPost` with typed `meta`.
- [x] Given `draft: true` + `NODE_ENV=production`, the post is filtered out.
- [x] Given `draft: true` + `NODE_ENV=development`, the post is included.
- [x] `readingTime` computed from word count @ 220 wpm. 440 words → 2 min verified in two ways: unit test (`computeReadingTime(440) === 2`) and round-trip test (a 440-word MDX fixture compiled by `compileBlog` produces `wordCount: 440` in the manifest).
- [x] Posts sort by `date` descending.

Task 3 — Routes `/blog` and `/blog/:slug`:
- [x] Routes registered in `app.tsx`.
- [x] `vtz dev` starts without errors (captured via `vtz 0.2.78` screenshot tool — see `reviews/2947-blog/screenshots/phase-01/`).
- [x] `/blog` shows the sample post title linked to its slug (screenshot).
- [x] `/blog/hello-world` renders the compiled MDX body (h2, p, inline `code`, ul) — screenshot shows the full rendered prose.
- [x] Unknown slug shows "Post not found" (verified via curl).

Task 4 — Sample fixture + author:
- [x] `2026-04-22-hello-world.mdx` exists and is compiled into the manifest.
- [x] `authors/matheus.json` parses; `loadAuthor('matheus')` returns `Matheus Poleza`.

## Screenshots (Phase 1 minimal, full-page)

- `reviews/2947-blog/screenshots/phase-01/blog-list-1440.png` — `/blog` at 1440×900
- `reviews/2947-blog/screenshots/phase-01/blog-post-1440.png` — `/blog/hello-world` at 1440×900

Both captured via `vtz 0.2.78`'s `vertz_browser_screenshot` MCP tool (#2865 dogfood) and stored in the review folder. No `[object Object]`, no console errors.

## Deviations from the plan

1. **MDX plugin registration mechanism.** The plan prescribes adding `createMdxPlugin()` to a `build.config.ts` in `packages/landing/`. The vtz UI app build pipeline (`packages/cli/src/production-build/ui-build-pipeline.ts`) does not expose a user-plugin extension point — plugins are only configurable for *library* builds via `@vertz/build`. **Workaround:** a pre-build script that invokes `compileMdx()` from `@vertz/mdx` on every `content/blog/*.mdx` file and emits a typed manifest. The build / dev / typecheck scripts chain `build:blog` ahead of vtz. **Follow-up filed as #2948** — exposing a user-plugin hook in the UI app build pipeline so landing can delete this pre-step.

2. **HTML rendering path (Phase 1 only).** The compiled MDX module from `@mdx-js/mdx` + `@vertz/ui/jsx-runtime` returns a `DocumentFragment`. The Vertz compiler's SSR serializer cannot mix that fragment into its own tree — it falls back to `String(children)` → `[object Object]`. Phase 4 (MDX component overrides) will resolve this with a shared runtime. For Phase 1 we pre-render each post's body to an HTML string (pattern copied from `packages/docs/src/dev/compile-mdx-html.ts` — a tiny string-emitting JSX shim over `@mdx-js/mdx`'s `function-body` output + Shiki) and inject it via `innerHTML` in `post.tsx`. The dogfood surface is preserved — we still use `@vertz/mdx`'s unified pipeline, just with a string runtime in place of the DOM one.

3. **Manifest shape.** The plan describes `import.meta.glob('content/blog/*.mdx')`. vtz does not implement `import.meta.glob` today, so the generator emits a static manifest (`.generated/manifest.ts`) with explicit imports. Pragmatically equivalent — the type graph is fully resolved at compile time.

## Review Checklist

- [x] Delivers what the ticket asks for (Phase 1 scope).
- [x] TDD compliance — loader tests written first (RED → GREEN), compile-script tests added after the reviewer flagged their absence.
- [x] No type gaps — no `@ts-ignore`; two `as any[]` local aliases used for unified's loose `PluggableList` typing (no `as unknown as T` double-casts, so `no-double-cast` is clean).
- [x] No security issues — HTML body injection is over author-controlled `.mdx` content; attribute values are HTML-escaped by the string JSX shim.
- [x] Public API — none changed (landing is private).

## Findings & Resolutions

### Blockers (reviewer)
- **B1 — Fresh clone bootstrap broken.** `manifest.ts` imported files excluded by `packages/.gitignore`.
  - **Resolved.** Added `packages/landing/src/blog/.gitignore` that re-enables tracking inside `.generated/**`, then removed the `.js`/`.d.ts` intermediate artifacts entirely when we switched to HTML-string rendering. Only `manifest.ts` is committed now; a fresh clone gets a working import graph on the first `bun run build:blog` (automatically run by `dev` / `build` / `typecheck`).
- **B2 — No evidence `/blog` actually renders.** Author's self-review had no screenshot, no curl, no log.
  - **Resolved.** `vtz dev` started cleanly on `localhost:3000`. Captured screenshots of both `/blog` and `/blog/hello-world` at 1440×900 using `vertz_browser_screenshot` (vtz 0.2.78 MCP, #2865 dogfood). Verified /blog lists the post, /blog/hello-world renders the MDX body, /blog/no-such-slug renders "Post not found".
- **B3 — Hand-rolled YAML parser fragile.**
  - **Resolved.** Replaced with `@mdx-js/mdx` + `remark-mdx-frontmatter` (a real YAML parser). The compile script compiles each post once with `@vertz/mdx` to extract `frontmatter` (a JSON-literal export — regex-parsed, no runtime import needed), then compiles a second time with a string JSX runtime to render the body HTML. Added a dedicated BDD test with a tricky title (`"Shipping v0.1: lessons, learned"` with commas and colons inside quotes) to prove the new parser handles it.

### Should-fix (reviewer)
- **S1 — Compile script had no tests.** Added 10 BDD tests in `compile-blog.test.ts` covering `countWords` (fenced blocks, JSX tags, empty body), `toRawFrontmatter` (required/optional/tag filtering), `compileBlog` (empty dir, tricky YAML, 440-word round-trip → `wordCount: 440` in the manifest).
- **S2 — Use `createMdxPlugin` from `@vertz/mdx` directly.** Filed follow-up #2948 proposing a user-plugin hook in the vtz UI app build pipeline. Blog will migrate off the pre-build script once #2948 ships.
- **S3 — `loadAuthor` throws on missing author.** Changed to return `Author | null`.
- **S4 — `PostComponent` loose.** N/A after refactor — the manifest now carries an HTML string (`html: string`) rather than a component function. Phase 4 will revisit when it adds component overrides.
- **S5 — Dead ambient wildcard module declaration.** Removed `.generated/posts.d.ts` entirely; the HTML-string design no longer needs the shim.

### Nits
- Replaced unicode arrow with `@vertz/icons`' `ArrowLeftIcon` — then reverted. The `@vertz/ui` SSR pipeline serializes `@vertz/icons` exports as `[object Object]` today (they return raw `HTMLSpanElement` outside JSX). Kept a plain text "← Blog" with an inline comment pointing at Phase 2 for the holistic fix.
- Sort comparison inside `compile-blog-posts.ts` switched to `localeCompare` to match `sortByDateDesc` in `load-posts.ts`.

## Resolution

All three blockers addressed; should-fixes S1, S3, S5 closed; S2 tracked as #2948; S4 obsoleted by the HTML-string refactor. Phase 1 ready to merge into the feature-branch history.
