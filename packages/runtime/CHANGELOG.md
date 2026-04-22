# @vertz/runtime

## 0.2.77

### Patch Changes

- [#2930](https://github.com/vertz-dev/vertz/pull/2930) [`17d9f17`](https://github.com/vertz-dev/vertz/commit/17d9f17addf7ca67def6416980d18f3bc5aa1168) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(vtz): compiler no longer rewrites `effect` → `domEffect` inside string literals or comments

  Closes [#2801](https://github.com/vertz-dev/vertz/issues/2801).

  The post-processing shim that renames the compiler-emitted `effect` identifier to `domEffect` used naive string replacement, so the rewrite leaked into `.test.ts` files wherever `effect(` appeared inside string literals, template literals, or comments. The most visible symptom was `it('flags effect() call', ...)` showing up in the test runner as `it('flags domEffect() call', ...)`, which broke `oxlint-plugins/__tests__/vertz-rules.test.ts > no-wrong-effect > flags effect() call`.

  The shim now walks the source byte-wise and skips single-/double-/backtick-quoted strings (including escape sequences), line comments, and block comments, only rewriting standalone `effect` identifiers outside those regions. All pre-existing import- and call-site rewrites are preserved; string and comment content round-trips unchanged.

- [#2909](https://github.com/vertz-dev/vertz/pull/2909) [`8695866`](https://github.com/vertz-dev/vertz/commit/86958667c5c36c6138e6ad1bac567775754023d2) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(vtz): dedup redundant package versions when a single version satisfies every declared range

  Closes [#2894](https://github.com/vertz-dev/vertz/issues/2894).

  `vtz install` used to nest a transitive copy of a package even when the root's already-hoisted version satisfied the transitive range. Scenario that triggered it: a root exact pin (`"@vertz/schema": "0.2.73"`) plus a transitive range (`"^0.2.68"` declared by `@vertz/agents`) produced two graph entries — 0.2.73 at root, 0.2.76 nested under `node_modules/@vertz/agents/node_modules/@vertz/schema/`. The resolver's BFS treated the two distinct range strings as separate resolution tasks and never checked whether they could share a version.

  TypeScript's structural typing treats module identity by file path, so any exported type with a private/protected field (including `ParseContext` in `@vertz/schema`) became two incompatible types — one per path — and consumers hit opaque `Types have separate declarations of a private property` errors at compile time.

  Fix: a new `resolver::dedup()` pass runs before `hoist()`. For each package name with multiple versions, it collects every declared range (root deps + every transitive `dependencies`/`optionalDependencies`) and, when a single version in the graph satisfies all of them, drops the redundant versions. Packages with any non-semver range (`github:`, `link:`, dist-tags) are skipped — they can't be reasoned about from the range string alone. When no version satisfies every range, the graph is left untouched and the existing hoist algorithm decides nesting as before.

- [#2914](https://github.com/vertz-dev/vertz/pull/2914) [`b9abc9d`](https://github.com/vertz-dev/vertz/commit/b9abc9d5baf37a1ceb92d74f82650197b69010b8) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(vtz): iterate install dedup until fixpoint so orphan optional binaries collapse with their parent

  Closes [#2912](https://github.com/vertz-dev/vertz/issues/2912).

  `vtz install`'s `resolver::dedup()` collected every declared range in one pass, then iterated package names once to drop redundant versions. That broke for chains like `esbuild` → `@esbuild/*` platform binaries: after `esbuild@0.27.7` was correctly collapsed into `esbuild@0.27.3`, the `"@esbuild/darwin-arm64": "0.27.7"` range contributed by the just-dropped parent still lingered in the ranges map, so the binary couldn't be dedup'd in the same pass. `hoist()` then promoted the orphan `@esbuild/darwin-arm64@0.27.7` to the root `node_modules`, leaving `esbuild`'s JS host at 0.27.3 while the platform binary resolved at 0.27.7 — esbuild exploded at startup with `Host version "0.27.3" does not match binary version "0.27.7"` and every TS-pipeline CI run after [#2909](https://github.com/vertz-dev/vertz/pull/2909) started failing at the "Build @vertz/ci" step.

  Fix: run `dedup` in a loop, rebuilding `ranges_by_name` from the current graph each iteration and exiting when a pass makes no changes. Dropped packages no longer contribute phantom ranges to downstream dedup decisions.

- [#2923](https://github.com/vertz-dev/vertz/pull/2923) [`8f5b18b`](https://github.com/vertz-dev/vertz/commit/8f5b18b5d726148bc4613f28d2c752d6e5998f13) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(vtz): native `@vertz/sqlite` now binds `Uint8Array` params and reads BLOBs as `Uint8Array`

  Closes [#2920](https://github.com/vertz-dev/vertz/issues/2920).

  `d.bytea()` (from [#2843](https://github.com/vertz-dev/vertz/issues/2843)) round-trips on every SQLite binding except the vtz runtime's native `@vertz/sqlite` driver, where writing a `Uint8Array` threw `"invalid type: byte array, expected any valid JSON value"` and reads materialized blobs as JS arrays of integers.

  The native op layer now accepts a `SqliteParam` enum (`Json` / `Bytes`) that intercepts serde_v8's byte-array visitor before delegating to `serde_json::Value`, mapping `Uint8Array` params to `rusqlite::Value::Blob`. The read path emits blob cells via `serialize_bytes`, so serde_v8 returns a proper `Uint8Array` to JS instead of a numeric array.

  With this fix, `d.bytea()` works under `vtz run` / `vtz dev` against `:memory:` and file-backed SQLite, matching the parity already held by Cloudflare D1, `better-sqlite3`, `bun:sqlite`, and `postgres` / `pg`. The `d.bytea()` JSDoc's driver-support caveat is removed.

- [#2935](https://github.com/vertz-dev/vertz/pull/2935) [`d1d2498`](https://github.com/vertz-dev/vertz/commit/d1d24987a9aeff8e7cd33a2328a94ad6810cbd5c) Thanks [@matheuspoleza](https://github.com/matheuspoleza)! - feat(vtz): `vertz_browser_screenshot` MCP tool — headless pixel-perfect PNG of any dev-server route

  Closes Phase 1 of [#2865](https://github.com/vertz-dev/vertz/issues/2865).

  New MCP tool exposed by every `vtz dev` session (no flags, no setup):

  ```
  vertz_browser_screenshot({
    url: '/tasks',                              // path or same-origin URL
    viewport?: { width: 375, height: 667 },     // default 1280x720
    fullPage?: true,                            // default false
    crop?: '.my-component',                     // or { text | name | label: string }
    waitFor?: 'networkidle',                    // or 'domcontentloaded' | 'load'
  })
  ```

  Returns two MCP content blocks: the base64 PNG (rendered inline in the agent's UI) plus JSON metadata with `path`, `url`, `dimensions`, `pageUrl`, and `capturedInMs`. PNGs persist to `.vertz/artifacts/screenshots/` and are served via `GET /__vertz_artifacts/screenshots/:filename` so humans can click the metadata URL to open the image.

  Architecture:

  - **`server::screenshot::fetcher`** — probes `$VERTZ_CHROME_PATH` and common system paths (`/Applications/Google Chrome.app`, `/usr/bin/google-chrome`, `/usr/bin/chromium`). Falls back to Chrome for Testing JSON index + SHA-256 verified download into `~/.vertz/chromium/` (or `$XDG_CACHE_HOME` / `$TMPDIR` if `$HOME` is read-only). Multi-process-safe via `fs2::try_lock_exclusive` on `<cache_dir>/.lock`; partial extractions are cleaned up on failure via a scope guard.
  - **`server::screenshot::pool`** — lazy + TTL (60s) browser pool around a `BrowserSpawner` trait. Concurrent captures during launch share a `futures::Shared` future (exactly one Browser per cold start). Warm captures run concurrently through a `tokio::sync::RwLock` on the handle — `close()` takes the write guard so TTL-triggered teardown waits for in-flight captures instead of interrupting them.
  - **`server::screenshot::chromium`** — production `BrowserSpawner` wrapping `chromiumoxide::Browser`. Handler task is abort-owned by the handle; `close()` is bounded to 2s via `tokio::time::timeout` so a wedged Chrome child can't block server shutdown.
  - **`server::screenshot::capture_tool`** — MCP entrypoint. Validates URL (same-origin only, rejects external and protocol-relative), normalizes paths to `http://localhost:PORT/...`, detects AUTH_REQUIRED by matching the final URL's last segment against `login`/`signin`/`sign_in`/`sign-in`/`signup`/`sign_up`/`sign-up`/`authenticate`/`session/new` (returns the redirect finalUrl so the agent can audit), persists the PNG through `server::screenshot::artifacts`, and maps `PoolError` variants to MCP error codes (`URL_INVALID`, `CHROME_LAUNCH_FAILED`, `NAVIGATION_FAILED`, `SELECTOR_INVALID`, `SELECTOR_NOT_FOUND`, `CAPTURE_FAILED`, `AUTH_REQUIRED`).

  Safety posture:

  - Download path enforces a 500 MB cap checked against `Content-Length` AND the running stream total — a hostile server can't OOM `vtz`.
  - `expected_sha256` must be 64 lowercase hex chars up front; empty / malformed SHAs can't accidentally disable integrity enforcement.
  - Zip extraction uses `enclosed_name()` for path traversal + explicit `S_IFLNK` check to reject symlink entries; file-type bits are masked off before `set_permissions`.
  - Artifact HTTP route uses a strict allowlist: `^[A-Za-z0-9._-]+\.png$`, no leading dot, no `..`, no path traversal. Returns 404 on any mismatch (no existence leaks).
  - `remove_quarantine` uses absolute `/usr/bin/xattr` to defeat PATH injection on macOS.

  Template + docs:

  - `@vertz/create-vertz-app`'s generated `.claude/rules/dev-server-tools.md` now documents the tool with the canonical patterns (default route, multi-viewport for layout, CSS/text-match crops) and an explicit "when to skip" clause so agents don't screenshot pure backend changes.
  - Public Mintlify docs at `/guides/dev-server-tools` gained a full `vertz_browser_screenshot` reference section: examples, parameter table, error codes, scope limits, artifact naming.

  Phase 1 scope deliberately excluded: impersonation / auth-aware capture, visual regression diffing, non-Chromium browsers, Windows support, overlay / human-to-agent visual feedback. Tracked as future issues.

  Linux E2E CI job runs the pool + spawner against a real Chrome on every `native/**` change. macOS E2E deferred — `browser-actions/setup-chrome@v1` on Apple Silicon hangs at first launch (Gatekeeper / quarantine on the installed Chrome.app). Tracked as a follow-up.

## 0.2.76

## 0.2.75

### Patch Changes

- [#2861](https://github.com/vertz-dev/vertz/pull/2861) [`2ad3d9a`](https://github.com/vertz-dev/vertz/commit/2ad3d9acde5fb817acff7c248874ce7d9d3e4239) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(vtz): refuse to silently downgrade in `vtz self-update`

  `vtz self-update` previously compared the installed and target versions with
  string equality, so any time the GitHub `/releases/latest` endpoint pointed at
  an older tag than what was installed (e.g., during a parallel-release race
  where an older workflow run wins the `latest` pointer, or when a developer is
  on a locally-built newer build) the updater happily replaced the binary with
  an older version.

  The updater now performs a semver comparison and refuses to proceed when the
  target version is older than the installed one, unless the user explicitly
  opts in via `vtz self-update --version <v>`.

  Addresses bug 3 in #2860. Bugs 1 and 2 (release workflow asset-upload race
  and `latest`-pointer race) remain open.

## 0.2.74

## 0.2.73

### Patch Changes

- [#2831](https://github.com/vertz-dev/vertz/pull/2831) [`3969cf2`](https://github.com/vertz-dev/vertz/commit/3969cf2592cb0c7fdcd9197901088a8cf1d11f18) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(vtz): enrich compile errors from the file watcher with real diagnostics

  The file-watcher loop in the dev server reported build errors as generic
  `Compilation failed: <path>` strings with no compiler message, source
  span, or code snippet. The `/__vertz_errors` WebSocket, the
  `/__vertz_ai/errors` JSON endpoint, and the MCP `error_update` events
  all exposed this degraded shape, forcing developers (and LLM agents) to
  reverse-engineer compiler behavior by reading transpiled output.

  The module-server request path already extracted structured diagnostics
  (message, line, column, snippet, suggestion). That logic is now extracted
  into `build_compile_error()` in `errors::categories` and shared with the
  file-watcher loop, which previously used a brittle string-match on the
  generated error module. Compile errors surfaced by both paths now carry
  the real diagnostic from the compiler.

  Closes #2818.

- [#2839](https://github.com/vertz-dev/vertz/pull/2839) [`ce18308`](https://github.com/vertz-dev/vertz/commit/ce1830887abf53733d314bdf2ebeb1325cdb9f64) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(vtz): point TS2339 on `ImportMeta.hot` at the `vertz/client` tsconfig fix

  When TypeScript reports `Property 'hot' does not exist on type 'ImportMeta'`
  — the common symptom of a tsconfig missing the `vertz/client` type
  augmentation — the dev server now appends a Vertz-specific hint with the
  exact fix and a link to `https://vertz.dev/guides/hmr-types`.

  The hint only fires for the `'hot'` + `'ImportMeta'` shape, so other
  TS2339 errors keep the generic suggestion. Set `VTZ_NO_HMR_HINT=1` to
  suppress the hint if you don't want it.

  Closes #2814.

- [#2823](https://github.com/vertz-dev/vertz/pull/2823) [`15b29a6`](https://github.com/vertz-dev/vertz/commit/15b29a63416b616a10827fc3b1b5f6177370e71b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(runtime): clean Node-like env for server handlers

  Server handlers (entity actions, service actions, middleware, auth resolvers,
  route loaders) now run in a Workers-compatible context that does **not**
  expose `window`, `document`, `location`, `history`, or other DOM globals.
  Only SSR render runs under a scoped DOM shim, which is installed before the
  matched route renders and removed immediately after.

  This means third-party SDKs that gate on `typeof window !== 'undefined'`
  (like `@anthropic-ai/sdk`, `openai`, and `stripe`) work in server handlers
  without `dangerouslyAllowBrowser: true`:

  ```ts
  import Anthropic from "@anthropic-ai/sdk";
  import { service } from "vertz/server";

  export default service("ai", {
    actions: {
      summarize: {
        handler: async ({ text }) => {
          const client = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY!,
          });
          // no `dangerouslyAllowBrowser: true` needed
          return client.messages.create({
            /* ... */
          });
        },
      },
    },
  });
  ```

  Closes #2760.

- [#2833](https://github.com/vertz-dev/vertz/pull/2833) [`5223868`](https://github.com/vertz-dev/vertz/commit/5223868cb3001349065cc246e0ca8a03ad9356f4) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(jsx): honor `defaultValue` / `defaultChecked` on `<input>` and `<textarea>`

  The React-style uncontrolled-initial-value props were silently dropped:

  ```tsx
  <textarea defaultValue="Hello world" />  // rendered empty
  <input defaultValue="initial" />          // rendered empty
  <input type="checkbox" defaultChecked /> // rendered unchecked
  ```

  Both have no HTML content attribute, so the compiler's fallback to
  `setAttribute("defaultValue", ...)` was a no-op in the browser.

  The native compiler and the test-time JSX runtime now route these through
  the IDL property path (`el.defaultValue = "..."`, `el.defaultChecked = true`),
  matching how `value` / `checked` are already handled. The SSR DOM shim
  serializes them to the correct initial HTML — `value="..."` for `<input>`,
  text content for `<textarea>`, and the `checked` attribute for
  `<input type="checkbox">` — so the value is visible before hydration.

  Closes #2820.

## 0.2.72

### Patch Changes

- [#2768](https://github.com/vertz-dev/vertz/pull/2768) [`cde05ee`](https://github.com/vertz-dev/vertz/commit/cde05eec91b283cccc5c6129f5fc76de0388c7e3) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(vtz): trigger HMR and clean module graph on file delete

  The dev server's file-change loop called `compile_for_browser` on every
  event, which fails for a deleted file — pushing the flow into the
  compilation-error branch and skipping graph/cache cleanup. Dependents of
  the deleted file were never HMR-invalidated, so clients kept using stale
  modules.

  `process_file_change` now cleans the module graph on `Remove` events
  (under a single write lock, so a concurrent browser fetch can't re-add
  the deleted node between the read and write phases). Deleting a
  standalone CSS file escalates past `CssUpdate` (whose URL would 404) to
  `ModuleUpdate`. The server loop branches on `Remove` to skip compilation
  while still invalidating dependents, so HMR broadcasts an `Update` (or
  `FullReload` when the entry file is deleted).

  Closes #2764.

- [#2800](https://github.com/vertz-dev/vertz/pull/2800) [`6db51ae`](https://github.com/vertz-dev/vertz/commit/6db51aede789a8bc01d2056fce2291ce847cb06c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(pm): `vtz install` now writes resolved npm dist-tag specs (`"latest"`, `"next"`, custom tags) to `vertz.lock` instead of silently dropping them (#2794). Previously, a `package.json` dep like `"@types/bun": "latest"` resolved and installed correctly but never landed in the lockfile, causing subsequent `vtz install --frozen` to fail with "lockfile is out of date".

- [#2773](https://github.com/vertz-dev/vertz/pull/2773) [`303e119`](https://github.com/vertz-dev/vertz/commit/303e119c194bed3b532ce1842ed5293bcf974818) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - refactor: rename vtz plugin system for honesty

  Dev is vtz; production build uses a Bun-shaped factory whose purpose (not
  runtime) drives its name.

  **Breaking changes:**

  - `@vertz/ui-server/bun-plugin` subpath removed. Use `@vertz/ui-server/build-plugin`.
  - `vertz/ui-server/bun-plugin` subpath removed. Use `vertz/ui-server/build-plugin`.
  - `createVertzBunPlugin` → `createVertzBuildPlugin`.
  - `VertzBunPluginOptions` → `VertzBuildPluginOptions`.
  - `VertzBunPluginResult` → `VertzBuildPluginResult`.
  - `vtz --plugin` CLI flag removed (only Vertz is supported now).
  - `ReactPlugin` removed from Rust (including `PluginChoice::React` config,
    `.vertzrc` handling, `package.json` auto-detect, and embedded React
    fast-refresh assets).

  **Dead-code cleanup:**

  - All six `bun-plugin-shim.ts` files deleted from examples, benchmarks, and
    first-party packages. These were orphans — no `bunfig.toml` referenced them.
  - `docs/fullstack-app-setup.md` deleted (documented a setup that no longer worked).

## 0.2.71

### Patch Changes

- [#2754](https://github.com/vertz-dev/vertz/pull/2754) [`4dfdf15`](https://github.com/vertz-dev/vertz/commit/4dfdf158bfc44786b2d5e49700dfb9bd8e926e92) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(vtz): import rewriter now skips JS comments

  The `/@deps/` import rewriter did not recognize `//` or `/* */` comments,
  so an apostrophe inside a comment (e.g. `// indicator's data-state`)
  opened a fake string literal that swallowed every `import` statement until
  the next apostrophe. In `@vertz/theme-shadcn@0.2.70/dist/index.js` this
  leaked 5 of 46 bare `@vertz/ui` imports to the browser despite #2740.
  The rewriter and its `from` search now skip line and block comments.
  Closes #2730.

## 0.2.70

### Patch Changes

- [#2750](https://github.com/vertz-dev/vertz/pull/2750) [`f7f05f4`](https://github.com/vertz-dev/vertz/commit/f7f05f4a7e56da83c47b37817149e071ce13522b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(vtz): vi.mock propagates through transitive imports (resolves #2731)

  When a test file did `vi.mock('m', () => ({ fn: ... }))` and then drove
  production code that itself called `await import('m')`, the production code
  got the REAL frozen module namespace — `spyOn` mutations from the test
  didn't propagate. Static imports of mocked modules were fine; only the
  dynamic-import path leaked the real module.

  Three concrete fixes, all needed together:

  1. **Wrap dynamic `import()` in non-test files when the test runner is
     active.** The mock-hoisting compiler pass already wrapped dynamic imports
     in test files via `__vertz_unwrap_module` so frozen ES module namespaces
     become mutable; this PR extends the same wrap to every module compiled
     while `spy_exports` is on (i.e., the entire dependency graph during a
     `vtz test` run). Without it, `cli.ts → await import('@vertz/compiler')`
     bypassed the spy installed by `cli.test.ts`.

  2. **Restore initial impl on `mockRestore()` for `mock(impl)`.** vtz had
     `mockRestore = mockReset` for plain mocks, which dropped the
     factory-supplied implementation to `null`. This broke the common pattern
     `vi.mock('m', () => ({ fn: mock(() => obj) }))` + `vi.restoreAllMocks()`
     in `afterEach` — the first cleanup nuked `fn`'s impl for every following
     test. Now matches vitest: "for `vi.fn(impl)`, `mockRestore` reverts to
     `impl`". `mockReset` still clears, as documented.

  3. **Union synthetic-polyfill exports into the mock proxy.** When mocking a
     bare specifier with a vtz polyfill (esbuild, `node:*`), the proxy module
     only exported names declared on disk + names returned by the factory.
     CJS modules like esbuild expose nothing the regex-based extractor can see,
     so transitive imports of unmocked exports (`import { transformSync } from
'esbuild'` in `@vertz/ui-server/bun-plugin`) failed at import time with
     "module does not provide an export named transformSync" — even when the
     call path never reached `transformSync()` at runtime. The proxy now
     advertises the full polyfill surface (values are `undefined` unless the
     factory supplied them), preserving spec-compliant import resolution.

  Unskipped 3 test blocks that had been parked on this:
  `packages/cli/src/__tests__/cli.test.ts` (codegen command action),
  `packages/cli/src/production-build/__tests__/orchestrator.test.ts`
  (BuildOrchestrator), and
  `packages/cli/src/production-build/__tests__/ui-build-pipeline.test.ts`
  (buildUI). 133/134 tests pass; one buildUI assertion that expects an actual
  Brotli `.br` sidecar remains skipped because vtz's `node:zlib` polyfill is a
  passthrough — tracked separately as a runtime polyfill gap, not a mock issue.

- [#2749](https://github.com/vertz-dev/vertz/pull/2749) [`d5d0a76`](https://github.com/vertz-dev/vertz/commit/d5d0a7647977217f4cb1b7aaba930af6fc5435c4) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(vtz): `node:http.createServer()` + `listen()` + `fetch()` + `close()` no longer hangs under the vtz test runner (resolves #2718, #2720)

  The synthetic `node:http` module exposed `createServer()` whose `listen()`
  implementation treated `globalThis.__vtz_http.serve()` as asynchronous —
  but `serve()` is a synchronous op that returns the server object directly.
  The resulting `.then()` on a non-thenable threw a `TypeError` that was
  swallowed by the `new Promise((resolve) => server.listen(0, resolve))`
  idiom, so the listen callback never fired and tests hung at the 120 s
  watchdog. The same bug existed in the CJS `require('http')` shim.

  Fixing the shim surfaced three secondary defects in the underlying op
  layer:

  - **`close()` aborted the axum task immediately**, cancelling in-flight
    response futures mid-reply so clients hung on `fetch()`. Replaced the
    abort-handle teardown with axum's `with_graceful_shutdown(...)` signal
    so existing connections drain before the task exits.
  - **`op_http_serve_respond` keyed the pending oneshot map per server**,
    so replying after close (which removed the `ServerInstance` from state)
    silently dropped the response. Moved the pending-responses map onto
    `HttpServeState` and keyed it globally by `request_id` so in-flight
    replies work across close.
  - **`op_http_serve_accept` and `op_http_serve_respond` returned an
    "Unknown server id" error** when the JS accept loop re-polled after
    `close()`, poisoning the event loop and failing unrelated tests. Both
    ops now treat a missing server as a soft null/no-op.

  The JS `createServer()` shim also gained proper Node-compatible semantics:
  `listen(cb)` invokes the callback via `queueMicrotask`; `close(cb)`
  defers the callback until all in-flight requests finish; new connections
  received after `close()` receive a `503` instead of entering the user
  handler.

  Previously-quarantined `packages/ui-server/src/__tests__/node-handler.local.ts`
  and `packages/docs/src/__tests__/docs-cli-actions.local.ts` are restored
  to `.test.ts` and now run under `vtz test`. The `test:integration` npm
  scripts that fell back to bun for these files are removed.

## 0.2.69

### Patch Changes

- [#2748](https://github.com/vertz-dev/vertz/pull/2748) [`d220831`](https://github.com/vertz-dev/vertz/commit/d2208316b502e667b9a435942609b8e5cb36ce71) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(vtz): add vitest-compatible mock APIs to `@vertz/test`

  Real-world test suites written against vitest often call `getMockImplementation()`,
  `getMockName()`, `mockName()`, and `withImplementation()` on mock functions. Our
  runtime exposed `mock()` / `vi.fn()` without those methods, so tests migrated
  from vitest hit `TypeError: x.getMockImplementation is not a function` (surfaced
  in #2731).

  This PR fills the gap. Added to every mock created by `mock()`, `vi.fn()`, and
  `spyOn()`:

  - **`getMockImplementation()`** — returns the current default implementation, or
    `undefined` if none is set. Does not consider the once-queue (matches vitest).
  - **`getMockName()`** — returns the display name set via `mockName()`. Defaults
    to `''` (empty string).
  - **`mockName(name)`** — sets the display name for diagnostics. Returns the mock
    for chaining. Cleared by `mockReset()`; preserved by `mockClear()`.
  - **`withImplementation(fn, cb)`** — temporarily swaps the default implementation
    with `fn`, runs `cb`, then restores the original — awaiting `cb` if it returns
    a Promise. Returns `cb`'s result. Restores cleanly on both sync and async
    exceptions. Does not disturb `getMockImplementation()` after return.

  Also added type declarations for all four methods to `MockFunction` in
  `@vertz/test`, and added Rust + TS test coverage (10 Rust tests, 15 TS tests).

  Not implemented (intentionally): `mockThrow` / `mockThrowOnce` (v4.1.0+ vitest,
  would add surface without strong use-case), `mock.settledResults` /
  `mock.instances` / `mock.contexts` / `mock.invocationCallOrder` (separate state
  that the runtime doesn't currently track — follow-up if demand materializes).

- [#2740](https://github.com/vertz-dev/vertz/pull/2740) [`48875ca`](https://github.com/vertz-dev/vertz/commit/48875ca7370dd4858134b928a2bbe6ffa2001275) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(vtz): rewrite bare imports inside pre-bundled `/@deps/` files

  The dev server's pre-bundle short-circuit previously served files from
  `.vertz/deps/` verbatim. When a bundle still contained bare specifiers
  (e.g. an `@vertz/theme-shadcn` bundle with `import { css } from "@vertz/ui"`),
  the browser rejected it with `Failed to resolve module specifier "@vertz/ui"`.
  The pre-bundle branch now runs the same import rewriter used by the direct
  `node_modules/` serve path. Closes #2730.

- [#2742](https://github.com/vertz-dev/vertz/pull/2742) [`7f7ff47`](https://github.com/vertz-dev/vertz/commit/7f7ff478308153e488dbd4ab4e2a1208c3e2449d) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(vtz): `vtz ci` now loads `ci.config.ts` through vtz itself (no more bun/tsx dependency)

  `vtz ci`'s config loader used to spawn an external JS runtime to evaluate
  `ci.config.ts` — preferring bun, falling back to `node --import tsx`. That
  made bun (or a tsx devDependency) a hard requirement for `vtz ci`, even
  though vtz is itself a TypeScript runtime. The fallback chain was
  discovered in #2739 while trying to drop bun from CI; the `@vertz/ci`
  package.json's exports field also doesn't satisfy strict-Node ESM, which
  tsx uses, so the fallback was fragile.

  This PR makes vtz self-host:

  - **New hidden subcommand `vtz __exec <file> [args...]`** — runs a
    single JS/TS file through the vtz runtime with `process.argv` populated.
    Not intended for end-user use; exists to support internal tooling like
    `vtz ci`.
  - **`find_runtime()` in `ci/config.rs`** now prefers the current vtz binary
    via `std::env::current_exe()` with `__exec`. bun/node+tsx stay as
    fallbacks for the edge case where `current_exe()` is unavailable.
  - **`process.exit(code)` is now implemented** (via a new `op_process_exit`
    op). It previously threw. The existing `.pipe/_loader.mjs` calls
    `process.exit(0)` at the end of its run, so this is necessary for the
    loader to terminate cleanly under vtz.

  After this lands, `vtz ci` has zero external-runtime dependencies — vtz
  alone is sufficient. Unblocks migrating CI from `bun install` to
  `vtz install --frozen` (tracked separately).

- [#2747](https://github.com/vertz-dev/vertz/pull/2747) [`7fea5d7`](https://github.com/vertz-dev/vertz/commit/7fea5d736750d879f44a09a8ef1d8bb64f91f9cd) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(vtz): semver resolver must not return versions that don't satisfy the range

  `vtz install` incorrectly resolved `esbuild: ^0.27.3` to `0.25.12` when a stale
  lockfile entry existed, because the lockfile-reuse fast path trusted the pinned
  version without revalidating that it still satisfied the requested range. The
  companion `graph_to_lockfile` path also wrote root-dep entries by name-only,
  blindly accepting whichever hoisted version was present.

  Both paths now verify that the chosen version satisfies the declared range. A
  stale or out-of-range pin falls through to a fresh registry resolve instead of
  silently being reused. Closes #2738.

## 0.2.68

### Patch Changes

- [#2735](https://github.com/vertz-dev/vertz/pull/2735) [`9c9f9ac`](https://github.com/vertz-dev/vertz/commit/9c9f9acffd7ec14497c5312af58666752a0ab9c8) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(vtz): preserve executable mode from tar headers during `vtz install`

  npm package tarballs encode `bin/*` files with mode 0o755 in their tar
  headers. The extractor in `native/vtz/src/pm/tarball.rs` was creating
  each file via `File::create` and copying bytes, but never applying the
  header mode — so every extracted file came out at the process umask
  (typically 0o644). This made shipped binaries non-executable and spawn
  failed with `EACCES`, e.g. `@esbuild/linux-x64/bin/esbuild`, which
  blocked any build that shelled out to esbuild after `vtz install
--frozen` in CI.

  Fix: read `entry.header().mode()` before writing, and apply the masked
  file-permission bits (0o777, excluding setuid/sticky for safety) via
  `set_permissions` after the write completes. Applied to both
  `extract_tarball` (npm) and `extract_github_tarball` (GitHub refs).

  No-op on Windows (permissions are gated by `#[cfg(unix)]`). Regression
  test builds a tar with a 0o755 exec file and a 0o644 data file,
  extracts, and asserts both modes are preserved.

## 0.2.67

### Patch Changes

- [#2727](https://github.com/vertz-dev/vertz/pull/2727) [`a34ea32`](https://github.com/vertz-dev/vertz/commit/a34ea322a3c4a165e456ba16623cdce326c08396) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(vtz): default NODE_ENV=test when unset under `vtz test`

  Bun and vitest both set `NODE_ENV=test` automatically when running tests. `vtz test` didn't, so library code that distinguishes production from test (e.g. `@vertz/server`'s JWT issuer/key-pair validation) would take the production branch under `vtz ci test` in CI, where the env is bare. This caused @vertz/server auth tests to fail with:

      JWT issuer is required in production.
      Key pair is required in production.

  Fixed by setting `NODE_ENV=test` at the start of `run_tests()` when NODE_ENV is unset or empty. An explicit `NODE_ENV=production` is preserved. Matches bun/vitest.

## 0.2.66

### Patch Changes

- [#2721](https://github.com/vertz-dev/vertz/pull/2721) [`3b610d5`](https://github.com/vertz-dev/vertz/commit/3b610d5496cb5cccfc29fbe406c770b4a5e2ca73) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(vtz): drain child stdout/stderr concurrently in ci scheduler to avoid pipe-buffer deadlock

  `vtz ci test` reported packages as `FAILED (exit -1) timeout after 120000ms` even when the underlying test run completed in seconds. Root cause: `execute_command` in the ci scheduler read the child process's piped stdout/stderr only _after_ `child.wait()` returned. Once either pipe filled (~16KB on macOS, ~64KB on Linux), the child blocked on its next `write()`, waiting for the parent to drain — which never happened until after `wait()`. Any real test suite emitting more than a few KB of output hit this.

  Fixed by draining stdout and stderr concurrently with the wait via `tokio::join!`, including inside the timeout-wrapped branch. Two regression tests generate 512KB of output on stdout and stderr respectively; both complete in ms now.

- [#2679](https://github.com/vertz-dev/vertz/pull/2679) [`cd47db1`](https://github.com/vertz-dev/vertz/commit/cd47db1dac1536f670e9fbee963b2bd1a151ff12) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add `codegen` subcommand to the vtz CLI, fixing `vtz run codegen` and `vtz dev` codegen step that broke when `@vertz/runtime` bin entry shadowed `@vertz/cli`

- [#2711](https://github.com/vertz-dev/vertz/pull/2711) [`72b6198`](https://github.com/vertz-dev/vertz/commit/72b61989af091dfb56613d28e26fa288c9e07432) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix `vi.mock()` and `spyOn()` on ESM module exports by adding a spy_exports compiler transform that converts `export` declarations to mutable `let` bindings with setter registration, mock proxy generation for CJS/opaque modules, and `mocked_bare_specifiers` to prevent synthetic module intercepts from bypassing `vi.mock()`

- [#2689](https://github.com/vertz-dev/vertz/pull/2689) [`48c651a`](https://github.com/vertz-dev/vertz/commit/48c651a70a0cccc5f96ad06eba22dfcd5f57a399) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix `node:util.types.isTypedArray` to use `Object.prototype.toString` tag-set check instead of `instanceof`, preventing false negatives when TypedArrays cross V8 snapshot boundaries (e.g., PGlite NODEFS)

- [#2683](https://github.com/vertz-dev/vertz/pull/2683) [`52aeed4`](https://github.com/vertz-dev/vertz/commit/52aeed4bbe556159865e4b2e256abad0f8476e0a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(vtz): resolve JWKS-based JWT verification returning null in full chain

  Two bugs prevented the full JWT chain (generate → sign → JWKS → verify) from working:

  1. V8 snapshot cross-realm: after snapshot restore, `ArrayBuffer.isView()` in the crypto bootstrap IIFE failed for TypedArrays created in ES modules (different realm constructors). Replaced with duck-type property checks.

  2. HTTP serve URL hostname: `Bun.serve()` hardcoded the bind address (e.g. `0.0.0.0`) in `req.url`, causing JWT issuer mismatch. Now prefers the `Host` header.

- [#2677](https://github.com/vertz-dev/vertz/pull/2677) [`9423bc8`](https://github.com/vertz-dev/vertz/commit/9423bc82802195602c96b66a72fb884f5dae3903) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(vtz): register preload script mocks in module loader

  Preload scripts that called `mock.module()` / `vi.mock()` had their mocks silently ignored because the Rust module loader only checked mocks extracted at compile time from the test file. The runtime now bridges preload mocks to the module loader's registry after each preload evaluates.

- [#2710](https://github.com/vertz-dev/vertz/pull/2710) [`cc998eb`](https://github.com/vertz-dev/vertz/commit/cc998eb9a37a25335764b1250418c0727f49778a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix production build pipeline: publish native compiler via platform packages, remove bin link shadowing, align esbuild versions, and hard-fail when native compiler is unavailable

- [#2693](https://github.com/vertz-dev/vertz/pull/2693) [`3695b13`](https://github.com/vertz-dev/vertz/commit/3695b135ea7003c0186efc8720dbc7f7bda17bc3) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(compiler): shorthand method definitions no longer trigger false import injection

  `contains_standalone_call()` now detects shorthand method definitions like `{ batch(items) { } }` by matching the closing `)` and checking for a following `{`. Previously, these were incorrectly treated as standalone function calls, causing spurious `import { batch } from '@vertz/ui'` injections.

- [#2676](https://github.com/vertz-dev/vertz/pull/2676) [`5b84bc4`](https://github.com/vertz-dev/vertz/commit/5b84bc48d523eb7f02c6fe3999df1308099a80ca) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(vtz): floor float delay before BigInt conversion in setTimeout/setInterval

  `BigInt()` throws `RangeError` on floating-point numbers. Timer delays like `1.5` or `Math.random() * 10` now work correctly by flooring the value before conversion.

## 0.2.65

### Patch Changes

- [#2674](https://github.com/vertz-dev/vertz/pull/2674) [`156a3d0`](https://github.com/vertz-dev/vertz/commit/156a3d03610e3c8459187bd9fda7216079ae22d5) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add `process.arch` to the vtz runtime bootstrap, fixing sharp and other native modules that construct platform-arch strings from `process.platform` and `process.arch`.

## 0.2.64

### Patch Changes

- [#2650](https://github.com/vertz-dev/vertz/pull/2650) [`6c295ef`](https://github.com/vertz-dev/vertz/commit/6c295ef98f5c707c0297fea61c2c1fc1c86d2b63) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(vtz): strip `export type *` in SSR, persist lockfile platform constraints

  - Strip `export type * from` and `export type * as Ns from` in the TypeScript strip pass, fixing SSR crashes on type-only star re-exports (#2638)
  - Persist `os` and `cpu` platform constraints in lockfile entries so they round-trip correctly through write/parse (#2645)
  - Replace no-op pre-push hook with working `vtz ci` quality gates (#2643)

## 0.2.63

### Patch Changes

- [#2646](https://github.com/vertz-dev/vertz/pull/2646) [`5e770e0`](https://github.com/vertz-dev/vertz/commit/5e770e0ddef46960ec9cf2c20027d16527a23b39) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(pm): install optional platform-specific dependencies from stale v1 lockfiles

  Packages using the `optionalDependencies` pattern for platform-specific native binaries
  (e.g., lefthook, @typescript/native-preview, oxfmt) were not getting their binaries installed
  because v1 lockfiles didn't record optional dependencies. Added lockfile versioning (v1/v2)
  and a migration path that discovers missing optional deps from the registry for direct
  dependencies when upgrading from a v1 lockfile.

## 0.2.62

### Patch Changes

- [#2639](https://github.com/vertz-dev/vertz/pull/2639) [`5e9a614`](https://github.com/vertz-dev/vertz/commit/5e9a614833d967e8cdce4a37c47d387842e04ad3) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Expand `node:perf_hooks` CJS stub with `PerformanceEntry`, `PerformanceObserver`, `PerformanceObserverEntryList`, and `monitorEventLoopDelay` (required by happy-dom v20.8.3). Add `import.meta.dirname` / `import.meta.dir` polyfill that derives the directory path from `import.meta.url` since deno_core only sets the latter.

## 0.2.61

### Patch Changes

- [#2594](https://github.com/vertz-dev/vertz/pull/2594) [`b002f4f`](https://github.com/vertz-dev/vertz/commit/b002f4f15ea29f8cd79b23d112e04eb1edb64807) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix CJS relative path resolution to check exports field before main, and add array fallback support to both CJS and ESM exports resolvers

- [#2588](https://github.com/vertz-dev/vertz/pull/2588) [`129c7d2`](https://github.com/vertz-dev/vertz/commit/129c7d2705dfb71fb04ed293dc0823511a1a81cd) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix CJS require() to resolve package.json exports field and fix execSync to use shell execution instead of splitting on spaces

- [#2637](https://github.com/vertz-dev/vertz/pull/2637) [`d6c978e`](https://github.com/vertz-dev/vertz/commit/d6c978ea1f6f9879357d9f5d480f270a37bbcef4) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix cli.sh to walk full PATH when resolving native binary, so nested vtz invocations in CI find the binary even when self-referencing symlinks shadow it

- [#2568](https://github.com/vertz-dev/vertz/pull/2568) [`69d82ed`](https://github.com/vertz-dev/vertz/commit/69d82ed1c525cba840c45d42a0e01230ccb00599) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix docs test failures: add CJS-to-ESM interop, readdir withFileTypes/recursive, cpSync, workspace source fallback, and pkg_type_cache for module loader

- [#2597](https://github.com/vertz-dev/vertz/pull/2597) [`6aff68e`](https://github.com/vertz-dev/vertz/commit/6aff68efb4b06aeceaccd9adec441b95b868a858) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add path traversal validation to both Rust deps resolver and JS CJS resolver to prevent malicious package.json exports from resolving files outside the package directory

- [#2628](https://github.com/vertz-dev/vertz/pull/2628) [`5d06b58`](https://github.com/vertz-dev/vertz/commit/5d06b58201a3f51bac591c78532727cd694e0483) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix runtime detection tests to support vtz as a valid runtime, fix path.dirname("/") returning "." instead of "/" in the vtz runtime, and fix version-check tests to explicitly chmod shell scripts

- [#2603](https://github.com/vertz-dev/vertz/pull/2603) [`ec5627f`](https://github.com/vertz-dev/vertz/commit/ec5627f557a4696a9b6e6dd939c06be7a8adf603) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix scoping bug where object properties inside nested parentheses were incorrectly stripped as TypeScript type annotations, causing `await expect(fn({key: Value})).rejects.toThrow()` to fail with "key is not defined"

- [#2614](https://github.com/vertz-dev/vertz/pull/2614) [`0b15e3a`](https://github.com/vertz-dev/vertz/commit/0b15e3a95c4ebb4d2a3e7182c0c1cdaa192095c8) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add `vm` module to ESM resolution layer and add `isContext` to both CJS and ESM implementations, fixing happy-dom test failures under `vtz test`

## 0.2.60

### Patch Changes

- [#2526](https://github.com/vertz-dev/vertz/pull/2526) [`92de65b`](https://github.com/vertz-dev/vertz/commit/92de65bb43fd34ffd9f4e8b979052b5475bcf73e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(vtz): support file:// URLs in fetch for PGlite WASM loading

- [#2527](https://github.com/vertz-dev/vertz/pull/2527) [`985d282`](https://github.com/vertz-dev/vertz/commit/985d2823c2f7f9e6a24497661d75e39f8a0f7764) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(desktop): shell.spawn now kills entire process group on kill(), preventing orphaned subprocesses

## 0.2.59

## 0.2.58

## 0.2.57

## 0.2.56

## 0.2.55

### Patch Changes

- [#2441](https://github.com/vertz-dev/vertz/pull/2441) [`e2126aa`](https://github.com/vertz-dev/vertz/commit/e2126aa0dca54dbb11c917c030895417ba6285da) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(runtime): expose `process.cwd()` globally so `@vertz/server` auth module works in the vtz test runtime

- [#2434](https://github.com/vertz-dev/vertz/pull/2434) [`a4957d6`](https://github.com/vertz-dev/vertz/commit/a4957d6160ce9ba181cdc54239a947106bc2c67f) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(install): remove macOS quarantine xattr and ad-hoc sign binaries in CI to prevent Gatekeeper from killing the vtz binary after curl install

## 0.2.54

## 0.2.53

### Patch Changes

- [#2420](https://github.com/vertz-dev/vertz/pull/2420) [`83be8f7`](https://github.com/vertz-dev/vertz/commit/83be8f7501c7487c4896855c7becfb6d5aa4fa7e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Remove Bun dependency from vtzx/vtz fallback paths. When the native binary is unavailable, the CLI now resolves commands from node_modules/.bin directly instead of delegating to bunx/bun.

## 0.2.52

## 0.2.51

## 0.2.50

### Patch Changes

- [#2387](https://github.com/vertz-dev/vertz/pull/2387) [`00c4d91`](https://github.com/vertz-dev/vertz/commit/00c4d91c8a5c3760ea1cd8e858e621f602a09999) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Ship Node.js CLI shims (`cli.js`, `cli-exec.js`) so npm creates working `node_modules/.bin/{vtz,vertz,vtzx}` entries. Previously the `bin` field pointed to `./vtz` which was not included in the published tarball.

## 0.2.49

## 0.2.48

### Patch Changes

- [#2318](https://github.com/vertz-dev/vertz/pull/2318) [`13cebc3`](https://github.com/vertz-dev/vertz/commit/13cebc335bf9d278419f550aaa01360a9597306f) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(runtime): stub node:/bun: built-ins in dev module server

  The dev module server now returns empty ES module stubs for `node:*` and `bun:*` specifiers instead of attempting to auto-install them from npm. This eliminates the "Auto-install failed" error overlay noise when server-only packages like `@vertz/db` are transitively pulled into the client bundle.

## 0.2.47

## 0.2.46

## 0.0.3

### Patch Changes

- [#55](https://github.com/vertz-dev/vtz/pull/55) [`2e81192`](https://github.com/vertz-dev/vtz/commit/2e81192b7511849ec6a38ffbd6e95b93d6e59c38) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - ### New Features
  - **Plugin API** — `FrameworkPlugin` trait with React plugin (TSX compilation, HMR, React Refresh)
  - **CSS file imports** — `import './styles.css'` injects styles in dev server
  - **PostCSS pipeline** — CSS imports processed through PostCSS when configured
  - **Asset imports** — `import logo from './logo.png'` resolves to URL strings
  - **`import.meta.env`** — `.env` file loading with `VERTZ_` prefix filtering
  - **tsconfig path aliases** — `paths` from `tsconfig.json` resolved in import rewriter
  - **Reverse proxy** — subdomain routing, WebSocket proxying, TLS/HTTPS with auto-generated certs, `/etc/hosts` sync, loop detection

## 0.0.2

### Patch Changes

- [`a75a484`](https://github.com/vertz-dev/vtz/commit/a75a4842f04ff4e250d3cbe24a58ffc184d30008) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Initial release of the Vertz runtime as a standalone package. Includes V8 dev server, test runner, package manager, and native compiler bindings. Binary renamed from `vertz-runtime` to `vtz` with `vertz` as an alias.
