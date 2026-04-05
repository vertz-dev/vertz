# Phase 5: Validation Report

## Context
After all validation phases, write the final report documenting pass/fail per feature area and create GitHub issues for remaining failures.

Design doc: `plans/vertz-dev-server/linear-clone-validation.md`

## Prerequisites
- Phases 1-4 complete

## Tasks

### Task 1: Write validation report
**Files:**
- `plans/vertz-dev-server/linear-clone-validation-report.md` (new)

**What to implement:**

Write a validation report with the following structure:

```markdown
# Linear Example Validation Report — Rust Dev Server

**Date:** YYYY-MM-DD
**Server:** vtz dev (native/vtz/) v0.2.47
**Target:** examples/linear/

## Summary
<1-2 sentence overall result>

## Feature Areas

### Server Startup
- Status: PASS/FAIL
- Notes: <startup time, any issues>

### Module Compilation (Client)
- Status: PASS/FAIL
- Notes: <which modules compile, any failures>

### Module Resolution
- Status: PASS/FAIL
- Notes: <dependency resolution, import rewriting>

### SSR Rendering
- Status: PASS/FAIL/PARTIAL
- Notes: <which routes SSR, which fall back, error details>

### Client-Side Hydration
- Status: PASS/FAIL
- Notes: <console errors, DOM population>

### Routing (Nested Layouts)
- Status: PASS/FAIL
- Notes: <client-side navigation, layout stability>

### HMR
- Status: PASS/FAIL
- Notes: <component updates, state preservation>

### Error Overlay
- Status: PASS/FAIL
- Notes: <appearance, auto-dismiss>

### Auth Flows
- Status: PASS/FAIL/PARTIAL
- Notes: <login page, auth provider, OAuth limitations>

### Entity CRUD (API Delegation)
- Status: PASS/FAIL
- Notes: <API route proxying, response correctness>

### CSS/Styling
- Status: PASS/FAIL
- Notes: <theme rendering, CSS extraction, hash consistency>

## Issues Created
| # | Title | Priority | Area |
|---|-------|----------|------|
| | | | |

## Known Limitations
- AsyncLocalStorage: <status>
- Codegen: <status>

## Conclusion
<overall assessment, readiness for --experimental-runtime flag>
```

**Acceptance criteria:**
- [ ] Validation report committed at `plans/vertz-dev-server/linear-clone-validation-report.md`
- [ ] All feature areas documented with pass/fail status
- [ ] All unresolved failures have corresponding GitHub issues
- [ ] Issues table links to actual GitHub issue numbers
