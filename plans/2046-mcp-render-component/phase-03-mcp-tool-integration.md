# Phase 3: MCP Tool Integration and Tests

## Context

This is the third and final phase of the `vertz_render_component` MCP tool (#2046). It wires everything together: adds the tool definition to the MCP tool list, implements the `execute_tool` handler, and adds comprehensive unit tests. After this phase, the feature is complete.

Design doc: `plans/2046-mcp-render-component.md` (Rev 2)

**Prerequisites:** Phase 1 (types, HTML assembly, path validation) and Phase 2 (V8 dispatch) complete.

## Tasks

### Task 1: Add tool definition and handler to mcp.rs

**Files:**
- `native/vtz/src/server/mcp.rs` (modified)

**What to implement:**

**1. Add tool to `tool_definitions()`:**

Add to the `tools` array in `tool_definitions()`:

```rust
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

**2. Add handler in `execute_tool()`:**

Add a new match arm for `"vertz_render_component"`:

```rust
"vertz_render_component" => {
    let file = args
        .get("file")
        .and_then(|v| v.as_str())
        .ok_or("Missing required parameter 'file'")?
        .to_string();

    let props_json = args
        .get("props")
        .map(|v| serde_json::to_string(v).unwrap_or_else(|_| "{}".to_string()))
        .unwrap_or_else(|| "{}".to_string());

    // 1. Validate path
    let abs_path = match crate::ssr::component_render::validate_component_path(
        &file,
        &state.root_dir,
    ) {
        Ok(p) => p,
        Err(msg) => {
            let is_not_found = msg.contains("not found");
            let error_type = if msg.contains("must be within") {
                "invalid_path"
            } else {
                "import_failed"
            };
            return Ok(serde_json::json!({
                "content": [{ "type": "text", "text": msg }],
                "isError": true,
                "_meta": {
                    "file": file,
                    "error": error_type,
                }
            }));
        }
    };

    // 2. Check isolate availability
    let isolate = state
        .api_isolate
        .read()
        .unwrap_or_else(|e| e.into_inner())
        .clone();

    let isolate = match isolate {
        Some(i) if i.is_initialized() => i,
        _ => {
            return Ok(serde_json::json!({
                "content": [{
                    "type": "text",
                    "text": "Component rendering not available: persistent isolate is not initialized."
                }],
                "isError": true,
                "_meta": {
                    "file": file,
                    "error": "isolate_unavailable",
                }
            }));
        }
    };

    // 3. Dispatch render
    let request = crate::runtime::persistent_isolate::ComponentRenderRequest {
        file_path: abs_path.to_string_lossy().to_string(),
        props_json,
    };

    match isolate.handle_component_render(request).await {
        Ok(resp) => {
            state.console_log.push(
                LogLevel::Info,
                format!(
                    "MCP component render: {} ({:.1}ms)",
                    file, resp.render_time_ms,
                ),
                Some("mcp"),
            );

            // Assemble HTML document
            let html = crate::ssr::component_render::assemble_component_document(
                &crate::ssr::component_render::ComponentHtmlOptions {
                    theme_css: state.theme_css.as_deref(),
                    component_css: &resp.css,
                    rendered_html: &resp.html,
                },
            );

            Ok(serde_json::json!({
                "content": [{ "type": "text", "text": html }],
                "_meta": {
                    "file": file,
                    "renderTimeMs": resp.render_time_ms,
                    "exportUsed": resp.export_used,
                    "warnings": resp.warnings,
                }
            }))
        }
        Err(e) => {
            // Parse structured errors from dispatch (format: "error_type:message")
            let (error_type, message) = if let Some(idx) = e.find(':') {
                let (t, m) = e.split_at(idx);
                (t.to_string(), m[1..].to_string())
            } else {
                ("render_error".to_string(), e.clone())
            };

            let is_context = error_type == "missing_context";
            let display_msg = if is_context {
                format!(
                    "Component threw an error during rendering:\n\n{}\n\n\
                    This component requires context providers that are not available in isolated rendering. \
                    Use vertz_render_page to render this component within its full page context.",
                    message
                )
            } else if error_type == "no_component_export" {
                format!(
                    "No component export found in {}. The file must have a default export that is a function component. \
                    If the component is a named export, add a default export.",
                    file
                )
            } else if error_type == "import_failed" {
                format!("Failed to import component: {}", message)
            } else {
                format!(
                    "Component threw an error during rendering:\n\n{}\n\n\
                    This may indicate the component expects props that were not provided, \
                    or depends on data that isn't available in isolated rendering.",
                    message
                )
            };

            state.console_log.push(
                LogLevel::Error,
                format!("MCP component render error: {} — {}", file, message),
                Some("mcp"),
            );

            Ok(serde_json::json!({
                "content": [{ "type": "text", "text": display_msg }],
                "isError": true,
                "_meta": {
                    "file": file,
                    "error": error_type,
                    "rawError": message,
                }
            }))
        }
    }
}
```

**Acceptance criteria:**
- [ ] Tool appears in `tool_definitions()` (8 tools total)
- [ ] `execute_tool` handles `"vertz_render_component"`
- [ ] Path validation errors return `isError: true` with correct `_meta.error`
- [ ] Isolate unavailable returns clear error
- [ ] Success path assembles HTML and includes `_meta` with timing + warnings
- [ ] Error path parses structured error types and formats display messages
- [ ] Console log entries recorded for both success and error

---

### Task 2: Add unit tests for the new tool

**Files:**
- `native/vtz/src/server/mcp.rs` (modified — add tests to existing `mod tests`)

**What to implement:**

Add tests to the existing `#[cfg(test)] mod tests` block:

**Tool definition tests:**
- [ ] `test_tool_definitions_includes_render_component` — tool count is now 8, `vertz_render_component` is in the list
- [ ] `test_render_component_tool_schema` — `file` is required, `props` is optional, both have correct types

**execute_tool tests (using the existing `create_test_state`):**
- [ ] `test_render_component_missing_file_param` — omitting `file` returns error
- [ ] `test_render_component_file_not_found` — nonexistent file returns `isError: true` with `_meta.error = "import_failed"`
- [ ] `test_render_component_path_escape` — `../../etc/passwd` returns `isError: true` with `_meta.error = "invalid_path"`
- [ ] `test_render_component_no_isolate` — when `api_isolate` is None, returns `isError: true` with `_meta.error = "isolate_unavailable"`

Note: Tests involving actual V8 execution (successful render, context errors, query warnings) require a running persistent isolate and are integration tests. They are out of scope for unit tests. The unit tests focus on the MCP handler logic (parameter parsing, path validation, error formatting).

**Update existing test:**
- [ ] Update `test_tool_definitions_structure` — change expected count from 7 to 8, add `vertz_render_component` to the assertion list

**Acceptance criteria:**
- [ ] All new unit tests pass
- [ ] Existing test `test_tool_definitions_structure` updated for 8 tools
- [ ] `cargo test --all` passes
- [ ] `cargo clippy --all-targets --release -- -D warnings` passes
- [ ] `cargo fmt --all -- --check` passes
