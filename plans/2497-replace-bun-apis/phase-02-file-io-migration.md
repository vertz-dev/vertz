# Phase 2: File I/O + Server Migration

## Context

Issue #2497 — replace Bun-specific APIs with vtz-native equivalents. This phase migrates all `Bun.file()`, `Bun.write()`, and `Bun.serve()` calls in framework source files to cross-runtime equivalents (`node:fs/promises` and the new vtz/Bun adapter pattern).

Design doc: `plans/2497-replace-bun-apis.md`
Depends on: Phase 1 (vtz adapter available for `Bun.serve()` replacements)

## Tasks

### Task 1: Migrate `@vertz/docs` build pipeline

**Files:** (2)
- `packages/docs/src/generator/build-pipeline.ts` (modified)
- `packages/docs/src/generator/__tests__/build-pipeline.test.ts` (modified if exists, or verify existing tests pass)

**What to implement:**

Replace all `Bun.file()` and `Bun.write()` calls:
- `await Bun.file(filePath).text()` → `await readFile(filePath, 'utf-8')` from `node:fs/promises`
- `await Bun.write(path, content)` → `await writeFile(path, content)` from `node:fs/promises`
- Keep `Bun.spawn()` (pagefind) as-is — out of scope (runtime `spawn()` not implemented)

Add `import { readFile, writeFile } from 'node:fs/promises'` at the top.

**Acceptance criteria:**
- [ ] No `Bun.file()` or `Bun.write()` calls in `build-pipeline.ts` (except `Bun.spawn`)
- [ ] Existing tests still pass
- [ ] `vtz run typecheck` passes on `packages/docs`

---

### Task 2: Migrate `@vertz/docs` init CLI

**Files:** (2)
- `packages/docs/src/cli/init.ts` (modified)
- `packages/docs/src/__tests__/init.test.ts` (modified if it uses Bun.write)

**What to implement:**

Replace 3x `Bun.write()` calls with `writeFile()` from `node:fs/promises`:
- `await Bun.write(configPath, configContent)` → `await writeFile(configPath, configContent)`
- Same for the two starter page files

Add `import { writeFile } from 'node:fs/promises'` at the top.

**Acceptance criteria:**
- [ ] No `Bun.write()` calls in `init.ts`
- [ ] Existing tests still pass
- [ ] `vtz run typecheck` passes on `packages/docs`

---

### Task 3: Migrate `@vertz/docs` dev server

**Files:** (2)
- `packages/docs/src/dev/docs-dev-server.ts` (modified)
- `packages/docs/src/dev/__tests__/docs-dev-server.test.ts` (modified if exists)

**What to implement:**

Replace `Bun.serve()` and `Bun.file()`:
- `Bun.serve({ port, fetch })` → Use `node:http` `createServer` (works on Bun + can be replaced with vtz op later). The docs dev server is a simple HTTP server, not using the `ServerAdapter` pattern since it's internal tooling.
- `Bun.file(publicPath)` for static file serving → `readFileSync(publicPath)` from `node:fs`
- Or use `await readFile(publicPath)` from `node:fs/promises` since the handler is async

Add `import { createServer } from 'node:http'` and `import { readFile } from 'node:fs/promises'`.

Note: `node:http` `createServer` works on Bun natively (Bun has full Node.js compat). On vtz, this module's `createServer` currently uses `Deno.serve` which doesn't exist, but the docs dev server is only used in development with Bun for now. If vtz support is needed later, the server can be migrated to use `__vtz_http.serve`.

**Acceptance criteria:**
- [ ] No `Bun.serve()` or `Bun.file()` calls in `docs-dev-server.ts`
- [ ] Dev server still starts and serves content correctly
- [ ] `vtz run typecheck` passes on `packages/docs`

---

### Task 4: Migrate `@vertz/ui-server` google fonts resolver

**Files:** (2)
- `packages/ui-server/src/google-fonts-resolver.ts` (modified)
- `packages/ui-server/src/__tests__/google-fonts-resolver.test.ts` (verify existing tests pass)

**What to implement:**

Replace `Bun.file(filePath).size`:
- `const stat = Bun.file(filePath).size` → `const { size } = await stat(filePath)` from `node:fs/promises`
- Or use `statSync(filePath).size` from `node:fs` if the call site is synchronous

Add `import { stat } from 'node:fs/promises'` (or `statSync` from `node:fs`).

**Acceptance criteria:**
- [ ] No `Bun.file()` calls in `google-fonts-resolver.ts`
- [ ] Existing tests still pass
- [ ] `vtz run typecheck` passes on `packages/ui-server`

---

### Task 5: Migrate `@vertz/cli` serve command

**Files:** (2)
- `packages/cli/src/commands/serve-shared.ts` (modified)
- `packages/cli/src/commands/__tests__/serve-shared.test.ts` (verify existing tests pass)

**What to implement:**

Replace 3x `Bun.serve()` and 2x `Bun.file()`:
- `Bun.serve({ port, fetch })` → Use `createServer` from `node:http` (Bun has full compat)
- `Bun.file(htmlPath)` for serving pre-rendered HTML → `readFileSync(htmlPath)` from `node:fs`
- Remove the ambient `declare const Bun` block at the top of the file
- For static file serving of arbitrary files (images, fonts), consider using `readFileSync` wrapped in a `Buffer` for proper binary support. For very large files, `createReadStream` would be better but adds complexity — acceptable to defer.

**Acceptance criteria:**
- [ ] No `Bun.serve()` or `Bun.file()` calls in `serve-shared.ts`
- [ ] No `declare const Bun` ambient declaration
- [ ] CLI serve command still works for UI-only, API-only, and full-stack apps
- [ ] `vtz run typecheck` passes on `packages/cli`
