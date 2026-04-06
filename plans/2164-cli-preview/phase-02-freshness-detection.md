# Phase 2: Build Freshness Detection

## Context

Issue #2164 adds a `vertz preview` command that auto-builds when the production build is missing or stale. This phase implements the freshness detection logic as a pure, testable function.

Design doc: `plans/2164-cli-preview.md`

## Tasks

### Task 1: Implement `isBuildFresh()` function

**Files:**
- `packages/cli/src/commands/freshness.ts` (new)
- `packages/cli/src/commands/__tests__/freshness.test.ts` (new)

**What to implement:**

Create a pure function that checks whether the build output is newer than all source files:

```typescript
import type { AppType } from '../dev-server/app-detector';

export interface FreshnessCheckResult {
  fresh: boolean;
  reason: string; // Human-readable reason for the decision
}

export function isBuildFresh(projectRoot: string, appType: AppType): FreshnessCheckResult;
```

**Source files to scan:**
- All files in `src/` with extensions: `.ts`, `.tsx`, `.js`, `.jsx`, `.css`, `.html`
- `vertz.config.ts` (if exists)
- `package.json`
- Uses `readdirSync({ recursive: true, withFileTypes: true })`
- Skips symlinks (`dirent.isSymbolicLink()`)

**Build output markers (by app type):**
- `ui-only`: `dist/client/_shell.html` mtime (fall back to `dist/client/index.html`)
- `api-only`: `.vertz/build/index.js` mtime
- `full-stack`: `min(api_marker_mtime, ui_marker_mtime)` — the oldest marker must be newer than the newest source file

**Return values:**
- `{ fresh: true, reason: 'dist/ is up to date' }` — all markers newer than all sources
- `{ fresh: false, reason: 'dist/ is missing' }` — no markers found
- `{ fresh: false, reason: 'src/ has changes newer than build' }` — source newer than markers

**Acceptance criteria:**
- [ ] Returns `fresh: false` when dist/ doesn't exist
- [ ] Returns `fresh: false` when a src/ file is newer than the build marker
- [ ] Returns `fresh: true` when all src/ files are older than the build marker
- [ ] Checks `vertz.config.ts` mtime (not just src/)
- [ ] Checks `package.json` mtime
- [ ] Skips symlinks in src/
- [ ] Only scans files with source extensions (.ts, .tsx, .js, .jsx, .css, .html)
- [ ] Full-stack: uses min(api_marker, ui_marker) > max(src)
- [ ] UI-only: prefers _shell.html over index.html for marker

---

### Task 2: Add tests for edge cases

**Files:**
- `packages/cli/src/commands/__tests__/freshness.test.ts` (modified — add edge case tests)

**What to implement:**

Additional test cases for tricky scenarios:

- `src/` with no matching extensions (empty project) → `fresh: false` (no sources, but also means no build)
- `dist/client/_shell.html` missing but `dist/client/index.html` exists → uses index.html as marker
- Full-stack with only one marker missing → `fresh: false`
- Symlinks in src/ are skipped
- Non-source files in src/ (e.g., `.DS_Store`, `.json`, images) don't affect freshness

**Acceptance criteria:**
- [ ] All edge cases covered with specific tests
- [ ] Tests use temporary directories (no filesystem pollution)
- [ ] Tests clean up after themselves
