# Phase 2+3: Function & Branch Coverage + Source Map Resolution

- **Author:** Implementation agent
- **Reviewer:** Claude Opus 4.6 (adversarial)
- **Commits:** fb29f892f..d3114ae89
- **Date:** 2026-04-04

## Changes

- `native/vtz/src/test/coverage.rs` (modified) -- new structs `FunctionCoverage`, `BranchCoverage`; new fields on `FileCoverage`/`CoverageReport`; function/branch extraction in `parse_v8_coverage`; LCOV `FN`/`FNDA`/`BRDA` output; terminal table columns; `byte_offset_to_line_col` utility; ~50 new tests
- `native/vtz/src/runtime/module_loader.rs` (modified) -- `NewlineIndexStore` type, `build_newline_index()` function, newline index collection during module loading, 5 unit tests
- `native/vtz/src/runtime/js_runtime.rs` (modified) -- `source_maps()` and `newline_indices()` accessor methods on `VertzJsRuntime`
- `native/vtz/src/test/runner.rs` (modified) -- source map + newline index aggregation, `SourceMapResolver` closure construction, decoded_cache
- `native/vtz/src/test/executor.rs` (modified) -- `source_maps` and `newline_indices` fields on `TestFileResult`/`ExecuteInnerResult`, extraction from runtime after test execution
- `native/vtz/src/errors/source_mapper.rs` (modified) -- visibility bumps: `SourceMapV3`, `MappingSegment`, `resolve_from_source_map`, `decode_mappings` to `pub(crate)`
- `native/vtz/src/test/e2e_runner.rs` (modified) -- empty `source_maps`/`newline_indices` fields added
- `native/vtz/src/test/typetests.rs` (modified) -- empty `source_maps`/`newline_indices` fields added
- `native/vtz/src/test/reporter/{json,junit,terminal}.rs` (modified) -- empty `source_maps`/`newline_indices` fields in test fixtures

## CI Status

- [ ] Quality gates passed (not verified by reviewer -- author's responsibility)

## Review Checklist

- [x] Delivers what the ticket asks for
- [ ] TDD compliance (tests before/alongside implementation)
- [ ] No type gaps or missing edge cases
- [ ] No security issues
- [x] Public API changes match design doc

## Findings

### BLOCKER 1: Newline index built from wrong code -- CSS injection shifts all byte offsets

**Files:** `native/vtz/src/runtime/module_loader.rs` lines 408-416 (cache path) and 460-463 (fresh compile path)

The newline index is built from the compiled code **before** `prepend_css_injection()` is called. But V8 sees the code **after** CSS injection. When a `.tsx` file produces CSS output, `prepend_css_injection` prepends a line like:

```js
if (typeof __vertz_inject_css === 'function') { __vertz_inject_css(`...css...`, '/path/to/file'); }
```

This shifts every byte offset that V8 reports. The newline index, built from the pre-injection code, will compute wrong `(line, column)` pairs for every subsequent line in the file. The first line's column offsets will also be wrong because the CSS injection adds bytes before the original code starts.

**Impact:** Every `.tsx` file with CSS output (any file using `css()` or `variants()`) will have incorrect source map resolution for coverage. Function start lines and branch lines will be off, and line coverage will map to wrong original source lines.

**Fix:** Build the newline index from the code that V8 actually executes -- i.e., after `prepend_css_injection()`. Either:
1. Move the `build_newline_index` call to after `prepend_css_injection`, or
2. Build it from the final return value of `compile_source`.

Both the cache path (line 411) and the fresh compile path (line 463) need fixing.

### BLOCKER 2: `decoded_cache` is populated but never consumed -- O(n) VLQ re-decode on every resolver call

**File:** `native/vtz/src/test/runner.rs` lines 197-231

The resolver closure:
1. Parses the source map JSON (`serde_json::from_str`) on every call.
2. Populates `decoded_cache` with decoded VLQ segments.
3. Calls `resolve_from_source_map()`, which **internally calls `decode_mappings()` again**, ignoring the cache entirely.

This means for a file with N coverage ranges, the VLQ decoding runs N times instead of 1. For large files with many ranges (common with branch coverage), this is a significant performance regression.

The `decoded_cache` is dead code -- it stores segments that nothing reads.

**Fix:** Either:
- (a) Create a variant of `resolve_from_source_map` that accepts pre-decoded segments, and use the cache, or
- (b) Cache the parsed `SourceMapV3` and pass it through, or
- (c) At minimum, remove the dead `decoded_cache` code to avoid misleading future readers.

The `serde_json::from_str` call also runs on every invocation for the same file. This should be cached too.

### SHOULD-FIX 1: Module wrapper detection heuristic is too aggressive -- false positives on small anonymous IIFEs

**File:** `native/vtz/src/test/coverage.rs` lines 364-370

The `is_likely_wrapper` condition is:
```rust
let is_likely_wrapper =
    func_name.is_empty() && func_start == 0 && func_end > 100 && !ranges.is_empty();
```

This catches any anonymous function starting at byte 0 with an end offset > 100. But consider a file that starts with an IIFE:

```ts
(function() {
  // small setup code
  doSomething();
})();
export function main() { ... }
```

V8 would report the IIFE as an anonymous function with `startOffset: 0` and `endOffset: ~80-150`. If `endOffset > 100`, the heuristic would incorrectly classify it as a module wrapper and skip it.

The `is_module_wrapper` check (`ranges.len() == 1`) is reasonable -- the actual module wrapper typically has a single range. But `is_likely_wrapper` doesn't check `ranges.len()`, so an IIFE at offset 0 with sub-ranges (branches) would be incorrectly skipped.

**Also:** The `is_module_wrapper` and `is_likely_wrapper` conditions overlap. If `func_name.is_empty() && func_start == 0 && ranges.len() == 1`, then `is_module_wrapper` is true. `is_likely_wrapper` with `func_end > 100` catches the case where `ranges.len() > 1` (multiple ranges but still starts at 0). However, if the module wrapper has sub-ranges (e.g., top-level `if` statements), `is_module_wrapper` won't catch it, and `is_likely_wrapper` will -- which is correct. But it would also catch the IIFE case above.

**Fix:** Tighten the heuristic. The V8 module wrapper's endOffset should match the total script length. Consider checking `func_end >= total_script_length * 0.9` or similar. At minimum, document the known false-positive case.

### SHOULD-FIX 2: Branch count arithmetic can underflow if V8 reports sub-range count > parent count

**File:** `native/vtz/src/test/coverage.rs` line 428

```rust
let else_count = parent_count - r_count;
```

If V8 ever reports a sub-range count higher than the parent count (which could theoretically happen with concurrent invocations or V8 bugs), this will panic with arithmetic underflow in debug mode (or wrap to `u32::MAX` in release mode).

**Fix:** Use `parent_count.saturating_sub(r_count)` for safety, since `count` is a `u32`.

### SHOULD-FIX 3: No test for CSS-injection byte offset shift

**File:** `native/vtz/src/test/coverage.rs` (tests section)

Even after fixing BLOCKER 1, there should be a test that verifies the newline index is built from the post-CSS-injection code. Currently all tests use mock resolvers that don't exercise the actual `build_newline_index` -> source map pipeline with CSS-producing files.

### SHOULD-FIX 4: Source map JSON is re-parsed on every resolver call for the same file

**File:** `native/vtz/src/test/runner.rs` line 213-214

```rust
let sm: crate::errors::source_mapper::SourceMapV3 =
    serde_json::from_str(source_map_json).ok()?;
```

This runs `serde_json::from_str` on every coverage range for the same file. For a file with 200 coverage ranges, the same JSON string is parsed 200 times. Should be cached alongside or instead of the `decoded_cache`.

### SHOULD-FIX 5: `test_parse_v8_coverage_with_ranges` test does not validate function coverage

**File:** `native/vtz/src/test/coverage.rs` line 702-727

The test `test_parse_v8_coverage_with_ranges` creates a function named `"add"` with `startOffset: 0`, `endOffset: 120`, `count: 1`, and a sub-range. But since `func_name` is `"add"` (not empty) and `func_start` is `0` -- wait, `func_start` is 0 and `func_name` is "add", so `is_module_wrapper` is false (name is not empty), `is_likely_wrapper` is false (name is not empty). The function should be counted. But the test only asserts `result[0].total_lines > 0` and doesn't check `result[0].functions`. This is a gap -- the test was written before function coverage was added and was never updated to validate the new behavior.

### NOTE 1: LCOV format compliance is correct

The LCOV output order is:
1. TN (test name)
2. SF (source file)
3. FN (function declarations)
4. FNDA (function execution data)
5. FNF/FNH (function summary)
6. BRDA (branch data)
7. BRF/BRH (branch summary)
8. DA (line data)
9. LF/LH (line summary)
10. end_of_record

This matches the LCOV geninfo specification. The `format_lcov_with_function_records` test explicitly validates FN-before-DA ordering, and `format_lcov_with_branch_records` validates BRDA-before-BRF ordering. Good.

### NOTE 2: `byte_offset_to_line_col` is correct

The function uses `partition_point` (binary search) on the newline index, which returns the number of newlines before the offset. This gives the 0-indexed line number. Adding 1 makes it 1-indexed. The column calculation subtracts the position of the previous newline and adds 1 for 1-indexing. The edge case for line 0 (no preceding newline) is handled. The tests cover first char, second line, third line, mid-line, and single-line cases. Correct.

### NOTE 3: Ternary branch detection produces 4 branches instead of 2

**File:** `native/vtz/src/test/coverage.rs` lines 1484-1517

The test `test_parse_v8_ternary_branches` expects 4 branches for a ternary. V8 reports a ternary as two sub-ranges (true-branch and false-branch), each with different counts from the parent. The code treats each sub-range independently, generating a "taken" and "not-taken" branch for each. This produces:
- Block 1: branch 0 = 7 (true arm), branch 1 = 3 (10-7, inferred else)
- Block 2: branch 0 = 3 (false arm), branch 1 = 7 (10-3, inferred else)

This is arguably double-counting. A ternary has 2 branches, not 4. The "inferred else" for the true arm (3) happens to equal the false arm's count (3), and vice versa. LCOV consumers (codecov, coveralls) may report inflated branch counts. This is not a correctness bug per se -- the coverage percentages work out because both "inferred else" branches have the same hit/miss status as their actual counterparts -- but it is semantically misleading.

This is acceptable for V0 but should be documented as a known limitation with a TODO.

## Resolution

**Blockers must be resolved before merge:**
1. BLOCKER 1: Fix newline index to be built from post-CSS-injection code
2. BLOCKER 2: Either use the decoded_cache properly or remove dead code; cache JSON parse

**Should-fix items:**
3. Use `saturating_sub` for branch else-count arithmetic
4. Add a test for CSS-injection offset handling
5. Cache source map JSON parse in resolver closure
6. Document module-wrapper heuristic limitations or tighten the check
7. Update `test_parse_v8_coverage_with_ranges` to validate function coverage
