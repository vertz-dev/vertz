# Phase 2: Function Coverage

## Context

The `vtz test` runner reports line coverage with source map resolution (Phase 1). This phase adds **function coverage** — extracting function names and hit counts from V8 CDP data and reporting them in LCOV and terminal output.

V8's `Profiler.takePreciseCoverage` with `callCount: true` already returns per-function data including function names and ranges. The first range of each function entry covers the entire function body, and its `count` field indicates how many times the function was called.

Design doc: `plans/2260-coverage-branch-fn.md`

## Tasks

### Task 1: Add FunctionCoverage struct and parsing logic

**Files:**
- `native/vtz/src/test/coverage.rs` (modified)

**What to implement:**

1. Add the `FunctionCoverage` struct:
   ```rust
   #[derive(Debug, Clone)]
   pub struct FunctionCoverage {
       /// Function name. Anonymous functions use "(anonymous_N)" with per-file counter.
       pub name: String,
       /// Start line in original source (1-indexed).
       pub start_line: u32,
       /// Execution count.
       pub count: u32,
   }
   ```

2. Add `functions: Vec<FunctionCoverage>` field to `FileCoverage`.

3. Add helper methods to `FileCoverage`:
   ```rust
   pub fn total_functions(&self) -> usize { self.functions.len() }
   pub fn covered_functions(&self) -> usize { self.functions.iter().filter(|f| f.count > 0).count() }
   pub fn function_percentage(&self) -> f64 {
       if self.functions.is_empty() { return 100.0; }
       (self.covered_functions() as f64 / self.total_functions() as f64) * 100.0
   }
   ```

4. Add aggregate methods to `CoverageReport`:
   ```rust
   pub fn total_function_percentage(&self) -> f64 { ... }
   ```

5. Modify `parse_v8_coverage()` to extract function data from V8 JSON:
   - For each function entry in the V8 data, extract `functionName` and the first range's `startOffset` and `count`
   - Use the `SourceMapResolver` to map the `startOffset` to an original line number
   - Assign anonymous function names using `(anonymous_N)` with a per-file counter (N starts at 1)
   - Skip the module-level wrapper function (V8 always includes a top-level function with empty name covering the entire script — identify it by `startOffset == 0` and `endOffset == <script_length>`)
   - Collect into `Vec<FunctionCoverage>` on the `FileCoverage`

6. Update all test helper functions (`make_file_coverage`) to include the new `functions` field (empty vec by default).

**Acceptance criteria:**
- [ ] `FunctionCoverage` struct exists with name, start_line, count fields
- [ ] `FileCoverage` has `functions` field and percentage helpers
- [ ] `CoverageReport` has `total_function_percentage()` aggregate
- [ ] `parse_v8_coverage` extracts functions from V8 JSON
- [ ] Anonymous functions get `(anonymous_N)` names per file
- [ ] Module-level wrapper function is excluded
- [ ] Unit test: V8 JSON with 3 named functions produces 3 FunctionCoverage entries with correct names and counts
- [ ] Unit test: V8 JSON with anonymous function produces `(anonymous_1)` name
- [ ] Unit test: `function_percentage()` for 2 of 3 functions covered returns ~66.7%
- [ ] Unit test: `function_percentage()` for empty functions vec returns 100.0%
- [ ] All existing tests pass with updated `FileCoverage` struct

---

### Task 2: Add FN/FNDA records to LCOV output

**Files:**
- `native/vtz/src/test/coverage.rs` (modified — `format_lcov`)

**What to implement:**

1. In `format_lcov()`, add function records after `SF:` and before `DA:` lines:
   ```
   FN:<start_line>,<name>    — one per function, sorted by start_line
   FNDA:<count>,<name>       — one per function, sorted by name
   FNF:<total_functions>     — functions found
   FNH:<covered_functions>   — functions hit (count > 0)
   ```

2. The ordering follows LCOV convention: `FN` records sorted by line number, `FNDA` records sorted by function name.

**Acceptance criteria:**
- [ ] LCOV output contains `FN:` records with correct start lines and names
- [ ] LCOV output contains `FNDA:` records with correct counts and names
- [ ] LCOV output contains `FNF:` and `FNH:` summary records
- [ ] FN records appear before DA records (standard LCOV ordering)
- [ ] Unit test: LCOV for a file with 2 functions (1 covered, 1 not) contains correct FN/FNDA/FNF/FNH
- [ ] Unit test: LCOV for a file with 0 functions omits FN section entirely (or emits FNF:0, FNH:0)
- [ ] Existing LCOV tests still pass

---

### Task 3: Add Fn% column to terminal report

**Files:**
- `native/vtz/src/test/coverage.rs` (modified — `format_terminal`)

**What to implement:**

1. Update the terminal report header to include `Fn%`:
   ```
   File                                               Lines    Fn%   Line%
   ```
   (Branch% will be added in Phase 3; for now include Fn% after Lines)

2. For each file, show the function coverage percentage.

3. Update the total row to include aggregate Fn%.

4. Update the separator width to accommodate the new column.

**Acceptance criteria:**
- [ ] Terminal report header includes `Fn%` column
- [ ] Each file row shows function coverage percentage
- [ ] Total row includes aggregate function percentage
- [ ] Files with no functions show `100.0%` for Fn%
- [ ] Unit test: terminal output for a report with functions includes Fn% values
- [ ] Existing terminal format tests updated and passing
- [ ] `cargo test --all` passes
- [ ] `cargo clippy --all-targets --release -- -D warnings` passes
- [ ] `cargo fmt --all -- --check` passes
