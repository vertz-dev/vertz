use super::*;
use crate::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

/// Helper: create a minimal V8 runtime for signal graph tests.
fn create_test_runtime() -> VertzJsRuntime {
    VertzJsRuntime::new(VertzRuntimeOptions {
        capture_output: true,
        ..Default::default()
    })
    .unwrap()
}

// --- Signal tests (Task 1) ---

#[test]
fn create_signal_returns_sequential_ids() {
    let mut rt = create_test_runtime();
    let scope = &mut rt.inner_mut().handle_scope();
    let mut graph = SignalGraph::new();

    let val1 = v8::Integer::new(scope, 42).into();
    let val2 = v8::Integer::new(scope, 99).into();

    let id1 = graph.create_signal(scope, val1, None);
    let id2 = graph.create_signal(scope, val2, None);

    assert_eq!(id1, 0);
    assert_eq!(id2, 1);
    assert_eq!(graph.live_node_count(), 2);
}

#[test]
fn read_signal_returns_stored_value() {
    let mut rt = create_test_runtime();
    let scope = &mut rt.inner_mut().handle_scope();
    let mut graph = SignalGraph::new();

    let val = v8::Integer::new(scope, 42).into();
    let id = graph.create_signal(scope, val, None);

    let result = graph.read_signal(scope, id).unwrap();
    assert!(result.is_int32());
    assert_eq!(result.int32_value(scope).unwrap(), 42);
}

#[test]
fn read_signal_adds_dependency_when_tracking() {
    let mut rt = create_test_runtime();
    let scope = &mut rt.inner_mut().handle_scope();
    let mut graph = SignalGraph::new();

    let val = v8::Integer::new(scope, 10).into();
    let signal_id = graph.create_signal(scope, val, None);

    // Simulate a subscriber tracking context
    graph.tracking_subscriber = Some(99);
    let _ = graph.read_signal(scope, signal_id).unwrap();
    graph.tracking_subscriber = None;

    // Verify the subscriber was added
    if let SignalNode::Signal { subscribers, .. } = &graph.nodes[signal_id as usize] {
        assert!(subscribers.contains(&99));
    } else {
        panic!("expected Signal node");
    }
}

#[test]
fn read_signal_does_not_duplicate_subscriber() {
    let mut rt = create_test_runtime();
    let scope = &mut rt.inner_mut().handle_scope();
    let mut graph = SignalGraph::new();

    let val = v8::Integer::new(scope, 10).into();
    let signal_id = graph.create_signal(scope, val, None);

    // Read twice with same subscriber
    graph.tracking_subscriber = Some(99);
    let _ = graph.read_signal(scope, signal_id).unwrap();
    let _ = graph.read_signal(scope, signal_id).unwrap();
    graph.tracking_subscriber = None;

    if let SignalNode::Signal { subscribers, .. } = &graph.nodes[signal_id as usize] {
        assert_eq!(subscribers.len(), 1);
    } else {
        panic!("expected Signal node");
    }
}

#[test]
fn write_signal_updates_value() {
    let mut rt = create_test_runtime();
    let scope = &mut rt.inner_mut().handle_scope();
    let mut graph = SignalGraph::new();

    let val = v8::Integer::new(scope, 1).into();
    let id = graph.create_signal(scope, val, None);

    let new_val = v8::Integer::new(scope, 2).into();
    graph.write_signal(scope, id, new_val).unwrap();

    let result = graph.read_signal(scope, id).unwrap();
    assert_eq!(result.int32_value(scope).unwrap(), 2);
}

#[test]
fn write_signal_same_value_is_noop() {
    let mut rt = create_test_runtime();
    let scope = &mut rt.inner_mut().handle_scope();
    let mut graph = SignalGraph::new();

    let val = v8::Integer::new(scope, 42).into();
    let id = graph.create_signal(scope, val, None);

    // Write same value — should be a no-op (Object.is semantics)
    let same_val = v8::Integer::new(scope, 42).into();
    graph.write_signal(scope, id, same_val).unwrap();

    let result = graph.read_signal(scope, id).unwrap();
    assert_eq!(result.int32_value(scope).unwrap(), 42);
}

#[test]
fn dispose_drops_node_and_reuses_slot() {
    let mut rt = create_test_runtime();
    let scope = &mut rt.inner_mut().handle_scope();
    let mut graph = SignalGraph::new();

    let val1 = v8::Integer::new(scope, 1).into();
    let val2 = v8::Integer::new(scope, 2).into();
    let id1 = graph.create_signal(scope, val1, None);
    let _ = graph.create_signal(scope, val2, None);

    assert_eq!(graph.live_node_count(), 2);

    // Dispose first node
    graph.dispose(id1);
    assert_eq!(graph.live_node_count(), 1);

    // New signal should reuse slot 0
    let val3 = v8::Integer::new(scope, 3).into();
    let id3 = graph.create_signal(scope, val3, None);
    assert_eq!(id3, id1); // Reused slot
    assert_eq!(graph.live_node_count(), 2);
}

#[test]
fn drop_impl_disposes_all_nodes() {
    let mut rt = create_test_runtime();
    let scope = &mut rt.inner_mut().handle_scope();

    {
        let mut graph = SignalGraph::new();
        let val = v8::Integer::new(scope, 1).into();
        graph.create_signal(scope, val, None);
        // graph drops here — Drop calls dispose_all()
    }
    // No panic = V8 Global handles were properly released
}

#[test]
fn invalid_id_returns_error() {
    let mut rt = create_test_runtime();
    let scope = &mut rt.inner_mut().handle_scope();
    let graph = &mut SignalGraph::new();

    let result = graph.read_signal(scope, 999);
    assert!(result.is_err());
    assert!(matches!(
        result.unwrap_err(),
        SignalGraphError::InvalidId(999)
    ));
}

#[test]
fn disposed_node_returns_error() {
    let mut rt = create_test_runtime();
    let scope = &mut rt.inner_mut().handle_scope();
    let mut graph = SignalGraph::new();

    let val = v8::Integer::new(scope, 1).into();
    let id = graph.create_signal(scope, val, None);
    graph.dispose(id);

    let result = graph.read_signal(scope, id);
    assert!(result.is_err());
    assert!(matches!(
        result.unwrap_err(),
        SignalGraphError::NodeDisposed { .. }
    ));
}

#[test]
fn error_includes_hmr_key() {
    let mut rt = create_test_runtime();
    let scope = &mut rt.inner_mut().handle_scope();
    let mut graph = SignalGraph::new();

    let val = v8::Integer::new(scope, 1).into();
    let id = graph.create_signal(scope, val, Some("counter".to_string()));
    graph.dispose(id);

    let err = graph.read_signal(scope, id).unwrap_err();
    let msg = err.to_string();
    assert!(
        msg.contains("counter"),
        "error should contain hmr_key: {}",
        msg
    );
}

// --- Computed tests (Task 2) ---

/// Helper: create a JS function from source code.
fn create_js_fn<'s>(scope: &mut v8::HandleScope<'s>, body: &str) -> v8::Local<'s, v8::Function> {
    let source = v8::String::new(scope, &format!("(function() {{ {} }})", body)).unwrap();
    let script = v8::Script::compile(scope, source, None).unwrap();
    let result = script.run(scope).unwrap();
    v8::Local::<v8::Function>::try_from(result).unwrap()
}

#[test]
fn computed_evaluates_on_first_read() {
    let mut rt = create_test_runtime();
    let scope = &mut rt.inner_mut().handle_scope();
    let mut graph = SignalGraph::new();

    let compute_fn = create_js_fn(scope, "return 42;");
    let id = graph.create_computed(scope, compute_fn);

    let result = graph.read_computed(scope, id).unwrap();
    assert_eq!(result.int32_value(scope).unwrap(), 42);
}

#[test]
fn computed_caches_value_when_clean() {
    let mut rt = create_test_runtime();
    let scope = &mut rt.inner_mut().handle_scope();
    let mut graph = SignalGraph::new();

    // Use a function that increments a counter (side effect visible if called twice)
    let compute_fn = create_js_fn(
        scope,
        "if (!globalThis._ctr) globalThis._ctr = 0; return ++globalThis._ctr;",
    );
    let id = graph.create_computed(scope, compute_fn);

    // First read: evaluates
    let result1 = graph.read_computed(scope, id).unwrap();
    assert_eq!(result1.int32_value(scope).unwrap(), 1);

    // Second read: returns cached (state is Clean, no re-evaluation)
    let result2 = graph.read_computed(scope, id).unwrap();
    assert_eq!(result2.int32_value(scope).unwrap(), 1); // Same value = cached
}

#[test]
fn computed_re_evaluates_when_dirty() {
    let mut rt = create_test_runtime();
    let scope = &mut rt.inner_mut().handle_scope();
    let mut graph = SignalGraph::new();

    let compute_fn = create_js_fn(
        scope,
        "if (!globalThis._ctr2) globalThis._ctr2 = 0; return ++globalThis._ctr2;",
    );
    let id = graph.create_computed(scope, compute_fn);

    // First read
    let result1 = graph.read_computed(scope, id).unwrap();
    assert_eq!(result1.int32_value(scope).unwrap(), 1);

    // Manually mark dirty (simulates dependency change)
    graph.mark_computed_dirty(id);

    // Second read: re-evaluates because dirty
    let result2 = graph.read_computed(scope, id).unwrap();
    assert_eq!(result2.int32_value(scope).unwrap(), 2);
}

#[test]
fn computed_cycle_detection() {
    let mut rt = create_test_runtime();
    let scope = &mut rt.inner_mut().handle_scope();
    let mut graph = SignalGraph::new();

    let compute_fn = create_js_fn(scope, "return 1;");
    let id = graph.create_computed(scope, compute_fn);

    // Manually set state to Computing to simulate a cycle
    if let SignalNode::Computed { state, .. } = &mut graph.nodes[id as usize] {
        *state = ComputedState::Computing;
    }

    let result = graph.read_computed(scope, id);
    assert!(matches!(
        result.unwrap_err(),
        SignalGraphError::CycleDetected(_)
    ));
}

#[test]
fn write_signal_marks_computed_subscriber_dirty() {
    let mut rt = create_test_runtime();
    let scope = &mut rt.inner_mut().handle_scope();
    let mut graph = SignalGraph::new();

    // Create signal with value 10
    let val = v8::Integer::new(scope, 10).into();
    let signal_id = graph.create_signal(scope, val, None);

    // Create computed
    let compute_fn = create_js_fn(scope, "return 99;");
    let computed_id = graph.create_computed(scope, compute_fn);

    // Read computed to put it in Clean state
    let _ = graph.read_computed(scope, computed_id).unwrap();

    // Manually wire dependency: signal -> computed
    if let SignalNode::Signal { subscribers, .. } = &mut graph.nodes[signal_id as usize] {
        subscribers.push(computed_id);
    }
    if let SignalNode::Computed { sources, .. } = &mut graph.nodes[computed_id as usize] {
        sources.push(signal_id);
    }

    // Verify computed is Clean
    if let SignalNode::Computed { state, .. } = &graph.nodes[computed_id as usize] {
        assert_eq!(*state, ComputedState::Clean);
    }

    // Write to signal — should mark computed as dirty
    let new_val = v8::Integer::new(scope, 20).into();
    graph.write_signal(scope, signal_id, new_val).unwrap();

    // Verify computed is now Dirty
    if let SignalNode::Computed { state, .. } = &graph.nodes[computed_id as usize] {
        assert_eq!(*state, ComputedState::Dirty);
    }
}

#[test]
fn computed_cleans_old_dependencies_on_re_evaluation() {
    let mut rt = create_test_runtime();
    let scope = &mut rt.inner_mut().handle_scope();
    let mut graph = SignalGraph::new();

    // Create two signals
    let val_a = v8::Integer::new(scope, 1).into();
    let signal_a = graph.create_signal(scope, val_a, None);
    let val_b = v8::Integer::new(scope, 2).into();
    let signal_b = graph.create_signal(scope, val_b, None);

    // Create computed that just returns a constant (no actual signal reads in JS)
    let compute_fn = create_js_fn(scope, "return 42;");
    let computed_id = graph.create_computed(scope, compute_fn);

    // Manually set up dependencies: computed depends on both signals
    if let SignalNode::Signal { subscribers, .. } = &mut graph.nodes[signal_a as usize] {
        subscribers.push(computed_id);
    }
    if let SignalNode::Signal { subscribers, .. } = &mut graph.nodes[signal_b as usize] {
        subscribers.push(computed_id);
    }
    if let SignalNode::Computed { sources, .. } = &mut graph.nodes[computed_id as usize] {
        sources.push(signal_a);
        sources.push(signal_b);
    }

    // Mark dirty and re-evaluate — should clear old sources
    graph.mark_computed_dirty(computed_id);
    let _ = graph.read_computed(scope, computed_id).unwrap();

    // After re-evaluation, the computed's sources should be empty
    // (since the compute_fn doesn't actually read any signals)
    if let SignalNode::Computed { sources, .. } = &graph.nodes[computed_id as usize] {
        assert!(sources.is_empty(), "old sources should be cleaned up");
    }

    // Signal A should no longer have computed as subscriber
    if let SignalNode::Signal { subscribers, .. } = &graph.nodes[signal_a as usize] {
        assert!(
            !subscribers.contains(&computed_id),
            "signal_a should not have computed as subscriber"
        );
    }
}

#[test]
fn diamond_dependency_marks_computed_dirty_once() {
    let mut rt = create_test_runtime();
    let scope = &mut rt.inner_mut().handle_scope();
    let mut graph = SignalGraph::new();

    // Diamond: a -> b, a -> c, b -> d, c -> d
    let val_a = v8::Integer::new(scope, 1).into();
    let signal_a = graph.create_signal(scope, val_a, None);

    let fn_b = create_js_fn(scope, "return 1;");
    let computed_b = graph.create_computed(scope, fn_b);
    let fn_c = create_js_fn(scope, "return 2;");
    let computed_c = graph.create_computed(scope, fn_c);
    let fn_d = create_js_fn(
        scope,
        "if (!globalThis._diamond) globalThis._diamond = 0; return ++globalThis._diamond;",
    );
    let computed_d = graph.create_computed(scope, fn_d);

    // First: evaluate all computed nodes to put them in Clean state
    let _ = graph.read_computed(scope, computed_b).unwrap();
    let _ = graph.read_computed(scope, computed_c).unwrap();
    let result1 = graph.read_computed(scope, computed_d).unwrap();
    assert_eq!(result1.int32_value(scope).unwrap(), 1);

    // Wire dependencies AFTER evaluation (evaluation clears old deps)
    // Diamond: a -> b, a -> c, b -> d, c -> d
    if let SignalNode::Signal { subscribers, .. } = &mut graph.nodes[signal_a as usize] {
        subscribers.push(computed_b);
        subscribers.push(computed_c);
    }
    if let SignalNode::Computed {
        subscribers,
        sources,
        ..
    } = &mut graph.nodes[computed_b as usize]
    {
        subscribers.push(computed_d);
        sources.push(signal_a);
    }
    if let SignalNode::Computed {
        subscribers,
        sources,
        ..
    } = &mut graph.nodes[computed_c as usize]
    {
        subscribers.push(computed_d);
        sources.push(signal_a);
    }
    if let SignalNode::Computed { sources, .. } = &mut graph.nodes[computed_d as usize] {
        sources.push(computed_b);
        sources.push(computed_c);
    }

    // Write to a — should dirty b, c, and d
    let new_val = v8::Integer::new(scope, 2).into();
    graph.write_signal(scope, signal_a, new_val).unwrap();

    // d should be Dirty (marked once, not twice — deduplication)
    if let SignalNode::Computed { state, .. } = &graph.nodes[computed_d as usize] {
        assert_eq!(*state, ComputedState::Dirty);
    }

    // Re-evaluate d — function runs exactly once
    let result2 = graph.read_computed(scope, computed_d).unwrap();
    assert_eq!(result2.int32_value(scope).unwrap(), 2); // Counter incremented once
}

#[test]
fn read_signal_delegates_to_read_computed_for_computed_nodes() {
    let mut rt = create_test_runtime();
    let scope = &mut rt.inner_mut().handle_scope();
    let mut graph = SignalGraph::new();

    let compute_fn = create_js_fn(scope, "return 77;");
    let id = graph.create_computed(scope, compute_fn);

    // read_signal should transparently handle computed nodes
    let result = graph.read_signal(scope, id).unwrap();
    assert_eq!(result.int32_value(scope).unwrap(), 77);
}

#[test]
fn dispose_computed_removes_from_sources() {
    let mut rt = create_test_runtime();
    let scope = &mut rt.inner_mut().handle_scope();
    let mut graph = SignalGraph::new();

    let val = v8::Integer::new(scope, 10).into();
    let signal_id = graph.create_signal(scope, val, None);

    let compute_fn = create_js_fn(scope, "return 1;");
    let computed_id = graph.create_computed(scope, compute_fn);

    // Wire: signal -> computed
    if let SignalNode::Signal { subscribers, .. } = &mut graph.nodes[signal_id as usize] {
        subscribers.push(computed_id);
    }
    if let SignalNode::Computed { sources, .. } = &mut graph.nodes[computed_id as usize] {
        sources.push(signal_id);
    }

    // Dispose computed
    graph.dispose(computed_id);

    // Signal should no longer have computed as subscriber
    if let SignalNode::Signal { subscribers, .. } = &graph.nodes[signal_id as usize] {
        assert!(
            !subscribers.contains(&computed_id),
            "disposed computed should be removed from signal's subscribers"
        );
    }
}

// --- Effect tests (Task 3) ---

/// Helper: read a globalThis property as i32 within a V8 scope.
fn read_global_i32(scope: &mut v8::HandleScope, name: &str) -> i32 {
    let global = scope.get_current_context().global(scope);
    let key = v8::String::new(scope, name).unwrap();
    let val = global.get(scope, key.into()).unwrap();
    val.int32_value(scope).unwrap_or(0)
}

/// Helper: read a globalThis boolean within a V8 scope.
fn read_global_bool(scope: &mut v8::HandleScope, name: &str) -> bool {
    let global = scope.get_current_context().global(scope);
    let key = v8::String::new(scope, name).unwrap();
    let val = global.get(scope, key.into()).unwrap();
    val.boolean_value(scope)
}

#[test]
fn effect_runs_immediately_on_creation() {
    let mut rt = create_test_runtime();
    let scope = &mut rt.inner_mut().handle_scope();
    let mut graph = SignalGraph::new();

    let effect_fn = create_js_fn(scope, "globalThis._effectRan = true;");
    let _id = graph.create_effect(scope, effect_fn);

    assert!(read_global_bool(scope, "_effectRan"));
}

#[test]
fn effect_re_runs_when_dependency_changes() {
    let mut rt = create_test_runtime();
    let scope = &mut rt.inner_mut().handle_scope();
    let mut graph = SignalGraph::new();

    let val = v8::Integer::new(scope, 1).into();
    let signal_id = graph.create_signal(scope, val, None);

    let effect_fn = create_js_fn(
        scope,
        "if (!globalThis._effectCount3) globalThis._effectCount3 = 0; globalThis._effectCount3++;",
    );
    let effect_id = graph.create_effect(scope, effect_fn);

    // Wire: signal -> effect
    if let SignalNode::Signal { subscribers, .. } = &mut graph.nodes[signal_id as usize] {
        subscribers.push(effect_id);
    }
    if let SignalNode::Effect { sources, .. } = &mut graph.nodes[effect_id as usize] {
        sources.push(signal_id);
    }

    // Write signal — should trigger effect re-run
    let new_val = v8::Integer::new(scope, 2).into();
    graph.write_signal(scope, signal_id, new_val).unwrap();

    // Counter: 1 (initial) + 1 (triggered) = 2
    assert_eq!(read_global_i32(scope, "_effectCount3"), 2);
}

#[test]
fn batch_groups_multiple_writes_into_single_effect_run() {
    let mut rt = create_test_runtime();
    let scope = &mut rt.inner_mut().handle_scope();
    let mut graph = SignalGraph::new();

    let val_a = v8::Integer::new(scope, 1).into();
    let signal_a = graph.create_signal(scope, val_a, None);
    let val_b = v8::Integer::new(scope, 2).into();
    let signal_b = graph.create_signal(scope, val_b, None);

    let effect_fn = create_js_fn(
        scope,
        "if (!globalThis._batchCount) globalThis._batchCount = 0; globalThis._batchCount++;",
    );
    let effect_id = graph.create_effect(scope, effect_fn);

    // Wire both signals to effect
    if let SignalNode::Signal { subscribers, .. } = &mut graph.nodes[signal_a as usize] {
        subscribers.push(effect_id);
    }
    if let SignalNode::Signal { subscribers, .. } = &mut graph.nodes[signal_b as usize] {
        subscribers.push(effect_id);
    }
    if let SignalNode::Effect { sources, .. } = &mut graph.nodes[effect_id as usize] {
        sources.push(signal_a);
        sources.push(signal_b);
    }

    // Batch: write both signals → effect should run only once
    graph.batch_start();
    let new_a = v8::Integer::new(scope, 10).into();
    graph.write_signal(scope, signal_a, new_a).unwrap();
    let new_b = v8::Integer::new(scope, 20).into();
    graph.write_signal(scope, signal_b, new_b).unwrap();
    graph.batch_end(scope).unwrap();

    // Counter: 1 (initial) + 1 (batch) = 2, NOT 3
    assert_eq!(read_global_i32(scope, "_batchCount"), 2);
}

#[test]
fn nested_batches_only_flush_on_outermost() {
    let mut rt = create_test_runtime();
    let scope = &mut rt.inner_mut().handle_scope();
    let mut graph = SignalGraph::new();

    let val = v8::Integer::new(scope, 1).into();
    let signal_id = graph.create_signal(scope, val, None);

    let effect_fn = create_js_fn(
        scope,
        "if (!globalThis._nestedCount) globalThis._nestedCount = 0; globalThis._nestedCount++;",
    );
    let effect_id = graph.create_effect(scope, effect_fn);

    // Wire
    if let SignalNode::Signal { subscribers, .. } = &mut graph.nodes[signal_id as usize] {
        subscribers.push(effect_id);
    }
    if let SignalNode::Effect { sources, .. } = &mut graph.nodes[effect_id as usize] {
        sources.push(signal_id);
    }

    // Nested batch
    graph.batch_start();
    graph.batch_start();
    let new_val = v8::Integer::new(scope, 2).into();
    graph.write_signal(scope, signal_id, new_val).unwrap();
    graph.batch_end(scope).unwrap(); // inner — no flush
    graph.batch_end(scope).unwrap(); // outer — flush!

    // Counter: 1 (initial) + 1 (flush) = 2
    assert_eq!(read_global_i32(scope, "_nestedCount"), 2);
}

#[test]
fn disposed_effect_does_not_run() {
    let mut rt = create_test_runtime();
    let scope = &mut rt.inner_mut().handle_scope();
    let mut graph = SignalGraph::new();

    let val = v8::Integer::new(scope, 1).into();
    let signal_id = graph.create_signal(scope, val, None);

    let effect_fn = create_js_fn(
        scope,
        "if (!globalThis._disposedCount) globalThis._disposedCount = 0; globalThis._disposedCount++;",
    );
    let effect_id = graph.create_effect(scope, effect_fn);

    // Wire
    if let SignalNode::Signal { subscribers, .. } = &mut graph.nodes[signal_id as usize] {
        subscribers.push(effect_id);
    }
    if let SignalNode::Effect { sources, .. } = &mut graph.nodes[effect_id as usize] {
        sources.push(signal_id);
    }

    // Dispose
    graph.dispose_effect(effect_id);

    // Write signal — disposed effect should not run
    let new_val = v8::Integer::new(scope, 2).into();
    graph.write_signal(scope, signal_id, new_val).unwrap();

    // Counter: 1 (initial only)
    assert_eq!(read_global_i32(scope, "_disposedCount"), 1);
}

#[test]
fn effect_dedup_same_effect_queued_twice_runs_once() {
    let mut rt = create_test_runtime();
    let scope = &mut rt.inner_mut().handle_scope();
    let mut graph = SignalGraph::new();

    let val_a = v8::Integer::new(scope, 1).into();
    let signal_a = graph.create_signal(scope, val_a, None);
    let val_b = v8::Integer::new(scope, 2).into();
    let signal_b = graph.create_signal(scope, val_b, None);

    let effect_fn = create_js_fn(
        scope,
        "if (!globalThis._dedupCount) globalThis._dedupCount = 0; globalThis._dedupCount++;",
    );
    let effect_id = graph.create_effect(scope, effect_fn);

    // Wire BOTH signals to the SAME effect
    if let SignalNode::Signal { subscribers, .. } = &mut graph.nodes[signal_a as usize] {
        subscribers.push(effect_id);
    }
    if let SignalNode::Signal { subscribers, .. } = &mut graph.nodes[signal_b as usize] {
        subscribers.push(effect_id);
    }
    if let SignalNode::Effect { sources, .. } = &mut graph.nodes[effect_id as usize] {
        sources.push(signal_a);
        sources.push(signal_b);
    }

    // Batch: write both → effect queued twice but should run once
    graph.batch_start();
    let new_a = v8::Integer::new(scope, 10).into();
    graph.write_signal(scope, signal_a, new_a).unwrap();
    let new_b = v8::Integer::new(scope, 20).into();
    graph.write_signal(scope, signal_b, new_b).unwrap();
    graph.batch_end(scope).unwrap();

    // Counter: 1 (initial) + 1 (single deduped) = 2
    assert_eq!(read_global_i32(scope, "_dedupCount"), 2);
}

#[test]
fn auto_batch_signal_write_flushes_effect() {
    let mut rt = create_test_runtime();
    let scope = &mut rt.inner_mut().handle_scope();
    let mut graph = SignalGraph::new();

    let val = v8::Integer::new(scope, 1).into();
    let signal_id = graph.create_signal(scope, val, None);

    let effect_fn = create_js_fn(
        scope,
        "if (!globalThis._autoCount) globalThis._autoCount = 0; globalThis._autoCount++;",
    );
    let effect_id = graph.create_effect(scope, effect_fn);

    // Wire
    if let SignalNode::Signal { subscribers, .. } = &mut graph.nodes[signal_id as usize] {
        subscribers.push(effect_id);
    }
    if let SignalNode::Effect { sources, .. } = &mut graph.nodes[effect_id as usize] {
        sources.push(signal_id);
    }

    // Write WITHOUT explicit batch — auto-batch handles it
    let new_val = v8::Integer::new(scope, 2).into();
    graph.write_signal(scope, signal_id, new_val).unwrap();

    // Counter: 1 (initial) + 1 (auto-flushed) = 2
    assert_eq!(read_global_i32(scope, "_autoCount"), 2);
}
