use crate::plugin::{
    ClientScript, CompileContext, CompileDiagnostic, CompileOutput, FrameworkPlugin, PluginContext,
    PluginMcpTool,
};

/// Classic JSX pragma info extracted from leading comments.
struct ClassicJsxPragma {
    /// The factory function name (e.g., `"h"` or `"React.createElement"`).
    factory: String,
    /// Optional fragment factory (from `@jsxFrag`), e.g., `"Fragment"`.
    frag: Option<String>,
}

/// Detect classic JSX pragmas (`@jsx`, `@jsxFrag`) in leading comments.
///
/// Returns `Some(ClassicJsxPragma)` if `@jsx <factory>` is found, `None` otherwise.
/// Only scans comment lines at the top of the file before any code — pragmas
/// after the first non-comment line are ignored (intentionally stricter than
/// the TypeScript compiler, which scans all comments).
fn detect_classic_jsx_pragma(source: &str) -> Option<ClassicJsxPragma> {
    // Quick check: bail early if no @jsx anywhere
    if !source.contains("@jsx ") {
        return None;
    }

    let mut factory: Option<String> = None;
    let mut frag: Option<String> = None;

    for line in source.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        // Only look at comment lines (block or line comments)
        if !trimmed.starts_with("/*") && !trimmed.starts_with("*") && !trimmed.starts_with("//") {
            // Hit a non-comment line — stop scanning
            break;
        }

        // Check for @jsxFrag <factory> (must check before @jsx to avoid substring conflict)
        if let Some(pos) = trimmed.find("@jsxFrag ") {
            let after = &trimmed[pos + 9..];
            let name: String = after
                .chars()
                .take_while(|c| c.is_alphanumeric() || *c == '.' || *c == '_' || *c == '$')
                .collect();
            if !name.is_empty() {
                frag = Some(name);
            }
        }

        // Check for @jsx <factory> — defensive guard against "@jsx Runtime" typo
        // (the standard "@jsxRuntime" has no space so "@jsx " won't match it)
        if let Some(pos) = trimmed.find("@jsx ") {
            let after_at_jsx = &trimmed[pos + 5..];
            // Guard: skip "@jsx Runtime"/"@jsx runtime" (typo variant of @jsxRuntime)
            if after_at_jsx.starts_with("Runtime") || after_at_jsx.starts_with("runtime") {
                continue;
            }
            // Also skip if this matched inside @jsxFrag
            if pos > 0 && trimmed[..pos].ends_with('@') {
                continue;
            }
            // Extract the identifier
            let name: String = after_at_jsx
                .chars()
                .take_while(|c| c.is_alphanumeric() || *c == '.' || *c == '_' || *c == '$')
                .collect();
            if !name.is_empty() {
                factory = Some(name);
            }
        }
    }

    factory.map(|f| ClassicJsxPragma { factory: f, frag })
}

/// Compile a file with classic JSX runtime using oxc_transformer.
///
/// Used when a `@jsx` pragma is detected — skips all Vertz-specific transforms
/// (signals, reactivity, mount frames, mock hoisting) and compiles JSX with
/// the specified factory.
///
/// Note: `post_process()` still runs on this output, but its Vertz-specific
/// string replacements (effect→domEffect, internals import rewriting) are
/// harmless for classic JSX files since they don't reference `@vertz/ui`.
fn compile_classic_jsx(
    source: &str,
    ctx: &CompileContext,
    pragma: &ClassicJsxPragma,
) -> CompileOutput {
    use oxc_allocator::Allocator;
    use oxc_codegen::Codegen;
    use oxc_parser::Parser;
    use oxc_semantic::SemanticBuilder;
    use oxc_span::SourceType;
    use oxc_transformer::{JsxOptions, JsxRuntime, TransformOptions, Transformer};

    let allocator = Allocator::default();
    let source_type = SourceType::from_path(ctx.file_path).unwrap_or_default();

    let parser_ret = Parser::new(&allocator, source, source_type).parse();

    let mut diagnostics = Vec::new();
    for error in &parser_ret.errors {
        diagnostics.push(CompileDiagnostic {
            message: error.to_string(),
            line: None,
            column: None,
            is_warning: false,
        });
    }

    if parser_ret.panicked {
        return CompileOutput {
            code: source.to_string(),
            css: None,
            source_map: None,
            diagnostics,
            mocked_specifiers: std::collections::HashSet::new(),
            mock_preamble: None,
        };
    }

    let mut program = parser_ret.program;

    let semantic_ret = SemanticBuilder::new().build(&program);
    let scoping = semantic_ret.semantic.into_scoping();

    let transform_options = TransformOptions {
        jsx: JsxOptions {
            runtime: JsxRuntime::Classic,
            pragma: Some(pragma.factory.clone()),
            pragma_frag: pragma.frag.clone(),
            ..JsxOptions::default()
        },
        ..TransformOptions::default()
    };

    let transformer = Transformer::new(&allocator, ctx.file_path, &transform_options);
    let transform_ret = transformer.build_with_scoping(scoping, &mut program);

    for error in &transform_ret.errors {
        diagnostics.push(CompileDiagnostic {
            message: error.to_string(),
            line: None,
            column: None,
            is_warning: true,
        });
    }

    let codegen_ret = Codegen::new().build(&program);

    CompileOutput {
        code: codegen_ret.code,
        css: None,
        source_map: codegen_ret.map.map(|sm| sm.to_json_string()),
        diagnostics,
        mocked_specifiers: std::collections::HashSet::new(),
        mock_preamble: None,
    }
}

/// Fast Refresh runtime JS (embedded at compile time).
const FAST_REFRESH_RUNTIME_JS: &str = include_str!("../assets/fast-refresh-runtime.js");

/// Fast Refresh helpers that register @vertz/ui context functions.
const FAST_REFRESH_HELPERS_JS: &str = include_str!("../assets/fast-refresh-helpers.js");

/// The Vertz framework plugin.
///
/// Provides Vertz-specific compilation (signal transforms, JSX, reactivity),
/// Fast Refresh HMR, and MCP tools (API spec, route map).
pub struct VertzPlugin;

impl FrameworkPlugin for VertzPlugin {
    fn name(&self) -> &str {
        "vertz"
    }

    fn compile(&self, source: &str, ctx: &CompileContext) -> CompileOutput {
        // Check for classic JSX pragma — skip Vertz transforms entirely
        if let Some(ref pragma) = detect_classic_jsx_pragma(source) {
            return compile_classic_jsx(source, ctx, pragma);
        }

        let filename = ctx.file_path.to_string_lossy().to_string();
        let is_test = crate::test::is_test_file(ctx.file_path);

        let compile_result = vertz_compiler_core::compile(
            source,
            vertz_compiler_core::CompileOptions {
                filename: Some(filename.clone()),
                target: Some(ctx.target.to_string()),
                fast_refresh: Some(!is_test),
                skip_css_transform: Some(is_test),
                mock_hoisting: Some(is_test),
                ..Default::default()
            },
        );

        let mut diagnostics = Vec::new();
        if let Some(ref diags) = compile_result.diagnostics {
            for d in diags {
                let is_warning = d.message.starts_with("[css-");
                diagnostics.push(CompileDiagnostic {
                    message: d.message.clone(),
                    line: d.line,
                    column: d.column,
                    is_warning,
                });
            }

            // Log diagnostics
            let log_msgs: Vec<String> = diags
                .iter()
                .map(|d| {
                    let location = match (d.line, d.column) {
                        (Some(line), Some(col)) => format!(" at {}:{}:{}", filename, line, col),
                        _ => String::new(),
                    };
                    format!("{}{}", d.message, location)
                })
                .collect();
            if !log_msgs.is_empty() {
                eprintln!(
                    "[vertz-compiler] Diagnostics for {}:\n  {}",
                    filename,
                    log_msgs.join("\n  ")
                );
            }
        }

        CompileOutput {
            code: compile_result.code,
            css: compile_result.css,
            source_map: compile_result.map,
            diagnostics,
            mocked_specifiers: compile_result.mocked_specifiers.unwrap_or_default(),
            mock_preamble: compile_result.mock_preamble,
        }
    }

    fn post_process(&self, code: &str, ctx: &CompileContext) -> String {
        // Vertz-specific post-processing:
        // 1. Fix wrong API names (effect → domEffect) — Vertz compiler quirk
        // 2. Move internal APIs to @vertz/ui/internals — Vertz compiler quirk
        let processed = crate::compiler::pipeline::post_process_compiled(code);
        // 3. Fix module ID to use URL-relative path for Fast Refresh registry
        crate::compiler::pipeline::fix_module_id(&processed, ctx.file_path, ctx.root_dir)
    }

    fn hmr_client_scripts(&self) -> Vec<ClientScript> {
        vec![
            ClientScript {
                content: FAST_REFRESH_RUNTIME_JS.to_string(),
                is_module: false,
            },
            ClientScript {
                content: FAST_REFRESH_HELPERS_JS.to_string(),
                is_module: true,
            },
        ]
    }

    fn supports_fast_refresh(&self) -> bool {
        true
    }

    fn restart_triggers(&self) -> Vec<String> {
        vec![
            "vertz.config.ts".into(),
            "vertz.config.js".into(),
            "package.json".into(),
            "bun.lock".into(),
            "bun.lockb".into(),
            ".env".into(),
            ".env.local".into(),
            ".env.development".into(),
        ]
    }

    fn env_public_prefixes(&self) -> Vec<String> {
        vec!["VERTZ_".into(), "VITE_".into()]
    }

    fn mcp_tool_definitions(&self) -> Vec<PluginMcpTool> {
        vec![PluginMcpTool {
            name: "api_spec".into(),
            description: "Returns the app's OpenAPI 3.1 specification including all entity CRUD \
                          routes, service endpoints, schemas, and access rules."
                .into(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "filter": {
                        "type": "string",
                        "description": "Optional: filter by entity name, e.g. 'Task' or 'User'"
                    }
                }
            }),
        }]
    }

    fn execute_mcp_tool(
        &self,
        name: &str,
        _args: &serde_json::Value,
        _ctx: &PluginContext,
    ) -> Result<serde_json::Value, String> {
        match name {
            "api_spec" => {
                // The actual API spec execution requires access to the persistent isolate,
                // which is not yet available through PluginContext. For now, return a
                // placeholder that tells the caller to use the isolate-based handler.
                // This will be fully wired when PluginContext gains isolate access.
                Err("api_spec requires isolate access — use the built-in handler for now".into())
            }
            _ => Err(format!("Unknown Vertz plugin tool: {}", name)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::plugin::HmrAction;
    use crate::watcher::file_watcher::FileChangeKind;
    use crate::watcher::InvalidationResult;
    use std::path::{Path, PathBuf};

    fn make_plugin() -> VertzPlugin {
        VertzPlugin
    }

    #[test]
    fn test_name() {
        assert_eq!(make_plugin().name(), "vertz");
    }

    #[test]
    fn test_supports_fast_refresh() {
        assert!(make_plugin().supports_fast_refresh());
    }

    #[test]
    fn test_restart_triggers_include_vertz_config() {
        let triggers = make_plugin().restart_triggers();
        assert!(triggers.contains(&"vertz.config.ts".to_string()));
        assert!(triggers.contains(&"vertz.config.js".to_string()));
        assert!(triggers.contains(&"package.json".to_string()));
        assert!(triggers.contains(&".env".to_string()));
        assert!(triggers.contains(&".env.local".to_string()));
    }

    #[test]
    fn test_hmr_client_scripts_returns_two_scripts() {
        let scripts = make_plugin().hmr_client_scripts();
        assert_eq!(scripts.len(), 2);
        // First: Fast Refresh runtime (non-module)
        assert!(!scripts[0].is_module);
        assert!(!scripts[0].content.is_empty());
        // Second: Fast Refresh helpers (module)
        assert!(scripts[1].is_module);
        assert!(!scripts[1].content.is_empty());
    }

    #[test]
    fn test_compile_simple_ts() {
        let plugin = make_plugin();
        let ctx = CompileContext {
            file_path: Path::new("/project/src/utils.ts"),
            root_dir: Path::new("/project"),
            src_dir: Path::new("/project/src"),
            target: "dom",
        };
        let output = plugin.compile("export const x = 1;", &ctx);
        assert!(output.code.contains("const x = 1"));
        assert!(output.diagnostics.is_empty());
    }

    #[test]
    fn test_compile_tsx_component() {
        let plugin = make_plugin();
        let ctx = CompileContext {
            file_path: Path::new("/project/src/App.tsx"),
            root_dir: Path::new("/project"),
            src_dir: Path::new("/project/src"),
            target: "dom",
        };
        let output = plugin.compile(
            "export default function App() { return <div>Hello</div>; }",
            &ctx,
        );
        // Should compile without errors
        let errors: Vec<_> = output
            .diagnostics
            .iter()
            .filter(|d| !d.is_warning)
            .collect();
        assert!(errors.is_empty(), "Unexpected errors: {:?}", errors);
        assert!(!output.code.is_empty());
    }

    #[test]
    fn test_post_process_strips_import_meta_hot() {
        let plugin = make_plugin();
        let ctx = CompileContext {
            file_path: Path::new("/project/src/app.tsx"),
            root_dir: Path::new("/project"),
            src_dir: Path::new("/project/src"),
            target: "dom",
        };
        let code = "const x = 1;\nimport.meta.hot.accept();\nconst y = 2;";
        let result = plugin.post_process(code, &ctx);
        assert!(!result.contains("import.meta.hot"));
        assert!(result.contains("const x = 1"));
        assert!(result.contains("const y = 2"));
    }

    #[test]
    fn test_post_process_fixes_module_id() {
        let plugin = make_plugin();
        let ctx = CompileContext {
            file_path: Path::new("/project/src/app.tsx"),
            root_dir: Path::new("/project"),
            src_dir: Path::new("/project/src"),
            target: "dom",
        };
        let code = "const __$moduleId = '/project/src/app.tsx';";
        let result = plugin.post_process(code, &ctx);
        assert!(
            result.contains("/src/app.tsx"),
            "Expected URL-relative path, got: {}",
            result
        );
        assert!(
            !result.contains("/project/src/app.tsx"),
            "Absolute path should be replaced"
        );
    }

    #[test]
    fn test_default_hmr_strategy_entry_file() {
        let plugin = make_plugin();
        let result = InvalidationResult {
            changed_file: PathBuf::from("/project/src/app.tsx"),
            change_kind: FileChangeKind::Modify,
            invalidated_files: vec![],
            is_entry_file: true,
            is_css_only: false,
        };
        match plugin.hmr_strategy(&result) {
            HmrAction::FullReload(_) => {}
            other => panic!("Expected FullReload, got {:?}", other),
        }
    }

    #[test]
    fn test_default_hmr_strategy_css() {
        let plugin = make_plugin();
        let result = InvalidationResult {
            changed_file: PathBuf::from("/project/src/styles.css"),
            change_kind: FileChangeKind::Modify,
            invalidated_files: vec![],
            is_entry_file: false,
            is_css_only: true,
        };
        match plugin.hmr_strategy(&result) {
            HmrAction::CssUpdate(path) => {
                assert_eq!(path, PathBuf::from("/project/src/styles.css"));
            }
            other => panic!("Expected CssUpdate, got {:?}", other),
        }
    }

    #[test]
    fn test_mcp_tool_definitions() {
        let plugin = make_plugin();
        let tools = plugin.mcp_tool_definitions();
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0].name, "api_spec");
    }

    #[test]
    fn test_execute_unknown_mcp_tool() {
        let plugin = make_plugin();
        let ctx = PluginContext {
            root_dir: Path::new("/project"),
            src_dir: Path::new("/project/src"),
            port: 3000,
        };
        let result = plugin.execute_mcp_tool("unknown_tool", &serde_json::json!({}), &ctx);
        assert!(result.is_err());
    }

    #[test]
    fn test_env_public_prefixes_includes_vertz_and_vite() {
        let plugin = make_plugin();
        let prefixes = plugin.env_public_prefixes();
        assert!(prefixes.contains(&"VERTZ_".to_string()));
        assert!(prefixes.contains(&"VITE_".to_string()));
    }

    // ── CSS transform skipped for test files ────────────────────

    #[test]
    fn test_file_preserves_css_call() {
        let plugin = make_plugin();
        let ctx = CompileContext {
            file_path: Path::new("/project/src/css/__tests__/css.test.ts"),
            root_dir: Path::new("/project"),
            src_dir: Path::new("/project/src"),
            target: "ssr",
        };
        let source = r#"const styles = css({ root: ['flex', 'p:4'] });"#;
        let output = plugin.compile(source, &ctx);
        assert!(
            output.code.contains("css("),
            "css() should be preserved in test files: {}",
            output.code
        );
        assert!(
            output.css.is_none(),
            "No CSS should be extracted from test files"
        );
    }

    #[test]
    fn spec_file_preserves_css_call() {
        let plugin = make_plugin();
        let ctx = CompileContext {
            file_path: Path::new("/project/src/css/css.spec.ts"),
            root_dir: Path::new("/project"),
            src_dir: Path::new("/project/src"),
            target: "ssr",
        };
        let source = r#"const styles = css({ root: ['flex'] });"#;
        let output = plugin.compile(source, &ctx);
        assert!(
            output.code.contains("css("),
            "css() should be preserved in spec files: {}",
            output.code
        );
    }

    #[test]
    fn test_tsx_file_preserves_css_call() {
        let plugin = make_plugin();
        let ctx = CompileContext {
            file_path: Path::new("/project/src/component.test.tsx"),
            root_dir: Path::new("/project"),
            src_dir: Path::new("/project/src"),
            target: "ssr",
        };
        let source = r#"const styles = css({ root: ['flex'] });"#;
        let output = plugin.compile(source, &ctx);
        assert!(
            output.code.contains("css("),
            "css() should be preserved in .test.tsx files: {}",
            output.code
        );
    }

    #[test]
    fn dunder_tests_dir_preserves_css_call() {
        let plugin = make_plugin();
        let ctx = CompileContext {
            file_path: Path::new("/project/src/__tests__/styles.ts"),
            root_dir: Path::new("/project"),
            src_dir: Path::new("/project/src"),
            target: "ssr",
        };
        let source = r#"const styles = css({ root: ['flex'] });"#;
        let output = plugin.compile(source, &ctx);
        assert!(
            output.code.contains("css("),
            "css() should be preserved in __tests__/ files: {}",
            output.code
        );
    }

    #[test]
    fn is_test_file_detects_patterns() {
        use crate::test::is_test_file;
        assert!(is_test_file(Path::new("src/css.test.ts")));
        assert!(is_test_file(Path::new("src/css.test.tsx")));
        assert!(is_test_file(Path::new("src/css.spec.ts")));
        assert!(is_test_file(Path::new("src/css.spec.tsx")));
        assert!(is_test_file(Path::new("src/css.e2e.ts")));
        assert!(is_test_file(Path::new("src/css.e2e.tsx")));
        assert!(is_test_file(Path::new("src/integration.local.ts")));
        assert!(is_test_file(Path::new("src/__tests__/css.ts")));
        assert!(is_test_file(Path::new("src/__tests__/nested/deep.ts")));
        assert!(!is_test_file(Path::new("src/components/card.tsx")));
        assert!(!is_test_file(Path::new("src/css/css.ts")));
        assert!(!is_test_file(Path::new("src/testing/helpers.ts")));
    }

    // ── Fast Refresh disabled for test files ──────────────────

    #[test]
    fn test_file_does_not_inject_fast_refresh() {
        let plugin = make_plugin();
        let ctx = CompileContext {
            file_path: Path::new("/project/src/App.test.tsx"),
            root_dir: Path::new("/project"),
            src_dir: Path::new("/project/src"),
            target: "dom",
        };
        let output = plugin.compile(
            "export default function App() { return <div>Hello</div>; }",
            &ctx,
        );
        assert!(
            !output.code.contains("__$fr"),
            "Fast Refresh preamble should not be injected in test files: {}",
            output.code
        );
        assert!(
            !output.code.contains("__$refreshReg"),
            "Fast Refresh registration should not be injected in test files: {}",
            output.code
        );
    }

    #[test]
    fn spec_file_does_not_inject_fast_refresh() {
        let plugin = make_plugin();
        let ctx = CompileContext {
            file_path: Path::new("/project/src/App.spec.tsx"),
            root_dir: Path::new("/project"),
            src_dir: Path::new("/project/src"),
            target: "dom",
        };
        let output = plugin.compile(
            "export default function App() { return <div>Hello</div>; }",
            &ctx,
        );
        assert!(
            !output.code.contains("__$fr"),
            "Fast Refresh preamble should not be injected in spec files: {}",
            output.code
        );
    }

    #[test]
    fn dunder_tests_dir_does_not_inject_fast_refresh() {
        let plugin = make_plugin();
        let ctx = CompileContext {
            file_path: Path::new("/project/src/__tests__/App.tsx"),
            root_dir: Path::new("/project"),
            src_dir: Path::new("/project/src"),
            target: "dom",
        };
        let output = plugin.compile(
            "export default function App() { return <div>Hello</div>; }",
            &ctx,
        );
        assert!(
            !output.code.contains("__$fr"),
            "Fast Refresh preamble should not be injected in __tests__/ files: {}",
            output.code
        );
    }

    #[test]
    fn e2e_file_does_not_inject_fast_refresh() {
        let plugin = make_plugin();
        let ctx = CompileContext {
            file_path: Path::new("/project/src/App.e2e.tsx"),
            root_dir: Path::new("/project"),
            src_dir: Path::new("/project/src"),
            target: "dom",
        };
        let output = plugin.compile(
            "export default function App() { return <div>Hello</div>; }",
            &ctx,
        );
        assert!(
            !output.code.contains("__$fr"),
            "Fast Refresh preamble should not be injected in e2e files: {}",
            output.code
        );
    }

    #[test]
    fn local_file_does_not_inject_fast_refresh() {
        let plugin = make_plugin();
        let ctx = CompileContext {
            file_path: Path::new("/project/src/integration.local.tsx"),
            root_dir: Path::new("/project"),
            src_dir: Path::new("/project/src"),
            target: "dom",
        };
        let output = plugin.compile(
            "export default function App() { return <div>Hello</div>; }",
            &ctx,
        );
        assert!(
            !output.code.contains("__$fr"),
            "Fast Refresh preamble should not be injected in .local files: {}",
            output.code
        );
    }

    #[test]
    fn non_test_file_still_injects_fast_refresh() {
        let plugin = make_plugin();
        let ctx = CompileContext {
            file_path: Path::new("/project/src/App.tsx"),
            root_dir: Path::new("/project"),
            src_dir: Path::new("/project/src"),
            target: "dom",
        };
        let output = plugin.compile(
            "export default function App() { return <div>Hello</div>; }",
            &ctx,
        );
        assert!(
            output.code.contains("__$fr"),
            "Fast Refresh preamble should be injected in non-test files: {}",
            output.code
        );
    }

    // ── Classic JSX pragma detection ─────────────────────────────

    #[test]
    fn classic_jsx_pragma_uses_custom_factory() {
        let plugin = make_plugin();
        let ctx = CompileContext {
            file_path: Path::new("/project/src/template.tsx"),
            root_dir: Path::new("/project"),
            src_dir: Path::new("/project/src"),
            target: "dom",
        };
        let source = r#"/* @jsxRuntime classic */
/* @jsx h */
import { h } from './h';

export function Card({ title }) {
    return <div>{title}</div>;
}
"#;
        let output = plugin.compile(source, &ctx);
        // Should call h() instead of Vertz DOM helpers
        assert!(
            output.code.contains("h("),
            "Expected h() factory call, got: {}",
            output.code
        );
        // Should NOT contain Vertz internals imports
        assert!(
            !output.code.contains("@vertz/ui/internals"),
            "Should not inject Vertz internals for classic JSX: {}",
            output.code
        );
    }

    #[test]
    fn classic_jsx_pragma_preserves_import() {
        let plugin = make_plugin();
        let ctx = CompileContext {
            file_path: Path::new("/project/src/template.tsx"),
            root_dir: Path::new("/project"),
            src_dir: Path::new("/project/src"),
            target: "dom",
        };
        let source = r#"/* @jsxRuntime classic */
/* @jsx h */
import { h } from '../h';

export function Minimal({ title }) {
    return <div style={{ fontSize: '72px' }}>{title}</div>;
}
"#;
        let output = plugin.compile(source, &ctx);
        // The h import should be preserved
        assert!(
            output.code.contains("from \"../h\"") || output.code.contains("from '../h'"),
            "Should preserve h import, got: {}",
            output.code
        );
    }

    #[test]
    fn no_pragma_still_uses_vertz_transforms() {
        let plugin = make_plugin();
        let ctx = CompileContext {
            file_path: Path::new("/project/src/App.tsx"),
            root_dir: Path::new("/project"),
            src_dir: Path::new("/project/src"),
            target: "dom",
        };
        let output = plugin.compile(
            "export default function App() { return <div>Hello</div>; }",
            &ctx,
        );
        // Without pragma, Vertz transforms should be applied
        assert!(
            !output.code.contains("React.createElement"),
            "Without pragma, should not use React.createElement: {}",
            output.code
        );
    }

    #[test]
    fn classic_jsx_pragma_strips_typescript() {
        let plugin = make_plugin();
        let ctx = CompileContext {
            file_path: Path::new("/project/src/template.tsx"),
            root_dir: Path::new("/project"),
            src_dir: Path::new("/project/src"),
            target: "dom",
        };
        let source = r#"/* @jsx h */
import { h } from './h';
interface Props { title: string; }
export function Card({ title }: Props) {
    return <div>{title}</div>;
}
"#;
        let output = plugin.compile(source, &ctx);
        // TypeScript should be stripped
        assert!(
            !output.code.contains("interface Props"),
            "TypeScript should be stripped: {}",
            output.code
        );
        // Should use h() factory
        assert!(
            output.code.contains("h("),
            "Should use h() factory: {}",
            output.code
        );
    }

    #[test]
    fn classic_jsx_pragma_line_comment() {
        let plugin = make_plugin();
        let ctx = CompileContext {
            file_path: Path::new("/project/src/template.tsx"),
            root_dir: Path::new("/project"),
            src_dir: Path::new("/project/src"),
            target: "dom",
        };
        let source = r#"// @jsx h
import { h } from './h';
export function X() { return <div />; }
"#;
        let output = plugin.compile(source, &ctx);
        assert!(
            output.code.contains("h("),
            "Line comment pragma should work: {}",
            output.code
        );
    }

    #[test]
    fn classic_jsx_pragma_jsdoc_comment() {
        let plugin = make_plugin();
        let ctx = CompileContext {
            file_path: Path::new("/project/src/template.tsx"),
            root_dir: Path::new("/project"),
            src_dir: Path::new("/project/src"),
            target: "dom",
        };
        let source = r#"/** @jsx h */
import { h } from './h';
export function X() { return <div />; }
"#;
        let output = plugin.compile(source, &ctx);
        assert!(
            output.code.contains("h("),
            "JSDoc-style pragma should work: {}",
            output.code
        );
    }

    #[test]
    fn classic_jsx_pragma_multiline_block_comment() {
        let plugin = make_plugin();
        let ctx = CompileContext {
            file_path: Path::new("/project/src/template.tsx"),
            root_dir: Path::new("/project"),
            src_dir: Path::new("/project/src"),
            target: "dom",
        };
        let source = r#"/*
 * @jsxRuntime classic
 * @jsx h
 */
import { h } from './h';
export function X() { return <div />; }
"#;
        let output = plugin.compile(source, &ctx);
        assert!(
            output.code.contains("h("),
            "Multi-line block comment pragma should work: {}",
            output.code
        );
    }

    // ── detect_classic_jsx_pragma unit tests ─────────────────────

    #[test]
    fn detect_pragma_none_for_empty_source() {
        assert!(detect_classic_jsx_pragma("").is_none());
    }

    #[test]
    fn detect_pragma_none_for_no_jsx() {
        assert!(detect_classic_jsx_pragma("const x = 1;").is_none());
    }

    #[test]
    fn detect_pragma_none_when_after_code() {
        let source = "import { h } from './h';\n/* @jsx h */\n";
        assert!(
            detect_classic_jsx_pragma(source).is_none(),
            "Pragma after code should be ignored"
        );
    }

    #[test]
    fn detect_pragma_extracts_factory() {
        let source = "/* @jsx h */\n";
        let pragma = detect_classic_jsx_pragma(source).unwrap();
        assert_eq!(pragma.factory, "h");
        assert!(pragma.frag.is_none());
    }

    #[test]
    fn detect_pragma_extracts_dotted_factory() {
        let source = "/* @jsx React.createElement */\n";
        let pragma = detect_classic_jsx_pragma(source).unwrap();
        assert_eq!(pragma.factory, "React.createElement");
    }

    #[test]
    fn detect_pragma_ignores_jsx_runtime() {
        let source = "/* @jsxRuntime classic */\n";
        assert!(
            detect_classic_jsx_pragma(source).is_none(),
            "@jsxRuntime alone should not trigger classic mode"
        );
    }

    #[test]
    fn detect_pragma_with_frag() {
        let source = "/* @jsx h */\n/* @jsxFrag Fragment */\n";
        let pragma = detect_classic_jsx_pragma(source).unwrap();
        assert_eq!(pragma.factory, "h");
        assert_eq!(pragma.frag.as_deref(), Some("Fragment"));
    }

    #[test]
    fn detect_pragma_skips_blank_lines() {
        let source = "\n\n/* @jsx h */\n";
        let pragma = detect_classic_jsx_pragma(source).unwrap();
        assert_eq!(pragma.factory, "h");
    }

    #[test]
    fn non_test_file_still_extracts_css() {
        let plugin = make_plugin();
        let ctx = CompileContext {
            file_path: Path::new("/project/src/components/card.tsx"),
            root_dir: Path::new("/project"),
            src_dir: Path::new("/project/src"),
            target: "ssr",
        };
        let source = r#"const styles = css({ root: ['flex', 'p:4'] });"#;
        let output = plugin.compile(source, &ctx);
        assert!(
            !output.code.contains("css("),
            "css() should be extracted in non-test files: {}",
            output.code
        );
        assert!(output.css.is_some(), "CSS should be extracted");
    }
}
