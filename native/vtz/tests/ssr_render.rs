/// End-to-end SSR integration tests.
///
/// Validates the full SSR pipeline:
/// 1. DOM shim provides document/window/Element globals
/// 2. AsyncLocalStorage polyfill works for SSR context
/// 3. CSS collection during rendering
/// 4. Hydration data serialization
/// 5. Full HTML document assembly
/// 6. Session/auth resolution
/// 7. SSR render with fixture apps (persistent isolate)
use std::path::PathBuf;
use std::sync::Arc;

use tokio::sync::OnceCell;
use vertz_runtime::pm;
use vertz_runtime::pm::output::DevPmOutput;
use vertz_runtime::pm::vertzrc::ScriptPolicy;
use vertz_runtime::runtime::persistent_isolate::{
    PersistentIsolate, PersistentIsolateOptions, SsrRequest,
};
use vertz_runtime::ssr::css_collector;
use vertz_runtime::ssr::dom_shim;
use vertz_runtime::ssr::html_document::{assemble_ssr_document, SsrHtmlOptions};
use vertz_runtime::ssr::session::{extract_session_from_cookies, SsrSession};

fn ssr_app_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("ssr-app")
}

static FIXTURE_DEPS_INSTALLED: OnceCell<()> = OnceCell::const_new();

/// Ensure the ssr-app fixture has its node_modules installed using vtz's own
/// package manager. This makes framework SSR tests self-contained — no external
/// tool (bun/npm) required. Runs at most once across all tests.
async fn ensure_fixture_deps() {
    FIXTURE_DEPS_INSTALLED
        .get_or_init(|| async {
            let root = ssr_app_path();
            if root.join("node_modules").exists() {
                return;
            }
            pm::install(
                &root,
                false,
                ScriptPolicy::IgnoreAll,
                false,
                Arc::new(DevPmOutput),
            )
            .await
            .expect("vtz pm::install should install fixture deps");
        })
        .await;
}

// ═══════════════════════════════════════════════════════════════════════════
// DOM Shim Integration Tests
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_dom_shim_provides_complete_environment() {
    use vertz_runtime::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

    let mut rt = VertzJsRuntime::new(VertzRuntimeOptions {
        capture_output: true,
        ..Default::default()
    })
    .unwrap();

    dom_shim::load_dom_shim(&mut rt).unwrap();

    // Verify all required globals are available
    let checks = rt
        .execute_script(
            "<test>",
            r#"({
                document: typeof document === 'object',
                window: typeof window === 'object',
                navigator: typeof navigator === 'object',
                location: typeof location === 'object',
                history: typeof history === 'object',
                Element: typeof Element === 'function',
                Text: typeof Text === 'function',
                DocumentFragment: typeof DocumentFragment === 'function',
                Event: typeof Event === 'function',
                CustomEvent: typeof CustomEvent === 'function',
                MutationObserver: typeof MutationObserver === 'function',
                ResizeObserver: typeof ResizeObserver === 'function',
                requestAnimationFrame: typeof requestAnimationFrame === 'function',
                cancelAnimationFrame: typeof cancelAnimationFrame === 'function',
                matchMedia: typeof matchMedia === 'function',
                getComputedStyle: typeof getComputedStyle === 'function',
            })"#,
        )
        .unwrap();

    let map = checks.as_object().unwrap();
    for (key, value) in map {
        assert_eq!(
            value,
            &serde_json::json!(true),
            "globalThis.{} should be defined",
            key
        );
    }
}

#[test]
fn test_dom_shim_complex_dom_tree() {
    use vertz_runtime::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

    let mut rt = VertzJsRuntime::new(VertzRuntimeOptions {
        capture_output: true,
        ..Default::default()
    })
    .unwrap();

    dom_shim::load_dom_shim(&mut rt).unwrap();

    let result = rt
        .execute_script(
            "<test>",
            r#"
            const table = document.createElement('table');
            table.setAttribute('class', 'data-table');

            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            ['Name', 'Status', 'Due Date'].forEach(text => {
                const th = document.createElement('th');
                th.appendChild(document.createTextNode(text));
                headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);
            table.appendChild(thead);

            const tbody = document.createElement('tbody');
            [
                ['Task 1', 'Active', '2026-04-01'],
                ['Task 2', 'Done', '2026-03-15'],
            ].forEach(([name, status, date]) => {
                const row = document.createElement('tr');
                [name, status, date].forEach(text => {
                    const td = document.createElement('td');
                    td.appendChild(document.createTextNode(text));
                    row.appendChild(td);
                });
                tbody.appendChild(row);
            });
            table.appendChild(tbody);

            table.outerHTML
            "#,
        )
        .unwrap();

    let html: String = serde_json::from_value(result).unwrap();
    assert!(html.contains("<table class=\"data-table\">"));
    assert!(html.contains("<th>Name</th>"));
    assert!(html.contains("<th>Status</th>"));
    assert!(html.contains("<td>Task 1</td>"));
    assert!(html.contains("<td>Done</td>"));
}

// ═══════════════════════════════════════════════════════════════════════════
// CSS Collection Integration Tests
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_css_collection_end_to_end() {
    use vertz_runtime::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

    let mut rt = VertzJsRuntime::new(VertzRuntimeOptions {
        capture_output: true,
        ..Default::default()
    })
    .unwrap();

    dom_shim::load_dom_shim(&mut rt).unwrap();

    // Simulate component rendering that injects CSS
    rt.execute_script_void(
        "<test>",
        r#"
        // Simulate theme CSS injection
        __vertz_inject_css(':root { --primary: #3b82f6; }', 'theme-vars');
        __vertz_inject_css('body { margin: 0; font-family: sans-serif; }', 'theme-base');

        // Simulate component CSS injections
        __vertz_inject_css('.btn { padding: 8px 16px; border-radius: 4px; }', 'btn');
        __vertz_inject_css('.card { background: white; border-radius: 8px; }', 'card');

        // Duplicate injection (should be ignored)
        __vertz_inject_css('.btn { padding: 8px 16px; border-radius: 4px; }', 'btn');
        "#,
    )
    .unwrap();

    let entries = css_collector::collect_css(&mut rt).unwrap();
    assert_eq!(entries.len(), 4, "Should have 4 unique CSS entries");

    let formatted = css_collector::format_css_as_style_tags(&entries);
    assert!(formatted.contains("--primary: #3b82f6"));
    assert!(formatted.contains("font-family: sans-serif"));
    assert!(formatted.contains(".btn"));
    assert!(formatted.contains(".card"));
    assert!(formatted.contains("data-vertz-ssr"));
}

// ═══════════════════════════════════════════════════════════════════════════
// Session Resolution Integration Tests
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_session_extraction_and_install() {
    use vertz_runtime::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};
    use vertz_runtime::ssr::session;

    let mut rt = VertzJsRuntime::new(VertzRuntimeOptions {
        capture_output: true,
        ..Default::default()
    })
    .unwrap();

    // Extract session from cookies
    let session = extract_session_from_cookies(Some(
        "vertz_session=eyJhbGciOiJSUzI1NiJ9.test; theme=dark; lang=en",
    ));
    assert!(session.authenticated);
    assert_eq!(session.token, Some("eyJhbGciOiJSUzI1NiJ9.test".to_string()));

    // Install into runtime
    session::install_session(&mut rt, &session).unwrap();

    let result = rt
        .execute_script(
            "<test>",
            r#"({
                auth: __vertz_ssr_session.authenticated,
                token: __vertz_ssr_session.token,
            })"#,
        )
        .unwrap();

    assert_eq!(result["auth"], serde_json::json!(true));
    assert_eq!(
        result["token"],
        serde_json::json!("eyJhbGciOiJSUzI1NiJ9.test")
    );
}

#[test]
fn test_unauthenticated_session() {
    let session = extract_session_from_cookies(Some("theme=dark"));
    assert!(!session.authenticated);
    assert!(session.token.is_none());
}

// ═══════════════════════════════════════════════════════════════════════════
// Full HTML Document Assembly Integration Tests
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_full_ssr_document_structure() {
    let hints = vec!["/@deps/@vertz/ui".to_string()];
    let html = assemble_ssr_document(&SsrHtmlOptions {
        title: "Task Manager",
        ssr_content: "<h1>Tasks</h1><ul><li>Task 1</li><li>Task 2</li></ul>",
        inline_css: "  <style data-vertz-ssr>.task { color: blue; }</style>\n",
        theme_css: Some("body { margin: 0; }"),
        entry_url: "/src/app.tsx",
        preload_hints: &hints,
        enable_hmr: false,
        ssr_data: None,
        head_tags: None,
    });

    // Document is valid HTML5
    assert!(html.starts_with("<!DOCTYPE html>\n"));

    // Content is inside the app div
    assert!(html.contains("<div id=\"app\"><h1>Tasks</h1>"));
    assert!(html.contains("<li>Task 1</li>"));

    // CSS is in head (before body)
    let head_end = html.find("</head>").unwrap();
    let css_pos = html.find("data-vertz-theme").unwrap();
    assert!(css_pos < head_end, "Theme CSS should be in <head>");

    let component_css = html.find("data-vertz-ssr").unwrap();
    assert!(
        component_css < head_end,
        "Component CSS should be in <head>"
    );

    // Preload hints present
    assert!(html.contains("modulepreload"));
    assert!(html.contains("/@deps/@vertz/ui"));
}

// ═══════════════════════════════════════════════════════════════════════════
// SSR Render Integration Tests (Inline JS)
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_ssr_render_full_pipeline() {
    use vertz_runtime::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

    let mut rt = VertzJsRuntime::new(VertzRuntimeOptions {
        capture_output: true,
        ..Default::default()
    })
    .unwrap();

    dom_shim::load_dom_shim(&mut rt).unwrap();

    rt.execute_script_void(
        "<test>",
        r#"
        // Inject CSS
        __vertz_inject_css('.header { background: #1a1a2e; color: white; }', 'header');
        __vertz_inject_css('.task { padding: 12px; border-bottom: 1px solid #eee; }', 'task');

        // Render the app
        const app = document.getElementById('app');

        const header = document.createElement('header');
        header.setAttribute('class', 'header');
        header.appendChild(document.createTextNode('Task Manager'));
        app.appendChild(header);

        const list = document.createElement('div');
        list.setAttribute('class', 'task');
        list.appendChild(document.createTextNode('Test Task'));
        app.appendChild(list);
        "#,
    )
    .unwrap();

    // Read content from #app
    let content = rt
        .execute_script("<test>", "document.getElementById('app').innerHTML")
        .unwrap();
    let content_str: String = serde_json::from_value(content).unwrap();

    assert!(
        content_str.contains("Task Manager"),
        "Should contain header text"
    );
    assert!(
        content_str.contains("Test Task"),
        "Should contain task text"
    );

    // CSS was collected
    let css_entries = css_collector::collect_css(&mut rt).unwrap();
    let css = css_collector::format_css_as_style_tags(&css_entries);
    assert!(css.contains(".header"), "Should collect header CSS");
    assert!(css.contains(".task"), "Should collect task CSS");
}

// ═══════════════════════════════════════════════════════════════════════════
// SSR with Fixture App (End-to-End)
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_ssr_render_fixture_app() {
    ensure_fixture_deps().await;
    let root = ssr_app_path();
    let opts = PersistentIsolateOptions {
        root_dir: root.clone(),
        ssr_entry: root.join("src/app.js"),
        server_entry: None,
        channel_capacity: 16,
    };

    let isolate = PersistentIsolate::new(opts).unwrap();

    for _ in 0..100 {
        if isolate.is_initialized() {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    assert!(isolate.is_initialized(), "Isolate should be initialized");

    let ssr_req = SsrRequest {
        url: "/".to_string(),
        session_json: None,
        cookies: None,
    };

    let result = isolate.handle_ssr(ssr_req).await.unwrap();

    assert!(result.is_ssr, "Should successfully SSR the fixture app");

    // Verify SSR content
    assert!(
        result.content.contains("SSR Test App"),
        "Should contain app title. Content: {}",
        result.content
    );
    assert!(
        result.content.contains("Write tests"),
        "Should contain task list. Content: {}",
        result.content
    );
    assert!(
        result.content.contains("Powered by Vertz"),
        "Should contain footer. Content: {}",
        result.content
    );
}

#[tokio::test]
async fn test_ssr_render_fixture_app_with_session() {
    ensure_fixture_deps().await;
    let root = ssr_app_path();
    let opts = PersistentIsolateOptions {
        root_dir: root.clone(),
        ssr_entry: root.join("src/app.js"),
        server_entry: None,
        channel_capacity: 16,
    };

    let isolate = PersistentIsolate::new(opts).unwrap();

    for _ in 0..100 {
        if isolate.is_initialized() {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    assert!(isolate.is_initialized(), "Isolate should be initialized");

    let session = SsrSession {
        token: Some("test-token".to_string()),
        authenticated: true,
        user_id: Some("user-123".to_string()),
        data: Default::default(),
    };

    let ssr_req = SsrRequest {
        url: "/tasks".to_string(),
        session_json: serde_json::to_string(&session).ok(),
        cookies: None,
    };

    let result = isolate.handle_ssr(ssr_req).await.unwrap();
    assert!(result.is_ssr, "Should successfully SSR with session");
}

#[tokio::test]
async fn test_ssr_render_performance() {
    ensure_fixture_deps().await;
    let root = ssr_app_path();
    let opts = PersistentIsolateOptions {
        root_dir: root.clone(),
        ssr_entry: root.join("src/app.js"),
        server_entry: None,
        channel_capacity: 16,
    };

    let isolate = PersistentIsolate::new(opts).unwrap();

    for _ in 0..100 {
        if isolate.is_initialized() {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    assert!(isolate.is_initialized(), "Isolate should be initialized");

    let ssr_req = SsrRequest {
        url: "/".to_string(),
        session_json: None,
        cookies: None,
    };

    let result = isolate.handle_ssr(ssr_req).await.unwrap();
    assert!(result.is_ssr);

    // SSR should complete in reasonable time (< 5000ms for test environment)
    assert!(
        result.render_time_ms < 5000.0,
        "SSR render took too long: {:.2}ms",
        result.render_time_ms
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 2: Framework SSR Rendering (ssrRenderSinglePass)
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn persistent_isolate_renders_via_framework_engine() {
    use vertz_runtime::runtime::persistent_isolate::{
        PersistentIsolate, PersistentIsolateOptions, SsrRequest,
    };

    ensure_fixture_deps().await;
    let root = ssr_app_path();

    let opts = PersistentIsolateOptions {
        root_dir: root.clone(),
        ssr_entry: root.join("src/app-ssr.js"),
        server_entry: None,
        channel_capacity: 16,
    };

    let isolate = PersistentIsolate::new(opts).unwrap();

    // Wait for initialization
    for _ in 0..100 {
        if isolate.is_initialized() {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    assert!(isolate.is_initialized(), "Isolate should be initialized");

    let ssr_req = SsrRequest {
        url: "/".to_string(),
        session_json: None,
        cookies: None,
    };

    let result = isolate.handle_ssr(ssr_req).await;
    assert!(
        result.is_ok(),
        "SSR request should succeed: {:?}",
        result.err()
    );

    let response = result.unwrap();
    // Framework engine (ssrRenderSinglePass) renders the App component
    // which returns a div with <h1>Hello SSR</h1>
    assert!(
        response.content.contains("Hello SSR"),
        "Content should be rendered by ssrRenderSinglePass. Got: {}",
        response.content
    );
    assert!(response.is_ssr, "Should be SSR rendered");
}

// ═══════════════════════════════════════════════════════════════════════════
// SSR Entry Module Loading (globalThis.__vertz_app_module)
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn isolate_stores_ssr_module_as_app_module_global() {
    use vertz_runtime::runtime::persistent_isolate::{
        PersistentIsolate, PersistentIsolateOptions, SsrRequest,
    };

    let root = ssr_app_path();
    let opts = PersistentIsolateOptions {
        root_dir: root.clone(),
        ssr_entry: root.join("src/app.tsx"),
        server_entry: None,
        channel_capacity: 16,
    };

    let isolate = PersistentIsolate::new(opts).unwrap();

    // Wait for initialization
    for _ in 0..100 {
        if isolate.is_initialized() {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    assert!(isolate.is_initialized(), "Isolate should be initialized");

    // Verify the module was stored as globalThis.__vertz_app_module
    // We can check this indirectly via an SSR request that reads the global
    let ssr_req = SsrRequest {
        url: "/".to_string(),
        session_json: None,
        cookies: None,
    };

    let result = isolate.handle_ssr(ssr_req).await;
    assert!(
        result.is_ok(),
        "SSR request should succeed: {:?}",
        result.err()
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// POC: ssrRenderSinglePass in deno_core V8
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn poc_ssr_render_single_pass_in_v8() {
    use vertz_runtime::runtime::async_context::load_async_context;
    use vertz_runtime::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

    ensure_fixture_deps().await;
    let root = ssr_app_path();

    let mut rt = VertzJsRuntime::new(VertzRuntimeOptions {
        root_dir: Some(root.to_string_lossy().to_string()),
        capture_output: false,
        ..Default::default()
    })
    .unwrap();

    // Load polyfills (AsyncLocalStorage, DOM shim)
    load_async_context(&mut rt).unwrap();
    dom_shim::load_dom_shim(&mut rt).unwrap();

    // Load the app module and store as globalThis.__vertz_app_module
    let app_path = root.join("src/app-ssr.js");
    let specifier = deno_core::ModuleSpecifier::from_file_path(&app_path).unwrap();
    rt.load_main_module(&specifier).await.unwrap();

    let safe_url = serde_json::to_string(specifier.as_str()).unwrap();
    let capture_js = format!(
        r#"(async function() {{
            const mod = await import({});
            globalThis.__vertz_app_module = mod;
        }})()"#,
        safe_url
    );
    rt.execute_script_void("<capture>", &capture_js).unwrap();
    rt.run_event_loop().await.unwrap();

    // Call ssrRenderSinglePass from @vertz/ui-server/ssr.
    // We load a temp module file so the module loader can resolve bare specifiers
    // from the correct directory (node_modules next to the app).
    let render_module = root.join("src/_ssr_render_poc.js");
    std::fs::write(
        &render_module,
        r#"
        import { ssrRenderSinglePass } from '@vertz/ui-server/ssr';
        const appModule = globalThis.__vertz_app_module;
        const result = await ssrRenderSinglePass(appModule, '/');
        globalThis.__ssr_poc_result = JSON.stringify({
            html: result.html,
            css: result.css,
            hasData: Array.isArray(result.ssrData),
        });
        "#,
    )
    .unwrap();

    let render_specifier = deno_core::ModuleSpecifier::from_file_path(&render_module).unwrap();
    let load_result = rt.load_side_module(&render_specifier).await;

    // Clean up temp file regardless of result
    let _ = std::fs::remove_file(&render_module);

    load_result.expect("Failed to load SSR render module");
    rt.run_event_loop().await.unwrap();

    // Read the result
    let result = rt
        .execute_script("<read-result>", "globalThis.__ssr_poc_result || '{}'")
        .unwrap();

    let result_str = result.as_str().unwrap_or("{}");
    let parsed: serde_json::Value = serde_json::from_str(result_str).unwrap();

    assert!(
        parsed["html"].as_str().unwrap_or("").contains("Hello SSR"),
        "SSR should render the App component. Got: {}",
        parsed["html"]
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// AsyncLocalStorage Integration Tests
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_async_local_storage_in_ssr_context() {
    use vertz_runtime::runtime::async_context::load_async_context;
    use vertz_runtime::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

    let mut rt = VertzJsRuntime::new(VertzRuntimeOptions {
        capture_output: true,
        ..Default::default()
    })
    .unwrap();

    load_async_context(&mut rt).unwrap();
    dom_shim::load_dom_shim(&mut rt).unwrap();

    // Simulate SSR context usage
    let result = rt
        .execute_script(
            "<test>",
            r#"
            const ssrStorage = new AsyncLocalStorage();

            function renderWithContext() {
                return ssrStorage.run({ requestId: 'req-123', url: '/tasks' }, () => {
                    const store = ssrStorage.getStore();
                    return {
                        requestId: store.requestId,
                        url: store.url,
                    };
                });
            }

            renderWithContext()
            "#,
        )
        .unwrap();

    assert_eq!(result["requestId"], serde_json::json!("req-123"));
    assert_eq!(result["url"], serde_json::json!("/tasks"));
}
