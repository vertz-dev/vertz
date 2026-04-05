# Validate Rust Dev Server Against Linear Example App

**Issue:** [#2051](https://github.com/vertz-dev/vertz/issues/2051)
**Status:** Design (Rev 2)
**Date:** 2026-04-04

## Context

The Rust dev server (`native/vtz/`) has completed Phase 1.6 — it starts, serves modules, compiles TSX, handles HMR, runs SSR, and provides diagnostics. The next step is validating that it actually works with the most complex example app: `examples/linear/`.

The linear example exercises: routing with nested layouts, SSR with data fetching, HMR with signal state preservation, auth flows (GitHub OAuth), entity CRUD (projects, issues, comments, labels), dialogs, theme components, and API route delegation.

**Note on real-time updates:** The issue mentions "real-time updates" but the linear example does not currently implement WebSocket-based real-time features. This area is N/A for this validation.

## Smoke Test Results (2026-04-04)

### What works
1. **Server startup** — 5-14ms, all routes registered, diagnostics endpoint functional
2. **Client module compilation** — TSX/TS files compiled with JSX transforms, CSS extraction, signal transforms, fast refresh wrappers
3. **Module resolution** — All workspace packages resolve: `@vertz/ui`, `@vertz/server`, `@vertz/db`, `@vertz/ui-auth`, `@vertz/theme-shadcn`, `@vertz/fetch`, `@vertz/schema`
4. **Dependency serving** — `/@deps/` routes serve pre-built package files correctly
5. **Import rewriting** — Bare specifiers correctly rewritten to `/@deps/` paths
6. **Generated files** — `.vertz/generated/` client SDK and entity files served and compiled
7. **Client-only SSR fallback** — HTML shell rendered when SSR fails
8. **Fast Refresh runtime** — Injected in HTML shell

### What's broken

#### P0: TypeScript type annotations survive in compiled output

**Root cause:** `props_transformer.rs` (line 64-71) reads type annotations from the **original source string**, not from MagicString. The `typescript_strip` phase runs first and correctly removes annotations from MagicString, but `props_transformer` then re-introduces them by reading `source[info.pattern_end..info.param_end]`.

**Design context:** This was **intentional** for the Bun plugin pipeline. The comment on line 64-65 says "Preserve the type annotation so downstream TS stripping (e.g., Bun) handles it." In the Bun pipeline, `loader: 'tsx'` (at `packages/ui-server/src/bun-plugin/plugin.ts`) causes Bun to strip remaining TypeScript. However, the Rust dev server serves compiled output directly to V8 (SSR) and browsers (client ES modules) — there is no downstream transpiler.

**Effect:** Compiled output contains `__props: { project: Project }` — invalid JavaScript. Both V8 (SSR) and browsers reject this.

**File:** `native/vertz-compiler-core/src/props_transformer.rs:64-72`

**Evidence:**
```
# SSR error
Failed to load SSR entry module: Uncaught SyntaxError: Unexpected token ':'
  at file://.../src/components/project-card.tsx:34:36

# Client compiled output (curl)
export function ProjectCard(__props: { project: Project }) { ...
```

**Fix:** In `props_transformer.rs`, stop copying the type annotation. Change `format!("__props{type_annotation}")` to just `"__props"`. Update the misleading comment. This is safe for the Bun pipeline because Bun's TypeScript stripping is additive-removal only — removing an annotation that Bun would have stripped anyway produces identical output.

**Test implications:**
- The existing test `props_rewrite_preserves_type_annotation` (props_transformer.rs:618) **asserts the OLD behavior** (`__props: CardProps`). This test must be updated to assert `__props` without type annotation.
- The existing test `test_full_compile_strips_task_card_pattern` (typescript_strip.rs:915) passes incorrectly because it never asserts on the destructured props type surviving. Must add assertion.
- The existing test `test_full_compile_strips_type_annotations` (typescript_strip.rs:873) has the same gap. Must add assertion.
- New tests must cover **inline object type annotations** (e.g., `{ task: Task; onClick?: (id: string) => void }`), not just named type references (`CardProps`).

**Secondary fix site:** `compile_for_ssr_aot` (lib.rs:644) has the same code path and should also be fixed.

#### P1: `vtz codegen` not implemented in Rust CLI
The Rust CLI does not have a `codegen` subcommand. Users must run codegen via Bun before starting the dev server. Not blocking for validation.

#### P2: AsyncLocalStorage broken for async callbacks (known)
Per-request context propagation fails after any `await` inside `AsyncLocalStorage.run()`. This blocks SSR data fetching (queries use async context for session). The linear app's `ProtectedRoute` component (from `@vertz/ui-auth`) wraps the entire authenticated section, so SSR will likely fail on ALL protected routes.

**SSR pass criteria given this limitation:** SSR succeeds for public routes (`/login`). Protected routes correctly fall back to client-only rendering without errors. No `X-Vertz-SSR-Error` header on public routes.

**Status:** Design doc exists (`plans/runtime-async-context.md`). Not addressed in this validation.

### Not yet tested (requires browser)
- HMR with state preservation
- Error overlay
- Auth flows (GitHub OAuth — requires credentials, may be environment-specific)
- Entity CRUD via API route delegation
- Client-side hydration
- Dialog stack
- Theme component rendering

## API Surface

No new public API. This work fixes bugs in existing compilation and runtime internals.

## Manifesto Alignment

- **Principle 1 (If it builds, it works):** Validates compiler output is valid JS — a type-stripping bug means "it builds but it doesn't work."
- **Principle 6 (If you can't demo it, it's not done):** The linear app IS the demo. This validation ensures the Rust runtime can run a real app.
- **Principle 7 (Performance is not optional):** The Rust dev server starts in 5ms vs hundreds for Bun. Validation ensures we don't sacrifice correctness for speed.

## Non-Goals

- **Full AsyncLocalStorage implementation** — tracked separately, has its own design doc
- **`vtz codegen` in Rust CLI** — separate issue, not needed for validation
- **Production builds** — only dev server mode
- **Benchmark comparisons with Bun** — performance is not the focus here
- **API route implementation** — the Bun framework server handles the business logic. API route **delegation/proxying** by the Rust server IS in scope.
- **Full OAuth cycle** — requires real GitHub OAuth credentials, environment-specific setup. We validate that the login page renders and that the auth provider initializes. Full OAuth end-to-end is a manual test by the developer with credentials configured.

## Unknowns

1. **Client-side module loading chain** — Does the browser successfully load and execute the full module graph? The compiled output contains TypeScript syntax (P0 bug above), so client-side is likely broken too. Need to verify after fixing the compiler.
2. **SSR depth** — After fixing the TS stripping bug, how far does SSR get before hitting AsyncLocalStorage? Protected routes likely fail; public routes may work.
3. **HMR stability** — Signal state preservation across HMR cycles hasn't been tested with the linear app's complex component tree.
4. **Source map accuracy** — The props transformer fix changes overwrite lengths, which affects source map offsets. Need to verify source maps still point to correct locations.
5. **API route delegation** — Does the Rust dev server correctly proxy `/api/*` requests to the Bun framework server? This is required for entity CRUD.

## Type Flow Map

N/A — no new generics or type-level changes.

## Triage Protocol

When discovering failures during validation phases:

1. **Blocking bug in Rust compiler/server, fixable in < 2 hours** → Fix in this PR. Add regression test.
2. **Known limitation (AsyncLocalStorage, codegen)** → Document in validation report, move on.
3. **Unknown issue needing investigation (> 2 hours)** → Create GitHub issue with reproduction steps, continue validation. Tag as `runtime` label.
4. **Non-blocking issue (specific component fails but app is navigable)** → Create GitHub issue, continue.

The goal is a **working app shell** — the app loads, navigates, and exercises core features. Not pixel-perfect parity with the Bun dev server.

## E2E Acceptance Test

```typescript
describe('Feature: Linear example on Rust dev server', () => {
  describe('Given the Rust dev server running examples/linear/', () => {

    describe('When loading the root page (/)', () => {
      it('Then SSR returns HTML with rendered component tree (not empty #app div)', () => {});
      it('Then response includes extracted CSS in <style> or <link> tags', () => {});
      it('Then no X-Vertz-SSR-Error response header is present', () => {});
    });

    describe('When the browser loads the client entry module', () => {
      it('Then no JavaScript console errors during hydration', () => {});
      it('Then the module graph loads without TypeScript syntax errors', () => {});
    });

    describe('When navigating to /login', () => {
      it('Then the login page renders with GitHub OAuth button', () => {});
      it('Then the auth provider initializes without errors', () => {});
    });

    describe('When navigating through the app', () => {
      it('Then /projects page renders (client-side if SSR falls back)', () => {});
      it('Then no JavaScript console errors during normal navigation', () => {});
    });

    describe('When making API requests (entity CRUD)', () => {
      it('Then /api/* requests are proxied to the framework server', () => {});
      it('Then entity list endpoints return valid JSON', () => {});
    });

    describe('When editing a component file and saving', () => {
      it('Then HMR updates the component without full page reload', () => {});
      it('Then signal state (e.g., filter selections) is preserved', () => {});
    });

    describe('When introducing a syntax error in a TSX file', () => {
      it('Then the error overlay appears with file path and line number', () => {});
      it('Then fixing the error auto-dismisses the overlay', () => {});
    });
  });
});
```

## Approach

### Phase 0: Prerequisites
Build workspace packages and run codegen for the linear example.

**Commands:**
```bash
# From repo root
cd /Users/viniciusdacal/conductor/workspaces/vertz/belo-horizonte

# Build workspace packages (skip examples, landing, benchmarks)
npx turbo run build --filter='!@vertz-examples/*' --filter='!entity-todo-example' --filter='!@vertz/landing-nextjs' --filter='!@vertz/landing-nextjs-vercel' --filter='!@vertz-benchmarks/*'

# Run codegen for linear example
cd examples/linear
bun ../../packages/cli/dist/vertz.js codegen

# Build Rust runtime (if not already built)
cd ../../native
cargo build --release -p vtz
```

**Dev server start command:**
```bash
cd examples/linear
../../native/target/release/vtz dev --port 3099 --no-typecheck --no-auto-install
```

### Phase 1: Fix Compiler TS Stripping Bug

Fix the `props_transformer.rs` bug that re-introduces TypeScript annotations. This is safe for both the Rust dev server path and the Bun plugin path.

**Files:**
- `native/vertz-compiler-core/src/props_transformer.rs` (modify — remove type annotation preservation)
- `native/vertz-compiler-core/src/props_transformer.rs` tests (modify — update `props_rewrite_preserves_type_annotation`)
- `native/vertz-compiler-core/src/typescript_strip.rs` tests (modify — add assertions to existing tests)

**Acceptance criteria:**
- [ ] `cargo test --all` passes (including updated `props_rewrite_preserves_type_annotation` test)
- [ ] `cargo clippy --all-targets --release -- -D warnings` clean
- [ ] New regression test: `compile()` with inline object type annotation `{ task: Task; onClick?: (id: string) => void }` produces output containing no `: {` type annotation syntax
- [ ] Existing tests augmented: `test_full_compile_strips_task_card_pattern` and `test_full_compile_strips_type_annotations` assert destructured props type annotations are absent
- [ ] `curl http://localhost:3099/src/components/project-card.tsx` output contains `__props` without type annotation
- [ ] SSR module loads without `SyntaxError` (server log shows `SSR module loaded` not `Failed to load`)

### Phase 2: Validate SSR

Test SSR rendering via HTTP requests (no browser needed). Verify the compiler fix unblocks SSR for the module loading chain, then check which routes render server-side vs. fall back to client-only.

**Files:**
- `native/vtz/src/` (potential bug fixes discovered during validation)
- `native/vertz-compiler-core/src/` (potential additional compiler fixes)

**Acceptance criteria:**
- [ ] `curl http://localhost:3099/` returns HTML with content inside `<div id="app">` (not empty)
- [ ] `curl http://localhost:3099/login` returns SSR-rendered HTML with OAuth button markup
- [ ] No `X-Vertz-SSR-Error` response header on `/login`
- [ ] Protected routes (`/projects`, `/projects/:id`) gracefully fall back to client-only rendering (empty `#app` div, no server error headers)
- [ ] All discovered blocking issues either fixed (< 2h) or filed as GitHub issues

**Time-box:** 2 days max for this phase. Fix blocking issues that prevent the module loading chain from working. File GitHub issues for non-blocking issues.

### Phase 3: Validate Client-Side Module Loading + API Delegation

Open the app in a browser (Playwright). Verify the full module graph loads, the app renders, and API routes are proxied correctly.

**Files:**
- `native/vtz/src/` (potential bug fixes)
- Validation scripts or Playwright test files

**Acceptance criteria:**
- [ ] Playwright opens `http://localhost:3099/`, `page.evaluate(() => document.querySelectorAll('#app *').length)` returns > 0
- [ ] Browser console has zero errors matching `/SyntaxError|TypeError|ReferenceError/` during page load
- [ ] Navigation to `/login` renders visible OAuth button
- [ ] `/api/*` requests return valid responses (not 404/500) — validates API route delegation
- [ ] All discovered blocking issues either fixed (< 2h) or filed as GitHub issues

**Time-box:** 3 days max. Goal is a working app shell, not pixel-perfect parity.

### Phase 4: Validate HMR + Error Overlay

Test hot module replacement and the error overlay with the running linear app.

**Acceptance criteria:**
- [ ] Edit a component file (e.g., change text in `project-card.tsx`), save — WebSocket receives HMR message
- [ ] Browser updates the component without full page reload (verify via Playwright: no `load` event)
- [ ] Introduce a syntax error in a TSX file — error overlay appears with file path and line number
- [ ] Fix the syntax error — overlay auto-dismisses
- [ ] All discovered blocking issues either fixed (< 2h) or filed as GitHub issues

### Phase 5: Validation Report

Write the final validation report and create GitHub issues for remaining failures.

**Acceptance criteria:**
- [ ] `plans/vertz-dev-server/linear-clone-validation-report.md` committed with pass/fail per feature area
- [ ] All unresolved failures have GitHub issues with reproduction steps and `runtime` label
- [ ] PR description includes summary of all phases and validation results

## Definition of Done

- [ ] P0 compiler bug is fixed with regression tests
- [ ] The linear app loads and is navigable in a browser on the Rust dev server
- [ ] E2E acceptance test scenarios pass (or failures are tracked as GitHub issues)
- [ ] All discovered failures are either fixed in this PR or tracked as GitHub issues with priority labels
- [ ] Validation report committed at `plans/vertz-dev-server/linear-clone-validation-report.md`
- [ ] `cargo test --all` and `cargo clippy` pass
- [ ] PR opened with public API changes summary and validation results

## Dependencies

- Phase 1.6 of the Rust dev server (already complete)
- Prerequisites (Phase 0) must be run before any validation phase
