use crate::plugin::{
    ClientScript, CompileContext, CompileDiagnostic, CompileOutput, FrameworkPlugin, PluginContext,
    PluginMcpTool,
};

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
        let filename = ctx.file_path.to_string_lossy().to_string();

        let compile_result = vertz_compiler_core::compile(
            source,
            vertz_compiler_core::CompileOptions {
                filename: Some(filename.clone()),
                target: Some(ctx.target.to_string()),
                fast_refresh: Some(true),
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
}
