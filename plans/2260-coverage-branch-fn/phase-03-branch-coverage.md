# Phase 3: Branch Coverage

## Context

The `vtz test` runner reports line coverage with source map resolution (Phase 1) and function coverage (Phase 2). This phase adds **branch coverage** — analyzing V8's block-level ranges to identify branches (if/else, ternary, logical operators, switch/case) and reporting them in LCOV and terminal output.

V8's `Profiler.takePreciseCoverage` with `detailed: true` returns block-level ranges for each function. The first range covers the entire function body. Subsequent ranges cover basic blocks within it. When a nested range has a different count than its parent, it represents a branch point. Adjacent ranges at the same nesting level with different counts indicate alternative branches.

Design doc: `plans/2260-coverage-branch-fn.md`

## Tasks

### Task 1: Add BranchCoverage struct and V8 block range parsing

**Files:**
- `native/vtz/src/test/coverage.rs` (modified)

**What to implement:**

1. Add the `BranchCoverage` struct:
   ```rust
   #[derive(Debug, Clone)]
   pub struct BranchCoverage {
       /// Line number of the branch point in original source (1-indexed).
       pub line: u32,
       /// Block number (groups related branches, e.g., both sides of an if/else share a block).
       pub block_number: u32,
       /// Branch number within the block (0 = first branch, 1 = second, etc.).
       pub branch_number: u32,
       /// Execution count.
       pub count: u32,
   }
   ```

2. Add `branches: Vec<BranchCoverage>` field to `FileCoverage`.

3. Add helper methods to `FileCoverage`:
   ```rust
   pub fn total_branches(&self) -> usize { self.branches.len() }
   pub fn covered_branches(&self) -> usize { self.branches.iter().filter(|b| b.count > 0).count() }
   pub fn branch_percentage(&self) -> f64 {
       if self.branches.is_empty() { return 100.0; }
       (self.covered_branches() as f64 / self.total_branches() as f64) * 100.0
   }
   ```

4. Add aggregate method to `CoverageReport`:
   ```rust
   pub fn total_branch_percentage(&self) -> f64 { ... }
   ```

5. Implement branch extraction in `parse_v8_coverage()`:

   For each function in the V8 data:
   - The function's `ranges` array is ordered: first range is the function body, remaining ranges are blocks.
   - **Branch detection algorithm:**
     a. Skip the first range (function body — not a branch).
     b. For ranges after the first: a range whose count differs from its parent's count indicates a branch.
     c. Group consecutive ranges that share the same start offset into a "branch group" (same `block_number`). Within a group, each range gets a sequential `branch_number`.
     d. If a function has exactly 2 non-body ranges with different counts, this is typically an if/else. If one range count < parent count, the "else" branch count is `parent.count - child.count`.
   - Use the `SourceMapResolver` to map each branch's `startOffset` to an original line.
   - Assign `block_number` as a per-file incrementing counter.

6. Update `make_file_coverage` helper to include `branches: vec![]` default.

**Acceptance criteria:**
- [ ] `BranchCoverage` struct exists with line, block_number, branch_number, count
- [ ] `FileCoverage` has `branches` field and percentage helpers
- [ ] `CoverageReport` has `total_branch_percentage()` aggregate
- [ ] Branch extraction handles if/else pattern: function with 2 nested ranges (one count=N, one count=0) → 2 branches
- [ ] Unit test: V8 JSON with if/else produces 2 BranchCoverage entries (one covered, one not)
- [ ] Unit test: V8 JSON with no branches (single-range functions) produces empty branches vec
- [ ] Unit test: `branch_percentage()` for 1 of 2 branches covered returns 50.0%
- [ ] Unit test: `branch_percentage()` for empty branches returns 100.0%
- [ ] Unit test: Multiple functions with branches get sequential block_numbers
- [ ] All existing tests pass

---

### Task 2: Add BRDA records to LCOV output

**Files:**
- `native/vtz/src/test/coverage.rs` (modified — `format_lcov`)

**What to implement:**

1. In `format_lcov()`, add branch records after FN/FNDA section and before DA lines:
   ```
   BRDA:<line>,<block_number>,<branch_number>,<count>  — one per branch
   BRF:<total_branches>                                 — branches found
   BRH:<covered_branches>                               — branches hit (count > 0)
   ```

2. BRDA records are sorted by (line, block_number, branch_number).

3. Record ordering in LCOV output becomes:
   ```
   TN:
   SF:<path>
   FN:...        (from Phase 2)
   FNDA:...      (from Phase 2)
   FNF:...       (from Phase 2)
   FNH:...       (from Phase 2)
   BRDA:...      (NEW)
   BRF:...       (NEW)
   BRH:...       (NEW)
   DA:...
   LF:...
   LH:...
   end_of_record
   ```

**Acceptance criteria:**
- [ ] LCOV output contains `BRDA:` records with correct line, block, branch, count
- [ ] LCOV output contains `BRF:` and `BRH:` summary records
- [ ] BRDA records appear after FN section and before DA section
- [ ] Unit test: LCOV for a file with 2 branches (1 covered, 1 not) contains correct BRDA/BRF/BRH
- [ ] Unit test: LCOV for a file with 0 branches omits BRDA section (or emits BRF:0, BRH:0)
- [ ] Existing LCOV tests still pass

---

### Task 3: Add Branch% column to terminal report

**Files:**
- `native/vtz/src/test/coverage.rs` (modified — `format_terminal`)

**What to implement:**

1. Update the terminal report header to the final format:
   ```
   File                                               Lines  Branch%    Fn%   Line%
   ----------------------------------------------------------------------------------
   ```

2. For each file, show the branch coverage percentage between Lines and Fn%.

3. Update the total row to include aggregate Branch%.

4. Update separator width.

**Acceptance criteria:**
- [ ] Terminal report header includes `Branch%` column
- [ ] Each file row shows branch coverage percentage
- [ ] Total row includes aggregate branch percentage
- [ ] Files with no branches show `100.0%` for Branch%
- [ ] Unit test: terminal output for a report with branches includes Branch% values
- [ ] Existing terminal format tests updated and passing

---

### Task 4: Branch detection edge case tests

**Files:**
- `native/vtz/src/test/coverage.rs` (modified — add tests)

**What to implement:**

Add targeted unit tests for V8 block range patterns that exercise edge cases in branch detection:

1. **If/else pattern**: Function with ranges `[{0,100,5}, {30,60,3}, {60,90,0}]` → 2 branches at if block: one covered (count=3), one uncovered (count=0).

2. **Ternary pattern**: Function with ranges `[{0,80,10}, {20,40,7}, {40,60,3}]` → 2 branches: true-branch (count=7), false-branch (count=3).

3. **Single-path function** (no branching): Function with ranges `[{0,50,1}]` → 0 branches.

4. **Nested branches**: Function with outer if/else and inner if/else → multiple block_numbers, each with their own branches.

5. **Uncalled function**: Function with ranges `[{0,50,0}]` → 0 branches (a function that was never called doesn't contribute branch data since V8 doesn't report block-level ranges for uncalled functions).

**Acceptance criteria:**
- [ ] If/else pattern produces 2 branches with correct counts
- [ ] Ternary pattern produces 2 branches with correct counts
- [ ] Single-path function produces 0 branches
- [ ] Nested branches produce separate block_numbers
- [ ] Uncalled function produces 0 branches
- [ ] `cargo test --all` passes with all new and existing tests green
- [ ] `cargo clippy --all-targets --release -- -D warnings` passes
- [ ] `cargo fmt --all -- --check` passes
