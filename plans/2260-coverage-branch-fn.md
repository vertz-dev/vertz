# Branch/Function Coverage and Source Map Support

**Issue:** #2260
**Status:** Draft
**Author:** cambridge-v1

---

## Summary

The `vtz test` runner currently reports only line coverage via V8's CDP Profiler. This design adds **branch coverage**, **function coverage**, and **source map resolution** so that coverage data is accurate and CI-ready.

All work is in Rust (`native/vtz/src/test/coverage.rs` and related files). No TypeScript API changes.

---

## API Surface

This feature has no user-facing TypeScript API. The "API" is the coverage output format.

### Configuration (unchanged)

```typescript
// vertz.config.ts — no new options needed
export default {
  test: {
    coverage: true,
    coverageThreshold: 95,
  },
};
```

### LCOV Output (new records)

Before:
```
TN:
SF:/src/math.ts
DA:1,1
DA:2,0
LF:2
LH:1
end_of_record
```

After:
```
TN:
SF:/src/math.ts
FN:1,add
FN:5,subtract
FN:9,(anonymous_1)
FNDA:3,add
FNDA:1,subtract
FNDA:0,(anonymous_1)
FNF:3
FNH:2
BRDA:3,0,0,3
BRDA:3,0,1,0
BRF:2
BRH:1
DA:1,3
DA:2,3
DA:3,3
DA:4,0
DA:5,1
LF:5
LH:4
end_of_record
```

New LCOV records:
- `FN:<start_line>,<name>` — function declaration
- `FNDA:<hit_count>,<name>` — function execution count
- `FNF:<count>` — functions found
- `FNH:<count>` — functions hit
- `BRDA:<line>,<block>,<branch>,<count>` — branch data
- `BRF:<count>` — branches found
- `BRH:<count>` — branches hit

**Anonymous function naming:** Functions with empty names from V8 use `(anonymous_N)` where N is a 1-indexed counter per file (matching c8/Istanbul convention). This ensures LCOV parsers always receive a non-empty name.

### Terminal Report (new columns)

Before:
```
File                                                  Lines  Covered      %
------------------------------------------------------------------------------
math.ts                                                  10       10  100.0% ✓
```

After:
```
File                                               Lines  Branch%    Fn%   Line%
----------------------------------------------------------------------------------
math.ts                                               10    50.0%  66.7%  100.0% ✓
----------------------------------------------------------------------------------
Total                                                 10    50.0%  66.7%  100.0%
```

Changes:
- `Covered` column replaced by `Branch%` and `Fn%` columns (covered count is derivable from line count + percentage).
- Final column is explicitly labeled `Line%` to make clear which metric the threshold check (✓/✗) applies to.
- **Total row** includes aggregate Branch% and Fn% alongside Line%.

The threshold check (`coverageThreshold`) continues to apply to **line coverage only**. Branch and function percentages are informational. Per-metric thresholds will be revisited once we have real-world feedback on branch/function coverage accuracy.

---

## Manifesto Alignment

### Principle 7: Performance is not optional
Source map parsing uses the existing `SourceMapper` infrastructure with VLQ decoding already in the codebase. Source maps are parsed on-demand per-file during coverage aggregation — no eager loading. Decoded mappings are cached per-file to avoid re-decoding when resolving multiple positions within the same file.

### Principle 1: If it builds, it works
The current 40-chars-per-line estimation produces inaccurate line numbers. With source map resolution, coverage reports match the actual source lines, making the data trustworthy for CI gates.

### Principle 8: No ceilings
V8's CDP Profiler already provides the block-level and function-level data we need (`detailed: true`, `callCount: true`). We're extracting what V8 gives us rather than building a custom instrumentation layer.

### Principle 2: One way to do things
Single pipeline: V8 CDP → parse → source-map resolve → format. No alternative coverage backends, no Istanbul compatibility layer.

---

## Non-Goals

1. **Condition coverage** — V8 block coverage doesn't distinguish individual boolean sub-expressions (`a && b`). We report branch coverage at the block level (if/else, ternary), not condition-level.
2. **Coverage merging** — No merging coverage across multiple test runs. Each `vtz test --coverage` produces a standalone report.
3. **HTML report generation** — LCOV output can be consumed by external tools (lcov, codecov, coveralls). We don't build an HTML renderer.
4. **Per-metric thresholds** — `coverageThreshold` applies to line coverage only. Separate thresholds for branch/function coverage are out of scope for this iteration.
5. **Coverage for non-compiled files** — Plain `.js` files without source maps get the existing byte-offset estimation. Improving this is out of scope.
6. **node_modules coverage** — Already excluded by existing URL filtering. This remains unchanged.

---

## Unknowns

### 1. V8 block range → branch mapping fidelity

**Question:** Do V8's nested block ranges map cleanly to source-level branches (if/else, ternary, `&&`/`||`)?

**Resolution strategy:** Implementation will test with concrete TypeScript patterns. V8's block coverage is well-documented: each function's first range covers the entire body, subsequent ranges cover basic blocks. Uncovered blocks within a covered parent indicate untaken branches. This is the same approach used by c8 and Node.js built-in coverage.

**Known edge cases to test in Phase 3:**
- **Ternary expressions**: V8 reports two nested ranges within a parent. The parent has the total count; children have individual branch counts.
- **Logical AND/OR short-circuit**: `a && b` produces a block for the right-hand side only. The implicit "else" (left side falsy) is inferred as `parent.count - child.count`.
- **Switch/case**: Each case is a separate block range, grouped under the same `block_number`.
- **Optional chaining (`?.`)**: V8 generates block ranges for the nullish case. These are reported as branches.
- **Empty else blocks**: V8 may not generate a range for an empty else. `BRF` count reflects only ranges V8 emits.

**Risk:** Low. V8 block coverage is the industry-standard mechanism used by Node.js, Deno, and c8.

### 2. Source map availability in test executor

**Question:** The `VertzModuleLoader` stores source maps in a `RefCell<HashMap<String, String>>` during compilation. Can we access these after test execution?

**Resolution:** The module loader is created as `Rc<VertzModuleLoader>` in `new_for_test()`. We'll clone the `Rc` before passing it to `JsRuntime` and store the clone in `VertzJsRuntime` as a new `module_loader: Rc<VertzModuleLoader>` field. A `pub fn source_maps(&self) -> HashMap<String, String>` method on `VertzJsRuntime` will clone and return the source map store. The executor returns source maps alongside coverage data.

---

## POC Results

No POC needed. The V8 CDP `Profiler.takePreciseCoverage` with `detailed: true` is already enabled in the executor and returns block-level ranges with function names. The `SourceMapper` with full VLQ decoding is proven infrastructure (used for error overlay stack traces). This is a wiring and parsing task, not a research task.

---

## Type Flow Map

Rust-only feature — no TypeScript generics. Data flow through the system:

```
V8 CDP Profiler.takePreciseCoverage
  │  (JSON: scripts[] → functions[] → ranges[])
  ▼
executor.rs: TestFileResult { coverage_data, source_maps }
  │  source_maps: HashMap<String, String> (script URL → source map JSON)
  │  Also stores: newline_offsets: HashMap<String, Vec<u32>> (for byte→line conversion)
  ▼
runner.rs: aggregate coverage from all test file results
  │  Deduplicates source maps by script URL (multiple test files may import same module)
  ▼
coverage.rs: parse_v8_coverage(json, source_map_resolver)
  │  Produces: Vec<FileCoverage>
  │    FileCoverage {
  │      file: PathBuf,
  │      lines: HashMap<u32, u32>,        ← existing
  │      functions: Vec<FunctionCoverage>, ← NEW
  │      branches: Vec<BranchCoverage>,   ← NEW
  │    }
  ▼
CoverageReport { files: Vec<FileCoverage> }
  │
  ├──▶ format_lcov()     → LCOV string with FN/FNDA/BRDA records
  └──▶ format_terminal() → terminal table with Branch%, Fn%, Line% columns
```

### Structural changes

**`VertzJsRuntime` (js_runtime.rs)**:
```rust
pub struct VertzJsRuntime {
    runtime: JsRuntime,
    captured_output: Arc<Mutex<CapturedOutput>>,
    module_loader: Rc<VertzModuleLoader>,  // NEW — retained for source map access
}
```

**Source mapper visibility** (`errors/source_mapper.rs`):
The following items change from `fn`/`struct` to `pub(crate)`:
- `resolve_from_source_map()` — called by the coverage module's resolver
- `SourceMapV3` — struct for parsing source map JSON
- `decode_mappings()` — VLQ mapping decoder

### Byte offset → line/column conversion

V8 coverage data provides byte offsets, but source maps work with (line, column). The compiled source text is **not retained** by the module loader after being passed to deno_core.

**Solution:** During compilation in `VertzModuleLoader::compile_source()`, compute a **newline offset index** — a `Vec<u32>` of byte positions where each newline occurs — and store it alongside the source map. This is O(code_length) once during compilation and uses minimal memory (~4 bytes per source line, vs full source text duplication).

```rust
/// Byte offsets of each newline in compiled source.
/// Used by coverage to convert V8 byte offsets → (line, col).
pub type NewlineIndex = Vec<u32>;

fn build_newline_index(code: &str) -> NewlineIndex {
    code.bytes()
        .enumerate()
        .filter(|(_, b)| *b == b'\n')
        .map(|(i, _)| i as u32)
        .collect()
}

fn byte_offset_to_line_col(index: &NewlineIndex, offset: u32) -> (u32, u32) {
    // Binary search for the line containing this offset
    let line = index.partition_point(|&nl| nl < offset);
    let col = if line == 0 {
        offset
    } else {
        offset - index[line - 1] - 1
    };
    (line as u32 + 1, col + 1) // 1-indexed
}
```

The module loader stores: `newline_indices: RefCell<HashMap<String, Vec<u32>>>`.

### New structs

```rust
/// Coverage data for a single function.
#[derive(Debug, Clone)]
pub struct FunctionCoverage {
    /// Function name. Anonymous functions use "(anonymous_N)" with per-file counter.
    pub name: String,
    /// Start line in original source (1-indexed).
    pub start_line: u32,
    /// Execution count.
    pub count: u32,
}

/// Coverage data for a single branch.
#[derive(Debug, Clone)]
pub struct BranchCoverage {
    /// Line number of the branch point in original source (1-indexed).
    pub line: u32,
    /// Block number (groups related branches).
    pub block_number: u32,
    /// Branch number within the block (0 = if-true, 1 = if-false, etc.).
    pub branch_number: u32,
    /// Execution count.
    pub count: u32,
}
```

### Source map resolution interface

```rust
// BEFORE: pre-computed line mapping (never actually used — always returns None)
pub type SourceMapLookup = dyn Fn(&str) -> Option<(String, Vec<(u32, u32)>)>;

// AFTER: point resolver using newline index + source map
pub type SourceMapResolver = dyn Fn(&str, u32) -> Option<(String, u32)>;
// Takes (script_url, byte_offset) → Option<(original_file, original_line)>
```

The resolver closure captures:
1. A `HashMap<String, String>` of source maps (script URL → JSON)
2. A `HashMap<String, Vec<u32>>` of newline indices (script URL → newline byte offsets)
3. A `HashMap<String, Vec<MappingSegment>>` for caching decoded mappings (populated lazily, decode once per file)

For each call: byte offset → `byte_offset_to_line_col()` → `resolve_from_source_map()` → `MappedPosition`.

---

## E2E Acceptance Test

### Test: Function and branch coverage with source maps

```
Given a TypeScript source file `src/math.ts`:
  export function add(a: number, b: number): number {
    return a + b;
  }
  export function subtract(a: number, b: number): number {
    if (a > b) {
      return a - b;
    } else {
      return b - a;
    }
  }
  export function unused(): void {
    console.log('never called');
  }

And a test file `src/math.test.ts`:
  import { add, subtract } from './math';
  it('add', () => expect(add(1, 2)).toBe(3));
  it('subtract positive', () => expect(subtract(5, 3)).toBe(2));

When `vtz test --coverage` is run:

Then the LCOV output contains:
  - FN records for `add`, `subtract`, `unused`
  - FNDA:≥1 for `add` and `subtract`
  - FNDA:0 for `unused`
  - FNF:3, FNH:2
  - BRDA records for the if/else in `subtract`
  - BRDA with count≥1 for the `a > b` true branch
  - BRDA with count=0 for the else branch (since 5 > 3, else is never taken)
  - BRF:2, BRH:1
  - DA records with source-mapped line numbers (not byte-offset estimates)

And the terminal report shows:
  - Branch coverage percentage (50.0%)
  - Function coverage percentage (66.7%)
  - Line coverage percentage
  - Total row with aggregate Branch%, Fn%, Line%
```

### Test: Source map resolution accuracy

```
Given a compiled .tsx file with source maps available in the module loader:

When coverage byte offsets are resolved through source maps:

Then each DA line number corresponds to the original TypeScript source line,
  not the compiled JavaScript line or a 40-char estimation.
```

---

## Phases

### Phase 1: Source Map Resolution
Wire source map resolution into the coverage pipeline. Specific changes:
- Add `module_loader: Rc<VertzModuleLoader>` field to `VertzJsRuntime`
- Add `newline_indices: RefCell<HashMap<String, Vec<u32>>>` to `VertzModuleLoader`, populated during compilation
- Expose `source_maps()` and `newline_indices()` methods on `VertzJsRuntime`
- Make `resolve_from_source_map()`, `SourceMapV3`, and `decode_mappings()` in `source_mapper.rs` `pub(crate)`
- Replace `SourceMapLookup` with `SourceMapResolver` in `parse_v8_coverage()`
- Build the resolver closure in `runner.rs` using collected source maps + newline indices
- Deduplicate source maps across test file results by script URL
- Cache decoded mappings per file in the resolver (decode once, binary search for lookups)

This immediately improves line coverage accuracy for all compiled files.

### Phase 2: Function Coverage
Extract function names and hit counts from V8 CDP data. Add `FunctionCoverage` struct, LCOV `FN`/`FNDA`/`FNF`/`FNH` records, terminal `Fn%` column, and total row aggregates.

### Phase 3: Branch Coverage
Analyze V8 block ranges to identify branches. Add `BranchCoverage` struct, LCOV `BRDA`/`BRF`/`BRH` records, terminal `Branch%` column, and total row aggregates. Test against known patterns: if/else, ternary, logical AND/OR, switch/case, optional chaining.

Each phase is independently useful and builds on the previous one.
