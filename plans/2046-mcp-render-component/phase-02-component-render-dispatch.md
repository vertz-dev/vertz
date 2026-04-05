# Phase 2: Component Render Dispatch (V8 Execution)

## Context

This is the second phase of the `vertz_render_component` MCP tool (#2046). It implements the actual V8 execution: the component-mode DOM reset script, the component render JS script, and the `dispatch_component_render` Rust function that orchestrates them. After this phase, the persistent isolate can render components in isolation.

Design doc: `plans/2046-mcp-render-component.md` (Rev 2)

**Prerequisites:** Phase 1 complete (types, HTML assembly, path validation).

## Tasks

### Task 1: Add COMPONENT_RESET_JS and COMPONENT_RENDER_JS scripts

**Files:**
- `native/vtz/src/runtime/persistent_isolate.rs` (modified)

**What to implement:**

Add two new JS script constants near the existing `SSR_RESET_JS` and `SSR_RENDER_FRAMEWORK_JS`:

**1. `COMPONENT_RESET_JS`** — variant of `SSR_RESET_JS` that does NOT restore baseline CSS:

```rust
const COMPONENT_RESET_JS: &str = r#"
(function() {
  // Clear DOM — same as SSR reset
  if (typeof document !== 'undefined') {
    document.head.innerHTML = '';
    document.body.innerHTML = '<div id="app"></div>';
  }
  // Clear CSS collector completely — no baseline restore.
  // This ensures only CSS from the component render is collected.
  if (typeof __vertz_clear_collected_css === 'function') {
    __vertz_clear_collected_css();
  } else if (typeof globalThis.__vertz_collected_css !== 'undefined') {
    globalThis.__vertz_collected_css = [];
  }
})()
"#;
```

**2. `COMPONENT_RENDER_JS`** — the async component render script from the design doc:

```rust
const COMPONENT_RENDER_JS: &str = r#"
(async function() {
  const filePath = globalThis.__vertz_component_file;
  const propsJson = globalThis.__vertz_component_props || '{}';
  const props = JSON.parse(propsJson);

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

  const Component = mod.default;
  if (typeof Component !== 'function') {
    globalThis.__vertz_component_result = JSON.stringify({
      error: 'no_component_export',
      message: 'No default function export found. The file must export a default function component.',
    });
    return;
  }

  const queryCountBefore = globalThis.__vertz_query_count || 0;

  try {
    Component(props);

    const appEl = document.getElementById('app');
    const html = appEl ? appEl.innerHTML : '';

    let css = '';
    if (typeof __vertz_get_collected_css === 'function') {
      const collected = __vertz_get_collected_css();
      if (collected.length > 0) {
        css = collected.map(function(e) { return e.css; }).join('\n');
      }
    }

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
"#;
```

**Acceptance criteria:**
- [ ] Both constants compile (valid Rust string literals)
- [ ] Scripts are syntactically valid JS (no runtime parse errors)
- [ ] Existing tests pass

---

### Task 2: Implement dispatch_component_render

**Files:**
- `native/vtz/src/runtime/persistent_isolate.rs` (modified)

**What to implement:**

Replace the stub `dispatch_component_render` from Phase 1 with the real implementation:

```rust
async fn dispatch_component_render(
    runtime: &mut crate::runtime::js_runtime::VertzJsRuntime,
    request: &ComponentRenderRequest,
) -> Result<ComponentRenderResponse, String> {
    let start = std::time::Instant::now();

    // 1. Component-mode DOM reset (no baseline CSS restore)
    runtime
        .execute_script_void("<component-reset>", COMPONENT_RESET_JS)
        .map_err(|e| format!("Component DOM reset error: {}", e))?;

    // 2. Set component file path and props as globals
    let safe_file = serde_json::to_string(&request.file_path)
        .map_err(|e| format!("File path serialize: {}", e))?;
    let safe_props = serde_json::to_string(&request.props_json)
        .map_err(|e| format!("Props serialize: {}", e))?;
    let setup_js = format!(
        "globalThis.__vertz_component_file = {}; globalThis.__vertz_component_props = {};",
        safe_file, safe_props
    );
    runtime
        .execute_script_void("<component-setup>", &setup_js)
        .map_err(|e| format!("Component setup error: {}", e))?;

    // 3. Execute the render script (async — needs event loop)
    runtime
        .execute_script_void("<component-render>", COMPONENT_RENDER_JS)
        .map_err(|e| format!("Component render script error: {}", e))?;

    // 4. Run event loop to resolve the async import
    match tokio::time::timeout(EVENT_LOOP_TIMEOUT, runtime.run_event_loop()).await {
        Ok(Ok(())) => {}
        Ok(Err(e)) => return Err(format!("Component render event loop error: {}", e)),
        Err(_) => {
            return Err(format!(
                "Component render timed out after {}s",
                EVENT_LOOP_TIMEOUT.as_secs()
            ))
        }
    }

    // 5. Read the result
    let result = runtime
        .execute_script(
            "<component-read-result>",
            "globalThis.__vertz_component_result || '{}'",
        )
        .map_err(|e| format!("Read component result error: {}", e))?;

    let elapsed = start.elapsed().as_secs_f64() * 1000.0;
    let result_str = result.as_str().unwrap_or("{}");
    let parsed: serde_json::Value =
        serde_json::from_str(result_str).map_err(|e| format!("Parse component result: {}", e))?;

    // 6. Check for JS-side errors
    if let Some(error) = parsed.get("error").and_then(|e| e.as_str()) {
        let message = parsed
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("Unknown error")
            .to_string();
        return Err(format!("{}:{}", error, message));
    }

    // 7. Build response
    let html = parsed.get("html").and_then(|h| h.as_str()).unwrap_or("").to_string();
    let css = parsed.get("css").and_then(|c| c.as_str()).unwrap_or("").to_string();
    let export_used = parsed.get("exportUsed").and_then(|e| e.as_str()).unwrap_or("default").to_string();
    let warnings: Vec<String> = parsed
        .get("warnings")
        .and_then(|w| w.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    Ok(ComponentRenderResponse {
        html,
        css,
        export_used,
        warnings,
        render_time_ms: elapsed,
    })
}
```

**Key implementation notes:**
- Uses `serde_json::to_string()` for safe JS interpolation of file path and props (same defense-in-depth pattern as session data in `dispatch_ssr_request`)
- Calls `run_event_loop()` with `EVENT_LOOP_TIMEOUT` (same timeout as SSR)
- Errors from JS side are encoded as `"error_type:message"` strings — the MCP handler in Phase 3 will parse these to set `_meta.error` and format the response

**Acceptance criteria:**
- [ ] `dispatch_component_render` compiles and is called from `process_messages`
- [ ] Uses `COMPONENT_RESET_JS` (not `SSR_RESET_JS`)
- [ ] Cache-busted import via `?t=timestamp` in the JS script
- [ ] Event loop drained with timeout after script execution
- [ ] JS-side errors propagated as Rust errors
- [ ] `cargo test --all` passes
- [ ] `cargo clippy --all-targets --release -- -D warnings` passes
