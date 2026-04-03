# Design: Document `src/server.ts` Auto-Discovery Convention (#2230)

## Summary

`vtz dev` auto-discovers `src/server.ts` (or `.tsx`) as the API handler entry. This convention is undocumented and easily confused with `compiler.entryFile` in `vertz.config.ts` (which controls codegen/compilation, not the API server). The codegen docs even show `entryFile: 'src/api/server.ts'` — which looks like a server entry config but is actually the codegen entry point.

## API Surface

### Documentation: New page `project-structure.mdx` (root-level, Getting Started group)

Placed in the "Getting Started" group after `installation` and before `conventions`. This is the natural discovery point — developers install, then need to understand the project layout.

The page centers on an **app type detection table** as its primary reference:

| Files present | App type | What `vertz dev` does |
|---|---|---|
| `src/app.tsx` only | UI-only | Dev server + SSR + HMR, no API |
| `src/server.ts` only | API-only | API server with watch mode, no UI |
| `src/app.tsx` + `src/server.ts` | Full-stack | API server + UI dev server + SSR + HMR |
| Neither | Error | Throws: "No app entry found" |

The canonical server entry convention is **`src/server.ts`** (or `.tsx`). This is the only path supported by both the Rust runtime and the TypeScript CLI.

> **Note on TS CLI fallback:** The TypeScript CLI (`bunx vertz dev`) also checks `src/api/server.ts` and `.js` extensions as a fallback. The Rust runtime (`vtz dev`) does not. To ensure portability, always use `src/server.ts` or `src/server.tsx`.

The page includes a **comparison table** to address the `compiler.entryFile` confusion:

| Config | What it does | What it does NOT do |
|---|---|---|
| `compiler.entryFile` | Tells codegen which file to analyze for entities/access | Does NOT start the API server |
| `src/server.ts` (file convention) | Auto-detected as the runtime API server entry | Does NOT affect codegen scanning |

With the note: "The default for `compiler.entryFile` is `src/app.ts`. You only need to set it if your entity definitions live in a different file (e.g., `src/api/server.ts`). The same file can serve both purposes — they are two independent discovery mechanisms."

### Changes to existing pages

1. **`guides/server/codegen.mdx`** — Add a `<Warning>` (not `<Note>`) directly below the `compiler.entryFile` config block (line ~35):

   ```
   <Warning>
     `compiler.entryFile` tells the code generator which file to analyze.
     It is not the API server entry point. The API server is auto-detected
     from `src/server.ts` — see [Project Structure](/project-structure).
   </Warning>
   ```

2. **`installation.mdx`** — Replace the "Project structure" section (lines 91-110) with a shorter note linking to the new page: "See [Project Structure](/project-structure) for a complete guide to file conventions, including server entry points and app type detection."

### No new config option

After evaluation: **do not add `server.entryFile`** to `vertz.config.ts`.

Rationale:
- The canonical convention (`src/server.ts`) covers all practical layouts
- Adding a config option creates a second source of truth — if `server.entryFile` points to `src/backend/app.ts` while `compiler.entryFile` points to `src/api/server.ts`, developers now have two config keys with "entry" and "file" in the name, tripling the confusion this issue set out to fix
- Zero users have requested this override — the issue says "consider," not "implement"
- If a user has an unusual layout, they can re-export from the conventional path
- If demand materializes in the future, the convention-first approach doesn't preclude adding the option later

This decision is documented as a deliberate "convention over configuration" choice in the new page.

## Manifesto Alignment

- **Convention over configuration** — auto-discovery by file presence, no config needed
- **LLM-friendly** — fixed file paths are easier for LLMs to reason about than config-dependent paths
- **Zero boilerplate** — no config file entries needed for the common case

## Non-Goals

- Adding a `server.entryFile` config option (evaluated and rejected — see above)
- Changing the auto-discovery behavior
- Documenting the Rust-side `detect_server_entry()` internals (implementation detail)
- Documenting `entry-client.ts` / `entry-server.ts` in detail (out of scope for this issue)

## Unknowns

None identified.

## Type Flow Map

N/A — documentation-only change, no new types.

## E2E Acceptance Test

No code changes. Acceptance criteria:

1. A root-level `project-structure.mdx` page in `packages/mint-docs/` explains the `src/server.ts` auto-discovery convention
2. The page is in the "Getting Started" nav group, between `installation` and `conventions`
3. The app type detection table accurately describes what `vertz dev` does for each file combination
4. The distinction between `compiler.entryFile` and `src/server.ts` is clarified via comparison table
5. The docs state the canonical path is `src/server.ts` / `.tsx` and note the TS CLI fallback divergence
6. `codegen.mdx` has a `<Warning>` below the config block clarifying `compiler.entryFile`
7. `installation.mdx` links to the new page instead of having a competing project structure section
8. The "convention over configuration" decision is documented with rationale

## Implementation Plan

### Phase 1: Documentation (single phase)

**Task 1: Create project structure page + update nav**
- Files:
  - `packages/mint-docs/project-structure.mdx` (new)
  - `packages/mint-docs/docs.json` (modified — add to Getting Started group)

**Task 2: Update existing pages**
- Files:
  - `packages/mint-docs/guides/server/codegen.mdx` (modified — add `<Warning>`)
  - `packages/mint-docs/installation.mdx` (modified — replace project structure section with link)

### Content Outline for `project-structure.mdx`

```
---
title: Project Structure
description: 'How Vertz discovers entry points and organizes your project'
---

## App type detection (TABLE — centerpiece of page)
  - Which files → which app type → what vertz dev does
  - Error case when no entry found

## Full-stack project layout
  - Annotated tree showing src/server.ts, src/app.tsx, etc.
  - Only mention files relevant to entry detection

## Server entry (src/server.ts)
  - Canonical path: src/server.ts or src/server.tsx
  - Note: TS CLI also checks src/api/server.ts and .js (Rust runtime does not)
  - What happens with both src/server.ts AND src/api/server.ts: src/server.ts wins
  - What createServer() export looks like

## UI entry (src/app.tsx)
  - Canonical path: src/app.tsx or src/app.ts
  - SSR vs client-only detection

## compiler.entryFile vs server entry (COMPARISON TABLE)
  - What each does / does not do
  - Default for compiler.entryFile is src/app.ts
  - Same file can serve both purposes
  - <Warning> that entryFile is for codegen, not for starting the server

## Convention over configuration
  - Why there's no server.entryFile config option
  - The "two sources of truth" argument
  - How to handle unusual layouts (re-export from canonical path)
  - Future: option could be added if demand emerges
```

## Review Sign-offs

### DX Review — Changes Requested (addressed)
1. ~~Placement wrong~~ → Moved to root-level Getting Started group
2. ~~Need concrete comparison table~~ → Added comparison table
3. ~~Missing "two sources of truth" argument~~ → Added to rationale
4. ~~"Both files exist" scenario~~ → Added to content outline (src/server.ts wins)
5. ~~App type table should be centerpiece~~ → Made the first section
6. ~~Use Warning not Note in codegen~~ → Changed to `<Warning>`
7. ~~entry-client.ts / entry-server.ts undocumented~~ → Removed from scope (non-goal)

### Product/Scope Review — Approved
- All three acceptance criteria covered
- Scope is right
- Suggestion: specify exact nav position → Done (after installation, before conventions)
- Suggestion: forward-looking note on config option → Added

### Technical Review — Changes Requested (addressed)
1. ~~src/api/server.ts fallback only in TS, not Rust~~ → Canonical path is src/server.ts; TS fallback noted as divergence
2. ~~.js extension only in TS~~ → Same treatment — noted as TS-only
3. ~~compiler.entryFile default not stated~~ → Default (src/app.ts) now explicit
4. ~~entry-server.ts role unclear~~ → Removed from scope (non-goal for this issue)
5. ~~Error behavior when no entry found~~ → Added "Error" row to app type table
