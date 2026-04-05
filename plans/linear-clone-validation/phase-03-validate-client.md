# Phase 3: Validate Client-Side Module Loading + API Delegation

## Context
After Phases 1-2, the compiler produces valid JS and SSR is validated. This phase opens the app in a browser (via Playwright or manual testing) to verify the full client-side module graph loads, the app renders interactively, and API routes are proxied correctly to the Bun framework server.

Design doc: `plans/vertz-dev-server/linear-clone-validation.md`
Time-box: 3 days max. Goal is a working app shell, not pixel-perfect parity.

## Prerequisites
- Phases 1-2 complete
- Rust dev server running on port 3099

## Tasks

### Task 1: Verify client-side module graph loads without errors
**Files:**
- No files modified (validation only, unless bugs are found)
- Bug fixes in `native/vtz/src/` or `native/vertz-compiler-core/src/` if needed

**What to do:**

1. Start the Rust dev server on the linear example
2. Open http://localhost:3099/ in a browser (or via Playwright)
3. Check browser console for errors:
   - Zero `SyntaxError` (TypeScript syntax in output)
   - Zero `TypeError` (missing functions/properties)
   - Zero `ReferenceError` (unresolved variables)
   - Module resolution failures (`Failed to fetch dynamically imported module`)
4. Verify the DOM is populated: `document.querySelectorAll('#app *').length > 0`
5. If errors occur, triage per protocol (< 2h fix inline, else file issue)

**Acceptance criteria:**
- [ ] Browser loads the app without `SyntaxError`, `TypeError`, or `ReferenceError` in console
- [ ] `#app` div has child elements (app rendered)
- [ ] All blocking module resolution issues either fixed or filed as GitHub issues

---

### Task 2: Verify navigation and page rendering
**Files:**
- No files modified (validation only)

**What to do:**

1. Navigate to `/login` — verify OAuth button visible
2. Navigate through pages (if app loads in authenticated state or use direct URL access):
   - `/projects` — project list page renders
   - `/projects/:id` — project detail with nested layout
3. Check for console errors during navigation
4. Verify client-side routing works (no full page reloads on navigation)

**Acceptance criteria:**
- [ ] `/login` renders with visible OAuth button
- [ ] Navigation between routes works without full page reloads
- [ ] No new console errors during navigation

---

### Task 3: Verify API route delegation
**Files:**
- No files modified (validation only, unless API proxying bug found)
- Potential fix in `native/vtz/src/server/` if API routes return 404

**What to do:**

1. Test API routes from the browser or curl:
   ```bash
   curl -s http://localhost:3099/api/auth/session
   curl -s http://localhost:3099/api/projects
   ```
2. API routes should return valid JSON responses (even if empty/unauthorized), NOT 404
3. If API routes return 404, investigate how the Rust dev server delegates to the framework request handler
4. The Rust dev server's fallback handling should route `/api/*` to the Bun framework server

**Acceptance criteria:**
- [ ] `/api/*` requests return valid responses (not 404)
- [ ] Entity list endpoints return JSON (even if empty due to auth)
- [ ] All API delegation issues either fixed or filed as GitHub issues
