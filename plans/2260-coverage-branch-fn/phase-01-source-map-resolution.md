# Phase 1: Source Map Resolution

## Context

The `vtz test` runner collects V8 code coverage but currently passes `&|_| None` as the source map lookup, falling back to a 40-chars-per-line estimation for line numbers. This phase wires the existing `SourceMapper` VLQ infrastructure into the coverage pipeline so that all line coverage data maps to correct original TypeScript source lines.

Design doc: `plans/2260-coverage-branch-fn.md`

## Tasks

### Task 1: Store newline indices during compilation and expose source maps from runtime

**Files:**
- `native/vtz/src/runtime/module_loader.rs` (modified)
- `native/vtz/src/runtime/js_runtime.rs` (modified)

**What to implement:**

1. Add a `newline_indices: RefCell<HashMap<String, Vec<u32>>>` field to `VertzModuleLoader`. This stores byte offsets of newline characters in compiled code, keyed by filename.

2. In `compile_source()`, after compilation (both cache-hit and cache-miss paths), compute the newline index from the compiled code and store it:
   ```rust
   fn build_newline_index(code: &str) -> Vec<u32> {
       code.bytes()
           .enumerate()
           .filter(|(_, b)| *b == b'\n')
           .map(|(i, _)| i as u32)
           .collect()
   }
   ```
   Call this on the compiled code (before CSS injection) and insert into `self.newline_indices`.

3. Add a public method `pub fn newline_indices(&self) -> HashMap<String, Vec<u32>>` that clones and returns the newline indices map.

4. Add a public method `pub fn source_maps(&self) -> HashMap<String, String>` that clones and returns the source maps.

5. In `VertzJsRuntime::new_for_test()`, clone the `Rc<VertzModuleLoader>` before passing it to `JsRuntime::new()`. Store the clone as a new field `module_loader: Rc<VertzModuleLoader>` on `VertzJsRuntime`.

6. Add two public methods on `VertzJsRuntime`:
   - `pub fn source_maps(&self) -> HashMap<String, String>` — delegates to `self.module_loader.source_maps()`
   - `pub fn newline_indices(&self) -> HashMap<String, Vec<u32>>` — delegates to `self.module_loader.newline_indices()`

**Acceptance criteria:**
- [ ] `VertzModuleLoader` stores newline indices for every compiled file (cache-hit and cache-miss paths)
- [ ] `VertzJsRuntime::source_maps()` returns source maps collected during module loading
- [ ] `VertzJsRuntime::newline_indices()` returns newline offset indices
- [ ] Existing tests in `executor.rs` and `js_runtime.rs` continue to pass
- [ ] Unit test: `build_newline_index("abc\ndef\nghi")` returns `[3, 7]`
- [ ] Unit test: `build_newline_index("")` returns `[]`
- [ ] Unit test: `build_newline_index("no newlines")` returns `[]`

---

### Task 2: Make source mapper internals crate-visible

**Files:**
- `native/vtz/src/errors/source_mapper.rs` (modified)

**What to implement:**

Change visibility of three items from private to `pub(crate)`:

1. `fn resolve_from_source_map(...)` → `pub(crate) fn resolve_from_source_map(...)`
2. `struct SourceMapV3` → `pub(crate) struct SourceMapV3`
3. `fn decode_mappings(...)` → `pub(crate) fn decode_mappings(...)`

Also make `MappingSegment` crate-visible: `struct MappingSegment` → `pub(crate) struct MappingSegment` (needed for caching decoded mappings in the resolver).

**Acceptance criteria:**
- [ ] `resolve_from_source_map`, `SourceMapV3`, `decode_mappings`, `MappingSegment` are `pub(crate)`
- [ ] All existing tests in `source_mapper.rs` continue to pass
- [ ] The coverage module (`test/coverage.rs`) can `use crate::errors::source_mapper::{...}` to access these items

---

### Task 3: Replace SourceMapLookup with SourceMapResolver in coverage parsing

**Files:**
- `native/vtz/src/test/coverage.rs` (modified)

**What to implement:**

1. Replace the `SourceMapLookup` type alias with:
   ```rust
   /// Source map resolver: given a script URL and byte offset, returns
   /// (original_file, original_line) or None if unmapped.
   pub type SourceMapResolver = dyn Fn(&str, u32) -> Option<(String, u32)>;
   ```

2. Add a `byte_offset_to_line_col` helper function:
   ```rust
   /// Convert a byte offset to (line, column) using a precomputed newline index.
   /// Returns 1-indexed (line, column).
   pub fn byte_offset_to_line_col(newline_index: &[u32], offset: u32) -> (u32, u32) {
       let line = newline_index.partition_point(|&nl| nl < offset);
       let col = if line == 0 {
           offset
       } else {
           offset - newline_index[line - 1] - 1
       };
       (line as u32 + 1, col + 1)
   }
   ```

3. Refactor `parse_v8_coverage()` to accept `&SourceMapResolver` instead of `&SourceMapLookup`. For each range's `startOffset`, call the resolver to get the original file and line. For ranges, the resolver maps each byte offset to an original line, and the max-count logic per line remains the same.

4. When the resolver returns `Some((original_file, original_line))`, use the original_line. When it returns `None`, fall back to the existing 40-chars-per-line estimation (unchanged behavior for unmapped files).

5. Update the `FileCoverage.file` field: when source maps are available, use the resolved original file path instead of the compiled URL.

6. Update all existing tests to use `&|_, _| None` (two-arg closure) instead of `&|_| None`.

**Acceptance criteria:**
- [ ] `SourceMapResolver` type replaces `SourceMapLookup`
- [ ] `byte_offset_to_line_col` correctly converts offsets (unit tests below)
- [ ] `parse_v8_coverage` uses the resolver for line mapping
- [ ] Fallback to 40-chars-per-line when resolver returns `None` still works
- [ ] All existing coverage tests pass with the updated closure signature
- [ ] Unit test: `byte_offset_to_line_col(&[3, 7], 0)` returns `(1, 1)` — first char
- [ ] Unit test: `byte_offset_to_line_col(&[3, 7], 4)` returns `(2, 1)` — first char of second line
- [ ] Unit test: `byte_offset_to_line_col(&[3, 7], 8)` returns `(3, 1)` — first char of third line
- [ ] Unit test: `byte_offset_to_line_col(&[], 5)` returns `(1, 6)` — single-line file

---

### Task 4: Wire source maps into the executor and runner

**Files:**
- `native/vtz/src/test/executor.rs` (modified)
- `native/vtz/src/test/runner.rs` (modified)

**What to implement:**

1. **Executor changes:**
   - Modify `execute_test_file_inner()` return type from `Result<(Vec<TestResult>, Option<serde_json::Value>), AnyError>` to include source maps and newline indices:
     ```rust
     Result<(Vec<TestResult>, Option<serde_json::Value>, HashMap<String, String>, HashMap<String, Vec<u32>>), AnyError>
     ```
     Or define a struct `CoverageArtifacts { coverage_data: Option<serde_json::Value>, source_maps: HashMap<String, String>, newline_indices: HashMap<String, Vec<u32>> }` for cleaner return.
   - After test execution, call `runtime.source_maps()` and `runtime.newline_indices()` to extract the data.
   - Update `TestFileResult` to include `source_maps: HashMap<String, String>` and `newline_indices: HashMap<String, Vec<u32>>` (both `#[serde(skip)]` since they're not serialized).

2. **Runner changes:**
   - In the coverage aggregation block (`run_tests()`), build a deduplicated source map store and newline index store from all `TestFileResult`s (dedup by key — multiple test files importing the same module produce identical maps).
   - Build a `SourceMapResolver` closure that:
     a. Strips `file://` prefix from the script URL to get the filename
     b. Looks up the source map JSON and newline index for that filename
     c. Parses the source map (`SourceMapV3` via `serde_json::from_str`)
     d. Decodes mappings (`decode_mappings`) — cached in a `RefCell<HashMap<String, Vec<MappingSegment>>>` inside the closure
     e. Calls `byte_offset_to_line_col` to get compiled (line, col)
     f. Calls `resolve_from_source_map` to get original (file, line)
     g. Returns `Some((original_file, original_line))` or `None`
   - Pass this resolver to `parse_v8_coverage()` instead of `&|_| None`.

**Acceptance criteria:**
- [ ] `TestFileResult` carries source maps and newline indices from the executor
- [ ] Runner builds a `SourceMapResolver` from aggregated source maps
- [ ] Source maps are deduplicated by filename across test file results
- [ ] Decoded mappings are cached per-file (not re-decoded per call)
- [ ] Coverage line numbers for compiled `.ts`/`.tsx` files use source-mapped positions
- [ ] Files without source maps (plain `.js`) fall back to byte-offset estimation
- [ ] All existing runner and executor tests pass
- [ ] Integration test: a simple `.ts` file compiled with known source map produces correct DA line numbers in LCOV output

---

### Task 5: End-to-end source map coverage test

**Files:**
- `native/vtz/src/test/coverage.rs` (modified — add tests)

**What to implement:**

Add an integration-level unit test that validates the full source map resolution pipeline:

1. Create a mock V8 coverage JSON with a script URL and known byte offsets
2. Create a matching source map JSON (hand-crafted VLQ mappings that map compiled positions to known original positions)
3. Create a matching newline index
4. Build a `SourceMapResolver` from these
5. Call `parse_v8_coverage()` with the resolver
6. Assert that the resulting `FileCoverage` has:
   - `file` set to the original source file (from the source map)
   - `lines` with keys matching original line numbers (not compiled line numbers or byte-offset estimates)

**Acceptance criteria:**
- [ ] Test proves that source-mapped line numbers are used when resolver returns `Some`
- [ ] Test proves that file path comes from source map's `sources` array
- [ ] Test proves that unmapped ranges still fall back to byte-offset estimation
- [ ] `cargo test --all` passes with all new and existing tests green
- [ ] `cargo clippy --all-targets --release -- -D warnings` passes
- [ ] `cargo fmt --all -- --check` passes
