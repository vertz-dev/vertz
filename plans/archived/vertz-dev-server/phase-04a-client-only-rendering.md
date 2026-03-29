# Phase 4a: Client-Only Rendering Shell

**Prerequisites:** Phase 3 (compilation + module serving) complete.

**Goal:** A Vertz app renders fully client-side. No SSR yet — just an HTML shell with the client entry script. This unblocks HMR (Phase 5) without waiting for SSR.

**Design doc:** `plans/vertz-dev-server.md` — Phase 1.4a

---

## Tasks

### Task 1: Route all page requests to the HTML shell

**What to do:**
- Any request that isn't a known route (`/src/**`, `/@deps/**`, `/@css/**`, `/public/**`) returns the HTML shell
- This enables SPA routing: `/tasks`, `/tasks/123`, `/settings` all get the same HTML
- Add a `Accept: text/html` check to distinguish page navigation from API/asset requests

**Files to modify:**
```
native/vertz-runtime/src/server/http.rs       # MODIFY — add HTML shell fallback for page routes
native/vertz-runtime/src/server/html_shell.rs # MODIFY — refine shell generation
```

**Acceptance criteria:**
- [ ] `GET /` returns HTML shell
- [ ] `GET /tasks/123` returns HTML shell
- [ ] `GET /settings` returns HTML shell
- [ ] `GET /src/app.tsx` still returns compiled JavaScript (not HTML)
- [ ] `GET /@deps/zod` still returns pre-bundled dep (not HTML)

---

### Task 2: Theme CSS injection

**What to do:**
- Load the app's theme configuration and extract global CSS
- Inline theme CSS as `<style>` in the HTML shell's `<head>` to prevent FOUC
- The theme CSS includes: reset styles, CSS custom properties (colors, spacing), font imports

**Files to modify:**
```
native/vertz-runtime/src/server/html_shell.rs # MODIFY — inject theme CSS
```

**Acceptance criteria:**
- [ ] HTML shell includes `<style>` with theme CSS in `<head>`
- [ ] No flash of unstyled content on initial page load
- [ ] Theme CSS includes custom properties (--color-primary, etc.)

---

### Task 3: Validate with task-manager example app

**What to do:**
- Point the dev server at the task-manager example app
- Verify it loads and renders client-side
- Check: navigation works, components render, styles apply, no console errors

**Acceptance criteria:**
- [ ] Task manager homepage renders
- [ ] Navigation between pages works (client-side routing)
- [ ] Component styles are correct (no missing CSS)
- [ ] No JavaScript console errors
- [ ] All module imports resolve (no 404s)

---

### Task 4: Validate with linear-clone example app

**What to do:**
- Point the dev server at the linear-clone example app
- Same validation as task 3

**Acceptance criteria:**
- [ ] Linear clone homepage renders
- [ ] Navigation works
- [ ] Styles are correct
- [ ] No console errors
- [ ] All imports resolve

---

## Quality Gates

```bash
cd native && cargo test -p vertz-runtime
```

---

## Notes

- This is a small phase (~1 week) but critical — it validates the entire compilation pipeline against real apps
- If either example app fails, debug before proceeding to Phase 5
- HMR (Phase 5) can start as soon as client-only rendering works — SSR is not required
