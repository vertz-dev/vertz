# Phase 1: Isolate Types, HTML Assembly, and Path Validation

## Context

This is the first phase of the `vertz_render_component` MCP tool (#2046). It establishes the foundational Rust types (`ComponentRenderRequest`, `ComponentRenderResponse`), the minimal HTML document assembly function, and the path validation utility. No V8 execution yet — this phase is pure Rust with unit tests.

Design doc: `plans/2046-mcp-render-component.md` (Rev 2)

## Tasks

### Task 1: Add ComponentRender message variant and types to persistent_isolate.rs

**Files:**
- `native/vtz/src/runtime/persistent_isolate.rs` (modified)

**What to implement:**

Add the new types and message variant:

```rust
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

Add `ComponentRender(ComponentRenderRequest, oneshot::Sender<Result<ComponentRenderResponse, String>>)` to the `IsolateMessage` enum.

Add a `handle_component_render` method to `PersistentIsolate` (public async, mirrors `handle_ssr`):

```rust
pub async fn handle_component_render(
    &self,
    request: ComponentRenderRequest,
) -> Result<ComponentRenderResponse, String> {
    let (response_tx, response_rx) = oneshot::channel();
    self.message_tx
        .send_timeout(
            IsolateMessage::ComponentRender(request, response_tx),
            std::time::Duration::from_secs(30),
        )
        .await
        .map_err(|_| "Isolate channel full or closed".to_string())?;
    response_rx
        .await
        .map_err(|_| "Isolate thread dropped response sender".to_string())?
}
```

Add the match arm in `process_messages`:

```rust
IsolateMessage::ComponentRender(request, response_tx) => {
    let result = dispatch_component_render(runtime, &request).await;
    let _ = response_tx.send(result);
}
```

Leave `dispatch_component_render` as a stub that returns an error: `Err("Not implemented yet".to_string())`. Phase 2 will implement it.

**Acceptance criteria:**
- [ ] `ComponentRenderRequest` and `ComponentRenderResponse` structs compile
- [ ] `IsolateMessage::ComponentRender` variant exists
- [ ] `handle_component_render` method exists on `PersistentIsolate`
- [ ] `process_messages` dispatches `ComponentRender` messages
- [ ] Existing tests pass (no regressions)

---

### Task 2: Create component_render.rs with HTML assembly and path validation

**Files:**
- `native/vtz/src/ssr/component_render.rs` (new)
- `native/vtz/src/ssr/mod.rs` (modified — add `pub mod component_render;`)

**What to implement:**

Create `component_render.rs` with two public functions:

**1. `assemble_component_document`**

```rust
pub struct ComponentHtmlOptions<'a> {
    pub theme_css: Option<&'a str>,
    pub component_css: &'a str,
    pub rendered_html: &'a str,
}

pub fn assemble_component_document(options: &ComponentHtmlOptions<'_>) -> String {
    // Minimal HTML5 document:
    // <!DOCTYPE html>
    // <html lang="en">
    // <head>
    //   <meta charset="UTF-8">
    //   <meta name="viewport" content="width=device-width, initial-scale=1.0">
    //   <style data-vertz-theme>{theme_css}</style>  (if present)
    //   <style data-vertz-component>{component_css}</style>  (if non-empty)
    // </head>
    // <body>
    //   <div id="app">{rendered_html}</div>
    // </body>
    // </html>
}
```

**2. `validate_component_path`**

```rust
pub fn validate_component_path(file: &str, root_dir: &Path) -> Result<PathBuf, String> {
    let abs_path = if Path::new(file).is_absolute() {
        PathBuf::from(file)
    } else {
        root_dir.join(file)
    };
    let canonical = abs_path.canonicalize()
        .map_err(|_| format!("Component file not found: {}", file))?;
    // root_dir should also be canonical for accurate comparison
    let canonical_root = root_dir.canonicalize()
        .unwrap_or_else(|_| root_dir.to_path_buf());
    if !canonical.starts_with(&canonical_root) {
        return Err(format!("File path must be within the project directory. Received: {}", file));
    }
    Ok(canonical)
}
```

**Tests (in the same file, `#[cfg(test)] mod tests`):**

For `assemble_component_document`:
- [ ] Basic structure: has DOCTYPE, html, head, body, app div
- [ ] Theme CSS injected when provided
- [ ] No theme style tag when theme_css is None
- [ ] Component CSS injected when non-empty
- [ ] No component style tag when component_css is empty
- [ ] Rendered HTML placed inside app div
- [ ] Empty rendered HTML produces empty app div
- [ ] Complete assembly: theme + component CSS + rendered HTML all present

For `validate_component_path`:
- [ ] Relative path resolved against root_dir
- [ ] Absolute path within root_dir accepted
- [ ] Path traversal (../../etc/passwd) rejected
- [ ] Non-existent file returns error
- [ ] File within subdirectory accepted

**Acceptance criteria:**
- [ ] `assemble_component_document` produces valid minimal HTML
- [ ] `validate_component_path` prevents path traversal
- [ ] All unit tests pass
- [ ] `cargo test --all` passes
- [ ] `cargo clippy --all-targets --release -- -D warnings` passes
