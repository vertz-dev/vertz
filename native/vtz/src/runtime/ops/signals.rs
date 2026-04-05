use std::cell::RefCell;

use deno_core::v8;
use deno_core::OpDecl;

use crate::runtime::signal_graph::{ReadOutcome, SignalGraph};

thread_local! {
    static SIGNAL_GRAPH: RefCell<Option<SignalGraph>> = const { RefCell::new(None) };
}

/// Borrow the signal graph for a short, non-V8-calling operation.
/// Returns `None` if the graph has not been initialized.
fn with_graph<R>(f: impl FnOnce(&mut SignalGraph) -> R) -> Option<R> {
    SIGNAL_GRAPH.with(|cell| {
        let mut guard = cell.borrow_mut();
        guard.as_mut().map(f)
    })
}

/// Error message for uninitialized graph.
const GRAPH_NOT_INIT: &str =
    "signal graph not initialized — call __VERTZ_SIGNAL_OPS__.init() first";

/// Throw a JavaScript error from a signal graph error.
fn throw_signal_error(scope: &mut v8::HandleScope, msg: &str) {
    let msg = v8::String::new(scope, msg).unwrap();
    let error = v8::Exception::error(scope, msg);
    scope.throw_exception(error);
}

// ── V8 native function callbacks ──

/// Initialize a fresh signal graph for this thread.
fn init_callback(
    _scope: &mut v8::HandleScope,
    _args: v8::FunctionCallbackArguments,
    _rv: v8::ReturnValue,
) {
    SIGNAL_GRAPH.with(|cell| {
        *cell.borrow_mut() = Some(SignalGraph::new());
    });
}

/// Dispose the signal graph, dropping all V8 Global handles.
fn dispose_callback(
    _scope: &mut v8::HandleScope,
    _args: v8::FunctionCallbackArguments,
    _rv: v8::ReturnValue,
) {
    SIGNAL_GRAPH.with(|cell| {
        *cell.borrow_mut() = None;
    });
}

/// Create a signal node. Args: (value, hmrKey?). Returns: id (u32).
fn create_signal_callback(
    scope: &mut v8::HandleScope,
    args: v8::FunctionCallbackArguments,
    mut rv: v8::ReturnValue,
) {
    let value = args.get(0);
    let hmr_key = {
        let arg1 = args.get(1);
        if arg1.is_undefined() || arg1.is_null() {
            None
        } else {
            Some(arg1.to_rust_string_lossy(scope))
        }
    };
    let Some(id) = with_graph(|graph| graph.create_signal(scope, value, hmr_key)) else {
        throw_signal_error(scope, GRAPH_NOT_INIT);
        return;
    };
    rv.set(v8::Integer::new_from_unsigned(scope, id).into());
}

/// Read a signal or computed value. Args: (id). Returns: value.
/// Handles computed evaluation with reentrant-safe borrow management.
fn read_signal_callback(
    scope: &mut v8::HandleScope,
    args: v8::FunctionCallbackArguments,
    mut rv: v8::ReturnValue,
) {
    let id = args.get(0).uint32_value(scope).unwrap_or(0);

    // Try a quick read first (handles signals and clean computeds)
    let Some(outcome) = with_graph(|graph| graph.try_read(scope, id)) else {
        throw_signal_error(scope, GRAPH_NOT_INIT);
        return;
    };

    match outcome {
        Ok(ReadOutcome::Ready(val)) => {
            rv.set(val);
        }
        Ok(ReadOutcome::NeedsEval) => {
            // Dirty computed — evaluate with reentrant-safe split methods
            let Some(prep) = with_graph(|graph| graph.begin_evaluate_computed(id)) else {
                throw_signal_error(scope, GRAPH_NOT_INIT);
                return;
            };
            match prep {
                Ok(prep) => {
                    // Call V8 compute function (no graph borrow held!)
                    let fn_local = v8::Local::new(scope, &prep.compute_fn);
                    let undefined = v8::undefined(scope).into();
                    let new_value = fn_local
                        .call(scope, undefined, &[])
                        .unwrap_or_else(|| v8::undefined(scope).into());

                    // Complete evaluation (reacquire borrow)
                    if let Some(Err(e)) = with_graph(|graph| {
                        graph
                            .complete_evaluate_computed(scope, id, new_value, prep)
                            .map(|val| rv.set(val))
                    }) {
                        throw_signal_error(scope, &e.to_string());
                    }
                }
                Err(e) => throw_signal_error(scope, &e.to_string()),
            }
        }
        Err(e) => throw_signal_error(scope, &e.to_string()),
    }
}

/// Write a signal value. Args: (id, value).
/// Auto-batches: if no explicit batch is active, flushes effects after write.
fn write_signal_callback(
    scope: &mut v8::HandleScope,
    args: v8::FunctionCallbackArguments,
    _rv: v8::ReturnValue,
) {
    let id = args.get(0).uint32_value(scope).unwrap_or(0);
    let value = args.get(1);

    let Some(result) = with_graph(|graph| {
        let changed = graph.write_signal_no_flush(scope, id, value)?;
        let should_flush = changed && graph.batch_depth == 0;
        if should_flush {
            graph.batch_start(); // Prevent nested auto-flush during effect execution
        }
        Ok::<_, crate::runtime::signal_graph::SignalGraphError>((changed, should_flush))
    }) else {
        throw_signal_error(scope, GRAPH_NOT_INIT);
        return;
    };

    match result {
        Ok((_changed, should_flush)) => {
            if should_flush {
                flush_pending_effects(scope);
                with_graph(|graph| graph.batch_end_no_flush());
            }
        }
        Err(e) => throw_signal_error(scope, &e.to_string()),
    }
}

/// Create a computed node. Args: (computeFn). Returns: id (u32).
fn create_computed_callback(
    scope: &mut v8::HandleScope,
    args: v8::FunctionCallbackArguments,
    mut rv: v8::ReturnValue,
) {
    let compute_fn: v8::Local<v8::Function> = args.get(0).try_into().unwrap();
    let Some(id) = with_graph(|graph| graph.create_computed(scope, compute_fn)) else {
        throw_signal_error(scope, GRAPH_NOT_INIT);
        return;
    };
    rv.set(v8::Integer::new_from_unsigned(scope, id).into());
}

/// Create an effect node. Args: (effectFn). Returns: id (u32).
/// Runs the effect immediately to capture initial dependencies.
fn create_effect_callback(
    scope: &mut v8::HandleScope,
    args: v8::FunctionCallbackArguments,
    mut rv: v8::ReturnValue,
) {
    let effect_fn: v8::Local<v8::Function> = args.get(0).try_into().unwrap();

    // Allocate node (no V8 call)
    let Some(id) = with_graph(|graph| graph.alloc_effect(scope, effect_fn)) else {
        throw_signal_error(scope, GRAPH_NOT_INIT);
        return;
    };

    // Run effect immediately with reentrant-safe split
    run_effect_reentrant(scope, id);

    rv.set(v8::Integer::new_from_unsigned(scope, id).into());
}

/// Begin an explicit batch. Args: none.
fn batch_start_callback(
    _scope: &mut v8::HandleScope,
    _args: v8::FunctionCallbackArguments,
    _rv: v8::ReturnValue,
) {
    with_graph(|graph| graph.batch_start());
}

/// End an explicit batch. Args: none. Flushes effects if outermost batch.
fn batch_end_callback(
    scope: &mut v8::HandleScope,
    _args: v8::FunctionCallbackArguments,
    _rv: v8::ReturnValue,
) {
    let should_flush = with_graph(|graph| {
        graph.batch_end_no_flush();
        graph.batch_depth == 0 && graph.has_pending_effects()
    })
    .unwrap_or(false);

    if should_flush {
        flush_pending_effects(scope);
    }
}

/// Dispose a node. Args: (id).
fn dispose_node_callback(
    scope: &mut v8::HandleScope,
    args: v8::FunctionCallbackArguments,
    _rv: v8::ReturnValue,
) {
    let id = args.get(0).uint32_value(scope).unwrap_or(0);
    with_graph(|graph| graph.dispose(id));
}

/// Dispose an effect node. Args: (id).
fn dispose_effect_callback(
    scope: &mut v8::HandleScope,
    args: v8::FunctionCallbackArguments,
    _rv: v8::ReturnValue,
) {
    let id = args.get(0).uint32_value(scope).unwrap_or(0);
    with_graph(|graph| graph.dispose_effect(id));
}

/// Sentinel ID returned for SSR effects that don't allocate graph nodes.
const SSR_SENTINEL_ID: u32 = u32::MAX;

/// Create a domEffect. Args: (effectFn, isSSR).
/// In SSR: execute once synchronously without tracking, no graph allocation.
/// In CSR: create a normal effect with dependency tracking.
fn dom_effect_create_callback(
    scope: &mut v8::HandleScope,
    args: v8::FunctionCallbackArguments,
    mut rv: v8::ReturnValue,
) {
    let effect_fn: v8::Local<v8::Function> = args.get(0).try_into().unwrap();
    let is_ssr = args.get(1).boolean_value(scope);

    if is_ssr {
        // SSR: execute once without tracking, no graph allocation
        let undefined = v8::undefined(scope).into();
        let _ = effect_fn.call(scope, undefined, &[]);
        rv.set(v8::Integer::new_from_unsigned(scope, SSR_SENTINEL_ID).into());
        return;
    }

    // CSR: normal effect creation with tracking
    let Some(id) = with_graph(|graph| graph.alloc_effect(scope, effect_fn)) else {
        throw_signal_error(scope, GRAPH_NOT_INIT);
        return;
    };
    run_effect_reentrant(scope, id);
    rv.set(v8::Integer::new_from_unsigned(scope, id).into());
}

/// Create a lifecycleEffect. Args: (effectFn, isSSR).
/// In SSR: complete no-op (don't even execute the callback).
/// In CSR: create a normal effect with dependency tracking.
fn lifecycle_effect_create_callback(
    scope: &mut v8::HandleScope,
    args: v8::FunctionCallbackArguments,
    mut rv: v8::ReturnValue,
) {
    let is_ssr = args.get(1).boolean_value(scope);

    if is_ssr {
        // SSR: complete no-op
        rv.set(v8::Integer::new_from_unsigned(scope, SSR_SENTINEL_ID).into());
        return;
    }

    // CSR: normal effect creation with tracking
    let effect_fn: v8::Local<v8::Function> = args.get(0).try_into().unwrap();
    let Some(id) = with_graph(|graph| graph.alloc_effect(scope, effect_fn)) else {
        throw_signal_error(scope, GRAPH_NOT_INIT);
        return;
    };
    run_effect_reentrant(scope, id);
    rv.set(v8::Integer::new_from_unsigned(scope, id).into());
}

/// Create a deferredDomEffect. Args: (effectFn, isSSR).
/// In SSR: same as domEffect (execute once without tracking).
/// In CSR: create a normal effect with dependency tracking.
fn deferred_dom_effect_create_callback(
    scope: &mut v8::HandleScope,
    args: v8::FunctionCallbackArguments,
    rv: v8::ReturnValue,
) {
    // Same behavior as domEffect for both SSR and CSR
    dom_effect_create_callback(scope, args, rv);
}

// ── Reentrant-safe helpers ──

/// Run a single effect with reentrant-safe borrow management.
fn run_effect_reentrant(scope: &mut v8::HandleScope, id: u32) {
    // with_graph returns Option<Option<EffectRunPrep>> — flatten both layers
    let prep = with_graph(|graph| graph.begin_run_effect(id)).flatten();

    if let Some(prep) = prep {
        // Call V8 effect function (no graph borrow held!)
        let fn_local = v8::Local::new(scope, &prep.effect_fn);
        let undefined = v8::undefined(scope).into();
        let _ = fn_local.call(scope, undefined, &[]);

        // Complete effect (reacquire borrow)
        with_graph(|graph| graph.complete_run_effect(prep));
    }
}

/// Flush all pending effects with reentrant-safe borrow management.
/// Loop handles effect-triggers-effect chains.
fn flush_pending_effects(scope: &mut v8::HandleScope) {
    loop {
        // with_graph returns Option<Option<Vec<u32>>> — flatten both layers
        let effects = with_graph(|graph| {
            if !graph.has_pending_effects() {
                return None;
            }
            Some(graph.drain_pending_effects())
        })
        .flatten();

        let Some(effects) = effects else { break };

        for effect_id in effects {
            run_effect_reentrant(scope, effect_id);
        }
    }
}

// ── Registration ──

/// Helper to set a V8 function on an object.
fn set_fn(
    scope: &mut v8::HandleScope,
    obj: v8::Local<v8::Object>,
    name: &str,
    callback: impl v8::MapFnTo<v8::FunctionCallback>,
) {
    let key = v8::String::new(scope, name).unwrap();
    let func = v8::Function::new(scope, callback).unwrap();
    obj.set(scope, key.into(), func.into());
}

/// Register signal ops as V8 native functions on `globalThis.__VERTZ_SIGNAL_OPS__`.
pub fn register_signal_ops(runtime: &mut deno_core::JsRuntime) {
    let context = runtime.main_context();
    let scope = &mut runtime.handle_scope();
    let context_local = v8::Local::new(scope, context);
    let global = context_local.global(scope);

    // Create the __VERTZ_SIGNAL_OPS__ namespace object
    let ops_obj = v8::Object::new(scope);

    set_fn(scope, ops_obj, "init", init_callback);
    set_fn(scope, ops_obj, "dispose", dispose_callback);
    set_fn(scope, ops_obj, "createSignal", create_signal_callback);
    set_fn(scope, ops_obj, "readSignal", read_signal_callback);
    set_fn(scope, ops_obj, "writeSignal", write_signal_callback);
    set_fn(scope, ops_obj, "createComputed", create_computed_callback);
    set_fn(scope, ops_obj, "createEffect", create_effect_callback);
    set_fn(scope, ops_obj, "batchStart", batch_start_callback);
    set_fn(scope, ops_obj, "batchEnd", batch_end_callback);
    set_fn(scope, ops_obj, "disposeNode", dispose_node_callback);
    set_fn(scope, ops_obj, "disposeEffect", dispose_effect_callback);
    set_fn(
        scope,
        ops_obj,
        "domEffectCreate",
        dom_effect_create_callback,
    );
    set_fn(
        scope,
        ops_obj,
        "lifecycleEffectCreate",
        lifecycle_effect_create_callback,
    );
    set_fn(
        scope,
        ops_obj,
        "deferredDomEffectCreate",
        deferred_dom_effect_create_callback,
    );

    let ops_key = v8::String::new(scope, "__VERTZ_SIGNAL_OPS__").unwrap();
    global.set(scope, ops_key.into(), ops_obj.into());

    // Set flag for detection
    let flag_key = v8::String::new(scope, "__VERTZ_NATIVE_SIGNALS__").unwrap();
    let flag_val = v8::Boolean::new(scope, true);
    global.set(scope, flag_key.into(), flag_val.into());
}

/// No deno_core ops — signal ops are registered as V8 native functions.
pub fn op_decls() -> Vec<OpDecl> {
    vec![]
}

/// No bootstrap JS — registration is done via `register_signal_ops`.
pub const SIGNALS_BOOTSTRAP_JS: &str = "";

#[cfg(test)]
mod tests {
    use crate::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

    fn create_runtime() -> VertzJsRuntime {
        VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap()
    }

    #[test]
    fn ops_object_exists_on_global() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script("<test>", "typeof globalThis.__VERTZ_SIGNAL_OPS__")
            .unwrap();
        assert_eq!(result, serde_json::json!("object"));
    }

    #[test]
    fn native_signals_flag_is_set() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script("<test>", "globalThis.__VERTZ_NATIVE_SIGNALS__")
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn init_and_dispose_lifecycle() {
        let mut rt = create_runtime();
        // init should not throw
        rt.execute_script_void("<test>", "__VERTZ_SIGNAL_OPS__.init()")
            .unwrap();
        // dispose should not throw
        rt.execute_script_void("<test>", "__VERTZ_SIGNAL_OPS__.dispose()")
            .unwrap();
    }

    #[test]
    fn create_signal_returns_id() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                __VERTZ_SIGNAL_OPS__.init();
                const id = __VERTZ_SIGNAL_OPS__.createSignal(42);
                typeof id === 'number' && id >= 0;
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn read_signal_returns_value() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                __VERTZ_SIGNAL_OPS__.init();
                const id = __VERTZ_SIGNAL_OPS__.createSignal(42);
                __VERTZ_SIGNAL_OPS__.readSignal(id);
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(42));
    }

    #[test]
    fn write_signal_updates_value() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                __VERTZ_SIGNAL_OPS__.init();
                const id = __VERTZ_SIGNAL_OPS__.createSignal(1);
                __VERTZ_SIGNAL_OPS__.writeSignal(id, 99);
                __VERTZ_SIGNAL_OPS__.readSignal(id);
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(99));
    }

    #[test]
    fn computed_evaluates_lazily() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                __VERTZ_SIGNAL_OPS__.init();
                const a = __VERTZ_SIGNAL_OPS__.createSignal(10);
                const b = __VERTZ_SIGNAL_OPS__.createComputed(() => {
                    return __VERTZ_SIGNAL_OPS__.readSignal(a) * 2;
                });
                __VERTZ_SIGNAL_OPS__.readSignal(b);
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(20));
    }

    #[test]
    fn computed_re_evaluates_on_dependency_change() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                __VERTZ_SIGNAL_OPS__.init();
                const a = __VERTZ_SIGNAL_OPS__.createSignal(5);
                const b = __VERTZ_SIGNAL_OPS__.createComputed(() => {
                    return __VERTZ_SIGNAL_OPS__.readSignal(a) + 1;
                });
                // First read triggers evaluation
                const v1 = __VERTZ_SIGNAL_OPS__.readSignal(b);
                // Write signal — computed becomes dirty
                __VERTZ_SIGNAL_OPS__.writeSignal(a, 10);
                // Second read triggers re-evaluation
                const v2 = __VERTZ_SIGNAL_OPS__.readSignal(b);
                [v1, v2];
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!([6, 11]));
    }

    #[test]
    fn effect_runs_on_creation() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                __VERTZ_SIGNAL_OPS__.init();
                globalThis.effectCount = 0;
                const a = __VERTZ_SIGNAL_OPS__.createSignal(1);
                __VERTZ_SIGNAL_OPS__.createEffect(() => {
                    __VERTZ_SIGNAL_OPS__.readSignal(a);
                    globalThis.effectCount++;
                });
                globalThis.effectCount;
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(1));
    }

    #[test]
    fn effect_re_runs_on_dependency_change() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                __VERTZ_SIGNAL_OPS__.init();
                globalThis.effectCount = 0;
                const a = __VERTZ_SIGNAL_OPS__.createSignal(1);
                __VERTZ_SIGNAL_OPS__.createEffect(() => {
                    __VERTZ_SIGNAL_OPS__.readSignal(a);
                    globalThis.effectCount++;
                });
                __VERTZ_SIGNAL_OPS__.writeSignal(a, 2);
                globalThis.effectCount;
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(2));
    }

    #[test]
    fn batch_groups_writes() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                __VERTZ_SIGNAL_OPS__.init();
                globalThis.effectCount = 0;
                const a = __VERTZ_SIGNAL_OPS__.createSignal(1);
                const b = __VERTZ_SIGNAL_OPS__.createSignal(2);
                __VERTZ_SIGNAL_OPS__.createEffect(() => {
                    __VERTZ_SIGNAL_OPS__.readSignal(a);
                    __VERTZ_SIGNAL_OPS__.readSignal(b);
                    globalThis.effectCount++;
                });
                // effectCount is 1 after creation
                __VERTZ_SIGNAL_OPS__.batchStart();
                __VERTZ_SIGNAL_OPS__.writeSignal(a, 10);
                __VERTZ_SIGNAL_OPS__.writeSignal(b, 20);
                __VERTZ_SIGNAL_OPS__.batchEnd();
                // Effect should have run once more (not twice)
                globalThis.effectCount;
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(2));
    }

    #[test]
    fn dispose_prevents_reads() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                __VERTZ_SIGNAL_OPS__.init();
                const id = __VERTZ_SIGNAL_OPS__.createSignal(42);
                __VERTZ_SIGNAL_OPS__.disposeNode(id);
                try {
                    __VERTZ_SIGNAL_OPS__.readSignal(id);
                    false;
                } catch (e) {
                    e.message.includes('disposed');
                }
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn diamond_dependency_computed_evaluates_once() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                __VERTZ_SIGNAL_OPS__.init();
                globalThis.evalCount = 0;
                const a = __VERTZ_SIGNAL_OPS__.createSignal(1);
                const b = __VERTZ_SIGNAL_OPS__.createComputed(() => {
                    return __VERTZ_SIGNAL_OPS__.readSignal(a) + 1;
                });
                const c = __VERTZ_SIGNAL_OPS__.createComputed(() => {
                    return __VERTZ_SIGNAL_OPS__.readSignal(a) * 2;
                });
                const d = __VERTZ_SIGNAL_OPS__.createComputed(() => {
                    globalThis.evalCount++;
                    return __VERTZ_SIGNAL_OPS__.readSignal(b) + __VERTZ_SIGNAL_OPS__.readSignal(c);
                });
                // Initial read
                const v1 = __VERTZ_SIGNAL_OPS__.readSignal(d);
                const initialEvals = globalThis.evalCount;
                // Change source
                globalThis.evalCount = 0;
                __VERTZ_SIGNAL_OPS__.writeSignal(a, 5);
                const v2 = __VERTZ_SIGNAL_OPS__.readSignal(d);
                [v1, v2, initialEvals, globalThis.evalCount];
                "#,
            )
            .unwrap();
        // v1 = (1+1) + (1*2) = 4
        // v2 = (5+1) + (5*2) = 16
        // d should evaluate once on each read
        assert_eq!(result, serde_json::json!([4, 16, 1, 1]));
    }

    // ── SSR-specific behavior tests ──

    #[test]
    fn ssr_dom_effect_executes_once_no_tracking() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                __VERTZ_SIGNAL_OPS__.init();
                globalThis.callCount = 0;
                const a = __VERTZ_SIGNAL_OPS__.createSignal(1);
                const id = __VERTZ_SIGNAL_OPS__.domEffectCreate(() => {
                    __VERTZ_SIGNAL_OPS__.readSignal(a);
                    globalThis.callCount++;
                }, true); // isSSR = true
                // Callback should have run once
                const ran = globalThis.callCount;
                // Should return sentinel ID (u32::MAX = 4294967295)
                const isSentinel = id === 4294967295;
                // Changing the signal should NOT re-trigger the effect
                __VERTZ_SIGNAL_OPS__.writeSignal(a, 2);
                const afterWrite = globalThis.callCount;
                [ran, isSentinel, afterWrite];
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!([1, true, 1]));
    }

    #[test]
    fn ssr_lifecycle_effect_is_noop() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                __VERTZ_SIGNAL_OPS__.init();
                globalThis.callCount = 0;
                const id = __VERTZ_SIGNAL_OPS__.lifecycleEffectCreate(() => {
                    globalThis.callCount++;
                }, true); // isSSR = true
                // Callback should NOT have run
                const ran = globalThis.callCount;
                // Should return sentinel ID
                const isSentinel = id === 4294967295;
                [ran, isSentinel];
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!([0, true]));
    }

    #[test]
    fn ssr_deferred_dom_effect_executes_once() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                __VERTZ_SIGNAL_OPS__.init();
                globalThis.callCount = 0;
                const id = __VERTZ_SIGNAL_OPS__.deferredDomEffectCreate(() => {
                    globalThis.callCount++;
                }, true); // isSSR = true
                const ran = globalThis.callCount;
                const isSentinel = id === 4294967295;
                [ran, isSentinel];
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!([1, true]));
    }

    #[test]
    fn ssr_dom_effect_100_effects_zero_nodes() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                __VERTZ_SIGNAL_OPS__.init();
                globalThis.totalCalls = 0;
                const a = __VERTZ_SIGNAL_OPS__.createSignal(1);
                // Create 100 SSR domEffects
                for (let i = 0; i < 100; i++) {
                    __VERTZ_SIGNAL_OPS__.domEffectCreate(() => {
                        __VERTZ_SIGNAL_OPS__.readSignal(a);
                        globalThis.totalCalls++;
                    }, true);
                }
                // All 100 should have executed
                const allRan = globalThis.totalCalls;
                // Changing signal should NOT trigger any re-runs
                __VERTZ_SIGNAL_OPS__.writeSignal(a, 2);
                const afterWrite = globalThis.totalCalls;
                [allRan, afterWrite];
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!([100, 100]));
    }

    #[test]
    fn csr_dom_effect_creates_tracked_effect() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                __VERTZ_SIGNAL_OPS__.init();
                globalThis.callCount = 0;
                const a = __VERTZ_SIGNAL_OPS__.createSignal(1);
                const id = __VERTZ_SIGNAL_OPS__.domEffectCreate(() => {
                    __VERTZ_SIGNAL_OPS__.readSignal(a);
                    globalThis.callCount++;
                }, false); // isSSR = false
                // Should have run once on creation
                const ran = globalThis.callCount;
                // Should NOT be sentinel
                const isNotSentinel = id !== 4294967295;
                // Changing signal SHOULD trigger re-run
                __VERTZ_SIGNAL_OPS__.writeSignal(a, 2);
                const afterWrite = globalThis.callCount;
                [ran, isNotSentinel, afterWrite];
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!([1, true, 2]));
    }

    #[test]
    fn graph_dispose_cleans_up_all_nodes() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                __VERTZ_SIGNAL_OPS__.init();
                // Create a bunch of nodes
                const a = __VERTZ_SIGNAL_OPS__.createSignal(1);
                const b = __VERTZ_SIGNAL_OPS__.createSignal(2);
                const c = __VERTZ_SIGNAL_OPS__.createComputed(() => {
                    return __VERTZ_SIGNAL_OPS__.readSignal(a) + __VERTZ_SIGNAL_OPS__.readSignal(b);
                });
                __VERTZ_SIGNAL_OPS__.createEffect(() => {
                    __VERTZ_SIGNAL_OPS__.readSignal(c);
                });
                // Dispose entire graph
                __VERTZ_SIGNAL_OPS__.dispose();
                // After dispose, reading should fail (graph not initialized)
                try {
                    __VERTZ_SIGNAL_OPS__.readSignal(a);
                    false;
                } catch (e) {
                    e.message.includes('not initialized');
                }
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    // ── Parity tests (matching signal.test.ts behaviors) ──

    #[test]
    fn same_value_write_is_noop() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                __VERTZ_SIGNAL_OPS__.init();
                globalThis.effectCount = 0;
                const a = __VERTZ_SIGNAL_OPS__.createSignal(42);
                __VERTZ_SIGNAL_OPS__.createEffect(() => {
                    __VERTZ_SIGNAL_OPS__.readSignal(a);
                    globalThis.effectCount++;
                });
                // effectCount = 1 from creation
                __VERTZ_SIGNAL_OPS__.writeSignal(a, 42); // same value
                globalThis.effectCount;
                "#,
            )
            .unwrap();
        // Effect should NOT re-run for same value (Object.is semantics)
        assert_eq!(result, serde_json::json!(1));
    }

    #[test]
    fn computed_chains_transitively() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                __VERTZ_SIGNAL_OPS__.init();
                const a = __VERTZ_SIGNAL_OPS__.createSignal(1);
                const b = __VERTZ_SIGNAL_OPS__.createComputed(() => __VERTZ_SIGNAL_OPS__.readSignal(a) + 1);
                const c = __VERTZ_SIGNAL_OPS__.createComputed(() => __VERTZ_SIGNAL_OPS__.readSignal(b) * 10);
                const v1 = __VERTZ_SIGNAL_OPS__.readSignal(c);
                __VERTZ_SIGNAL_OPS__.writeSignal(a, 5);
                const v2 = __VERTZ_SIGNAL_OPS__.readSignal(c);
                [v1, v2];
                "#,
            )
            .unwrap();
        // v1 = (1+1)*10 = 20, v2 = (5+1)*10 = 60
        assert_eq!(result, serde_json::json!([20, 60]));
    }

    #[test]
    fn stale_subscription_cleanup_on_conditional_branch() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                __VERTZ_SIGNAL_OPS__.init();
                globalThis.effectCount = 0;
                const flag = __VERTZ_SIGNAL_OPS__.createSignal(true);
                const a = __VERTZ_SIGNAL_OPS__.createSignal(1);
                const b = __VERTZ_SIGNAL_OPS__.createSignal(2);
                __VERTZ_SIGNAL_OPS__.createEffect(() => {
                    globalThis.effectCount++;
                    if (__VERTZ_SIGNAL_OPS__.readSignal(flag)) {
                        __VERTZ_SIGNAL_OPS__.readSignal(a);
                    } else {
                        __VERTZ_SIGNAL_OPS__.readSignal(b);
                    }
                });
                // effectCount = 1, effect depends on [flag, a]

                // Switch branch: now depends on [flag, b], NOT a
                __VERTZ_SIGNAL_OPS__.writeSignal(flag, false);
                // effectCount = 2

                // Writing a should NOT trigger the effect (stale dep)
                __VERTZ_SIGNAL_OPS__.writeSignal(a, 99);
                const afterStaleWrite = globalThis.effectCount;

                // Writing b SHOULD trigger (active dep)
                __VERTZ_SIGNAL_OPS__.writeSignal(b, 99);
                const afterActiveWrite = globalThis.effectCount;

                [afterStaleWrite, afterActiveWrite];
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!([2, 3]));
    }

    #[test]
    fn nested_batches_only_outermost_flushes() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                __VERTZ_SIGNAL_OPS__.init();
                globalThis.effectCount = 0;
                const a = __VERTZ_SIGNAL_OPS__.createSignal(1);
                __VERTZ_SIGNAL_OPS__.createEffect(() => {
                    __VERTZ_SIGNAL_OPS__.readSignal(a);
                    globalThis.effectCount++;
                });
                // effectCount = 1
                __VERTZ_SIGNAL_OPS__.batchStart();
                __VERTZ_SIGNAL_OPS__.writeSignal(a, 2);
                __VERTZ_SIGNAL_OPS__.batchStart(); // nested
                __VERTZ_SIGNAL_OPS__.writeSignal(a, 3);
                __VERTZ_SIGNAL_OPS__.batchEnd(); // inner end — should NOT flush
                const midBatch = globalThis.effectCount;
                __VERTZ_SIGNAL_OPS__.batchEnd(); // outer end — NOW flush
                const afterBatch = globalThis.effectCount;
                [midBatch, afterBatch];
                "#,
            )
            .unwrap();
        // During nested batch, no flush; after outermost end, flush once
        assert_eq!(result, serde_json::json!([1, 2]));
    }

    #[test]
    fn effect_triggers_effect_chain() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                __VERTZ_SIGNAL_OPS__.init();
                const a = __VERTZ_SIGNAL_OPS__.createSignal(1);
                const b = __VERTZ_SIGNAL_OPS__.createSignal(0);
                globalThis.bVal = 0;

                // Effect 1: when a changes, write b
                __VERTZ_SIGNAL_OPS__.createEffect(() => {
                    const val = __VERTZ_SIGNAL_OPS__.readSignal(a);
                    __VERTZ_SIGNAL_OPS__.writeSignal(b, val * 10);
                });

                // Effect 2: when b changes, store value
                __VERTZ_SIGNAL_OPS__.createEffect(() => {
                    globalThis.bVal = __VERTZ_SIGNAL_OPS__.readSignal(b);
                });

                __VERTZ_SIGNAL_OPS__.writeSignal(a, 5);
                globalThis.bVal;
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(50));
    }

    #[test]
    fn dispose_effect_stops_re_running() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                __VERTZ_SIGNAL_OPS__.init();
                globalThis.effectCount = 0;
                const a = __VERTZ_SIGNAL_OPS__.createSignal(1);
                const effectId = __VERTZ_SIGNAL_OPS__.createEffect(() => {
                    __VERTZ_SIGNAL_OPS__.readSignal(a);
                    globalThis.effectCount++;
                });
                // effectCount = 1
                __VERTZ_SIGNAL_OPS__.disposeEffect(effectId);
                __VERTZ_SIGNAL_OPS__.writeSignal(a, 2);
                // Effect should NOT have re-run
                globalThis.effectCount;
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(1));
    }

    #[test]
    fn effect_with_computed_dependency() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                __VERTZ_SIGNAL_OPS__.init();
                globalThis.lastSeen = null;
                const a = __VERTZ_SIGNAL_OPS__.createSignal(3);
                const doubled = __VERTZ_SIGNAL_OPS__.createComputed(() => {
                    return __VERTZ_SIGNAL_OPS__.readSignal(a) * 2;
                });
                __VERTZ_SIGNAL_OPS__.createEffect(() => {
                    globalThis.lastSeen = __VERTZ_SIGNAL_OPS__.readSignal(doubled);
                });
                const after_create = globalThis.lastSeen;
                __VERTZ_SIGNAL_OPS__.writeSignal(a, 7);
                const after_write = globalThis.lastSeen;
                [after_create, after_write];
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!([6, 14]));
    }

    #[test]
    fn dispose_slot_reuse_does_not_corrupt_unrelated_node() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                __VERTZ_SIGNAL_OPS__.init();
                globalThis.effectCount = 0;

                // Create signal A (gets id=0) and a computed B depending on A
                const a = __VERTZ_SIGNAL_OPS__.createSignal(10);
                const b = __VERTZ_SIGNAL_OPS__.createComputed(() => {
                    return __VERTZ_SIGNAL_OPS__.readSignal(a) * 2;
                });
                // Read b to establish dependency a -> b
                __VERTZ_SIGNAL_OPS__.readSignal(b);

                // Dispose A — slot 0 freed. B's sources should be cleaned.
                __VERTZ_SIGNAL_OPS__.disposeNode(a);

                // Create signal C — should reuse slot 0
                const c = __VERTZ_SIGNAL_OPS__.createSignal(99);

                // Create an effect depending on C
                __VERTZ_SIGNAL_OPS__.createEffect(() => {
                    __VERTZ_SIGNAL_OPS__.readSignal(c);
                    globalThis.effectCount++;
                });
                // effectCount = 1

                // Write C — effect should re-run
                __VERTZ_SIGNAL_OPS__.writeSignal(c, 100);
                const afterWrite = globalThis.effectCount;

                // B's stale source should NOT have corrupted C's subscriber list
                // The effect on C should still work correctly
                __VERTZ_SIGNAL_OPS__.writeSignal(c, 200);
                const afterSecondWrite = globalThis.effectCount;

                [afterWrite, afterSecondWrite];
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!([2, 3]));
    }
}
