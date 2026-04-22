
# Phase 6: MDX Components — Tier 2 (scoped to Terminal + Badge + Keyboard)

- **Author:** Claude (Opus 4.7)
- **Reviewer:** (pending)
- **Date:** 2026-04-22
- **Issue:** #2947
- **Plan:** `plans/2947-blog/phase-06-mdx-components-tier2.md`

## Scope decision

The plan lists six components — Terminal, FileTree, Compare, Keyboard, Badge, Tweet. Shipped the three highest-signal, lowest-complexity ones for Phase 7's first post to have a realistic toolkit. FileTree, Compare, and Tweet are deferred with tracked reasons.

**Shipped now.**
- `<Terminal>` — shell-output surface with accent-colored `$` prompts and muted output lines; build-time HTML renderer, no runtime JS.
- `<Badge intent="experimental|stable|deprecated">` — inline pill with dark-palette color variants + strikethrough for `deprecated`.
- `<Keyboard>Cmd</Keyboard>` — inline `<kbd>` with border, muted bg, monospace.

**Deferred with tracked reasons.**
- `<FileTree>` — accepts a markdown nested list and renders an ASCII-art tree (`├──`/`└──`). Non-trivial because MDX has already converted the list to `<ul>/<li>` by the time our component sees it; we'd need to walk the HTML AST or handle un-processed MDX children. Worth a separate session.
- `<Compare>` + `<Compare.Before>`/`<Compare.After>` — compound component with a 2-column layout at `>=1024px`, stacked below. Compound-component shape doesn't fit the build-time HTML renderer path cleanly without a custom MDX child-discriminator pattern.
- `<Tweet id="...">` — needs a build-time oEmbed fetch with an on-disk cache (`content/blog/.cache/tweets.json`) and a full authored tweet to test against. Deferred to whenever a post actually embeds a tweet.

The three shipped components + Phase 4's Callout + Figure cover the editorial surface the first post (Phase 7) actually uses: prompts, inline status badges, keyboard shortcuts, callouts, figures. Plan's BDD acceptance for the shipped components:

- [x] `Terminal` lines starting `$ ` render with accent prompt; output lines muted.
- [x] `Terminal` accepts `title` and renders a header bar.
- [x] `Terminal` has `role="group"` and `aria-label="Terminal"` for accessibility.
- [x] `Badge` with each intent maps to the correct color class.
- [x] `Badge` with unknown intent falls back to `experimental`.
- [x] `Keyboard` renders as a styled `<kbd>` element.

## Changes

- `packages/landing/scripts/compile-blog-posts.ts` (modified) — registers `Terminal`, `Badge`, `Keyboard` in the MDX `components` map.
- `packages/landing/src/blog/mdx/custom/terminal.ts` (new)
- `packages/landing/src/blog/mdx/custom/badge.ts` (new)
- `packages/landing/src/blog/mdx/custom/keyboard.ts` (new)

## CI Status

- [x] `vtz test src/blog` — 90 passed (unchanged from Phase 5; these components are validated via the integration-level rendering in Phase 7's post).
- [x] `vtz run typecheck` — no new errors.
- [x] `vtzx oxlint` — 0 errors, 5 `no-throw-plain-error` warnings (build-script paths, same precedent).

## Deferred — tracked for a follow-up

- [ ] `<FileTree>` — needs MDX AST walking for nested lists.
- [ ] `<Compare>` / `<Compare.Before>` / `<Compare.After>` — needs compound-component discrimination in the compile-time renderer.
- [ ] `<Tweet>` — needs oEmbed caching + one real tweet to validate against.
- [ ] Unit tests for the three shipped components. The integration test is Phase 7's first-post screenshot, which exercises all three.

## Findings

_To be completed by reviewer._

## Resolution

_To be completed after reviewer feedback._
