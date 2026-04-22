# Phase 6: MDX Components — Tier 2 (Differentiator)

**Issue:** [#2947](https://github.com/vertz-dev/vertz/issues/2947)
**Design doc:** [`plans/2947-blog.md`](../2947-blog.md)
**Estimate:** 1.0 day
**Depends on:** Phase 4

## Context

Tier 2 is what makes the blog read as "the Vertz blog" rather than "a technical blog in dark mode". These components are the recurring visual vocabulary — terminal demos, file trees, before/after comparisons, keyboard shortcuts, social embeds. `TypeFlow` was moved to Tier 3 during planning.

## Outcome

Writers can use `Terminal`, `FileTree`, `Compare`, `Keyboard`, `Badge`, and `Tweet` in any post. All render SSR (no runtime JS for third-party embeds).

---

## Tasks

### Task 1: Terminal

**Files:** (3)
- `packages/landing/src/blog/mdx/custom/terminal.tsx` (new)
- `packages/landing/src/blog/mdx/custom/terminal.test.tsx` (new)
- `packages/landing/src/blog/mdx/components.tsx` (modified — register)

**What to implement:**

`<Terminal>` renders a code-block-like surface with:
- Lines starting with `$` rendered with accent-colored `$` prompt and white command
- Non-`$` lines rendered muted (output)
- Copy button that copies **only command lines** (not output) — important UX detail
- No syntax highlighting (not a programming language), JetBrains Mono throughout
- Optional `title` prop for a header (like `zsh`, `my-project/`)

**Acceptance criteria:**
- [ ] Test: lines prefixed `$` render in primary; other lines in muted
- [ ] BDD: `Given a Terminal with "$ cmd\noutput\n$ cmd2", When user clicks copy, Then clipboard receives "cmd\ncmd2" only`
- [ ] Test: optional `title` prop renders header
- [ ] Accessible: block has `role="group"` and `aria-label="Terminal"`

---

### Task 2: FileTree

**Files:** (3)
- `packages/landing/src/blog/mdx/custom/file-tree.tsx` (new)
- `packages/landing/src/blog/mdx/custom/file-tree.test.tsx` (new)
- `packages/landing/src/blog/mdx/components.tsx` (modified)

**What to implement:**

`<FileTree>` accepts markdown nested list (compiled by MDX) and transforms into an ASCII-art tree:
- Folders auto-detected by children presence (or `/` suffix)
- Leaves render with `├──` / `└──` connectors
- Nodes with `(highlighted)` suffix receive accent background + remove the suffix from display
- Monospace font

Example author input:
```mdx
<FileTree>
  - src
    - entities
      - task.ts (highlighted)
    - pages
      - home.tsx
  - vertz.config.ts
</FileTree>
```

**Acceptance criteria:**
- [ ] Test: given 3-level nested list, renders tree with correct `├──` / `└──` / `│` connectors
- [ ] Test: `(highlighted)` node receives highlight styling and renders without the suffix
- [ ] Test: root-level siblings render without indent
- [ ] Accessible: tree uses `role="tree"` and list items `role="treeitem"`

---

### Task 3: Compare (before/after)

**Files:** (2)
- `packages/landing/src/blog/mdx/custom/compare.tsx` (new — Compare + Compare.Before + Compare.After)
- `packages/landing/src/blog/mdx/custom/compare.test.tsx` (new)

**What to implement:**

Compound component:
```mdx
<Compare>
  <Compare.Before title="Prisma + tRPC + Zod">...</Compare.Before>
  <Compare.After title="Vertz">...</Compare.After>
</Compare>
```

Layout:
- `>=1024px`: side-by-side flex columns with 1px divider in between
- `<1024px`: stacked (Before above After) with horizontal divider
- Title for each column (`Before` muted, `After` accent)
- Children can be any content (code blocks, prose) — common case is two code blocks showing line count difference

**Acceptance criteria:**
- [ ] BDD: `Given Compare at >=1024px, Then Before and After render side-by-side`
- [ ] BDD: `Given <1024px, Then Before renders above After stacked`
- [ ] Title styling matches spec (Before muted, After accent)
- [ ] Works with `<CodeGroup>` nested inside

---

### Task 4: Keyboard + Badge

**Files:** (2)
- `packages/landing/src/blog/mdx/custom/keyboard.tsx` (new — Keyboard + Badge)
- `packages/landing/src/blog/mdx/custom/keyboard.test.tsx` (new)

**What to implement:**

`<Keyboard>Cmd</Keyboard>` — inline `<kbd>` with border, bg muted, font JetBrains Mono, 0.85em, padding 0 0.4em, border-radius sm.

`<Badge intent="experimental|stable|deprecated">v0.2-beta</Badge>` — inline pill. Intents map to theme colors:
- `experimental`: accent
- `stable`: green
- `deprecated`: muted (strikethrough)

Keep both small (<30 lines each).

**Acceptance criteria:**
- [ ] Test: `Keyboard` renders as `<kbd>` element with styled class
- [ ] Test: `Badge` with each intent renders with matching class
- [ ] Test: `Badge` with unknown intent falls back to experimental

---

### Task 5: Tweet (SSR oEmbed, no runtime JS)

**Files:** (3)
- `packages/landing/src/blog/mdx/custom/tweet.tsx` (new)
- `packages/landing/src/blog/mdx/custom/tweet-fetch.ts` (new — build-time fetch)
- `packages/landing/src/blog/mdx/custom/tweet.test.tsx` (new)

**What to implement:**

`<Tweet id="1234567890" />` — build-time behavior:
1. `tweet-fetch.ts` script runs at build, fetches oEmbed data from `https://publish.twitter.com/oembed?url=https://twitter.com/any/status/<id>` for all tweet IDs found in posts (regex scan over `.mdx` files)
2. Stores result in `content/blog/.cache/tweets.json` (committed — stable across builds)
3. `<Tweet>` component reads from cache at render time, outputs static HTML embed with author, avatar, text, timestamp, link back to tweet
4. No runtime script injection, no Twitter widget JS, no tracking

Fallback: if cache missing (first build with new tweet ID), render a plain link: `<a href="https://twitter.com/.../status/<id>">View tweet</a>` with a build-time warning.

**Acceptance criteria:**
- [ ] BDD: `Given a Tweet id with cached oEmbed, When post renders, Then static HTML shows tweet content without runtime JS`
- [ ] BDD: `Given a Tweet id with no cache, Then fallback link renders and build emits warning`
- [ ] No `<script>` tags from twitter.com in the rendered HTML
- [ ] Embed styling matches blog theme (dark, rounded, zinc borders)

---

## Phase Definition of Done

- [ ] All tasks complete, BDD criteria checked
- [ ] Quality gates green
- [ ] Sample post updated to demonstrate every Tier 2 component
- [ ] Test coverage ≥95% per new file
- [ ] Visual QA at 3 viewports
- [ ] Phase review at `reviews/2947-blog/phase-06-mdx-components-tier2.md`
