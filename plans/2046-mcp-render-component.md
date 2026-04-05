# Design: Component-Level Rendering via MCP (#2046)

**Rev 2** — Updated after DX, Product, and Technical reviews.

## Summary

Add an MCP tool `vertz_render_component` that SSR-renders a single component in isolation — no router, no layout, no data fetching — and returns the HTML with theme CSS. This gives LLM agents a focused "text screenshot" of exactly the component being edited, making edit-render-check cycles faster than full-page renders.

**Relationship to `vertz_render_page`:** `vertz_render_page` (already shipped) renders a full URL path through the app's router, layout, and data layer — equivalent to loading a page in the browser. `vertz_render_component` renders a single component function with provided props, outside any app context. Use `vertz_render_page` for page-level output or components that require routing/data/auth context. Use `vertz_render_component` for stateless or presentational components during iterative editing.

## API Surface

### MCP Tool Schema

```json
{
  "name": "vertz_render_component",
  "description": "Render a single stateless/presentational component in isolation and return HTML output. Wraps the component in a minimal shell with theme CSS but no router, layout, auth, or data providers. Best for leaf components during iterative editing. For page-level components or components that require context providers (router, auth, settings) or data fetching, use vertz_render_page instead.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "file": {
        "type": "string",
        "description": "Path to the component file relative to project root, e.g. 'src/components/TaskCard.tsx'. Must be within the project directory."
      },
      "props": {
        "type": "object",
        "description": "Props to pass to the component as a JSON object, e.g. { \"title\": \"Test\", \"count\": 5 }"
      }
    },
    "required": ["file"]
  }
}
```

> **`viewport` parameter removed (Rev 2).** SSR produces static HTML — there is no CSS media query evaluation or layout engine. A viewport meta tag in the output would create a false expectation of responsive layout control. If a future visual screenshot feature (headless browser) is added, viewport can be introduced there where it has actual effect.

### Tool Response (Success)

```json
{
  "content": [{ "type": "text", "text": "<html>...rendered component HTML...</html>" }],
  "_meta": {
    "file": "src/components/TaskCard.tsx",
    "renderTimeMs": 12.3,
    "exportUsed": "default",
    "warnings": []
  }
}
```

### Tool Response (Success with warnings — component uses `query()`)

When a component calls `query()` during render, it executes but data is empty/undefined since there is no data fetching in isolated mode. The tool succeeds but includes a warning so the agent knows the output is incomplete:

```json
{
  "content": [{ "type": "text", "text": "<html>...rendered component (with empty data)...</html>" }],
  "_meta": {
    "file": "src/components/TaskList.tsx",
    "renderTimeMs": 8.1,
    "exportUsed": "default",
    "warnings": [
      "Component uses query() — data renders as empty/undefined in isolated mode. Use vertz_render_page for components with data dependencies."
    ]
  }
}
```

The warning is detected by checking if any `query()` calls were registered during the render (the query registration is global and observable).

### Tool Response (Error — Missing Context Provider)

```json
{
  "content": [{
    "type": "text",
    "text": "Component threw an error during rendering:\n\nuseRouter() must be called within RouterContext.Provider\n\nThis component requires context providers that are not available in isolated rendering. Use vertz_render_page to render this component within its full page context."
  }],
  "isError": true,
  "_meta": {
    "file": "src/components/TaskCard.tsx",
    "error": "missing_context",
    "rawError": "useRouter() must be called within RouterContext.Provider"
  }
}
```

> **Context detection (Rev 2):** Instead of a fragile regex to extract context names, we use a broad check: `msg.includes('must be called within')`. All Vertz context hooks (`useRouter`, `useDialogStack`, `useSettings`, etc.) throw with this pattern. The raw error message is included in both `content.text` and `_meta.rawError` so the agent can reason about it directly. No attempt to parse out the context name — the error message itself is the best guidance.

### Tool Response (Error — File Not Found / Import Failed)

```json
{
  "content": [{
    "type": "text",
    "text": "Failed to import component: Cannot find module 'src/components/DoesNotExist.tsx'"
  }],
  "isError": true,
  "_meta": {
    "file": "src/components/DoesNotExist.tsx",
    "error": "import_failed",
    "rawError": "Cannot find module 'src/components/DoesNotExist.tsx'"
  }
}
```

> **Canonical error code (Rev 2):** Always `"import_failed"` for any import error (file not found, syntax error, etc.). The raw error message provides specifics. No need for separate `file_not_found` vs `import_failed` distinction — the agent reads the message.

### Tool Response (Error — No Component Export)

```json
{
  "content": [{
    "type": "text",
    "text": "No component export found in src/components/TaskCard.tsx. The file must have a default export that is a function component. If the component is a named export, add a default export."
  }],
  "isError": true,
  "_meta": {
    "file": "src/components/TaskCard.tsx",
    "error": "no_component_export"
  }
}
```

### Tool Response (Error — Render Error)

Generic fallback for any error during `Component(props)` that isn't a context error:

```json
{
  "content": [{
    "type": "text",
    "text": "Component threw an error during rendering:\n\nCannot read property 'map' of undefined\n\nThis may indicate the component expects props that were not provided, or depends on data that isn't available in isolated rendering."
  }],
  "isError": true,
  "_meta": {
    "file": "src/components/TaskCard.tsx",
    "error": "render_error",
    "rawError": "Cannot read property 'map' of undefined"
  }
}
```

### Tool Response (Error — Path Escape)

```json
{
  "content": [{
    "type": "text",
    "text": "File path must be within the project directory. Received: ../../etc/passwd"
  }],
  "isError": true,
  "_meta": {
    "file": "../../etc/passwd",
    "error": "invalid_path"
  }
}
```

## Rendering Pipeline

The component render bypasses the full SSR pipeline (no routing, no data fetching, no layout). Instead:

1. **Path validation** — resolve `file` against `root_dir`, reject if it escapes the project directory
2. **DOM reset (component mode)** — use `COMPONENT_RESET_JS` (variant of `SSR_RESET_JS` that does NOT restore the baseline CSS, giving us only CSS from this component's render)
3. **Dynamic import with cache-bust** — `await import(absPath + '?t=' + Date.now())` to bypass V8's module cache and always load the latest file contents
4. **Export resolution** — use the default export only (not first-named-function heuristic)
5. **JSX instantiation** — call `Component(props)`, which writes to the DOM shim's document
6. **DOM serialization** — read `document.getElementById('app').innerHTML` (consistent with legacy SSR path, handles components that append to DOM rather than return elements)
7. **CSS collection** — `__vertz_get_collected_css()` captures only CSS from this component's render (baseline was not restored in step 2)
8. **Warning detection** — check if any `query()` registrations occurred during render
9. **HTML assembly** — wrap in minimal HTML document (theme CSS in `<head>`, component CSS, no HMR/SSR data)
10. **Event loop drain** — `run_event_loop()` with timeout (same as framework SSR path) to resolve the async import

### Message Channel

A new `IsolateMessage::ComponentRender` variant is added to the persistent isolate's message enum:

```rust
enum IsolateMessage {
    Api(IsolateRequest, oneshot::Sender<Result<IsolateResponse, String>>),
    Ssr(SsrRequest, oneshot::Sender<Result<SsrResponse, String>>),
    ComponentRender(ComponentRenderRequest, oneshot::Sender<Result<ComponentRenderResponse, String>>),
}

pub struct ComponentRenderRequest {
    pub file_path: String,   // Absolute path (validated by caller)
    pub props_json: String,  // Serialized JSON props
}

pub struct ComponentRenderResponse {
    pub html: String,
    pub css: String,
    pub export_used: String,
    pub warnings: Vec<String>,
    pub render_time_ms: f64,
}
```

This keeps component rendering separate from `dispatch_ssr_request` — different reset behavior, different CSS handling, different result shape.

### JS Execution Script

```javascript
(async function() {
  const filePath = globalThis.__vertz_component_file;
  const propsJson = globalThis.__vertz_component_props || '{}';
  const props = JSON.parse(propsJson);

  // Cache-bust: always load the latest version of the file
  const cacheBuster = '?t=' + Date.now();
  let mod;
  try {
    mod = await import(filePath + cacheBuster);
  } catch (e) {
    globalThis.__vertz_component_result = JSON.stringify({
      error: 'import_failed',
      message: e.message || String(e),
    });
    return;
  }

  // Resolve component: default export only
  const Component = mod.default;
  if (typeof Component !== 'function') {
    globalThis.__vertz_component_result = JSON.stringify({
      error: 'no_component_export',
      message: 'No default function export found. The file must export a default function component.',
    });
    return;
  }

  // Track query() registrations to detect data-dependent components
  const queryCountBefore = globalThis.__vertz_query_count || 0;

  try {
    // Call component — writes to DOM shim's document via JSX factory
    Component(props);

    // Read rendered HTML from DOM (consistent with legacy SSR path)
    const appEl = document.getElementById('app');
    const html = appEl ? appEl.innerHTML : '';

    // Collect only component CSS (baseline was NOT restored during reset)
    let css = '';
    if (typeof __vertz_get_collected_css === 'function') {
      const collected = __vertz_get_collected_css();
      if (collected.length > 0) {
        css = collected.map(function(e) { return e.css; }).join('\n');
      }
    }

    // Check for query() usage
    const warnings = [];
    const queryCountAfter = globalThis.__vertz_query_count || 0;
    if (queryCountAfter > queryCountBefore) {
      warnings.push(
        'Component uses query() — data renders as empty/undefined in isolated mode. ' +
        'Use vertz_render_page for components with data dependencies.'
      );
    }

    globalThis.__vertz_component_result = JSON.stringify({
      html: html,
      css: css,
      exportUsed: 'default',
      warnings: warnings,
    });
  } catch (e) {
    const msg = e.message || String(e);
    const isContext = msg.includes('must be called within');
    globalThis.__vertz_component_result = JSON.stringify({
      error: isContext ? 'missing_context' : 'render_error',
      message: msg,
    });
  }
})()
```

**Key differences from SSR render script (Rev 2):**
- **Cache-busted import** (`?t=Date.now()`) — V8's ES module loader caches by specifier. Unlike SSR reload which re-evaluates the entire app entry, dynamic `import()` to an already-resolved specifier returns the cached version. The timestamp query string creates a unique specifier, forcing V8 to load the file fresh.
- **Component-mode DOM reset** — does not restore baseline CSS (see CSS Isolation below)
- **DOM-based output** — reads `document.getElementById('app').innerHTML` instead of the return value, consistent with how Vertz compiled components work (they write to DOM via JSX factory, not necessarily return elements)
- **`run_event_loop()`** — the Rust handler must call `runtime.run_event_loop()` with a timeout after `execute_script_void()`, identical to the framework SSR path. The async IIFE contains `await import()` which requires the event loop to resolve.

### CSS Isolation

**Problem identified in Technical Review:** `SSR_RESET_JS` snapshots all app-level CSS as "baseline" on first call, then restores it on every subsequent reset. This means a component render after a page render would include all app CSS in the output.

**Solution:** A separate `COMPONENT_RESET_JS` script that:
1. Clears the DOM (same as `SSR_RESET_JS`)
2. Clears the CSS collector completely (does NOT restore baseline)
3. Does NOT snapshot baseline

This ensures `__vertz_get_collected_css()` returns only CSS from the component's own `css()` calls. Theme CSS is handled separately (injected by the Rust HTML assembly, not by the CSS collector).

```javascript
(function() {
  // Clear DOM
  if (typeof document !== 'undefined') {
    document.head.innerHTML = '';
    document.body.innerHTML = '<div id="app"></div>';
  }
  // Clear CSS collector completely — no baseline restore
  if (typeof __vertz_clear_collected_css === 'function') {
    __vertz_clear_collected_css();
  }
})()
```

### Path Validation

The Rust handler validates the file path before dispatching to V8:

```rust
fn validate_component_path(file: &str, root_dir: &Path) -> Result<PathBuf, String> {
    let abs_path = if Path::new(file).is_absolute() {
        PathBuf::from(file)
    } else {
        root_dir.join(file)
    };
    let canonical = abs_path.canonicalize()
        .map_err(|_| format!("Component file not found: {}", file))?;
    if !canonical.starts_with(root_dir) {
        return Err(format!("File path must be within the project directory. Received: {}", file));
    }
    Ok(canonical)
}
```

### HTML Assembly

The component render uses a **minimal HTML shell** — no HMR, no SSR data, no entry script:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style data-vertz-theme>{theme_css}</style>
  <style data-vertz-component>{component_css}</style>
</head>
<body>
  <div id="app">{rendered_html}</div>
</body>
</html>
```

A dedicated `assemble_component_document` function with a lean `ComponentHtmlOptions` struct (only `theme_css`, `component_css`, `rendered_html`) keeps concerns separate from `assemble_ssr_document`.

## Manifesto Alignment

### Principle 3: AI agents are first-class users

This feature exists specifically for LLM agents. `vertz_render_page` renders the full page with routing, layout, and data fetching — powerful but slow and noisy for iterating on a single component. `vertz_render_component` gives agents exactly what they need: a focused preview of the component they're editing. Less noise = fewer tokens = faster iteration.

The tool description explicitly tells agents when to use each tool, and the warning system for `query()` components prevents agents from silently getting misleading output.

### Principle 7: Performance is not optional

Component renders skip the routing engine, data fetching layer, and layout tree. For a leaf component with no data dependencies, this should be an order of magnitude faster than a page render. The `renderTimeMs` metadata lets agents make informed decisions about which tool to use.

### Principle 2: One way to do things

Clear distinction: `vertz_render_page` for page-level output, `vertz_render_component` for presentational component output. The tool description makes the choice unambiguous.

### Tradeoffs

- **No context providers in isolated render.** Components that depend on `useRouter()`, `useSettings()`, etc. will fail with a clear error message containing the raw exception. This is intentional — the tool renders components *in isolation*. Context-dependent components should use `vertz_render_page`. We reject adding a "mock provider" system because it would add significant complexity for a narrow use case.

- **Default export only.** We require `export default function ComponentName` and do not fall back to searching named exports. This avoids the ambiguity of picking an arbitrary function export from a file that may export both components and utilities. If the component is a named export, the error message tells the developer to add a default export. This is consistent with Principle 2 (one way to do things).

- **Cache-busted imports.** Every component render loads the file fresh via `?t=timestamp`. This is slightly slower than cached imports but guarantees correctness — the agent always sees the latest version of the file. For a dev tool, correctness over speed is the right tradeoff.

### What was rejected

- **Headless browser rendering.** Using Playwright/Puppeteer to render components would give pixel-perfect screenshots but adds a heavy dependency, is much slower, and doesn't align with the "text screenshot" philosophy of the MCP tools.
- **Component storybook-style isolation.** A full isolation environment with mock providers, synthetic data, and component explorer UI is a separate feature (future). This tool is deliberately minimal.
- **Named export selection via parameter.** Adds API surface for a rare case. Default-only is predictable.
- **`viewport` parameter.** Removed in Rev 2 — SSR doesn't evaluate CSS media queries, so the parameter would create false expectations. Will be introduced with a future headless browser rendering feature where it has actual effect.

## Non-Goals

- **Pixel-accurate rendering.** This is a text/HTML screenshot, not a visual screenshot. No browser engine involved.
- **Data fetching.** Components that use `query()` will render with empty/undefined data (with a warning). This tool doesn't prefetch.
- **Context injection/mocking.** No mock providers. Components either work standalone or fail with a clear error.
- **Interactive preview.** No client-side JS, no hydration, no event handlers. Pure SSR output.
- **Component discovery/listing.** No tool to list available components. The agent knows the file path.
- **Screenshot image output.** Future work (requires headless browser). This tool returns HTML text only.
- **Responsive layout preview.** No viewport parameter — SSR doesn't evaluate media queries.

## Unknowns

### Resolved: Module cache (V8 dynamic import)

**Question:** Will `await import()` return stale modules from V8's cache?

**Resolution:** Yes, it will. V8's ES module loader caches by specifier, and unlike Bun's `require.cache`, there is no API to invalidate it. **Solution:** Append `?t=timestamp` to the import specifier, creating a unique specifier that bypasses the cache. This is the same pattern the SSR reload mechanism uses for the `.ts` wrapper.

### Resolved: CSS baseline contamination

**Question:** Will `SSR_RESET_JS` restore app-level baseline CSS into the component render?

**Resolution:** Yes, it will. `SSR_RESET_JS` snapshots all app CSS as "baseline" and restores it on every reset. **Solution:** Use a separate `COMPONENT_RESET_JS` that clears the CSS collector without restoring baseline. Component renders only include their own `css()` calls. Theme CSS comes from the Rust-side HTML assembly, not the CSS collector.

### Open: `query()` registration detection

**Question:** Can we reliably detect when a component calls `query()` during render to surface the warning?

**Resolution strategy:** Check `globalThis.__vertz_query_count` (or equivalent) before and after the component render. If `query()` increments a global counter, we can detect it. If no such counter exists, we'll need to add one to the query registration path. This is a small change to the query runtime. Verify during implementation — if detection isn't feasible without intrusive changes, ship without the warning and add it in a follow-up.

## POC Results

No POC required. The feature reuses proven infrastructure:
- Cache-busted dynamic import: same `?t=timestamp` pattern as SSR module reload
- DOM reset + CSS collection: variant of existing `SSR_RESET_JS`
- HTML assembly: simpler variant of `assemble_ssr_document`
- MCP tool registration: 7 tools already defined with established patterns
- Path validation: standard `canonicalize()` + `starts_with(root_dir)`

## Type Flow Map

This feature is entirely in Rust + embedded JS — no TypeScript generics involved. The data flow is:

```
MCP JSON-RPC request (serde_json::Value)
  → execute_tool() parses: file: &str, props: serde_json::Value
  → validate_component_path(file, root_dir) → PathBuf (or error response)
  → Rust sends ComponentRenderRequest { file_path, props_json } via IsolateMessage::ComponentRender
  → V8 thread: dispatch_component_render()
    → execute_script_void(COMPONENT_RESET_JS)
    → set globalThis.__vertz_component_file, __vertz_component_props
    → execute_script_void(COMPONENT_RENDER_JS)
    → run_event_loop() with timeout (resolves async import)
    → read globalThis.__vertz_component_result (JSON string)
  → ComponentRenderResponse { html, css, export_used, warnings, render_time_ms }
  → Rust assembles HTML document via assemble_component_document()
  → MCP JSON-RPC response (serde_json::Value)
```

All values are `serde_json::Value` — no generics to trace. Props flow as opaque JSON from MCP client → JS component function.

## E2E Acceptance Test

### Happy path: stateless component

```
Input (MCP tool call):
  vertz_render_component({
    file: "src/components/TaskCard.tsx",
    props: { "title": "Build MCP tools", "status": "in-progress" }
  })

Expected output:
  - Response contains "content": [{ "type": "text", "text": "<html>..." }]
  - HTML contains the rendered component markup (e.g., "Build MCP tools" text)
  - HTML contains <style data-vertz-theme> with theme CSS
  - _meta.renderTimeMs is a positive number
  - _meta.file is "src/components/TaskCard.tsx"
  - _meta.exportUsed is "default"
  - _meta.warnings is an empty array
```

### Warning: component uses query()

```
Input:
  vertz_render_component({
    file: "src/components/TaskList.tsx"
  })

Expected output (component calls query()):
  - Response is NOT an error (isError absent)
  - HTML is returned (possibly with empty data sections)
  - _meta.warnings contains a string mentioning "query()" and "vertz_render_page"
```

### Error: component requires context

```
Input:
  vertz_render_component({
    file: "src/pages/TaskListPage.tsx"
  })

Expected output (page component uses useRouter()):
  - isError is true
  - Response text contains the raw error message (e.g., "must be called within")
  - Response text mentions "vertz_render_page" as alternative
  - _meta.error is "missing_context"
  - _meta.rawError contains the original exception message
```

### Error: file not found

```
Input:
  vertz_render_component({
    file: "src/components/DoesNotExist.tsx"
  })

Expected output:
  - isError is true
  - _meta.error is "import_failed"
  - _meta.rawError contains the module resolution error
```

### Error: no default export

```
Input:
  vertz_render_component({
    file: "src/utils/helpers.ts"
  })

Expected output:
  - isError is true
  - Response text mentions "default export" and "function component"
  - _meta.error is "no_component_export"
```

### Error: path escape attempt

```
Input:
  vertz_render_component({
    file: "../../etc/passwd"
  })

Expected output:
  - isError is true
  - _meta.error is "invalid_path"
  - Response text says "must be within the project directory"
```

### Error: generic render error

```
Input:
  vertz_render_component({
    file: "src/components/BrokenComponent.tsx"
  })

Expected output (component throws TypeError):
  - isError is true
  - _meta.error is "render_error"
  - _meta.rawError contains the original exception message
  - Response text includes the raw error for agent reasoning
```
