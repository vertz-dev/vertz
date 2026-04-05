# Phase 4: Validate HMR + Error Overlay

## Context
After Phases 1-3, the app loads and navigates. This phase validates Hot Module Replacement (edit a component, verify it updates without reload) and the error overlay (introduce syntax error, verify overlay appears and auto-dismisses on fix).

Design doc: `plans/vertz-dev-server/linear-clone-validation.md`

## Prerequisites
- Phases 1-3 complete
- Rust dev server running, app loads in browser

## Tasks

### Task 1: Validate HMR component updates
**Files:**
- No files modified permanently (temporary edits to test files, reverted after)
- Bug fixes in `native/vtz/src/hmr/` if HMR is broken

**What to do:**

1. Open the app in browser with DevTools open (Network tab)
2. Edit a visible component file (e.g., change text in `examples/linear/src/components/project-card.tsx`)
3. Save the file
4. Observe:
   - WebSocket message received (check Network > WS tab for HMR update message)
   - Component updates in the browser WITHOUT full page reload
   - No `load` event in the console (would indicate full reload)
5. Revert the edit

**Acceptance criteria:**
- [ ] File save triggers WebSocket HMR update message
- [ ] Browser updates the component without full page reload
- [ ] All HMR issues either fixed or filed as GitHub issues

---

### Task 2: Validate error overlay
**Files:**
- No files modified permanently (temporary syntax error, reverted after)

**What to do:**

1. With the app running in browser, introduce a syntax error in a TSX file:
   ```tsx
   // Add this to any component
   const x = {{{ invalid syntax
   ```
2. Save the file
3. Observe:
   - Error overlay appears in the browser
   - Overlay shows file path and line number of the error
4. Fix the syntax error (revert the change) and save
5. Observe:
   - Error overlay auto-dismisses
   - App returns to normal state

**Acceptance criteria:**
- [ ] Syntax error causes error overlay to appear with file path and line number
- [ ] Fixing the error auto-dismisses the overlay
- [ ] All error overlay issues either fixed or filed as GitHub issues
