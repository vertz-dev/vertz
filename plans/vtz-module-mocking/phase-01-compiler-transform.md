# Phase 1: Compiler Transform — Mock Detection & Import Rewriting

## Context

The vtz test runner needs module mocking (`vi.mock()` / `mock.module()`) to unblock 15 test files from migrating to `vtz test`. This phase implements the core compiler transform in Rust that detects mock calls, hoists them, and rewrites imports of mocked modules.

Design doc: `plans/vtz-module-mocking.md`

## Tasks

### Task 1: `collect_mocked_specifiers()` — Pre-scan for mocked module specifiers

**Files:**
- `native/vertz-compiler-core/src/mock_hoisting.rs` (new)
- `native/vertz-compiler-core/src/mock_hoisting.rs` tests (inline `#[cfg(test)]`)

**What to implement:**

Create `mock_hoisting.rs` with a function that walks `program.body` to find top-level `vi.mock('specifier', factory)` and `mock.module('specifier', factory)` calls. Returns a `HashSet<String>` of mocked specifier strings.

```rust
pub fn collect_mocked_specifiers(program: &Program) -> HashSet<String>
```

Detection rules:
- Match `ExpressionStatement` → `CallExpression` where callee is:
  - `vi.mock` (MemberExpression: object=`vi`, property=`mock`)
  - `mock.module` (MemberExpression: object=`mock`, property=`module`)
- First argument must be a `StringLiteral` — extract its value as the specifier
- Only match at `program.body` level (top-level statements), NOT inside function bodies

This function will be called by `lib.rs` BEFORE `build_import_aliases()` to provide an exclusion set, preventing the reactivity analyzer from applying signal transforms to mocked imports.

**Acceptance criteria:**
- [x] `collect_mocked_specifiers` returns correct specifiers for `vi.mock('foo', ...)` and `mock.module('bar', ...)`
- [x] Returns empty set when no mock calls exist
- [x] Ignores `vi.mock()` calls inside function bodies
- [x] Ignores `vi.fn()`, `mock()`, and other non-module-mock calls

---

### Task 2: Mock hoisting transform — core rewriting logic

**Files:**
- `native/vertz-compiler-core/src/mock_hoisting.rs` (extend)

**What to implement:**

The main transform function:

```rust
pub struct MockHoistingResult {
    pub mocked_specifiers: HashSet<String>,
    pub diagnostics: Vec<Diagnostic>,
}

pub fn transform_mock_hoisting(
    ms: &mut MagicString,
    program: &Program,
    source: &str,
) -> MockHoistingResult
```

This function:

1. **Collects top-level mock info:** For each top-level `vi.mock('spec', factory)` / `mock.module('spec', factory)`:
   - Extract specifier string and factory source text (the second argument's span)
   - Assign a mock index N (0, 1, 2, ...)
   - Record the full statement span for removal

2. **Collects top-level `vi.hoisted()` info:** For each top-level statement containing `vi.hoisted(factory)`:
   - Extract the entire statement source text
   - Record the statement span for removal
   - Mark for prepending (before mock factories)

3. **Collects import declarations for mocked specifiers:** For each `ImportDeclaration` where `source.value` matches a mocked specifier:
   - Determine import kind: named (`{ a, b }`), default (`def`), namespace (`* as ns`), side-effect (no specifiers), or mixed (`def, { a }`)
   - Record the import span for overwriting

4. **Applies MagicString edits:**
   - **Prepend hoisted code** at position 0 via `prepend_left`:
     - `vi.hoisted()` IIFEs (transform `vi.hoisted(() => expr)` to `(() => expr)()`)
     - Mock factory IIFEs: `const __vertz_mock_N = (factory)();`
     - Registration: `globalThis.__vertz_mocked_modules = globalThis.__vertz_mocked_modules || {}; globalThis.__vertz_mocked_modules['spec'] = __vertz_mock_N;`
   - **Overwrite mocked imports** with `const` destructuring:
     - Named: `const { a, b } = __vertz_mock_N;`
     - Default: `const def = "default" in __vertz_mock_N ? __vertz_mock_N.default : __vertz_mock_N;`
     - Namespace: `const ns = __vertz_mock_N;`
     - Side-effect: overwrite with empty string
     - Mixed: both default and named on separate lines
   - **Remove original `vi.mock()` / `vi.hoisted()` statements** by overwriting their span with empty string
   - **Replace `vi.importActual('spec')` calls** with `import('spec')` via overwrite (walk entire AST for these, not just top-level)

5. **Handles multiple mocks for the same specifier:** If multiple `vi.mock()` calls target the same specifier, use the last one (matching vitest behavior). Earlier calls are still removed.

**Acceptance criteria:**
- [x] `vi.mock('spec', factory)` generates correct IIFE + registration + import rewrite
- [x] `mock.module('spec', factory)` produces identical output
- [x] Named imports rewritten to `const { ... } = __vertz_mock_N`
- [x] Default imports rewritten with `"default" in` check
- [x] Namespace imports rewritten to `const ns = __vertz_mock_N`
- [x] Side-effect imports removed entirely
- [x] Mixed imports (default + named) produce two `const` declarations
- [x] `vi.hoisted()` IIFEs prepended before mock factories
- [x] `vi.importActual('spec')` replaced with `import('spec')` everywhere in file
- [x] Original `vi.mock()` / `vi.hoisted()` calls removed from body
- [x] Non-mocked imports left completely untouched
- [x] Transform is a no-op when no mock calls exist (returns empty result)
- [x] Multiple mocks for same specifier: last one wins

---

### Task 3: Diagnostics — compile errors and warnings

**Files:**
- `native/vertz-compiler-core/src/mock_hoisting.rs` (extend)

**What to implement:**

Add diagnostic emission to `transform_mock_hoisting`:

1. **Error: `vi.mock()` inside function body.** Do a `Visit` walk of the entire AST. For any `vi.mock()` / `mock.module()` call expression that was NOT found during top-level collection (Task 2 step 1), emit:
   ```
   vi.mock() must be called at the module top level. Move vi.mock() to the top of the file, and use mockFn.mockImplementation() inside test blocks to change behavior per test.
   ```
   Include line/column from the call expression span.

2. **Error: `vi.mock()` without factory.** If a top-level `vi.mock('spec')` call has only 1 argument (no factory), emit:
   ```
   vi.mock() requires a factory function. Provide a factory: vi.mock('module', () => ({ ... }))
   ```

3. **Warning: unused mock.** If a `vi.mock('spec', factory)` call's specifier does not match any `ImportDeclaration.source.value` in the file, emit:
   ```
   vi.mock('spec') has no matching import in this file — the mock will have no effect.
   ```

**Acceptance criteria:**
- [x] `vi.mock()` inside `it()` / `beforeEach()` / `describe()` / arrow function emits error with actionable message
- [x] `vi.mock('module')` without factory emits error
- [x] `vi.mock('typo', factory)` with no matching import emits warning
- [x] Diagnostics include correct line and column numbers
- [x] No false positives for valid top-level `vi.mock()` calls

---

### Task 4: Pipeline integration — wire into `compile()`

**Files:**
- `native/vertz-compiler-core/src/lib.rs` (modify)
- `native/vertz-compiler-core/src/mock_hoisting.rs` (add `pub mod` declaration)

**What to implement:**

1. Add `mock_hoisting` to `CompileOptions`:
   ```rust
   pub struct CompileOptions {
       // ... existing fields ...
       pub mock_hoisting: Option<bool>,
   }
   ```

2. Add `pub mod mock_hoisting;` to `lib.rs`.

3. In the `compile()` function, BEFORE TypeScript stripping and BEFORE `build_import_aliases()`:
   ```rust
   // Mock hoisting — must run before TS stripping and import alias building
   let mocked_specifiers = if options.mock_hoisting.unwrap_or(false) {
       let result = mock_hoisting::transform_mock_hoisting(&mut ms, &parser_ret.program, source);
       all_diagnostics.extend(result.diagnostics);
       result.mocked_specifiers
   } else {
       HashSet::new()
   };
   ```

4. Pass `mocked_specifiers` to `build_import_aliases()` as an exclusion set. Modify `build_import_aliases` signature to accept `exclusions: &HashSet<String>` and skip any `ImportDeclaration` whose `source.value` is in the exclusion set.

**Acceptance criteria:**
- [x] `CompileOptions { mock_hoisting: Some(true) }` enables mock hoisting
- [x] `CompileOptions { mock_hoisting: None }` or `Some(false)` skips mock hoisting (no-op)
- [x] Mock hoisting runs before TypeScript stripping
- [x] `build_import_aliases()` excludes mocked specifiers from signal API analysis
- [x] Diagnostics from mock hoisting appear in `CompileResult.diagnostics`
- [x] Existing tests still pass (no regression)
