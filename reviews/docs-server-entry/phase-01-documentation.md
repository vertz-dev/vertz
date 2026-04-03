# Phase 1: Documentation — Project Structure Page

- **Author:** task-agent
- **Reviewer:** review-agent (Claude Opus 4.6)
- **Commits:** viniciusdacal/sun-valley-v2 branch
- **Date:** 2026-04-03

## Changes

- `packages/mint-docs/project-structure.mdx` (new)
- `packages/mint-docs/docs.json` (modified — nav entry added)
- `packages/mint-docs/guides/server/codegen.mdx` (modified — Warning added)
- `packages/mint-docs/installation.mdx` (modified — project structure section replaced with link)

## CI Status

- [ ] Quality gates passed (pending — review is pre-CI)

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] No type gaps or missing edge cases (see findings below)
- [x] No security issues
- [x] Public API changes match design doc

---

## Findings

### BLOCKER-1: App type detection table omits `src/entry-server.ts` as UI trigger

**File:** `project-structure.mdx`, line 12-17

The detection table says UI-only mode requires `src/app.tsx`. But in `app-detector.ts` line 49:

```ts
const hasUI = uiEntry !== undefined || ssrEntry !== undefined;
```

A project with ONLY `src/entry-server.ts` (no `src/app.tsx`) is detected as `ui-only`. This is a valid edge case — the error message in the source even lists `src/entry-server.ts` as a recognized entry.

The table is therefore **incomplete and misleading**. A developer with only `src/entry-server.ts` would expect an error based on the docs but would actually get a working UI-only dev server.

**Fix:** Add a row to the table or a Note below it:

| `src/entry-server.ts` only | **UI-only** | Dev server with SSR (legacy custom entry) |

Or at minimum, add a note explaining that `src/entry-server.ts` is a backward-compat alternative to `src/app.tsx` for triggering UI mode.

---

### BLOCKER-2: Note about TS CLI fallback paths is inaccurate regarding `.js`

**File:** `project-structure.mdx`, lines 70-73

The Note says:

> The TypeScript CLI (`bunx vertz dev`) also checks `src/api/server.ts` and `.js` extensions as fallbacks.

Looking at the source (`app-detector.ts` line 20):

```ts
const SERVER_EXTENSIONS = ['.ts', '.tsx', '.js'] as const;
```

The TS CLI checks `.js` for `src/server.js` and `src/api/server.js`, which is correct. But the Note implies `.js` is specifically a "fallback" alongside `src/api/server.ts`. The actual behavior is:

- Priority order: `src/server.ts` > `src/server.tsx` > `src/server.js` > `src/api/server.ts` > `src/api/server.tsx` > `src/api/server.js`

The wording "also checks `src/api/server.ts` and `.js` extensions" conflates two separate fallback dimensions (alternative directory + alternative extension) in a confusing way.

**Fix:** Reword to:

> The TypeScript CLI (`bunx vertz dev`) also checks `.tsx` and `.js` extensions, and looks in `src/api/` as a secondary directory. The Rust runtime (`vtz dev`) only checks `src/server.ts` and `src/server.tsx`. For portability, always use `src/server.ts`.

---

### SHOULD-FIX-1: Rust runtime SSR entry supports `.jsx` and `.js` but docs don't mention this

**File:** `project-structure.mdx`, lines 82-84

The docs say UI entry supports:
- `src/app.tsx` (preferred)
- `src/app.ts` (also supported)

But the Rust runtime's `detect_ssr_entry()` (config.rs line 279) checks `["app.tsx", "app.ts", "app.jsx", "app.js"]` — four extensions.

The TS CLI checks `.tsx` and `.ts` only.

This is a divergence worth noting. A developer using `app.jsx` would have it work on `vtz dev` but NOT on `bunx vertz dev`. Since the docs list supported extensions, they should be accurate for both runtimes.

**Fix:** Either:
- Add a note that the Rust runtime additionally supports `.jsx` and `.js` for the UI entry, or
- Document the common subset only (`.tsx` and `.ts`) and add a note about Rust-specific extras.

---

### SHOULD-FIX-2: `compiler.entryFile` default value claim needs verification context

**File:** `project-structure.mdx`, lines 117-118

The Warning says:

> The default value for `compiler.entryFile` is `src/app.ts`.

This is correct per `packages/compiler/src/config.ts` line 63 and `packages/cli/src/config/defaults.ts` line 54. Good.

However, the Warning also says:

> You only need to set it if your entity definitions live in a different file.

This is slightly misleading. If the developer's server entry IS `src/server.ts` and their entities are defined/re-exported there, they WOULD need to set `compiler.entryFile` to `src/server.ts` since the default points to `src/app.ts`. The phrasing "only need to set it if your entity definitions live in a different file" could be read as "different from `src/server.ts`" rather than "different from the default `src/app.ts`."

**Fix:** Reword to:

> The default value for `compiler.entryFile` is `src/app.ts`. If your entity definitions are exported from a different file (e.g., `src/server.ts` or `src/api/server.ts`), you must set `entryFile` to point there.

---

### NIT-1: Code example uses non-existent imports

**File:** `project-structure.mdx`, lines 90-104

```tsx
import { RouterView, defineRoutes } from 'vertz/ui';
import { registerTheme } from '@vertz/ui';
```

This imports from both `vertz/ui` and `@vertz/ui` in the same file. For a documentation page about project structure, this inconsistency may confuse developers about which package to import from. Pick one consistently, or add a comment explaining they're the same.

Also, `defineRoutes` is not a common API in the codebase examples — verify it exists as a public export.

---

### NIT-2: The `docs.json` diff includes an unrelated change

The diff shows a new `vertz/agents` group was added to `docs.json` (lines 101-104):

```json
{
  "group": "vertz/agents",
  "pages": ["guides/agents/overview", "guides/agents/workflows"]
}
```

This is unrelated to issue #2230 (project structure docs). If this was intentional as part of another change bundled in, fine. But if it was accidental, it should be in a separate commit/PR. Verify that `guides/agents/overview.mdx` and `guides/agents/workflows.mdx` actually exist — if not, this will break the Mintlify build.

---

### NIT-3: Missing `entry-client.ts` and `entry-server.ts` from the project layout tree

**File:** `project-structure.mdx`, lines 25-44

The project layout tree includes `entry-client.ts` with "(optional)" but does not include `entry-server.ts`. Since the detection code recognizes `entry-server.ts` as a backward-compat SSR entry, and it's mentioned in the error message, it should either be in the tree (with a "legacy" or "backward compat" annotation) or explicitly noted as deprecated.

---

## Verdict: CHANGES REQUESTED

Two blockers must be addressed:

1. **BLOCKER-1**: The app type detection table is incomplete — `src/entry-server.ts` triggers UI mode but is not documented.
2. **BLOCKER-2**: The Note about TS CLI fallback paths conflates two fallback dimensions in a confusing way.

Two should-fix items:

3. **SHOULD-FIX-1**: Rust runtime supports `.jsx`/`.js` for UI entry but docs don't mention this divergence.
4. **SHOULD-FIX-2**: The `compiler.entryFile` Warning phrasing is slightly ambiguous about "different file."

Three nits (non-blocking):

5. **NIT-1**: Inconsistent import paths (`vertz/ui` vs `@vertz/ui`).
6. **NIT-2**: Unrelated `vertz/agents` nav group added — verify pages exist.
7. **NIT-3**: `entry-server.ts` missing from project layout tree.

## Resolution

_Pending — awaiting fixes._
