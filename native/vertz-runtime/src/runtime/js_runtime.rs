use std::rc::Rc;
use std::sync::Arc;
use std::sync::Mutex;
use std::time::Instant;

use deno_core::error::AnyError;
use deno_core::v8;
use deno_core::Extension;
use deno_core::JsRuntime;
use deno_core::ModuleSpecifier;
use deno_core::PollEventLoopOptions;
use deno_core::RuntimeOptions;

use super::module_loader::VertzModuleLoader;
use super::ops::async_context;
use super::ops::clone;
use super::ops::console;
use super::ops::crypto;
use super::ops::crypto_subtle;
use super::ops::encoding;
use super::ops::env;
use super::ops::fetch;
use super::ops::fs;
use super::ops::microtask;
use super::ops::os;
use super::ops::path;
use super::ops::performance;
use super::ops::sqlite;
use super::ops::streams;
use super::ops::timers;
use super::ops::url;
use super::ops::web_api;

/// Captured output from console operations, used for testing.
#[derive(Debug, Clone, Default)]
pub struct CapturedOutput {
    pub stdout: Vec<String>,
    pub stderr: Vec<String>,
}

/// Configuration for creating a VertzJsRuntime.
#[derive(Default)]
pub struct VertzRuntimeOptions {
    /// Root directory for module resolution. Defaults to current directory.
    pub root_dir: Option<String>,
    /// Whether to capture console output (for testing). Defaults to false.
    pub capture_output: bool,
    /// Whether to enable the V8 inspector (for coverage collection). Defaults to false.
    pub enable_inspector: bool,
    /// Whether to enable the disk-backed compilation cache. Defaults to false.
    pub compile_cache: bool,
}

/// Wrapper around deno_core's JsRuntime with Vertz-specific extensions.
pub struct VertzJsRuntime {
    runtime: JsRuntime,
    captured_output: Arc<Mutex<CapturedOutput>>,
}

impl VertzJsRuntime {
    /// Collect all op declarations for the Vertz runtime extension.
    ///
    /// Single source of truth — used by both `new()` and the test snapshot.
    pub(crate) fn all_op_decls() -> Vec<deno_core::OpDecl> {
        let mut ops = Vec::new();
        ops.extend(async_context::op_decls());
        ops.extend(clone::op_decls());
        ops.extend(console::op_decls());
        ops.extend(timers::op_decls());
        ops.extend(crypto::op_decls());
        ops.extend(encoding::op_decls());
        ops.extend(env::op_decls());
        ops.extend(performance::op_decls());
        ops.extend(path::op_decls());
        ops.extend(fetch::op_decls());
        ops.extend(url::op_decls());
        ops.extend(crypto_subtle::op_decls());
        ops.extend(web_api::op_decls());
        ops.extend(streams::op_decls());
        ops.extend(os::op_decls());
        ops.extend(fs::op_decls());
        ops.extend(sqlite::op_decls());
        ops
    }

    /// Concatenate all bootstrap JS into a single string.
    ///
    /// Single source of truth — used by both `new()` and the test snapshot.
    pub(crate) fn bootstrap_js() -> String {
        [
            clone::CLONE_BOOTSTRAP_JS,
            console::CONSOLE_BOOTSTRAP_JS,
            timers::TIMERS_BOOTSTRAP_JS,
            crypto::CRYPTO_BOOTSTRAP_JS,
            encoding::ENCODING_BOOTSTRAP_JS,
            env::ENV_BOOTSTRAP_JS,
            performance::PERFORMANCE_BOOTSTRAP_JS,
            path::PATH_BOOTSTRAP_JS,
            web_api::WEB_API_BOOTSTRAP_JS,
            fetch::FETCH_BOOTSTRAP_JS,
            microtask::MICROTASK_BOOTSTRAP_JS,
            url::URL_BOOTSTRAP_JS,
            streams::STREAMS_BOOTSTRAP_JS,
            os::OS_BOOTSTRAP_JS,
            fs::FS_BOOTSTRAP_JS,
        ]
        .join("\n")
    }

    /// Create a new VertzJsRuntime with all Vertz extensions registered.
    pub fn new(options: VertzRuntimeOptions) -> Result<Self, AnyError> {
        let captured_output = Arc::new(Mutex::new(CapturedOutput::default()));
        let start_time = Instant::now();

        let all_ops = Self::all_op_decls();

        let capture = options.capture_output;
        let captured_clone = Arc::clone(&captured_output);

        // Single extension with all ops and state initialization
        let ext = Extension {
            name: "vertz",
            ops: std::borrow::Cow::Owned(all_ops),
            op_state_fn: Some(Box::new(move |state| {
                state.put(console::ConsoleState {
                    capture,
                    captured: Arc::clone(&captured_clone),
                });
                state.put(performance::PerformanceState { start_time });
                state.put(crypto_subtle::CryptoKeyStore::default());
                state.put(sqlite::SqliteStore::default());
            })),
            ..Default::default()
        };

        let root_dir = options.root_dir.unwrap_or_else(|| {
            std::env::current_dir()
                .unwrap()
                .to_string_lossy()
                .to_string()
        });
        let module_loader = Rc::new(VertzModuleLoader::new(&root_dir));

        let mut runtime = JsRuntime::new(RuntimeOptions {
            module_loader: Some(module_loader),
            extensions: vec![ext],
            inspector: options.enable_inspector,
            ..Default::default()
        });

        // Register V8 native functions (before bootstrap JS)
        clone::register_structured_clone(&mut runtime);
        async_context::register_promise_hooks(&mut runtime);

        // Bootstrap all JS globals
        runtime.execute_script(
            "[vertz:bootstrap]",
            deno_core::FastString::from(Self::bootstrap_js()),
        )?;

        Ok(Self {
            runtime,
            captured_output,
        })
    }

    /// Create a new VertzJsRuntime from the pre-built test snapshot.
    ///
    /// Significantly faster than `new()` because bootstrap JS, async context,
    /// and test harness are pre-baked into a V8 snapshot, skipping JS
    /// parsing/execution overhead.
    ///
    /// Post-restore steps:
    /// 1. Re-registers native V8 functions (structuredClone, promise hooks)
    /// 2. Re-installs promise hooks from stored functions on globalThis
    pub fn new_for_test(options: VertzRuntimeOptions) -> Result<Self, AnyError> {
        let captured_output = Arc::new(Mutex::new(CapturedOutput::default()));
        let start_time = Instant::now();

        let capture = options.capture_output;
        let captured_clone = Arc::clone(&captured_output);

        let ext = Extension {
            name: "vertz",
            ops: std::borrow::Cow::Owned(Self::all_op_decls()),
            op_state_fn: Some(Box::new(move |state| {
                state.put(console::ConsoleState {
                    capture,
                    captured: Arc::clone(&captured_clone),
                });
                state.put(performance::PerformanceState { start_time });
                state.put(crypto_subtle::CryptoKeyStore::default());
                state.put(sqlite::SqliteStore::default());
            })),
            ..Default::default()
        };

        let cache_enabled = options.compile_cache;
        let root_dir = options.root_dir.unwrap_or_else(|| {
            std::env::current_dir()
                .unwrap()
                .to_string_lossy()
                .to_string()
        });
        let module_loader = Rc::new(VertzModuleLoader::new_with_cache(&root_dir, cache_enabled));

        let snapshot = crate::test::snapshot::get_test_snapshot();

        let mut runtime = JsRuntime::new(RuntimeOptions {
            startup_snapshot: Some(snapshot),
            module_loader: Some(module_loader),
            extensions: vec![ext],
            inspector: options.enable_inspector,
            ..Default::default()
        });

        // Re-register native V8 functions (not preserved in snapshot)
        clone::register_structured_clone(&mut runtime);
        async_context::register_promise_hooks(&mut runtime);

        // Re-install promise hooks from stored functions on globalThis
        runtime.execute_script(
            "[vertz:rehook]",
            deno_core::FastString::from(crate::test::snapshot::ASYNC_CONTEXT_REHOOK_JS.to_string()),
        )?;

        Ok(Self {
            runtime,
            captured_output,
        })
    }

    /// Execute a JavaScript snippet and return the result as a serde_json::Value.
    pub fn execute_script(
        &mut self,
        name: &'static str,
        code: &str,
    ) -> Result<serde_json::Value, AnyError> {
        let global = self
            .runtime
            .execute_script(name, deno_core::FastString::from(code.to_string()))?;
        let scope = &mut self.runtime.handle_scope();
        let local = v8::Local::new(scope, global);
        let value = deno_core::serde_v8::from_v8::<serde_json::Value>(scope, local)?;
        Ok(value)
    }

    /// Execute a JavaScript snippet without capturing the return value.
    pub fn execute_script_void(&mut self, name: &'static str, code: &str) -> Result<(), AnyError> {
        self.runtime
            .execute_script(name, deno_core::FastString::from(code.to_string()))?;
        Ok(())
    }

    /// Load and evaluate an ES module from a file URL.
    pub async fn load_main_module(&mut self, specifier: &ModuleSpecifier) -> Result<(), AnyError> {
        let mod_id = self.runtime.load_main_es_module(specifier).await?;
        let result = self.runtime.mod_evaluate(mod_id);
        self.runtime
            .run_event_loop(PollEventLoopOptions::default())
            .await?;
        result.await?;
        Ok(())
    }

    /// Load and evaluate an ES module from inline source code.
    pub async fn load_main_module_from_code(
        &mut self,
        specifier: &ModuleSpecifier,
        code: String,
    ) -> Result<(), AnyError> {
        let mod_id = self
            .runtime
            .load_main_es_module_from_code(specifier, code)
            .await?;
        let result = self.runtime.mod_evaluate(mod_id);
        self.runtime
            .run_event_loop(PollEventLoopOptions::default())
            .await?;
        result.await?;
        Ok(())
    }

    /// Load and evaluate an ES module as a side module (not "main").
    ///
    /// Unlike `load_main_module`, this can be called after a main module has
    /// already been loaded. Used for loading the server entry alongside the
    /// app entry in the persistent isolate.
    pub async fn load_side_module(&mut self, specifier: &ModuleSpecifier) -> Result<(), AnyError> {
        let mod_id = self.runtime.load_side_es_module(specifier).await?;
        let result = self.runtime.mod_evaluate(mod_id);
        self.runtime
            .run_event_loop(PollEventLoopOptions::default())
            .await?;
        result.await?;
        Ok(())
    }

    /// Run the event loop until all pending operations complete.
    pub async fn run_event_loop(&mut self) -> Result<(), AnyError> {
        self.runtime
            .run_event_loop(PollEventLoopOptions::default())
            .await
    }

    /// Get captured console output (only available when capture_output is true).
    pub fn captured_output(&self) -> CapturedOutput {
        self.captured_output.lock().unwrap().clone()
    }

    /// Get a mutable reference to the inner JsRuntime.
    pub fn inner_mut(&mut self) -> &mut JsRuntime {
        &mut self.runtime
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_runtime() {
        let runtime = VertzJsRuntime::new(VertzRuntimeOptions::default());
        assert!(runtime.is_ok());
    }

    #[test]
    fn test_execute_simple_expression() {
        let mut runtime = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = runtime.execute_script("<test>", "1 + 1").unwrap();
        assert_eq!(result, serde_json::json!(2));
    }

    #[test]
    fn test_execute_string_expression() {
        let mut runtime = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = runtime
            .execute_script("<test>", "'hello' + ' ' + 'world'")
            .unwrap();
        assert_eq!(result, serde_json::json!("hello world"));
    }

    #[test]
    fn test_execute_object_expression() {
        let mut runtime = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = runtime
            .execute_script("<test>", "({ a: 1, b: 'two' })")
            .unwrap();
        assert_eq!(result, serde_json::json!({"a": 1, "b": "two"}));
    }

    #[test]
    fn test_execute_script_error() {
        let mut runtime = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = runtime.execute_script("<test>", "throw new Error('boom')");
        assert!(result.is_err());
        let err_msg = result.unwrap_err().to_string();
        assert!(err_msg.contains("boom"), "Error message: {}", err_msg);
    }

    #[test]
    fn test_runtime_drops_cleanly() {
        let runtime = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        drop(runtime);
        // If we get here without crash, the runtime dropped cleanly
    }

    #[test]
    fn test_execute_multiple_scripts() {
        let mut runtime = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        runtime
            .execute_script_void("<setup>", "globalThis.x = 10;")
            .unwrap();
        let result = runtime
            .execute_script("<test>", "globalThis.x * 3")
            .unwrap();
        assert_eq!(result, serde_json::json!(30));
    }
}
