use deno_core::v8;
use deno_core::OpDecl;

/// No deno_core ops — promise hooks are registered as a v8 function callback
/// because we need direct HandleScope access to call v8::set_promise_hooks().
pub fn op_decls() -> Vec<OpDecl> {
    vec![]
}

/// V8 callback that receives 4 JS functions (init, before, after, resolve)
/// and registers them as V8 promise hooks via Context::set_promise_hooks().
fn set_promise_hooks_callback(
    scope: &mut v8::HandleScope,
    args: v8::FunctionCallbackArguments,
    _rv: v8::ReturnValue,
) {
    // Extract the 4 function arguments, converting to Option<Local<Function>>
    let init = v8::Local::<v8::Function>::try_from(args.get(0)).ok();
    let before = v8::Local::<v8::Function>::try_from(args.get(1)).ok();
    let after = v8::Local::<v8::Function>::try_from(args.get(2)).ok();
    let resolve = v8::Local::<v8::Function>::try_from(args.get(3)).ok();

    // Wire up V8's internal promise lifecycle hooks.
    // These fire for every promise creation, continuation, and resolution.
    scope.set_promise_hooks(init, before, after, resolve);
}

/// Register the __vertz_setPromiseHooks function on the global scope.
/// Must be called after runtime creation, before async_context JS loads.
pub fn register_promise_hooks(runtime: &mut deno_core::JsRuntime) {
    let context = runtime.main_context();
    let scope = &mut runtime.handle_scope();
    let context_local = v8::Local::new(scope, context);
    let global = context_local.global(scope);

    let name = v8::String::new(scope, "__vertz_setPromiseHooks").unwrap();
    let func = v8::Function::new(scope, set_promise_hooks_callback).unwrap();
    global.set(scope, name.into(), func.into());
}

/// No bootstrap JS — the async_context module calls __vertz_setPromiseHooks
/// when loaded via load_async_context().
pub const ASYNC_CONTEXT_BOOTSTRAP_JS: &str = "";

#[cfg(test)]
mod tests {
    use crate::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

    fn create_runtime() -> VertzJsRuntime {
        VertzJsRuntime::new(VertzRuntimeOptions {
            capture_output: true,
            ..Default::default()
        })
        .unwrap()
    }

    #[test]
    fn test_promise_hooks_fn_exists_on_global() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script("<test>", "typeof __vertz_setPromiseHooks === 'function'")
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_promise_hooks_can_be_called_without_crash() {
        let mut rt = create_runtime();
        // Calling with 4 no-op functions should not crash
        rt.execute_script_void(
            "<test>",
            r#"
            __vertz_setPromiseHooks(
                () => {},
                () => {},
                () => {},
                () => {},
            );
            "#,
        )
        .unwrap();
    }

    #[test]
    fn test_promise_hooks_init_fires_on_promise_creation() {
        let mut rt = create_runtime();

        let tokio_rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();

        let result = tokio_rt.block_on(async {
            rt.execute_script_void(
                "<test>",
                r#"
                globalThis.__hookCalls = [];
                __vertz_setPromiseHooks(
                    (promise) => { globalThis.__hookCalls.push('init'); },
                    (promise) => { globalThis.__hookCalls.push('before'); },
                    (promise) => { globalThis.__hookCalls.push('after'); },
                    (promise) => { globalThis.__hookCalls.push('resolve'); },
                );
                // Creating a promise should trigger the init hook
                const p = new Promise(resolve => resolve(42));
                "#,
            )
            .unwrap();

            rt.run_event_loop().await.unwrap();

            rt.execute_script("<get>", "globalThis.__hookCalls")
                .unwrap()
        });

        // init should fire when the promise is created
        let calls: Vec<String> = serde_json::from_value(result).unwrap();
        assert!(
            calls.contains(&"init".to_string()),
            "Expected 'init' hook to fire, got: {:?}",
            calls
        );
    }
}
