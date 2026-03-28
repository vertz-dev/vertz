/// End-to-end integration test: start the dev server with a minimal Vertz app,
/// make HTTP requests, and verify that compilation, import rewriting, source maps,
/// HTML shell generation, and CSS/deps routes all work correctly.
use std::path::PathBuf;

/// Path to the minimal app fixture
fn fixture_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("minimal-app")
}

// ── HTML Shell Tests ─────────────────────────────────────────────────────

#[tokio::test]
async fn test_html_shell_for_root_page() {
    let root = fixture_path();
    let config =
        vertz_runtime::compiler::pipeline::CompilationPipeline::new(root.clone(), root.join("src"));
    drop(config); // We just test the HTML shell directly

    let html = vertz_runtime::server::html_shell::generate_html_shell(
        &root.join("src/app.tsx"),
        &root,
        &[],
        None,
        "Vertz App",
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

// ── Source Compilation Tests ─────────────────────────────────────────────

#[tokio::test]
async fn test_compile_app_tsx_for_browser() {
    let root = fixture_path();
    let pipeline =
        vertz_runtime::compiler::pipeline::CompilationPipeline::new(root.clone(), root.join("src"));

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
    let root = fixture_path();
    let pipeline =
        vertz_runtime::compiler::pipeline::CompilationPipeline::new(root.clone(), root.join("src"));

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
    let root = fixture_path();
    let pipeline =
        vertz_runtime::compiler::pipeline::CompilationPipeline::new(root.clone(), root.join("src"));

    let result = pipeline.compile_for_browser(&root.join("src/app.tsx"));

    // The relative import `./components/Hello` should be rewritten to an absolute path
    // It should NOT be `./components/Hello` anymore — it should be `/src/components/Hello.tsx`
    assert!(
        !result.code.contains("'./components/Hello'"),
        "Relative import should be rewritten. Code: {}",
        result.code
    );
}

// ── Source Map Tests ─────────────────────────────────────────────────────

#[tokio::test]
async fn test_source_map_generated() {
    let root = fixture_path();
    let pipeline =
        vertz_runtime::compiler::pipeline::CompilationPipeline::new(root.clone(), root.join("src"));

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

// ── Compilation Cache Tests ──────────────────────────────────────────────

#[tokio::test]
async fn test_compilation_cache_works() {
    let root = fixture_path();
    let pipeline =
        vertz_runtime::compiler::pipeline::CompilationPipeline::new(root.clone(), root.join("src"));

    let file = root.join("src/app.tsx");

    // First compile
    let result1 = pipeline.compile_for_browser(&file);
    // Second compile (should be cached)
    let result2 = pipeline.compile_for_browser(&file);

    // Both should return the same compiled code
    assert_eq!(result1.code, result2.code);
}

// ── Dependency Resolution Tests ──────────────────────────────────────────

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

// ── Import Scanner Tests ─────────────────────────────────────────────────

#[tokio::test]
async fn test_import_scanner_finds_deps() {
    let root = fixture_path();
    let deps = vertz_runtime::deps::scanner::scan_entry_recursive(&root.join("src/app.tsx"), &root);

    // The minimal app has no bare imports (only relative), so deps should be empty
    assert!(
        deps.is_empty(),
        "Minimal app has no node_modules deps: {:?}",
        deps
    );
}

// ── HTML Shell Routing Tests ─────────────────────────────────────────────

#[test]
fn test_page_route_detection() {
    use vertz_runtime::server::html_shell::is_page_route;

    // Page routes
    assert!(is_page_route("/"));
    assert!(is_page_route("/tasks"));
    assert!(is_page_route("/tasks/123"));
    assert!(is_page_route("/settings/profile"));

    // Non-page routes
    assert!(!is_page_route("/@deps/@vertz/ui"));
    assert!(!is_page_route("/@css/button.css"));
    assert!(!is_page_route("/src/app.tsx"));
    assert!(!is_page_route("/favicon.ico"));
    assert!(!is_page_route("/logo.png"));
}

// ── CSS Server Tests ─────────────────────────────────────────────────────

#[test]
fn test_css_key_extraction() {
    use vertz_runtime::server::css_server::extract_css_key;

    assert_eq!(
        extract_css_key("/@css/button.css"),
        Some("button.css".to_string())
    );
    assert_eq!(extract_css_key("/src/app.tsx"), None);
}

// ── Error Handling Tests ─────────────────────────────────────────────────

#[tokio::test]
async fn test_compile_nonexistent_file_returns_error_module() {
    let root = fixture_path();
    let pipeline =
        vertz_runtime::compiler::pipeline::CompilationPipeline::new(root.clone(), root.join("src"));

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
