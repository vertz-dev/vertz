//! POC Benchmark: Rust-Native Signal Graph
//!
//! Validates the kill gate for Phase 4.2: native signals must not be >2x slower
//! than JS for <2000 nodes.
//!
//! Benchmarks:
//! 1. Create 500 signals: allocation time
//! 2. Read 500 signals with tracking: boundary crossing overhead
//! 3. Write 50 signals in batch → propagate → flush: full cycle
//! 4. Diamond dependency (a → b,c → d): propagation + dedup
//! 5. Full SSR render simulation: 500 signals, 200 computeds, 100 effects
//!
//! Run: cargo bench --bench signal_graph

use criterion::{criterion_group, criterion_main, Criterion};

use vertz_runtime::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

/// Helper: create a runtime with signal graph initialized.
fn create_runtime_with_graph() -> VertzJsRuntime {
    let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
    rt.execute_script_void("<bench-init>", "globalThis.__VERTZ_SIGNAL_OPS__.init();")
        .unwrap();
    rt
}

fn bench_create_500_signals(c: &mut Criterion) {
    c.bench_function("native: create 500 signals", |b| {
        b.iter(|| {
            let mut rt = create_runtime_with_graph();
            rt.execute_script_void(
                "<bench>",
                r#"
                const ops = globalThis.__VERTZ_SIGNAL_OPS__;
                for (let i = 0; i < 500; i++) {
                    ops.createSignal(i);
                }
                "#,
            )
            .unwrap();
        });
    });
}

fn bench_read_500_signals(c: &mut Criterion) {
    c.bench_function("native: read 500 signals", |b| {
        b.iter(|| {
            let mut rt = create_runtime_with_graph();
            rt.execute_script_void(
                "<bench>",
                r#"
                const ops = globalThis.__VERTZ_SIGNAL_OPS__;
                const ids = [];
                for (let i = 0; i < 500; i++) {
                    ids.push(ops.createSignal(i));
                }
                for (const id of ids) {
                    ops.readSignal(id);
                }
                "#,
            )
            .unwrap();
        });
    });
}

fn bench_write_50_signals_batch(c: &mut Criterion) {
    c.bench_function("native: write 50 signals in batch + flush", |b| {
        b.iter(|| {
            let mut rt = create_runtime_with_graph();
            rt.execute_script_void(
                "<bench>",
                r#"
                const ops = globalThis.__VERTZ_SIGNAL_OPS__;
                // Setup: 50 signals, 1 effect depending on all 50
                const ids = [];
                for (let i = 0; i < 50; i++) {
                    ids.push(ops.createSignal(i));
                }
                // Effect that reads all 50 signals
                let runCount = 0;
                ops.createEffect(() => {
                    for (const id of ids) ops.readSignal(id);
                    runCount++;
                });

                // Batch: write all 50 signals
                ops.batchStart();
                for (let i = 0; i < 50; i++) {
                    ops.writeSignal(ids[i], i + 100);
                }
                ops.batchEnd();
                "#,
            )
            .unwrap();
        });
    });
}

fn bench_diamond_dependency(c: &mut Criterion) {
    c.bench_function("native: diamond dependency propagation", |b| {
        b.iter(|| {
            let mut rt = create_runtime_with_graph();
            rt.execute_script_void(
                "<bench>",
                r#"
                const ops = globalThis.__VERTZ_SIGNAL_OPS__;
                // Diamond: a → b, a → c, b+c → d (effect)
                const a = ops.createSignal(1);
                const b = ops.createComputed(() => ops.readSignal(a) * 2);
                const c = ops.createComputed(() => ops.readSignal(a) + 10);
                let dRuns = 0;
                ops.createEffect(() => {
                    const bVal = ops.readSignal(b);
                    const cVal = ops.readSignal(c);
                    dRuns++;
                });
                // Write a 100 times
                for (let i = 0; i < 100; i++) {
                    ops.writeSignal(a, i);
                }
                "#,
            )
            .unwrap();
        });
    });
}

fn bench_ssr_simulation(c: &mut Criterion) {
    c.bench_function("native: SSR simulation (500s + 200c + 100e)", |b| {
        b.iter(|| {
            let mut rt = create_runtime_with_graph();
            rt.execute_script_void(
                "<bench>",
                r#"
                const ops = globalThis.__VERTZ_SIGNAL_OPS__;
                // Phase 1: Create 500 signals
                const signals = [];
                for (let i = 0; i < 500; i++) {
                    signals.push(ops.createSignal(i));
                }

                // Phase 2: Create 200 computeds (each depends on 2-3 signals)
                const computeds = [];
                for (let i = 0; i < 200; i++) {
                    const s1 = signals[i % 500];
                    const s2 = signals[(i + 1) % 500];
                    computeds.push(ops.createComputed(() => {
                        return ops.readSignal(s1) + ops.readSignal(s2);
                    }));
                }

                // Phase 3: Create 100 effects (each reads 2 computeds)
                for (let i = 0; i < 100; i++) {
                    const c1 = computeds[i % 200];
                    const c2 = computeds[(i + 1) % 200];
                    ops.createEffect(() => {
                        ops.readSignal(c1);
                        ops.readSignal(c2);
                    });
                }

                // Phase 4: Write 50 signals (simulates SSR data arrival)
                ops.batchStart();
                for (let i = 0; i < 50; i++) {
                    ops.writeSignal(signals[i], i + 1000);
                }
                ops.batchEnd();

                // Cleanup
                ops.dispose();
                "#,
            )
            .unwrap();
        });
    });
}

fn bench_js_baseline_ssr_simulation(c: &mut Criterion) {
    c.bench_function("js-baseline: SSR simulation (500s + 200c + 100e)", |b| {
        b.iter(|| {
            let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
            rt.execute_script_void(
                "<bench>",
                r#"
                // Pure JS signal implementation (minimal, matching semantics)
                let trackingSub = null;
                let batchDepth = 0;
                const pendingEffects = new Set();
                const nodes = [];

                function createSignal(value) {
                    const id = nodes.length;
                    nodes.push({ type: 'signal', value, subs: [] });
                    return id;
                }
                function readSignal(id) {
                    const node = nodes[id];
                    if (trackingSub !== null) {
                        if (!node.subs.includes(trackingSub)) node.subs.push(trackingSub);
                        if (nodes[trackingSub].sources) {
                            if (!nodes[trackingSub].sources.includes(id)) nodes[trackingSub].sources.push(id);
                        }
                    }
                    if (node.type === 'computed' && node.dirty) {
                        node.dirty = false;
                        const oldSub = trackingSub;
                        trackingSub = id;
                        // Clear old sources
                        for (const s of node.sources) {
                            const src = nodes[s];
                            src.subs = src.subs.filter(x => x !== id);
                        }
                        node.sources = [];
                        node.value = node.fn();
                        trackingSub = oldSub;
                    }
                    return node.value;
                }
                function writeSignal(id, value) {
                    const node = nodes[id];
                    if (Object.is(node.value, value)) return;
                    node.value = value;
                    const autoBatch = batchDepth === 0;
                    if (autoBatch) batchDepth++;
                    for (const sub of node.subs) {
                        const s = nodes[sub];
                        if (s.type === 'computed') { s.dirty = true; for (const ss of s.subs) notify(ss); }
                        else if (s.type === 'effect') pendingEffects.add(sub);
                    }
                    if (autoBatch) { batchDepth--; flush(); }
                }
                function notify(id) {
                    const s = nodes[id];
                    if (s.type === 'computed') { s.dirty = true; for (const ss of s.subs) notify(ss); }
                    else if (s.type === 'effect') pendingEffects.add(id);
                }
                function createComputed(fn) {
                    const id = nodes.length;
                    nodes.push({ type: 'computed', fn, value: undefined, dirty: true, subs: [], sources: [] });
                    return id;
                }
                function createEffect(fn) {
                    const id = nodes.length;
                    nodes.push({ type: 'effect', fn, sources: [] });
                    const oldSub = trackingSub;
                    trackingSub = id;
                    fn();
                    trackingSub = oldSub;
                    return id;
                }
                function batchStart() { batchDepth++; }
                function batchEnd() { batchDepth--; if (batchDepth === 0) flush(); }
                function flush() {
                    while (pendingEffects.size > 0) {
                        const effs = [...pendingEffects];
                        pendingEffects.clear();
                        for (const id of effs) {
                            const node = nodes[id];
                            const oldSub = trackingSub;
                            trackingSub = id;
                            for (const s of node.sources) {
                                nodes[s].subs = nodes[s].subs.filter(x => x !== id);
                            }
                            node.sources = [];
                            node.fn();
                            trackingSub = oldSub;
                        }
                    }
                }

                // Same workload as native benchmark
                const signals = [];
                for (let i = 0; i < 500; i++) signals.push(createSignal(i));

                const computeds = [];
                for (let i = 0; i < 200; i++) {
                    const s1 = signals[i % 500];
                    const s2 = signals[(i + 1) % 500];
                    computeds.push(createComputed(() => readSignal(s1) + readSignal(s2)));
                }

                for (let i = 0; i < 100; i++) {
                    const c1 = computeds[i % 200];
                    const c2 = computeds[(i + 1) % 200];
                    createEffect(() => { readSignal(c1); readSignal(c2); });
                }

                batchStart();
                for (let i = 0; i < 50; i++) writeSignal(signals[i], i + 1000);
                batchEnd();
                "#,
            )
            .unwrap();
        });
    });
}

criterion_group!(
    benches,
    bench_create_500_signals,
    bench_read_500_signals,
    bench_write_50_signals_batch,
    bench_diamond_dependency,
    bench_ssr_simulation,
    bench_js_baseline_ssr_simulation,
);
criterion_main!(benches);
