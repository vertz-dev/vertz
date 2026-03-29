# Phase 3: Compilation Pipeline + Dev Module Serving

**Prerequisites:** Phase 1 (HTTP server), Phase 2 (V8 embedding) complete.

**Goal:** The server compiles `.tsx`/`.ts` files on-demand and serves them as ES modules to the browser. A Vertz app renders client-side.

**Design doc:** `plans/vertz-dev-server.md` — Phase 1.3

---

## Context — Read These First

- Current Bun plugin pipeline: `packages/ui-server/src/bun-plugin/plugin.ts`
- Import rewriting examples in Vite: https://vitejs.dev/guide/dep-pre-bundling.html
- Native compiler API: `native/vertz-compiler-core/src/lib.rs`

---

## Tasks

### Task 1: Browser-targeted compilation endpoint

**What to do:**
- Add route: `GET /src/**/*.tsx` → compile the file and return JavaScript
- Call `vertz_compiler_core::compile()` with target `"dom"` (browser target)
- Set `Content-Type: application/javascript`
- Return compiled code as the response body

**Files to create:**
```
native/vertz-runtime/src/
├── compiler/
│   ├── mod.rs
│   └── pipeline.rs      # NEW — compile orchestration for browser target
└── server/
    └── module_server.rs  # NEW — /src/** route handler
```

**Acceptance criteria:**
- [ ] `GET /src/components/Button.tsx` returns compiled JavaScript
- [ ] The response has `Content-Type: application/javascript`
- [ ] JSX is transformed (no raw JSX in output)
- [ ] Signals are transformed (`let count = 0` → `signal(0)`)
- [ ] Compilation errors return a JS module that logs the error to console (not a 500)

---

### Task 2: Import specifier rewriting (browser target)

**What to do:**
- After compilation, rewrite import specifiers in the output:
  - `@vertz/ui` → `/@deps/@vertz/ui`
  - `./components/Task` → `/src/components/Task.tsx` (resolve extension)
  - `../utils/format` → `/src/utils/format.ts`
  - `zod` → `/@deps/zod`
- Use regex or AST-based rewriting on the compiled output
- Handle: static `import`, dynamic `import()`, `export ... from`

**Files to create:**
```
native/vertz-runtime/src/compiler/
└── import_rewriter.rs    # NEW — specifier rewriting
```

**Acceptance criteria:**
- [ ] Bare specifier `@vertz/ui` rewrites to `/@deps/@vertz/ui`
- [ ] Relative specifier `./Foo` rewrites to `/src/components/Foo.tsx` (resolved, with extension)
- [ ] Package specifier `zod` rewrites to `/@deps/zod`
- [ ] `export { x } from './y'` rewrites the specifier
- [ ] Dynamic `import('./Lazy')` rewrites the specifier
- [ ] Already-absolute URLs (http://) are not modified

---

### Task 3: Compilation cache

**What to do:**
- In-memory `HashMap<PathBuf, CachedModule>` where `CachedModule` has: compiled code, source map, timestamp
- On request: check cache → if hit and file mtime unchanged, return cached → else compile and cache
- Cache is module-server-level (shared across requests)

**Files to create:**
```
native/vertz-runtime/src/compiler/
└── cache.rs              # NEW — in-memory compilation cache
```

**Acceptance criteria:**
- [ ] First request compiles the file (cache miss)
- [ ] Second request returns cached result (no recompilation)
- [ ] If file is modified (mtime changes), cache is invalidated and file recompiles
- [ ] Cache is thread-safe (multiple concurrent requests)

---

### Task 4: Source map serving

**What to do:**
- Store source maps alongside compiled output in the cache
- Route: `GET /src/**/*.tsx.map` → return source map JSON
- Add `//# sourceMappingURL=<file>.tsx.map` comment to compiled output

**Files to create:**
```
native/vertz-runtime/src/compiler/
└── source_maps.rs        # NEW — source map storage + serving
```

**Acceptance criteria:**
- [ ] Compiled output includes `//# sourceMappingURL` comment
- [ ] `GET /src/components/Button.tsx.map` returns valid JSON source map
- [ ] Source map maps back to original `.tsx` source (line-level accuracy)

---

### Task 5: Dependency pre-bundling at startup

**What to do:**
- At server start, scan the app entry file for `node_modules` imports (recursive static analysis)
- For each dependency found: run `esbuild` (subprocess) to bundle it into a single ESM file
- Store pre-bundled files in `.vertz/deps/` directory
- Convert CJS packages to ESM during bundling
- Cache key: `package.json` + lockfile hash. Skip re-bundling if unchanged.
- Route: `GET /@deps/**` → serve pre-bundled files from `.vertz/deps/`

**Files to create:**
```
native/vertz-runtime/src/deps/
├── mod.rs
├── scanner.rs            # NEW — scan imports for node_modules deps
├── prebundle.rs          # NEW — esbuild subprocess invocation
└── cache.rs              # NEW — .vertz/deps/ management + cache invalidation
```

**Acceptance criteria:**
- [ ] Server start scans entry and discovers dependency list (e.g., `@vertz/ui`, `zod`)
- [ ] Each dependency is pre-bundled into a single ESM file in `.vertz/deps/`
- [ ] CJS-only packages (e.g., if any) are converted to ESM
- [ ] `GET /@deps/@vertz/ui` returns the pre-bundled file
- [ ] Second server start with unchanged deps skips pre-bundling (cache hit)
- [ ] Changed `package.json` triggers re-bundling
- [ ] Pre-bundling completes in < 5 seconds for a typical Vertz app

---

### Task 6: HTML shell generation

**What to do:**
- For page routes (`GET /`, `GET /tasks`, etc.), return an HTML document:
  ```html
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vertz App</title>
    <link rel="modulepreload" href="/src/app.tsx" />
    <!-- additional preload hints for known imports -->
    <style>/* base theme CSS */</style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/app.tsx"></script>
  </body>
  </html>
  ```
- Include `<link rel="modulepreload">` hints for the entry file's direct imports (from module graph if available, else just entry)
- Include base theme CSS as inline `<style>` if available

**Files to create:**
```
native/vertz-runtime/src/server/
└── html_shell.rs         # NEW — HTML document generation
```

**Acceptance criteria:**
- [ ] `GET /` returns HTML with `<script type="module" src="/src/app.tsx">`
- [ ] `GET /tasks/123` returns the same HTML shell (SPA routing)
- [ ] HTML includes `<link rel="modulepreload">` for entry file
- [ ] HTML includes `<div id="app"></div>` mount point
- [ ] HTML is valid (`<!DOCTYPE html>`, charset, viewport)

---

### Task 7: CSS serving

**What to do:**
- During compilation, CSS is extracted (via the CSS extraction transform)
- Store extracted CSS alongside compiled output
- Compiled JS imports CSS via a side-effect import: `import '/@css/Button.css'`
- Route: `GET /@css/**` → serve extracted CSS files
- CSS files have `Content-Type: text/css`

**Files to create:**
```
native/vertz-runtime/src/server/
└── css_server.rs         # NEW — CSS file serving
```

**Acceptance criteria:**
- [ ] Compiled components that use `css()` produce CSS output
- [ ] CSS is accessible at `/@css/<hash>.css`
- [ ] CSS has correct `Content-Type: text/css`

---

### Task 8: V8-side transforms (context stable IDs, hydration IDs)

**What to do:**
- Some transforms aren't in Rust yet (hydration IDs, island ID injection)
- Load these as V8-side post-processing: after Rust compilation, run JS transforms on the output
- Create a V8 module that exports transform functions
- Call from Rust after compilation, before serving

**Files to create:**
```
native/vertz-runtime/src/compiler/
└── v8_transforms.rs      # NEW — orchestrate V8-side post-transforms
native/vertz-runtime/src/runtime/
└── transforms.js         # NEW — JS transform implementations
```

**Acceptance criteria:**
- [ ] Hydration IDs are injected into compiled output
- [ ] Context stable IDs are injected (verify: createContext calls get stableId arg)
- [ ] Transforms run without significantly increasing compilation time (< 2ms overhead)

---

### Task 9: End-to-end test — Vertz app renders client-side

**What to do:**
- Create a minimal test fixture: a Vertz app with 2-3 components
- Start the dev server, open the page, verify the app renders
- This is the Phase 1.3 kill gate validation

**Files to create:**
```
native/vertz-runtime/tests/
├── client_render.rs
└── fixtures/
    └── minimal-app/
        ├── public/
        ├── src/
        │   ├── app.tsx
        │   └── components/
        │       └── Hello.tsx
        └── package.json
```

**Acceptance criteria:**
- [ ] Server starts and serves the minimal app
- [ ] Browser loads the page and renders the app (can test with headless browser or by checking HTTP responses)
- [ ] All imports resolve correctly (no 404s in the module chain)
- [ ] No console errors in the browser

**Kill gate:** If this doesn't work after 3 weeks of effort, evaluate bundled dev mode (esbuild as full dev bundler).

---

## Quality Gates

```bash
cd native && cargo check -p vertz-runtime
cd native && cargo test -p vertz-runtime
cd native && cargo clippy -p vertz-runtime
```

---

## Notes

- Import rewriting is the trickiest part. Start with static imports only, add dynamic import() support incrementally.
- Pre-bundling via esbuild subprocess is pragmatic. Don't try to embed esbuild in Rust — just `Command::new("esbuild")`.
- The V8-side transforms are a bridge. Long-term, port them to Rust. For now, running them in V8 is fine.
- Error handling is critical in this phase: compilation errors should NEVER crash the server. Always return an error module.
