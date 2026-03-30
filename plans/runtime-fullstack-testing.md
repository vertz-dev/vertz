# Runtime Full-Stack Testing & Test Runner Benchmarking — Design Document

> "If the runtime is too slow, we build a faster one." — Vertz Vision, Principle 8

## Revision History

| Rev | Date | Changes |
|---|---|---|
| 1 | 2026-03-29 | Initial draft |
| 2 | 2026-03-29 | Address 7 blockers from DX, Product, and Technical reviews: fix test count (27), tiered test categories, graduated acceptance criteria, narrow codemod scope, isolated compilation metric, dual-shim conflict unknown, Web API availability unknown |

---

## Executive Summary

Validate the Vertz native runtime against a **real full-stack example** (entity-todo) to surface integration gaps, then **benchmark `vertz test` vs `bun test`** on the subset of tests that both runners can execute. This is the first time the runtime's test runner faces production-like test code — API tests, SSR tests, component tests, DB setup/teardown — not just unit-level synthetic tests.

The outcome is a benchmark report comparing startup time, compilation time, per-test execution, total suite time, and memory usage, plus a gap analysis of what works, what needs fixes, and what's missing.

**Expected outcome:** We expect API tests (11) to have the best chance of passing. SSR tests (5) may partially work. Component tests (11) will almost certainly fail due to DOM shim limitations. The value is in documenting *exactly* what fails and why.

---

## Manifesto Alignment

- **Principle 7 (Performance is not optional):** We can't claim the runtime is faster without measuring it against real workloads. This initiative provides the first concrete performance data.
- **Principle 8 (No ceilings):** The runtime replaces Bun as the underlying engine. Testing with real projects proves it can handle the full stack, not just isolated benchmarks.
- **Principle 5 (If you can't test it, don't build it):** Dogfooding the test runner against our own examples validates the tool we're building for developers.

---

## The Problem

The Vertz runtime's test runner (Phase 1) is implemented in Rust with 26+ matchers, mocking, coverage, and reporters. But it has **never been run against a real full-stack Vertz project**. We don't know:

1. Does `vertz test` actually run entity-todo's 27 tests successfully?
2. How does performance compare to `bun test`?
3. What APIs are missing or incompatible?
4. Where are the boundaries between "works," "partially works," and "not viable yet"?

### Current State

| Component | Status |
|---|---|
| Runtime binary | Not built (no `target/` directory) |
| Test runner (Rust) | Phase 1 complete — executor, globals, matchers, mocking, reporters |
| `@vertz/test` resolution | Already implemented — `module_loader.rs` intercepts `@vertz/test` AND `bun:test` imports via synthetic module. No shim package needed. |
| Import codemod (`bun:test` → `@vertz/test`) | `codemod.rs` exists — uses string replacement (not AST). Only import rewrites are reliable. |
| Example tests | 100 tests across 4 examples, all use `bun:test` |

### Target Example: entity-todo

Chosen because it exercises the widest range of framework features.

#### Test Inventory (27 tests, 3 tiers)

**Tier 1 — API tests (likely to work, no DOM needed):**

| Test File | Tests | What It Exercises |
|---|---|---|
| `src/__tests__/api.test.ts` | 11 | Server CRUD, DB (SQLite in-memory), validation, webhooks |

**Tier 2 — SSR tests (may partially work, needs DOM shim investigation):**

| Test File | Tests | What It Exercises |
|---|---|---|
| `src/__tests__/ssr.test.ts` | 5 | SSR rendering via `@vertz/ui-server/dom-shim`, theme provider |

**Tier 3 — Component tests (will NOT work with native DOM shim):**

| Test File | Tests | What It Exercises |
|---|---|---|
| `src/tests/todo-form.test.ts` | 6 | `renderTest()`, form submission, `dispatchEvent`, `type()` interaction |
| `src/tests/todo-list.test.ts` | 5 | Async data loading, DOM queries, `waitFor()` polling |
| **Subtotal** | **11** | Requires full DOM: event propagation, input mutation, listener invocation |

**Total: 27 tests** (11 API + 5 SSR + 11 component)

#### Why Component Tests Won't Work

The runtime's SSR DOM shim (`dom_shim.rs`) is designed for serialization-only rendering:
- `addEventListener` is a no-op
- `dispatchEvent` returns `true` without invoking listeners
- No `Event` constructor with `bubbles`/`cancelable`
- No `FormData`, `MouseEvent`, `KeyboardEvent`

Component tests need interactive DOM: `form.dispatchEvent(new Event('submit', { bubbles: true }))`, `renderTest()` with `querySelector`, `waitFor()` polling mutations. These require happy-dom or equivalent — not the SSR shim.

---

## Non-Goals

- **Not migrating the entire monorepo** — this is entity-todo only, as a proof-of-concept
- **Not optimizing the runtime** — we measure first, optimize later
- **Not building `@vertz/test` as a publishable package** — the runtime already resolves imports internally
- **Not replacing `bun test` yet** — this is validation, not a switchover
- **Not testing E2E/Playwright** — that's a separate runtime phase
- **Not fixing the codemod's `vi.fn()`/`vi.spyOn()` transforms** — entity-todo doesn't use them; the codemod's string-based approach is fragile for those patterns (no AST). We only validate import rewrites.

---

## Unknowns

| ID | Question | Resolution |
|---|---|---|
| U1 | Does the runtime binary build on macOS ARM64 without issues? | Phase 1 — cargo build. First build requires V8 prebuilt download (~80MB) + native dep compilation. Expect 15-30 min. Requires Xcode CLI tools. |
| U2 | Do entity-todo's DB tests work in the runtime's V8 isolate? (SQLite in-memory via `@vertz/db`) | Phase 2 — run Tier 1 tests |
| U3 | Does `@vertz/ui-server/dom-shim`'s `installDomShim()` work inside the runtime's V8 isolate? Does it conflict with the test harness DOM stubs injected by `globals.rs`? | Phase 2 — run Tier 2 tests. The harness injects minimal `HTMLElement`/`Element` stubs; `installDomShim()` may overwrite or conflict with them. |
| U4 | Does the runtime's V8 isolate provide `Request`, `Response`, and `URL` constructors? API tests use `new Request(...)` extensively. If missing, even Tier 1 tests fail. | Phase 2 — run Tier 1 tests |
| U5 | Can the codemod handle entity-todo's import patterns? (Only import rewrites — `vi.*` transforms are out of scope) | Phase 2 — run codemod, document success rate |

---

## API Surface

No new public API. This initiative produces:

1. **Benchmark script** — `scripts/bench-test-runner.sh` at monorepo root (parameterized by example)
2. **Gap report** — `plans/runtime-fullstack-testing-results.md`
3. **Codemod validation** — migrated test files (in a branch, not merged to main)

---

## Implementation Plan

### Phase 1: Build the Runtime Binary

**Goal:** Get a working `vertz-runtime` binary on macOS.

**Steps:**
1. Ensure Xcode CLI tools are installed (`xcode-select --install`)
2. Run `cargo build --release` in `native/vertz-runtime/`
3. Verify the binary exists and runs: `./target/release/vertz-runtime --help`
4. Verify test command: `./target/release/vertz-runtime test --help`

**Acceptance Criteria:**
```typescript
describe('Phase 1: Runtime binary build', () => {
  describe('Given the Rust source at native/vertz-runtime/', () => {
    describe('When cargo build --release completes', () => {
      it('produces a vertz-runtime binary in target/release/', () => {});
      it('binary responds to --help with usage info', () => {});
      it('binary responds to test --help with test runner options', () => {});
    });
  });
});
```

**Risk:** Build may fail due to missing system dependencies (V8 build, deno_core). First build takes 15-30 min due to V8 download + Rust compilation. If `--release` fails, fall back to `cargo build` (debug mode) — faster compile, slower runtime.

---

### Phase 2: Run entity-todo Tests with Vertz Runtime

**Goal:** Execute entity-todo's 27 tests using `vertz test`, document what works/fails per tier.

**Steps:**
1. Run codegen with Bun first (`bun run codegen` in entity-todo) — runtime doesn't need to own codegen for this test
2. Create a `vertz.config.ts` in entity-todo with test configuration (include patterns, timeout). **Exclude `test-compiler-plugin.ts` from preloads** — it uses `import { plugin } from 'bun'` which won't resolve in the runtime. The runtime's native compiler handles `.tsx` compilation automatically.
3. The runtime already resolves both `@vertz/test` and `bun:test` imports via a synthetic module (`module_loader.rs` line 859). No codemod or shim needed for import resolution. Run the codemod anyway to validate it, but test execution works with or without it.
4. Run `vertz-runtime test` from entity-todo root
5. Document results per tier:
   - **Tier 1 (API):** Do all 11 tests discover? Execute? Pass? What fails and why?
   - **Tier 2 (SSR):** Does `installDomShim()` load? Does it conflict with harness stubs? Which tests pass?
   - **Tier 3 (Component):** Confirm expected failure. Document exact error messages.
6. Run the codemod on entity-todo's test files and document: how many files auto-migrated cleanly vs needed manual fixes

**Acceptance Criteria:**
```typescript
describe('Phase 2: entity-todo test execution', () => {
  describe('Given entity-todo codegen has been run', () => {
    describe('When vertz test runs against entity-todo', () => {
      it('discovers all 4 test files', () => {});
      it('reports a pass/fail/error result for each of the 27 tests', () => {});
    });
  });

  // Tier 1: API tests — best chance of success
  describe('Given Tier 1 (api.test.ts, 11 tests)', () => {
    describe('When vertz test executes api.test.ts', () => {
      it('produces a per-test pass/fail result', () => {});
      it('documents any missing Web APIs (Request, Response, URL)', () => {});
    });
  });

  // Tier 2: SSR tests — may partially work
  describe('Given Tier 2 (ssr.test.ts, 5 tests)', () => {
    describe('When vertz test executes ssr.test.ts', () => {
      it('documents whether installDomShim() loads without error', () => {});
      it('documents any conflicts with test harness DOM stubs', () => {});
    });
  });

  // Tier 3: Component tests — expected to fail
  describe('Given Tier 3 (todo-form + todo-list, 11 tests)', () => {
    describe('When vertz test executes component tests', () => {
      it('documents the exact failure point (missing DOM APIs)', () => {});
      it('lists which DOM APIs are required but absent', () => {});
    });
  });

  // Codemod validation
  describe('Given the codemod runs on entity-todo test files', () => {
    it('documents success rate: auto-migrated vs manual-fix-required per file', () => {});
  });
});
```

---

### Phase 3: Benchmark — `bun test` vs `vertz test`

**Goal:** Produce a side-by-side performance comparison on the subset of tests that both runners can execute.

**Scope:** Only benchmark tests that pass on BOTH runners. If only Tier 1 passes on the runtime, benchmark Tier 1 only. This keeps the comparison fair.

**Methodology:**
- Run each runner 10 times, discard first 2 (cold start), average remaining 8
- Measure: total wall-clock time, **compilation time (isolated)**, per-file breakdown, peak RSS memory
- Environment: same machine, same test files, no other load
- Report both cold (first run) and warm (subsequent) numbers

**Metrics:**
| Metric | How Measured |
|---|---|
| Total wall time | `time` command wrapper |
| Compilation time (isolated) | Compile test files without executing — `bun build` vs native compiler. Isolates "compiler speed" from "test runner speed." |
| Startup time | Time from process launch to first test file execution |
| Per-file time | Reporter output (both runners support per-file timing) |
| Memory (peak RSS) | `/usr/bin/time -l` on macOS |
| Binary size | `ls -la` on both binaries |

**Why compilation must be measured separately:** Bun uses a JS-based preload plugin (`test-compiler-plugin.ts` → `@vertz/ui-compiler`) for `.tsx` files plus native TS transpilation for `.ts`. The Vertz runtime uses the Rust-native oxc compiler for all files. Conflating compilation into wall time makes it impossible to know whether performance differences come from the compiler or the test executor.

**Steps:**
1. Write `scripts/bench-test-runner.sh` at monorepo root, parameterized by example directory
2. Capture structured output (JSON reporter for both if available)
3. Run compilation-only benchmark separately
4. Generate comparison tables
5. Write results to `plans/runtime-fullstack-testing-results.md`

**Acceptance Criteria:**
```typescript
describe('Phase 3: Benchmark comparison', () => {
  describe('Given both runners execute the same passing tests', () => {
    it('produces a comparison table with wall time, compilation time, memory, and per-file breakdown', () => {});
    it('includes cold start and warm run numbers', () => {});
    it('documents the exact commands used for reproducibility', () => {});
    it('separates compilation overhead from test execution time', () => {});
  });
});
```

---

### Phase 4: Gap Analysis & Report

**Goal:** Document findings and next steps.

**Deliverable:** `plans/runtime-fullstack-testing-results.md` containing:
1. Test compatibility matrix (pass/fail per test, per runner, per tier)
2. Performance comparison table (wall time, compilation, memory)
3. Missing APIs or incompatibilities discovered (categorized: Web APIs, DOM APIs, Node.js compat)
4. Codemod effectiveness: auto-migrated vs manual-fix-required per file, success rate
5. Error quality assessment: when tests fail, does the runtime tell the developer *which* API is missing or just show an opaque V8 stack trace?
6. Recommendations for the test runner roadmap

---

## Type Flow Map

N/A — this initiative produces data and scripts, not library code with generics.

## E2E Acceptance Test

The E2E test is the gap analysis report itself: all 27 entity-todo tests attempted on both `bun test` and `vertz test`, with per-test pass/fail results, timing data, and a compatibility matrix documenting exactly what works and what doesn't.

---

## Risks

| Risk | Mitigation |
|---|---|
| Runtime binary doesn't build | Fall back to debug build; file issues for build failures. First build takes 15-30 min (V8 download + compilation). |
| Most tests fail on runtime | Expected outcome for Tier 2-3. Document gaps, don't block on fixing. Even Tier 1 failures are valuable data. |
| Tier 1 (API) fails due to missing Web APIs (Request/Response) | Document which Web APIs are missing. This feeds directly into the runtime-web-api-layer plan. |
| Benchmark is unfair (different compilation paths) | Measure compilation separately from execution. Document what each runner does differently. |
| entity-todo needs codegen first (`bun run codegen`) | Run codegen with Bun before benchmarking; runtime doesn't need to own codegen for this test |
| `test-compiler-plugin.ts` preload crashes (uses `import { plugin } from 'bun'`) | Exclude from preloads. Runtime's native compiler replaces this automatically. |

---

## Timeline

This is an exploratory initiative. Phases are sequential and each informs the next. If Phase 1 (build) fails, we stop and file build issues. If Phase 2 reveals the test runner can't run any tests, we focus the report on gap analysis rather than benchmarking.

If contacts-api (a simpler server-only example, 28 tests) proves easy to add after entity-todo, it can serve as a second data point that isolates server/DB tests from SSR/component complexity.
