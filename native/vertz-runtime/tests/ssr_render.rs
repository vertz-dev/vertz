/// End-to-end SSR integration tests.
///
/// Validates the full SSR pipeline:
/// 1. DOM shim provides document/window/Element globals
/// 2. AsyncLocalStorage polyfill works for SSR context
/// 3. CSS collection during rendering
/// 4. Hydration data serialization
/// 5. Full HTML document assembly
/// 6. Session/auth resolution
/// 7. SSR render with fixture apps
/// 8. Graceful fallback when SSR fails
use std::path::PathBuf;

use vertz_runtime::ssr::css_collector;
use vertz_runtime::ssr::dom_shim;
use vertz_runtime::ssr::html_document::{assemble_ssr_document, SsrHtmlOptions};
use vertz_runtime::ssr::hydration;
use vertz_runtime::ssr::render::{render_inline_ssr, render_to_html_sync, SsrOptions};
use vertz_runtime::ssr::session::{extract_session_from_cookies, SsrSession};

fn ssr_app_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("ssr-app")
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
// Hydration Data Integration Tests
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_hydration_data_round_trip() {
    let mut cache = std::collections::HashMap::new();
    cache.insert(
        "tasks".to_string(),
        serde_json::json!({
            "items": [
                {"id": "1", "title": "Write SSR", "status": "done"},
                {"id": "2", "title": "Add hydration", "status": "active"},
            ],
            "total": 2
        }),
    );
    cache.insert(
        "user".to_string(),
        serde_json::json!({"id": "u1", "name": "Test User"}),
    );

    let data = hydration::HydrationData {
        query_cache: cache,
        render_timestamp: 1711612800000,
        rendered_url: "/tasks".to_string(),
    };

    let script = hydration::serialize_hydration_data(&data);

    // Verify it's a valid script tag
    assert!(script.contains("<script>"));
    assert!(script.contains("</script>"));
    assert!(script.contains("window.__VERTZ_SSR_DATA__"));

    // Verify data content (array format: [{ key, data }, ...])
    assert!(script.contains("Write SSR"));
    assert!(script.contains("Test User"));
    assert!(script.contains("\"key\":\"tasks\""));
    assert!(script.contains("\"key\":\"user\""));
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
        hydration_script: "  <script>window.__VERTZ_SSR_DATA__ = {};</script>\n",
        entry_url: "/src/app.tsx",
        preload_hints: &hints,
        enable_hmr: false,
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

    // Hydration data before module script
    let hydration_pos = html.find("__VERTZ_SSR_DATA__").unwrap();
    let module_pos = html.find("type=\"module\"").unwrap();
    assert!(
        hydration_pos < module_pos,
        "Hydration script should be before module"
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
    let result = render_inline_ssr(
        r#"
        // Inject CSS
        __vertz_inject_css('.header { background: #1a1a2e; color: white; }', 'header');
        __vertz_inject_css('.task { padding: 12px; border-bottom: 1px solid #eee; }', 'task');

        // Set hydration data
        globalThis.__vertz_ssr_queries = {
            "task-list": { "items": [{ "id": "1", "title": "Test Task" }], "total": 1 }
        };

        // Render the app
        const app = document.createElement('div');
        app.setAttribute('id', 'app');

        const header = document.createElement('header');
        header.setAttribute('class', 'header');
        header.appendChild(document.createTextNode('Task Manager'));
        app.appendChild(header);

        const list = document.createElement('div');
        list.setAttribute('class', 'task');
        list.appendChild(document.createTextNode('Test Task'));
        app.appendChild(list);

        document.body.appendChild(app);
        "#,
        "/tasks",
    )
    .unwrap();

    assert!(result.is_ssr);

    // Content was rendered
    assert!(
        result.content.contains("Task Manager"),
        "Should contain header text"
    );
    assert!(
        result.content.contains("Test Task"),
        "Should contain task text"
    );

    // CSS was collected
    assert!(result.css.contains(".header"), "Should collect header CSS");
    assert!(result.css.contains(".task"), "Should collect task CSS");
}

// ═══════════════════════════════════════════════════════════════════════════
// SSR with Fixture App (End-to-End)
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_ssr_render_fixture_app() {
    let root = ssr_app_path();
    let options = SsrOptions {
        root_dir: root.clone(),
        entry_file: root.join("src/app.js"),
        url: "/".to_string(),
        title: "SSR Test".to_string(),
        theme_css: None,
        session: SsrSession::default(),
        preload_hints: vec![],
        enable_hmr: false,
    };

    let result = render_to_html_sync(&options);

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

    // Verify full HTML document
    assert!(result.html.contains("<!DOCTYPE html>"));
    assert!(result.html.contains("<div id=\"app\">"));
    assert!(result.html.contains("SSR Test App"));
    assert!(result
        .html
        .contains("<script type=\"module\" src=\"/src/app.js\">"));
}

#[test]
fn test_ssr_render_fixture_app_with_session() {
    let root = ssr_app_path();
    let session = SsrSession {
        token: Some("test-token".to_string()),
        authenticated: true,
        user_id: Some("user-123".to_string()),
        data: Default::default(),
    };

    let options = SsrOptions {
        root_dir: root.clone(),
        entry_file: root.join("src/app.js"),
        url: "/tasks".to_string(),
        title: "SSR Test".to_string(),
        theme_css: Some("body { margin: 0; }".to_string()),
        session,
        preload_hints: vec!["/@deps/@vertz/ui".to_string()],
        enable_hmr: true,
    };

    let result = render_to_html_sync(&options);
    assert!(result.is_ssr);

    // Theme CSS should be in the document
    assert!(
        result.html.contains("body { margin: 0; }"),
        "Should include theme CSS"
    );

    // Preload hints
    assert!(
        result.html.contains("/@deps/@vertz/ui"),
        "Should include preload hints"
    );

    // HMR scripts
    assert!(
        result.html.contains("__vertz_hmr"),
        "Should include HMR scripts in dev mode"
    );
}

#[test]
fn test_ssr_fallback_on_invalid_entry() {
    let options = SsrOptions {
        root_dir: PathBuf::from("/tmp/nonexistent-project"),
        entry_file: PathBuf::from("/tmp/nonexistent-project/src/app.tsx"),
        url: "/".to_string(),
        title: "Fallback Test".to_string(),
        theme_css: None,
        session: SsrSession::default(),
        preload_hints: vec![],
        enable_hmr: false,
    };

    let result = render_to_html_sync(&options);

    // Should gracefully fall back to client-only shell
    assert!(!result.is_ssr, "Should fall back to client-only");
    assert!(result.content.is_empty());
    assert!(
        result.html.contains("<div id=\"app\"></div>"),
        "Should have empty app div"
    );
    assert!(
        result.html.contains("<script type=\"module\""),
        "Should still include module script for client render"
    );
}

#[test]
fn test_ssr_render_performance() {
    let root = ssr_app_path();
    let options = SsrOptions {
        root_dir: root.clone(),
        entry_file: root.join("src/app.js"),
        url: "/".to_string(),
        title: "Perf Test".to_string(),
        theme_css: None,
        session: SsrSession::default(),
        preload_hints: vec![],
        enable_hmr: false,
    };

    let result = render_to_html_sync(&options);
    assert!(result.is_ssr);

    // SSR should complete in reasonable time (< 5000ms for test environment)
    assert!(
        result.render_time_ms < 5000.0,
        "SSR render took too long: {:.2}ms",
        result.render_time_ms
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
