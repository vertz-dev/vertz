# Phase 4: Reporter Fix + Cross-Package Benchmarks

## Context

Phases 1-3 optimized test execution performance. This phase fixes the misleading "Time:" metric in all reporters (terminal, JUnit, JSON) and produces cross-package benchmarks for CI decision-making.

The current "Time:" output shows the **sum of all per-file durations** (aggregate CPU time), not wall clock time. For 63 files on 10 threads: reported 2018ms vs actual 214ms wall clock. This misleads developers and CI systems into thinking tests are 10x slower than they actually are.

Design doc: `plans/2259-vtz-test-perf.md` (Rev 2)

## Tasks

### Task 1: Add wall_clock_ms to TestRunResult and measure it

**Files:**
- `native/vtz/src/test/runner.rs` (modified)

**What to implement:**

1. Add `wall_clock_ms: f64` field to `TestRunResult` (line 51-63):
```rust
pub struct TestRunResult {
    // ... existing fields ...
    pub wall_clock_ms: f64,
}
```

2. In `run_tests()`, measure wall clock around `execute_parallel()` + type tests:
```rust
let wall_clock_start = std::time::Instant::now();

let results = execute_parallel(
    &unit_test_files, concurrency, config.bail, exec_options,
);

// ... type tests if any ...

let wall_clock_ms = wall_clock_start.elapsed().as_secs_f64() * 1000.0;
```

3. Set `wall_clock_ms` in the returned `TestRunResult`.

4. Also compute `aggregate_cpu_ms` (sum of per-file durations) for the JSON reporter:
```rust
let aggregate_cpu_ms: f64 = results.iter().map(|r| r.duration_ms).sum();
```

**Acceptance criteria:**
- [ ] `TestRunResult` has `wall_clock_ms` field
- [ ] Wall clock is measured around parallel execution + type tests
- [ ] Existing tests compile and pass (update any test that constructs TestRunResult)

---

### Task 2: Fix terminal reporter

**Files:**
- `native/vtz/src/test/reporter/terminal.rs` (modified)

**What to implement:**

Change `format_results()` (line 69 and 94) to use `wall_clock_ms` from the result instead of summing per-file durations:

```rust
// Before (line 69):
let total_duration_ms: f64 = results.iter().map(|r| r.duration_ms).sum();

// After: use wall_clock_ms passed in from TestRunResult
// The format_results function needs to accept wall_clock_ms as a parameter
// or accept &TestRunResult instead of &[TestFileResult]
```

The `format_results()` function signature (line 4) currently takes `results: &[TestFileResult]`. It needs to be updated to also accept `wall_clock_ms: f64`, or to accept `&TestRunResult` directly.

Output remains: `Time:   {:.0}ms\n` but with the correct wall clock value.

**Acceptance criteria:**
- [ ] Terminal reporter shows wall clock time, not aggregate
- [ ] Running `vtz test packages/schema` shows ~140-200ms instead of ~2000ms
- [ ] Existing test for format_results (if any) is updated

---

### Task 3: Fix JUnit and JSON reporters

**Files:**
- `native/vtz/src/test/reporter/junit.rs` (modified)
- `native/vtz/src/test/reporter/json.rs` (modified)

**What to implement:**

**JUnit (line 8):**
```rust
// Before:
let total_time_s: f64 = result.results.iter().map(|r| r.duration_ms).sum::<f64>() / 1000.0;

// After:
let total_time_s = result.wall_clock_ms / 1000.0;
```

**JSON — add timing fields to JsonReport (line 9-20):**
```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonReport {
    // ... existing fields ...
    pub wall_clock_ms: f64,
    pub aggregate_cpu_ms: f64,
}
```

Populate `wall_clock_ms` from `TestRunResult::wall_clock_ms` and compute `aggregate_cpu_ms` as the sum of per-file durations.

**Acceptance criteria:**
- [ ] JUnit `<testsuites time="...">` shows wall clock seconds
- [ ] JSON includes `wallClockMs` and `aggregateCpuMs` fields
- [ ] Both reporters produce valid output format

---

### Task 4: Cross-package benchmarks and documentation

**Files:**
- No code changes — benchmarking and documentation

**What to implement:**

1. Build release: `cd native && cargo build --release`
2. Run benchmarks across 5 packages: schema, errors, core, server (auth tests are in server)
3. For each package, measure:
   - `vtz test` wall clock (3 runs, take median)
   - `bun test` wall clock (3 runs, take median)
   - Gap ratio
4. Run single-file benchmarks on representative files from each package
5. Compile results table
6. Post results as a comment on issue #2259

Expected format:
```markdown
## Performance Results (Phase 1-4)

### Parallel Execution (default concurrency, 10 CPUs)

| Package | Files | Tests | vtz (median) | bun (median) | Gap |
|---|---|---|---|---|---|
| schema | 63 | 465 | Xms | Yms | Z.Zx |
| errors | 14 | N | Xms | Yms | Z.Zx |
| core | 36 | N | Xms | Yms | Z.Zx |
| server | 139 | N | Xms | Yms | Z.Zx |

### Single File (TDD hot path)
| Package | File | vtz | bun | Gap |
...

### CI Recommendations
- Recommended concurrency: match CPU count (default)
- Coverage mode adds ~Xms overhead per file
- Expected overhead: ~Yms per file for capacity planning
```

**Acceptance criteria:**
- [ ] Benchmarks run across all 5 packages
- [ ] Gap < 2x for parallel execution on all packages
- [ ] Results documented in issue #2259
- [ ] Quality gates pass: `cargo test --all && cargo clippy --all-targets --release -- -D warnings && cargo fmt --all -- --check`
