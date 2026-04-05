# Phase 2: Validate SSR

## Context
After Phase 1 fixes the compiler TS stripping bug, the SSR module should load successfully. This phase validates SSR rendering via HTTP requests (no browser needed). Public routes (`/login`) should render server-side. Protected routes should gracefully fall back to client-only rendering due to the known AsyncLocalStorage limitation.

Design doc: `plans/vertz-dev-server/linear-clone-validation.md`
Time-box: 2 days max.

## Prerequisites
- Phase 1 complete (compiler fix)
- Workspace packages built (`npx turbo run build ...`)
- Codegen run for linear example

## Tasks

### Task 1: Validate SSR module loading and public route rendering
**Files:**
- No files modified (validation only, unless bugs are found)
- Bug fixes in `native/vtz/src/` or `native/vertz-compiler-core/src/` if needed (max 2 files)

**What to do:**

1. Start the Rust dev server on the linear example:
   ```bash
   cd examples/linear
   ../../native/target/release/vtz dev --port 3099 --no-typecheck --no-auto-install
   ```

2. Check server startup log — confirm `SSR module loaded` (not `Failed to load`)

3. Fetch the root page and inspect SSR output:
   ```bash
   curl -s http://localhost:3099/ | head -50
   curl -sI http://localhost:3099/  # Check response headers
   ```
   - Check if `<div id="app">` has content inside it (SSR rendered) or is empty (client-only fallback)
   - Check for `X-Vertz-SSR-Error` header

4. Fetch the login page:
   ```bash
   curl -s http://localhost:3099/login | head -80
   ```
   - Should contain rendered HTML with OAuth button markup
   - No `X-Vertz-SSR-Error` header

5. If SSR fails with a new error (not the TS stripping bug), triage per the protocol:
   - < 2h fix → fix in this PR
   - Known limitation (AsyncLocalStorage) → document and continue
   - Unknown > 2h → create GitHub issue

**Acceptance criteria:**
- [ ] Server log shows `SSR module loaded` (not `Failed to load`)
- [ ] `curl http://localhost:3099/login` returns HTML with OAuth button markup inside `<div id="app">`
- [ ] No `X-Vertz-SSR-Error` response header on `/login`
- [ ] All blocking issues either fixed or filed as GitHub issues

---

### Task 2: Validate protected route fallback behavior
**Files:**
- No files modified (validation only, unless bugs are found)

**What to do:**

1. Fetch protected routes and check behavior:
   ```bash
   curl -s http://localhost:3099/projects | head -50
   curl -sI http://localhost:3099/projects
   ```

2. Expected behavior for protected routes:
   - Due to AsyncLocalStorage limitation, SSR for auth-protected routes will likely fail
   - The server should gracefully fall back to client-only rendering (empty `#app` div)
   - There should be NO server crash, NO 500 error — just clean client-only fallback

3. Document which routes SSR successfully vs. fall back:
   - `/login` — expected: SSR works (public route)
   - `/` — expected: may redirect to `/login` or fall back to client-only
   - `/projects` — expected: client-only fallback (auth-protected)
   - `/projects/:id` — expected: client-only fallback

**Acceptance criteria:**
- [ ] Protected routes fall back to client-only rendering (no server crashes)
- [ ] No 500 error responses from any route
- [ ] Documented which routes SSR vs. client-only in validation notes
