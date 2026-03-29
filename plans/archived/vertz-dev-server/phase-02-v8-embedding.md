# Phase 2: V8 Embedding + JavaScript Module Execution

**Prerequisites:** Phase 1 (HTTP server + static assets) complete.

**Goal:** The server can load and execute JavaScript/TypeScript modules in a V8 Isolate via `deno_core`. Foundation for SSR and compilation orchestration.

**Design doc:** `plans/vertz-dev-server.md` — Phase 1.2

---

## Context — Read These First

- `deno_core` docs: https://docs.rs/deno_core/latest/deno_core/
- `oxc_resolver` docs: https://docs.rs/oxc_resolver/latest/oxc_resolver/
- Current SSR code (to understand what JS APIs are needed): `packages/ui-server/src/ssr-render.ts`

---

## Tasks

### Task 1: Add `deno_core` dependency + minimal JsRuntime

**What to do:**
- Add `deno_core` v0.311.0 to `vertz-runtime/Cargo.toml`
- Create `runtime/js_runtime.rs` that creates a `JsRuntime` with minimal configuration
- Verify: can create and destroy a JsRuntime without crash
- Execute a simple JS snippet: `1 + 1` and read the result back in Rust

**Files to create:**
```
native/vertz-runtime/src/
└── runtime/
    ├── mod.rs
    └── js_runtime.rs    # NEW — JsRuntime creation
```

**Acceptance criteria:**
- [ ] `JsRuntime::new()` succeeds
- [ ] Can execute `1 + 1` and get `2` back in Rust
- [ ] JsRuntime drops cleanly (no memory leaks in test)

**POC gate:** If `deno_core` has fundamental issues here (API changed, won't compile), evaluate `rusty_v8` within 3 days.

---

### Task 2: Console ops (console.log/warn/error/info)

**What to do:**
- Create `ops/console.rs` with deno_core `#[op2]` functions for console methods
- Register as a deno_core extension
- Output goes to Rust's stdout/stderr with formatting:
  - `console.log` → stdout
  - `console.warn` → stderr (yellow)
  - `console.error` → stderr (red)
  - Multiple args joined with space
  - Object args formatted as JSON

**Files to create:**
```
native/vertz-runtime/src/runtime/ops/
├── mod.rs
└── console.rs    # NEW
```

**Acceptance criteria:**
- [ ] `console.log("hello", "world")` prints "hello world" to stdout
- [ ] `console.error("fail")` prints to stderr in red
- [ ] `console.log({ a: 1 })` prints JSON representation
- [ ] `console.log(1, "two", true)` prints "1 two true"

---

### Task 3: Timer ops (setTimeout/setInterval/clearTimeout/clearInterval)

**What to do:**
- Create `ops/timers.rs` with async ops for timers
- `setTimeout(callback, delay)` → schedule callback on tokio runtime
- `setInterval(callback, delay)` → repeating schedule
- `clearTimeout(id)` / `clearInterval(id)` → cancel
- Timer IDs are integers, tracked in a `HashMap<u32, JoinHandle>`

**Files to create:**
```
native/vertz-runtime/src/runtime/ops/
└── timers.rs     # NEW
```

**Acceptance criteria:**
- [ ] `setTimeout(() => console.log("hi"), 100)` fires after ~100ms
- [ ] `clearTimeout(id)` prevents the callback from firing
- [ ] `setInterval(() => counter++, 50)` fires repeatedly
- [ ] `clearInterval(id)` stops the interval
- [ ] Timers don't block the event loop

---

### Task 4: Custom ModuleLoader with filesystem resolution

**What to do:**
- Implement the `deno_core::ModuleLoader` trait
- `resolve()`: use `oxc_resolver` for Node.js-compatible resolution (package.json exports, index.js, etc.)
- `load()`: read file from disk, return source code
- For `.ts`/`.tsx` files: compile via `vertz-compiler-core` before returning (SSR compilation path)
- Module specifiers use `file:///` URLs (deno_core's format)

**Files to create:**
```
native/vertz-runtime/src/runtime/
└── module_loader.rs    # NEW — ModuleLoader implementation
```

**Acceptance criteria:**
- [ ] Can load a `.js` module from disk: `import { foo } from './bar.js'`
- [ ] Can load a `.ts` module (returned as-is for now, compilation in next task)
- [ ] Can resolve `node_modules` packages: `import { z } from 'zod'`
- [ ] `oxc_resolver` respects `package.json` `exports` field
- [ ] Relative imports resolve correctly (`.`, `..`)
- [ ] Missing module produces a clear error (not a crash)

---

### Task 5: Compile `.tsx`/`.ts` on load (SSR compilation path)

**What to do:**
- In `module_loader.rs`, when loading a `.tsx` or `.ts` file:
  - Read source from disk
  - Call `vertz_compiler_core::compile()` with target `"ssr"`
  - Return the compiled JS code
  - Store source map for later retrieval
- Import rewriting for SSR: bare specifiers → `file:///` absolute paths (not browser URLs)

**Files to modify:**
```
native/vertz-runtime/src/runtime/module_loader.rs   # MODIFY — add compilation
```

**Acceptance criteria:**
- [ ] A `.tsx` file with JSX compiles and executes in V8
- [ ] A `.tsx` file with signals (`let count = 0`) compiles correctly
- [ ] Import specifiers in compiled output use `file:///` paths (not `/@deps/` URLs)
- [ ] Compilation errors produce readable error messages (not V8 syntax errors)

---

### Task 6: Fetch op (HTTP client)

**What to do:**
- Create `ops/fetch.rs` implementing the `fetch()` Web API
- Use `reqwest` as the HTTP client
- Support: GET, POST, PUT, DELETE, headers, body (text, JSON)
- Return a `Response`-like object with `.text()`, `.json()`, `.status`, `.headers`
- This is needed for SSR (API calls during rendering)

**Files to create:**
```
native/vertz-runtime/src/runtime/ops/
└── fetch.rs      # NEW
```

**Acceptance criteria:**
- [ ] `fetch("http://httpbin.org/get")` returns a response
- [ ] `response.status` is accessible
- [ ] `await response.text()` returns body
- [ ] `await response.json()` parses JSON
- [ ] POST with JSON body works
- [ ] Network errors produce clean error messages (not panics)

---

### Task 7: Utility ops (crypto, env, performance, path)

**What to do:**
- `ops/crypto.rs`: `crypto.randomUUID()` → Rust `uuid::Uuid::new_v4()`
- `ops/env.rs`: `process.env.VAR_NAME` → `std::env::var("VAR_NAME")` (read-only)
- `ops/performance.rs`: `performance.now()` → `std::time::Instant` elapsed since runtime start
- `ops/path.rs`: `path.join()`, `path.resolve()`, `path.dirname()`, `path.basename()`, `path.extname()` → Rust `std::path`

**Files to create:**
```
native/vertz-runtime/src/runtime/ops/
├── crypto.rs        # NEW
├── env.rs           # NEW
├── performance.rs   # NEW
└── path.rs          # NEW
```

**Acceptance criteria:**
- [ ] `crypto.randomUUID()` returns a valid UUID v4 string
- [ ] `process.env.HOME` returns the home directory
- [ ] `process.env.NONEXISTENT` returns `undefined`
- [ ] `performance.now()` returns a monotonically increasing number
- [ ] `path.join("a", "b", "c")` returns `"a/b/c"`
- [ ] `path.resolve("./foo")` returns absolute path
- [ ] `path.dirname("/a/b/c.ts")` returns `"/a/b"`

---

### Task 8: Integration test — execute a multi-module JS program

**What to do:**
- Write an end-to-end test: create a temp directory with 3 JS files that import each other
- Load the entry module into the JsRuntime
- Verify: all modules execute, console output is captured, no errors

**Files to create:**
```
native/vertz-runtime/tests/
├── v8_integration.rs           # NEW — multi-module execution test
└── fixtures/
    └── js-modules/
        ├── entry.js            # imports from ./utils.js and ./config.js
        ├── utils.js            # exports a function
        └── config.js           # exports a constant
```

**Acceptance criteria:**
- [ ] Entry module successfully imports and uses both dependencies
- [ ] Console output from all modules is captured
- [ ] Error in any module produces a readable stack trace with filename and line
- [ ] The test completes in < 2 seconds

---

## Quality Gates

```bash
cd native && cargo check -p vertz-runtime
cd native && cargo test -p vertz-runtime
cd native && cargo clippy -p vertz-runtime
```

---

## Notes

- This is the highest-risk phase — deno_core integration is the main unknown
- Pin `deno_core` to an exact version (v0.311.0) to avoid API changes
- If `deno_core` blocks on the ModuleLoader trait, the fallback is `rusty_v8` with manual module loading (2-3 week delay)
- The `node:` module audit (what SSR code needs) should happen during this phase. Document each `node:*` import and the chosen solution.
- `structuredClone` and `TextEncoder`/`TextDecoder` are V8 built-ins — no custom op needed
