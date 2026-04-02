/// End-to-end integration tests for client-only rendering.
///
/// Validates the full compilation pipeline against representative Vertz app fixtures:
/// 1. HTML shell generation (SPA routing)
/// 2. Theme CSS injection
/// 3. Compilation of JSX/TSX components
/// 4. Import specifier rewriting
/// 5. Source map generation
/// 6. Acceptance header handling for SPA fallback
///
/// Tests use three fixture apps:
/// - minimal-app: basic JSX + relative imports
/// - task-manager-app: multi-file app with signal state, nested components, theme CSS
/// - linear-clone-app: complex patterns with layouts, barrel imports, deep nesting
use std::path::PathBuf;

/// Path to the minimal app fixture
fn minimal_app_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("minimal-app")
}

/// Path to the task-manager fixture
fn task_manager_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("task-manager-app")
}

/// Path to the linear-clone fixture
fn linear_clone_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("linear-clone-app")
}

fn test_plugin() -> std::sync::Arc<dyn vertz_runtime::plugin::FrameworkPlugin> {
    std::sync::Arc::new(vertz_runtime::plugin::vertz::VertzPlugin)
}

fn create_pipeline(
    root: &std::path::Path,
) -> vertz_runtime::compiler::pipeline::CompilationPipeline {
    vertz_runtime::compiler::pipeline::CompilationPipeline::new(
        root.to_path_buf(),
        root.join("src"),
        test_plugin(),
    )
}

// ═══════════════════════════════════════════════════════════════════════════
// HTML Shell Tests (SPA Routing)
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_html_shell_for_root_page() {
    let root = minimal_app_path();

    let plugin = vertz_runtime::plugin::vertz::VertzPlugin;
    let html = vertz_runtime::server::html_shell::generate_html_shell(
        &root.join("src/app.tsx"),
        &root,
        &[],
        None,
        "Vertz App",
        &plugin,
    );

    assert!(html.contains("<!DOCTYPE html>"), "Should have doctype");
    assert!(
        html.contains(r#"<div id="app"></div>"#),
        "Should have mount point"
    );
    assert!(
        html.contains(r#"<script type="module" src="/src/app.tsx"></script>"#),
        "Should have module script tag"
    );
    assert!(
        html.contains(r#"<link rel="modulepreload" href="/src/app.tsx""#),
        "Should have preload hint for entry"
    );
}

#[test]
fn test_page_route_detection() {
    use vertz_runtime::server::html_shell::is_page_route;

    // Page routes — should return HTML shell
    assert!(is_page_route("/"));
    assert!(is_page_route("/tasks"));
    assert!(is_page_route("/tasks/123"));
    assert!(is_page_route("/settings/profile"));
    assert!(is_page_route("/issues"));
    assert!(is_page_route("/projects/abc/settings"));

    // Non-page routes — should NOT return HTML shell
    assert!(!is_page_route("/@deps/@vertz/ui"));
    assert!(!is_page_route("/@css/button.css"));
    assert!(!is_page_route("/src/app.tsx"));
    assert!(!is_page_route("/favicon.ico"));
    assert!(!is_page_route("/logo.png"));
    assert!(!is_page_route("/node_modules/zod/index.js"));
}

#[test]
fn test_html_shell_includes_preload_hints() {
    let root = minimal_app_path();

    let hints = vec![
        "/@deps/@vertz/ui".to_string(),
        "/src/components/Hello.tsx".to_string(),
    ];
    let plugin = vertz_runtime::plugin::vertz::VertzPlugin;
    let html = vertz_runtime::server::html_shell::generate_html_shell(
        &root.join("src/app.tsx"),
        &root,
        &hints,
        None,
        "Vertz App",
        &plugin,
    );

    assert!(html.contains(r#"<link rel="modulepreload" href="/@deps/@vertz/ui""#));
    assert!(html.contains(r#"<link rel="modulepreload" href="/src/components/Hello.tsx""#));
}

// ═══════════════════════════════════════════════════════════════════════════
// Theme CSS Injection Tests
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_theme_css_injection_task_manager() {
    let root = task_manager_path();

    let theme_css = vertz_runtime::server::theme_css::load_theme_css(&root);
    assert!(theme_css.is_some(), "Task manager should have theme CSS");
    let css = theme_css.unwrap();
    assert!(
        css.contains("--color-primary"),
        "Theme CSS should have custom properties"
    );
    assert!(
        css.contains("--color-background"),
        "Theme CSS should have background var"
    );
    assert!(
        css.contains("--radius-md"),
        "Theme CSS should have radius var"
    );
    assert!(
        css.contains("--font-sans"),
        "Theme CSS should have font var"
    );

    // Verify it's included in the HTML shell
    let plugin = vertz_runtime::plugin::vertz::VertzPlugin;
    let html = vertz_runtime::server::html_shell::generate_html_shell(
        &root.join("src/app.tsx"),
        &root,
        &[],
        Some(&css),
        "Task Manager",
        &plugin,
    );

    assert!(
        html.contains("<style>"),
        "HTML shell should include <style> tag"
    );
    assert!(
        html.contains("--color-primary"),
        "HTML shell should include theme custom properties"
    );
    assert!(
        html.contains("box-sizing: border-box"),
        "HTML shell should include reset styles"
    );
}

#[test]
fn test_theme_css_injection_linear_clone() {
    let root = linear_clone_path();

    let theme_css = vertz_runtime::server::theme_css::load_theme_css(&root);
    assert!(theme_css.is_some(), "Linear clone should have theme CSS");
    let css = theme_css.unwrap();
    // Linear clone has dark-theme custom properties
    assert!(
        css.contains("--color-primary: #5e6ad2"),
        "Should have linear-style primary color"
    );
    assert!(
        css.contains("--color-background: #1a1a2e"),
        "Should have dark background"
    );
    assert!(
        css.contains("--font-mono"),
        "Should have monospace font var"
    );
}

#[test]
fn test_theme_css_returns_none_for_minimal_app() {
    let root = minimal_app_path();
    let theme_css = vertz_runtime::server::theme_css::load_theme_css(&root);
    assert!(theme_css.is_none(), "Minimal app has no theme CSS file");
}

// ═══════════════════════════════════════════════════════════════════════════
// Source Compilation Tests — Minimal App
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_compile_app_tsx_for_browser() {
    let root = minimal_app_path();
    let pipeline = create_pipeline(&root);

    let result = pipeline.compile_for_browser(&root.join("src/app.tsx"));

    // Should be compiled (vertz-native comment)
    assert!(
        result.code.contains("compiled by vertz-native"),
        "Should contain compiler comment. Code: {}",
        result.code
    );

    // JSX should be transformed (no raw <div> tags)
    assert!(
        !result.code.contains("<div id=\"root\">"),
        "Raw JSX should be transformed. Code: {}",
        result.code
    );
}

#[tokio::test]
async fn test_compile_hello_component_for_browser() {
    let root = minimal_app_path();
    let pipeline = create_pipeline(&root);

    let result = pipeline.compile_for_browser(&root.join("src/components/Hello.tsx"));

    // Should be compiled
    assert!(result.code.contains("compiled by vertz-native"));

    // TypeScript interface should be stripped
    assert!(
        !result.code.contains("interface HelloProps"),
        "TypeScript interface should be stripped. Code: {}",
        result.code
    );

    // The original `{ name }: HelloProps` destructuring should be transformed
    // (compiler replaces with __props and uses __props.name)
    assert!(
        !result.code.contains("{ name }"),
        "Props destructuring should be transformed. Code: {}",
        result.code
    );
}

#[tokio::test]
async fn test_import_rewriting_in_compiled_output() {
    let root = minimal_app_path();
    let pipeline = create_pipeline(&root);

    let result = pipeline.compile_for_browser(&root.join("src/app.tsx"));

    // The relative import `./components/Hello` should be rewritten to an absolute path
    assert!(
        !result.code.contains("'./components/Hello'"),
        "Relative import should be rewritten. Code: {}",
        result.code
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// Source Compilation Tests — Task Manager
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_task_manager_app_compiles() {
    let root = task_manager_path();
    let pipeline = create_pipeline(&root);

    let result = pipeline.compile_for_browser(&root.join("src/app.tsx"));
    assert!(
        result.code.contains("compiled by vertz-native"),
        "App entry should compile. Code: {}",
        result.code
    );
    // Should not contain raw JSX
    assert!(
        !result.code.contains("<div id=\"root\">"),
        "JSX should be transformed. Code: {}",
        result.code
    );
    // Should not contain console.error (no compilation errors)
    assert!(
        !result.code.contains("console.error"),
        "Should not produce error module. Code: {}",
        result.code
    );
}

#[tokio::test]
async fn test_task_manager_taskcard_compiles() {
    let root = task_manager_path();
    let pipeline = create_pipeline(&root);

    let result = pipeline.compile_for_browser(&root.join("src/components/TaskCard.tsx"));
    assert!(result.code.contains("compiled by vertz-native"));

    // TypeScript interfaces should be stripped
    assert!(
        !result.code.contains("interface TaskCardProps"),
        "Interface should be stripped. Code: {}",
        result.code
    );

    // Should not contain raw JSX
    assert!(
        !result.code.contains("<div class=\"task-card\""),
        "JSX should be transformed. Code: {}",
        result.code
    );
}

#[tokio::test]
async fn test_task_manager_status_badge_compiles() {
    let root = task_manager_path();
    let pipeline = create_pipeline(&root);

    let result = pipeline.compile_for_browser(&root.join("src/components/StatusBadge.tsx"));
    assert!(result.code.contains("compiled by vertz-native"));
    assert!(!result.code.contains("interface StatusBadgeProps"));
}

#[tokio::test]
async fn test_task_manager_tasklist_page_compiles() {
    let root = task_manager_path();
    let pipeline = create_pipeline(&root);

    let result = pipeline.compile_for_browser(&root.join("src/pages/TaskList.tsx"));
    assert!(result.code.contains("compiled by vertz-native"));
    // Should not contain TS type annotations
    assert!(
        !result.code.contains("interface Task"),
        "Interface should be stripped. Code: {}",
        result.code
    );
}

#[tokio::test]
async fn test_task_manager_import_rewriting() {
    let root = task_manager_path();
    let pipeline = create_pipeline(&root);

    // app.tsx imports from ./pages/TaskList, ./components/TaskCard, ./components/StatusBadge
    let result = pipeline.compile_for_browser(&root.join("src/app.tsx"));

    assert!(
        !result.code.contains("'./pages/TaskList'"),
        "Relative import should be rewritten. Code: {}",
        result.code
    );
    assert!(
        !result.code.contains("'./components/TaskCard'"),
        "Relative import should be rewritten. Code: {}",
        result.code
    );

    // TaskList imports from ../components/TaskCard
    let result = pipeline.compile_for_browser(&root.join("src/pages/TaskList.tsx"));
    assert!(
        !result.code.contains("'../components/TaskCard'"),
        "Relative parent import should be rewritten. Code: {}",
        result.code
    );
}

#[tokio::test]
async fn test_task_manager_all_files_produce_valid_js() {
    let root = task_manager_path();
    let pipeline = create_pipeline(&root);

    let files = [
        "src/app.tsx",
        "src/components/TaskCard.tsx",
        "src/components/StatusBadge.tsx",
        "src/pages/TaskList.tsx",
    ];

    for file in &files {
        let result = pipeline.compile_for_browser(&root.join(file));

        // Should not be an error module
        assert!(
            !result
                .code
                .contains("console.error(`[vertz] Compilation error"),
            "File {} should compile without errors. Code: {}",
            file,
            result.code
        );

        // Should be valid JavaScript (basic syntax checks)
        // - No raw TypeScript annotations should remain
        assert!(
            !result.code.contains(": string"),
            "TypeScript annotations should be stripped from {}. Code: {}",
            file,
            result.code
        );
        assert!(
            !result.code.contains(": number"),
            "TypeScript annotations should be stripped from {}. Code: {}",
            file,
            result.code
        );

        // - Should have the compiler comment
        assert!(
            result.code.contains("compiled by vertz-native"),
            "File {} should have compiler comment. Code: {}",
            file,
            result.code
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Source Compilation Tests — Linear Clone
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_linear_clone_app_compiles() {
    let root = linear_clone_path();
    let pipeline = create_pipeline(&root);

    let result = pipeline.compile_for_browser(&root.join("src/app.tsx"));
    assert!(
        result.code.contains("compiled by vertz-native"),
        "App entry should compile. Code: {}",
        result.code
    );
    assert!(
        !result
            .code
            .contains("console.error(`[vertz] Compilation error"),
        "Should not produce error module. Code: {}",
        result.code
    );
}

#[tokio::test]
async fn test_linear_clone_layout_compiles() {
    let root = linear_clone_path();
    let pipeline = create_pipeline(&root);

    let result = pipeline.compile_for_browser(&root.join("src/layouts/AppLayout.tsx"));
    assert!(result.code.contains("compiled by vertz-native"));
    assert!(!result.code.contains("interface AppLayoutProps"));
}

#[tokio::test]
async fn test_linear_clone_issue_row_compiles() {
    let root = linear_clone_path();
    let pipeline = create_pipeline(&root);

    let result = pipeline.compile_for_browser(&root.join("src/components/IssueRow.tsx"));
    assert!(result.code.contains("compiled by vertz-native"));
    assert!(!result.code.contains("interface Issue"));
    assert!(!result.code.contains("interface IssueRowProps"));
}

#[tokio::test]
async fn test_linear_clone_priority_icon_compiles() {
    let root = linear_clone_path();
    let pipeline = create_pipeline(&root);

    let result = pipeline.compile_for_browser(&root.join("src/components/PriorityIcon.tsx"));
    assert!(result.code.contains("compiled by vertz-native"));
    assert!(!result.code.contains("interface PriorityIconProps"));
}

#[tokio::test]
async fn test_linear_clone_avatar_compiles() {
    let root = linear_clone_path();
    let pipeline = create_pipeline(&root);

    let result = pipeline.compile_for_browser(&root.join("src/components/Avatar.tsx"));
    assert!(result.code.contains("compiled by vertz-native"));
    assert!(!result.code.contains("interface AvatarProps"));
}

#[tokio::test]
async fn test_linear_clone_issue_page_compiles() {
    let root = linear_clone_path();
    let pipeline = create_pipeline(&root);

    let result = pipeline.compile_for_browser(&root.join("src/pages/IssuePage.tsx"));
    assert!(result.code.contains("compiled by vertz-native"));
}

#[tokio::test]
async fn test_linear_clone_import_rewriting() {
    let root = linear_clone_path();
    let pipeline = create_pipeline(&root);

    // app.tsx imports from ./layouts/AppLayout, ./pages/IssuePage, ./components/*
    let result = pipeline.compile_for_browser(&root.join("src/app.tsx"));

    assert!(
        !result.code.contains("'./layouts/AppLayout'"),
        "Relative import should be rewritten. Code: {}",
        result.code
    );
    assert!(
        !result.code.contains("'./pages/IssuePage'"),
        "Relative import should be rewritten. Code: {}",
        result.code
    );
    assert!(
        !result.code.contains("'./components/IssueRow'"),
        "Relative import should be rewritten. Code: {}",
        result.code
    );

    // IssueRow imports from ./PriorityIcon and ./Avatar
    let result = pipeline.compile_for_browser(&root.join("src/components/IssueRow.tsx"));
    assert!(
        !result.code.contains("'./PriorityIcon'"),
        "Sibling import should be rewritten. Code: {}",
        result.code
    );
    assert!(
        !result.code.contains("'./Avatar'"),
        "Sibling import should be rewritten. Code: {}",
        result.code
    );

    // IssuePage imports from ../components/IssueRow
    let result = pipeline.compile_for_browser(&root.join("src/pages/IssuePage.tsx"));
    assert!(
        !result.code.contains("'../components/IssueRow'"),
        "Parent-relative import should be rewritten. Code: {}",
        result.code
    );
}

#[tokio::test]
async fn test_linear_clone_all_files_produce_valid_js() {
    let root = linear_clone_path();
    let pipeline = create_pipeline(&root);

    let files = [
        "src/app.tsx",
        "src/layouts/AppLayout.tsx",
        "src/components/IssueRow.tsx",
        "src/components/PriorityIcon.tsx",
        "src/components/Avatar.tsx",
        "src/pages/IssuePage.tsx",
    ];

    for file in &files {
        let result = pipeline.compile_for_browser(&root.join(file));

        // Should not be an error module
        assert!(
            !result
                .code
                .contains("console.error(`[vertz] Compilation error"),
            "File {} should compile without errors. Code: {}",
            file,
            result.code
        );

        // TypeScript type annotations should be stripped
        assert!(
            !result.code.contains("interface "),
            "TypeScript interfaces should be stripped from {}. Code: {}",
            file,
            result.code
        );

        // Should have the compiler comment
        assert!(
            result.code.contains("compiled by vertz-native"),
            "File {} should have compiler comment. Code: {}",
            file,
            result.code
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Source Map Tests
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_source_map_generated() {
    let root = minimal_app_path();
    let pipeline = create_pipeline(&root);

    let result = pipeline.compile_for_browser(&root.join("src/app.tsx"));

    // Should include sourceMappingURL comment
    assert!(
        result.code.contains("//# sourceMappingURL="),
        "Should have sourceMappingURL comment. Code: {}",
        result.code
    );

    // Source map should be JSON
    if let Some(ref map) = result.source_map {
        assert!(map.starts_with('{'), "Source map should be JSON");
        assert!(
            map.contains("\"version\""),
            "Source map should have version"
        );
    }
}

#[tokio::test]
async fn test_source_maps_for_task_manager_components() {
    let root = task_manager_path();
    let pipeline = create_pipeline(&root);

    let files = [
        "src/app.tsx",
        "src/components/TaskCard.tsx",
        "src/components/StatusBadge.tsx",
        "src/pages/TaskList.tsx",
    ];

    for file in &files {
        let result = pipeline.compile_for_browser(&root.join(file));
        assert!(
            result.code.contains("//# sourceMappingURL="),
            "File {} should have sourceMappingURL. Code: {}",
            file,
            result.code
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Compilation Cache Tests
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_compilation_cache_works() {
    let root = minimal_app_path();
    let pipeline = create_pipeline(&root);

    let file = root.join("src/app.tsx");

    // First compile
    let result1 = pipeline.compile_for_browser(&file);
    // Second compile (should be cached)
    let result2 = pipeline.compile_for_browser(&file);

    // Both should return the same compiled code
    assert_eq!(result1.code, result2.code);
}

// ═══════════════════════════════════════════════════════════════════════════
// Dependency Resolution Tests
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_deps_url_resolution() {
    let tmp = tempfile::tempdir().unwrap();
    let deps_dir = tmp.path().join("deps");
    std::fs::create_dir_all(&deps_dir).unwrap();

    // Write a mock pre-bundled dependency
    std::fs::write(deps_dir.join("zod.js"), "export const z = {};").unwrap();

    let resolved = vertz_runtime::deps::prebundle::resolve_deps_file("/@deps/zod", &deps_dir);
    assert!(resolved.is_some());
    assert!(resolved.unwrap().ends_with("zod.js"));
}

#[tokio::test]
async fn test_deps_url_resolution_scoped_package() {
    let tmp = tempfile::tempdir().unwrap();
    let deps_dir = tmp.path().join("deps");
    std::fs::create_dir_all(&deps_dir).unwrap();

    std::fs::write(deps_dir.join("@vertz__ui.js"), "export default {};").unwrap();

    let resolved = vertz_runtime::deps::prebundle::resolve_deps_file("/@deps/@vertz/ui", &deps_dir);
    assert!(resolved.is_some());
}

// ═══════════════════════════════════════════════════════════════════════════
// Import Scanner Tests
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_import_scanner_finds_deps() {
    let root = minimal_app_path();
    let deps = vertz_runtime::deps::scanner::scan_entry_recursive(&root.join("src/app.tsx"), &root);

    // The minimal app has no bare imports (only relative), so deps should be empty
    assert!(
        deps.is_empty(),
        "Minimal app has no node_modules deps: {:?}",
        deps
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// CSS Server Tests
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_css_key_extraction() {
    use vertz_runtime::server::css_server::extract_css_key;

    assert_eq!(
        extract_css_key("/@css/button.css"),
        Some("button.css".to_string())
    );
    assert_eq!(extract_css_key("/src/app.tsx"), None);
}

// ═══════════════════════════════════════════════════════════════════════════
// Error Handling Tests
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_compile_nonexistent_file_returns_error_module() {
    let root = minimal_app_path();
    let pipeline = create_pipeline(&root);

    let result = pipeline.compile_for_browser(&root.join("src/nonexistent.tsx"));

    assert!(
        result.code.contains("console.error"),
        "Error module should log to console. Code: {}",
        result.code
    );
    assert!(
        result.code.contains("Compilation error"),
        "Error module should mention compilation error. Code: {}",
        result.code
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// Full Pipeline Integration: HTTP Server with SPA Routing
// ═══════════════════════════════════════════════════════════════════════════

mod http_integration {
    use super::*;
    use reqwest::Client;
    use std::net::TcpListener as StdTcpListener;
    use std::time::Duration;
    use tokio::time::timeout;

    /// Find a free port.
    fn free_port() -> u16 {
        let listener = StdTcpListener::bind("127.0.0.1:0").unwrap();
        listener.local_addr().unwrap().port()
    }

    /// Start a dev server on a random port with the given fixture root.
    async fn start_dev_server(root: PathBuf) -> (String, tokio::sync::oneshot::Sender<()>) {
        let port = free_port();
        let addr = format!("127.0.0.1:{}", port);
        let base_url = format!("http://127.0.0.1:{}", port);

        let mut config = vertz_runtime::config::ServerConfig::with_root(
            port,
            "127.0.0.1".to_string(),
            root.join("public"),
            root,
        );
        // Disable SSR for client-only rendering tests
        config.enable_ssr = false;

        let (router, _state) = vertz_runtime::server::http::build_router(&config, test_plugin());

        let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();

        let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();

        tokio::spawn(async move {
            axum::serve(listener, router)
                .with_graceful_shutdown(async {
                    let _ = shutdown_rx.await;
                })
                .await
                .unwrap();
        });

        // Wait briefly for the server to start
        tokio::time::sleep(Duration::from_millis(50)).await;

        (base_url, shutdown_tx)
    }

    #[tokio::test]
    async fn test_root_returns_html_shell() {
        let (base_url, shutdown_tx) = start_dev_server(task_manager_path()).await;
        let client = Client::new();

        let resp = timeout(
            Duration::from_secs(5),
            client.get(&base_url).header("Accept", "text/html").send(),
        )
        .await
        .expect("request timed out")
        .expect("request failed");

        assert_eq!(resp.status(), 200);

        let ct = resp
            .headers()
            .get("content-type")
            .unwrap()
            .to_str()
            .unwrap();
        assert!(ct.contains("text/html"), "Expected text/html, got {}", ct);

        let body = resp.text().await.unwrap();
        assert!(body.contains("<!DOCTYPE html>"), "Should have doctype");
        assert!(
            body.contains(r#"<div id="app"></div>"#),
            "Should have mount point"
        );
        assert!(
            body.contains(r#"<script type="module" src="/src/app.tsx">"#),
            "Should have module script"
        );

        let _ = shutdown_tx.send(());
    }

    #[tokio::test]
    async fn test_spa_routes_return_html_shell() {
        let (base_url, shutdown_tx) = start_dev_server(task_manager_path()).await;
        let client = Client::new();

        let routes = ["/tasks", "/tasks/123", "/settings", "/settings/profile"];

        for route in &routes {
            let resp = timeout(
                Duration::from_secs(5),
                client
                    .get(format!("{}{}", base_url, route))
                    .header("Accept", "text/html")
                    .send(),
            )
            .await
            .expect("request timed out")
            .expect("request failed");

            assert_eq!(resp.status(), 200, "Route {} should return 200", route);

            let body = resp.text().await.unwrap();
            assert!(
                body.contains(r#"<script type="module" src="/src/app.tsx">"#),
                "Route {} should return HTML shell with entry script",
                route
            );
        }

        let _ = shutdown_tx.send(());
    }

    #[tokio::test]
    async fn test_source_files_return_compiled_js_not_html() {
        let (base_url, shutdown_tx) = start_dev_server(task_manager_path()).await;
        let client = Client::new();

        let resp = timeout(
            Duration::from_secs(5),
            client.get(format!("{}/src/app.tsx", base_url)).send(),
        )
        .await
        .expect("request timed out")
        .expect("request failed");

        assert_eq!(resp.status(), 200);

        let ct = resp
            .headers()
            .get("content-type")
            .unwrap()
            .to_str()
            .unwrap();
        assert!(
            ct.contains("application/javascript"),
            "Source files should return JS, got {}",
            ct
        );

        let body = resp.text().await.unwrap();
        assert!(
            !body.contains("<!DOCTYPE html>"),
            "Source files should not return HTML"
        );
        assert!(
            body.contains("compiled by vertz-native"),
            "Source files should return compiled JS"
        );

        let _ = shutdown_tx.send(());
    }

    #[tokio::test]
    async fn test_source_files_component_returns_compiled_js() {
        let (base_url, shutdown_tx) = start_dev_server(task_manager_path()).await;
        let client = Client::new();

        let resp = timeout(
            Duration::from_secs(5),
            client
                .get(format!("{}/src/components/TaskCard.tsx", base_url))
                .send(),
        )
        .await
        .expect("request timed out")
        .expect("request failed");

        assert_eq!(resp.status(), 200);

        let body = resp.text().await.unwrap();
        assert!(body.contains("compiled by vertz-native"));
        // TS interfaces should be stripped
        assert!(!body.contains("interface TaskCardProps"));

        let _ = shutdown_tx.send(());
    }

    #[tokio::test]
    async fn test_html_shell_includes_theme_css() {
        let (base_url, shutdown_tx) = start_dev_server(task_manager_path()).await;
        let client = Client::new();

        let resp = timeout(
            Duration::from_secs(5),
            client.get(&base_url).header("Accept", "text/html").send(),
        )
        .await
        .expect("request timed out")
        .expect("request failed");

        let body = resp.text().await.unwrap();

        // Theme CSS should be inlined
        assert!(
            body.contains("<style>"),
            "HTML shell should include <style> tag with theme CSS"
        );
        assert!(
            body.contains("--color-primary"),
            "HTML shell should include theme custom properties"
        );
        assert!(
            body.contains("box-sizing: border-box"),
            "HTML shell should include CSS reset from theme"
        );

        let _ = shutdown_tx.send(());
    }

    #[tokio::test]
    async fn test_html_shell_no_theme_css_for_minimal_app() {
        let (base_url, shutdown_tx) = start_dev_server(minimal_app_path()).await;
        let client = Client::new();

        let resp = timeout(
            Duration::from_secs(5),
            client.get(&base_url).header("Accept", "text/html").send(),
        )
        .await
        .expect("request timed out")
        .expect("request failed");

        let body = resp.text().await.unwrap();

        // Should not have inline <style> for minimal app (no theme file)
        assert!(
            !body.contains("<style>"),
            "Minimal app should not have inline theme CSS"
        );

        let _ = shutdown_tx.send(());
    }

    #[tokio::test]
    async fn test_json_api_request_does_not_return_html() {
        let (base_url, shutdown_tx) = start_dev_server(task_manager_path()).await;
        let client = Client::new();

        // Request with Accept: application/json should NOT get HTML shell
        let resp = timeout(
            Duration::from_secs(5),
            client
                .get(format!("{}/api/tasks", base_url))
                .header("Accept", "application/json")
                .send(),
        )
        .await
        .expect("request timed out")
        .expect("request failed");

        // Should be 404 (not an HTML shell)
        assert_eq!(
            resp.status(),
            404,
            "JSON API request should get 404, not HTML shell"
        );

        let _ = shutdown_tx.send(());
    }

    #[tokio::test]
    async fn test_linear_clone_full_pipeline_via_http() {
        let (base_url, shutdown_tx) = start_dev_server(linear_clone_path()).await;
        let client = Client::new();

        // Root page should return HTML shell with theme CSS
        let resp = timeout(
            Duration::from_secs(5),
            client.get(&base_url).header("Accept", "text/html").send(),
        )
        .await
        .expect("request timed out")
        .expect("request failed");

        let body = resp.text().await.unwrap();
        assert!(body.contains("<!DOCTYPE html>"));
        assert!(body.contains("<style>"));
        assert!(body.contains("--color-primary: #5e6ad2"));

        // Verify source files compile
        let files = [
            "/src/app.tsx",
            "/src/layouts/AppLayout.tsx",
            "/src/components/IssueRow.tsx",
            "/src/components/PriorityIcon.tsx",
            "/src/components/Avatar.tsx",
            "/src/pages/IssuePage.tsx",
        ];

        for file in &files {
            let resp = timeout(
                Duration::from_secs(5),
                client.get(format!("{}{}", base_url, file)).send(),
            )
            .await
            .expect("request timed out")
            .expect("request failed");

            assert_eq!(resp.status(), 200, "File {} should return 200", file);

            let ct = resp
                .headers()
                .get("content-type")
                .unwrap()
                .to_str()
                .unwrap();
            assert!(
                ct.contains("application/javascript"),
                "File {} should return JS. Got: {}",
                file,
                ct
            );

            let body = resp.text().await.unwrap();
            assert!(
                body.contains("compiled by vertz-native"),
                "File {} should be compiled. Code: {}",
                file,
                &body[..body.len().min(200)]
            );
            assert!(
                !body.contains("console.error(`[vertz] Compilation error"),
                "File {} should not be an error module. Code: {}",
                file,
                &body[..body.len().min(200)]
            );
        }

        let _ = shutdown_tx.send(());
    }

    #[tokio::test]
    async fn test_nonexistent_source_file_returns_404() {
        let (base_url, shutdown_tx) = start_dev_server(task_manager_path()).await;
        let client = Client::new();

        let resp = timeout(
            Duration::from_secs(5),
            client
                .get(format!("{}/src/nonexistent.tsx", base_url))
                .send(),
        )
        .await
        .expect("request timed out")
        .expect("request failed");

        assert_eq!(resp.status(), 404);

        let _ = shutdown_tx.send(());
    }

    #[tokio::test]
    async fn test_cache_control_headers() {
        let (base_url, shutdown_tx) = start_dev_server(task_manager_path()).await;
        let client = Client::new();

        // HTML shell should have no-cache
        let resp = timeout(
            Duration::from_secs(5),
            client.get(&base_url).header("Accept", "text/html").send(),
        )
        .await
        .expect("request timed out")
        .expect("request failed");

        let cc = resp
            .headers()
            .get("cache-control")
            .unwrap()
            .to_str()
            .unwrap();
        assert!(
            cc.contains("no-cache"),
            "HTML shell should have no-cache. Got: {}",
            cc
        );

        // Source files should also have no-cache (dev mode)
        let resp = timeout(
            Duration::from_secs(5),
            client.get(format!("{}/src/app.tsx", base_url)).send(),
        )
        .await
        .expect("request timed out")
        .expect("request failed");

        let cc = resp
            .headers()
            .get("cache-control")
            .unwrap()
            .to_str()
            .unwrap();
        assert!(
            cc.contains("no-cache"),
            "Source files should have no-cache. Got: {}",
            cc
        );

        let _ = shutdown_tx.send(());
    }

    #[tokio::test]
    async fn test_html_shell_includes_hmr_scripts() {
        let (base_url, shutdown_tx) = start_dev_server(task_manager_path()).await;
        let client = Client::new();

        let resp = timeout(
            Duration::from_secs(5),
            client.get(&base_url).header("Accept", "text/html").send(),
        )
        .await
        .expect("request timed out")
        .expect("request failed");

        let body = resp.text().await.unwrap();

        // HMR client script should be present
        assert!(
            body.contains("__vertz_hmr"),
            "HTML shell should include HMR client script"
        );

        // Fast Refresh runtime should be present
        assert!(
            body.contains("vertz:fast-refresh"),
            "HTML shell should include Fast Refresh runtime"
        );

        // HMR scripts should come before the app module
        let hmr_pos = body.find("__vertz_hmr").unwrap();
        let app_pos = body
            .find(r#"<script type="module" src="/src/app.tsx">"#)
            .unwrap();
        assert!(
            hmr_pos < app_pos,
            "HMR scripts must appear before the app module"
        );

        let _ = shutdown_tx.send(());
    }

    #[tokio::test]
    async fn test_websocket_hmr_endpoint_accepts_upgrade() {
        let (base_url, shutdown_tx) = start_dev_server(task_manager_path()).await;

        // Connect via WebSocket to /__vertz_hmr
        let ws_url = base_url.replace("http://", "ws://") + "/__vertz_hmr";

        let result = timeout(
            Duration::from_secs(5),
            tokio_tungstenite::connect_async(&ws_url),
        )
        .await;

        match result {
            Ok(Ok((mut ws, _))) => {
                // Should receive a "connected" message
                use futures_util::StreamExt;
                let msg = timeout(Duration::from_secs(2), ws.next())
                    .await
                    .expect("timed out waiting for message")
                    .expect("stream ended")
                    .expect("message error");

                let text = msg.to_text().unwrap();
                let parsed: serde_json::Value = serde_json::from_str(text).unwrap();
                assert_eq!(
                    parsed["type"], "connected",
                    "First message should be 'connected'"
                );

                // Clean up — drop the WebSocket to close
                drop(ws);
            }
            Ok(Err(e)) => panic!("WebSocket connection failed: {}", e),
            Err(_) => panic!("WebSocket connection timed out"),
        }

        let _ = shutdown_tx.send(());
    }
}
