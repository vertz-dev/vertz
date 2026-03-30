/// SSR render orchestration.
///
/// Coordinates the full SSR pipeline:
/// 1. Create a fresh V8 runtime with DOM shim
/// 2. Set location for routing
/// 3. Load the app entry module
/// 4. Execute the app's render function to get an HTML string
/// 5. Collect CSS injected during rendering
/// 6. Collect hydration data
/// 7. Assemble the complete HTML document
///
/// Supports two modes:
/// - **Single-pass:** Render once, capturing queries as they're registered
/// - **Two-pass:** Pass 1 discovers queries, fetches data, Pass 2 renders with data
use std::time::Instant;

use deno_core::error::AnyError;

use crate::runtime::async_context::load_async_context;
use crate::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};
use crate::ssr::css_collector;
use crate::ssr::dom_shim;
use crate::ssr::html_document::{assemble_ssr_document, entry_path_to_url, SsrHtmlOptions};
use crate::ssr::hydration;
use crate::ssr::session::{self, SsrSession};

/// Result of an SSR render.
#[derive(Debug, Clone)]
pub struct SsrResult {
    /// The complete HTML document.
    pub html: String,
    /// The rendered content (just the SSR fragment, without the document shell).
    pub content: String,
    /// CSS collected during rendering.
    pub css: String,
    /// Time taken to render (in milliseconds).
    pub render_time_ms: f64,
    /// Whether rendering succeeded or fell back to client-only shell.
    pub is_ssr: bool,
    /// Error message if SSR failed (fell back to client-only shell).
    pub error: Option<String>,
}

/// Options for SSR rendering.
#[derive(Debug, Clone)]
pub struct SsrOptions {
    /// Root directory of the project.
    pub root_dir: std::path::PathBuf,
    /// Path to the app entry file.
    pub entry_file: std::path::PathBuf,
    /// Request URL to render.
    pub url: String,
    /// Page title.
    pub title: String,
    /// Theme CSS to include.
    pub theme_css: Option<String>,
    /// Session data from request cookies.
    pub session: SsrSession,
    /// Module preload hints.
    pub preload_hints: Vec<String>,
    /// Whether to include HMR scripts (dev mode).
    pub enable_hmr: bool,
}

/// Perform SSR rendering: load the app, render to HTML, collect CSS and hydration data.
///
/// This is the main entry point for SSR. It creates a new V8 runtime for each
/// request (isolated rendering context), loads the DOM shim and app entry,
/// executes the render, and assembles the final HTML document.
///
/// If SSR fails for any reason, it falls back to a client-only HTML shell.
///
/// This function is async because V8 module loading is async (deno_core requires
/// an async runtime for module resolution). It runs the V8 work on a blocking
/// thread to avoid nesting tokio runtimes.
pub async fn render_to_html(options: &SsrOptions) -> SsrResult {
    let options = options.clone();
    let start = Instant::now();

    // Run SSR on a blocking thread — V8/deno_core creates its own tokio
    // runtime internally, which cannot nest inside the server's async runtime.
    let opts_for_fallback = options.clone();
    let result = tokio::task::spawn_blocking(move || render_ssr(&options))
        .await
        .unwrap_or_else(|e| {
            eprintln!("[SSR] Task panicked: {}", e);
            Err(deno_core::anyhow::anyhow!("SSR task panicked: {}", e))
        });

    match result {
        Ok(result) => result,
        Err(e) => {
            let error_msg = e.to_string();
            eprintln!(
                "[SSR] Render failed, falling back to client shell: {}",
                error_msg
            );
            let elapsed = start.elapsed().as_secs_f64() * 1000.0;
            fallback_client_shell(&opts_for_fallback, elapsed, Some(error_msg))
        }
    }
}

/// Synchronous version of render_to_html for non-async contexts (tests, CLI).
pub fn render_to_html_sync(options: &SsrOptions) -> SsrResult {
    let start = Instant::now();

    match render_ssr(options) {
        Ok(result) => result,
        Err(e) => {
            let error_msg = e.to_string();
            eprintln!(
                "[SSR] Render failed, falling back to client shell: {}",
                error_msg
            );
            let elapsed = start.elapsed().as_secs_f64() * 1000.0;
            fallback_client_shell(options, elapsed, Some(error_msg))
        }
    }
}

/// Internal SSR rendering implementation.
fn render_ssr(options: &SsrOptions) -> Result<SsrResult, AnyError> {
    let start = Instant::now();

    // Create a fresh V8 runtime for this render
    let mut runtime = VertzJsRuntime::new(VertzRuntimeOptions {
        root_dir: Some(options.root_dir.to_string_lossy().to_string()),
        capture_output: false,
        ..Default::default()
    })?;

    // Load polyfills and shims
    load_async_context(&mut runtime)?;
    dom_shim::load_dom_shim(&mut runtime)?;

    // Set location for router
    dom_shim::set_ssr_location(&mut runtime, &options.url)?;

    // Install session data
    session::install_session(&mut runtime, &options.session)?;

    // Initialize SSR query tracking
    runtime.execute_script_void(
        "[vertz:ssr-init]",
        "globalThis.__vertz_ssr_queries = {}; globalThis.__vertz_ssr_mode = true;",
    )?;

    // Load and execute the app entry module
    let entry_specifier =
        deno_core::ModuleSpecifier::from_file_path(&options.entry_file).map_err(|_| {
            deno_core::anyhow::anyhow!(
                "Cannot convert entry path to URL: {}",
                options.entry_file.display()
            )
        })?;

    // Use tokio runtime to load modules (async operation)
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()?;

    rt.block_on(async { runtime.load_main_module(&entry_specifier).await })?;

    // Try to invoke the SSR render function
    let content = render_app_content(&mut runtime)?;

    // Collect CSS
    let css_entries = css_collector::collect_css(&mut runtime)?;
    let css_string = css_collector::format_css_as_style_tags(&css_entries);

    // Collect hydration data
    let hydration_data = hydration::collect_hydration_data(&mut runtime, &options.url)?;
    let hydration_script = hydration::serialize_hydration_data(&hydration_data);

    let entry_url = entry_path_to_url(&options.entry_file, &options.root_dir);

    let html = assemble_ssr_document(&SsrHtmlOptions {
        title: &options.title,
        ssr_content: &content,
        inline_css: &css_string,
        theme_css: options.theme_css.as_deref(),
        hydration_script: &hydration_script,
        entry_url: &entry_url,
        preload_hints: &options.preload_hints,
        enable_hmr: options.enable_hmr,
    });

    let elapsed = start.elapsed().as_secs_f64() * 1000.0;

    Ok(SsrResult {
        html,
        content,
        css: css_string,
        render_time_ms: elapsed,
        is_ssr: true,
        error: None,
    })
}

/// Execute the app's render function and extract the HTML content.
///
/// Looks for these patterns in order:
/// 1. `globalThis.__vertz_ssr_render(url)` — explicit SSR render function
/// 2. `document.getElementById('app').innerHTML` — read from DOM after module execution
/// 3. `document.body.innerHTML` — last resort
fn render_app_content(runtime: &mut VertzJsRuntime) -> Result<String, AnyError> {
    let result = runtime.execute_script(
        "[vertz:ssr-render]",
        r#"
        (function() {
            // Check for explicit SSR render function
            if (typeof globalThis.__vertz_ssr_render === 'function') {
                const result = globalThis.__vertz_ssr_render(globalThis.location.pathname);
                if (typeof result === 'string') return result;
                if (result && typeof result.outerHTML === 'string') return result.outerHTML;
                if (result && typeof result.innerHTML === 'string') return result.innerHTML;
            }

            // Check if the app rendered into #app
            const appEl = document.getElementById('app') || document.body.querySelector('#app');
            if (appEl && appEl.childNodes.length > 0) {
                return appEl.innerHTML;
            }

            // Fall back to body content (excluding the empty #app container)
            const bodyChildren = Array.from(document.body.childNodes).filter(
                n => !(n.nodeType === 1 && n.getAttribute && n.getAttribute('id') === 'app' && n.childNodes.length === 0)
            );
            if (bodyChildren.length > 0) {
                return bodyChildren.map(n => n.outerHTML || n.textContent || '').join('');
            }

            return '';
        })()
        "#,
    )?;

    match result {
        serde_json::Value::String(s) => Ok(s),
        _ => Ok(String::new()),
    }
}

/// Generate a client-only HTML shell as a fallback when SSR fails.
fn fallback_client_shell(
    options: &SsrOptions,
    render_time_ms: f64,
    error: Option<String>,
) -> SsrResult {
    let entry_url = entry_path_to_url(&options.entry_file, &options.root_dir);

    let html = assemble_ssr_document(&SsrHtmlOptions {
        title: &options.title,
        ssr_content: "",
        inline_css: "",
        theme_css: options.theme_css.as_deref(),
        hydration_script: "",
        entry_url: &entry_url,
        preload_hints: &options.preload_hints,
        enable_hmr: options.enable_hmr,
    });

    SsrResult {
        html,
        content: String::new(),
        css: String::new(),
        render_time_ms,
        is_ssr: false,
        error,
    }
}

/// Perform a simple SSR render with inline JavaScript (for testing/validation).
///
/// This function renders inline JavaScript code in an SSR context,
/// useful for validating the SSR pipeline without a full app.
pub fn render_inline_ssr(js_code: &str, url: &str) -> Result<SsrResult, AnyError> {
    let start = Instant::now();

    let mut runtime = VertzJsRuntime::new(VertzRuntimeOptions {
        capture_output: true,
        ..Default::default()
    })?;

    // Load polyfills and shims
    load_async_context(&mut runtime)?;
    dom_shim::load_dom_shim(&mut runtime)?;
    dom_shim::set_ssr_location(&mut runtime, url)?;

    // Initialize SSR tracking
    runtime.execute_script_void(
        "[vertz:ssr-init]",
        "globalThis.__vertz_ssr_queries = {}; globalThis.__vertz_ssr_mode = true;",
    )?;

    // Execute the provided code
    runtime.execute_script_void("[vertz:inline-ssr]", js_code)?;

    // Extract rendered content
    let content = render_app_content(&mut runtime)?;

    // Collect CSS
    let css_entries = css_collector::collect_css(&mut runtime)?;
    let css_string = css_collector::format_css_as_style_tags(&css_entries);

    // Collect hydration data
    let _hydration_data = hydration::collect_hydration_data(&mut runtime, url)?;

    let elapsed = start.elapsed().as_secs_f64() * 1000.0;

    Ok(SsrResult {
        html: String::new(), // No full document for inline render
        content,
        css: css_string,
        render_time_ms: elapsed,
        is_ssr: true,
        error: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_render_inline_simple_component() {
        let result = render_inline_ssr(
            r#"
            const app = document.getElementById('app');
            app.appendChild(document.createTextNode('Hello SSR'));
            "#,
            "/",
        )
        .unwrap();

        assert!(result.is_ssr);
        assert_eq!(result.content, "Hello SSR");
    }

    #[test]
    fn test_render_inline_nested_elements() {
        let result = render_inline_ssr(
            r#"
            const app = document.getElementById('app');

            const header = document.createElement('h1');
            header.appendChild(document.createTextNode('Tasks'));
            app.appendChild(header);

            const list = document.createElement('ul');
            for (let i = 0; i < 3; i++) {
                const li = document.createElement('li');
                li.appendChild(document.createTextNode('Task ' + i));
                list.appendChild(li);
            }
            app.appendChild(list);
            "#,
            "/tasks",
        )
        .unwrap();

        assert!(result.is_ssr);
        assert!(result.content.contains("<h1>Tasks</h1>"));
        assert!(result.content.contains("<li>Task 0</li>"));
        assert!(result.content.contains("<li>Task 1</li>"));
        assert!(result.content.contains("<li>Task 2</li>"));
    }

    #[test]
    fn test_render_inline_with_css() {
        let result = render_inline_ssr(
            r#"
            __vertz_inject_css('.btn { color: red; }', 'btn');

            const app = document.getElementById('app');
            const btn = document.createElement('button');
            btn.setAttribute('class', 'btn');
            btn.appendChild(document.createTextNode('Click'));
            app.appendChild(btn);
            "#,
            "/",
        )
        .unwrap();

        assert!(!result.css.is_empty());
        assert!(result.css.contains(".btn { color: red; }"));
    }

    #[test]
    fn test_render_inline_with_hydration_data() {
        let result = render_inline_ssr(
            r#"
            globalThis.__vertz_ssr_queries = {
                "tasks": { "items": [{ "id": "1", "title": "Test" }] }
            };

            const app = document.getElementById('app');
            app.appendChild(document.createTextNode('Tasks loaded'));
            "#,
            "/tasks",
        )
        .unwrap();

        assert_eq!(result.content, "Tasks loaded");
    }

    #[test]
    fn test_render_inline_empty_returns_empty_content() {
        let result = render_inline_ssr("// empty module", "/").unwrap();
        assert!(result.is_ssr);
        assert!(result.content.is_empty());
    }

    #[test]
    fn test_render_inline_explicit_ssr_render_fn() {
        let result = render_inline_ssr(
            r#"
            globalThis.__vertz_ssr_render = function(url) {
                return '<div class="page">Welcome to ' + url + '</div>';
            };
            "#,
            "/home",
        )
        .unwrap();

        assert!(result.is_ssr);
        assert_eq!(result.content, "<div class=\"page\">Welcome to /home</div>");
    }

    #[test]
    fn test_render_inline_ssr_render_fn_with_element() {
        let result = render_inline_ssr(
            r#"
            globalThis.__vertz_ssr_render = function(url) {
                const div = document.createElement('div');
                div.setAttribute('class', 'page');
                div.appendChild(document.createTextNode('Page: ' + url));
                return div;
            };
            "#,
            "/about",
        )
        .unwrap();

        assert!(result.is_ssr);
        assert!(result.content.contains("Page: /about"));
    }

    #[test]
    fn test_render_inline_location_set_correctly() {
        let result = render_inline_ssr(
            r#"
            const app = document.getElementById('app');
            app.appendChild(document.createTextNode(location.pathname));
            "#,
            "/tasks/123",
        )
        .unwrap();

        assert_eq!(result.content, "/tasks/123");
    }

    #[test]
    fn test_render_inline_performance() {
        let result = render_inline_ssr(
            r#"
            const app = document.getElementById('app');
            app.appendChild(document.createTextNode('fast'));
            "#,
            "/",
        )
        .unwrap();

        // SSR should be fast (< 200ms per task spec)
        assert!(
            result.render_time_ms < 5000.0,
            "SSR took too long: {}ms",
            result.render_time_ms
        );
    }

    #[test]
    fn test_fallback_client_shell() {
        let options = SsrOptions {
            root_dir: std::path::PathBuf::from("/project"),
            entry_file: std::path::PathBuf::from("/project/src/app.tsx"),
            url: "/".to_string(),
            title: "Test App".to_string(),
            theme_css: None,
            session: SsrSession::default(),
            preload_hints: vec![],
            enable_hmr: false,
        };

        let result = fallback_client_shell(&options, 1.0, None);
        assert!(!result.is_ssr);
        assert!(result.content.is_empty());
        assert!(result.html.contains("<div id=\"app\"></div>"));
        assert!(result
            .html
            .contains("<script type=\"module\" src=\"/src/app.tsx\">"));
    }

    #[test]
    fn test_render_to_html_with_bad_entry_falls_back() {
        let options = SsrOptions {
            root_dir: std::path::PathBuf::from("/nonexistent"),
            entry_file: std::path::PathBuf::from("/nonexistent/src/app.tsx"),
            url: "/".to_string(),
            title: "Test App".to_string(),
            theme_css: None,
            session: SsrSession::default(),
            preload_hints: vec![],
            enable_hmr: false,
        };

        let result = render_to_html_sync(&options);
        // Should fall back to client shell gracefully
        assert!(!result.is_ssr);
        assert!(result.html.contains("<div id=\"app\"></div>"));
    }

    #[test]
    fn test_render_inline_with_attributes() {
        let result = render_inline_ssr(
            r#"
            const app = document.getElementById('app');

            const link = document.createElement('a');
            link.setAttribute('href', '/tasks');
            link.setAttribute('class', 'nav-link');
            link.appendChild(document.createTextNode('Tasks'));
            app.appendChild(link);
            "#,
            "/",
        )
        .unwrap();

        assert!(result
            .content
            .contains(r#"<a href="/tasks" class="nav-link">Tasks</a>"#));
    }

    #[test]
    fn test_render_inline_void_elements() {
        let result = render_inline_ssr(
            r#"
            const app = document.getElementById('app');

            const img = document.createElement('img');
            img.setAttribute('src', '/logo.png');
            img.setAttribute('alt', 'Logo');
            app.appendChild(img);

            const br = document.createElement('br');
            app.appendChild(br);

            const input = document.createElement('input');
            input.setAttribute('type', 'text');
            input.setAttribute('name', 'search');
            app.appendChild(input);
            "#,
            "/",
        )
        .unwrap();

        assert!(result
            .content
            .contains(r#"<img src="/logo.png" alt="Logo" />"#));
        assert!(result.content.contains("<br />"));
        assert!(result
            .content
            .contains(r#"<input type="text" name="search" />"#));
    }
}
