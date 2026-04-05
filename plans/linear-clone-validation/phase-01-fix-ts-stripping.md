# Phase 1: Fix Compiler TS Stripping Bug

## Context
The Rust native compiler's `props_transformer` re-introduces TypeScript type annotations that `typescript_strip` already removed. It reads from the original source string instead of MagicString. This produces invalid JavaScript (`__props: { project: Project }`) that breaks both V8 (SSR) and browsers (client ES modules).

Design doc: `plans/vertz-dev-server/linear-clone-validation.md`

## Tasks

### Task 1: Fix props_transformer and update its test
**Files:**
- `native/vertz-compiler-core/src/props_transformer.rs` (modify)

**What to implement:**

1. In `transform_props()` (line 64-72), remove the type annotation preservation logic:
   - Delete lines 64-70 (the comment + `type_annotation` variable)
   - Change line 71 from `format!("__props{type_annotation}")` to `"__props".to_string()`
   - Update the comment on line 64 to explain that type annotations are NOT preserved because the Rust dev server serves output directly (no downstream transpiler)

2. Update the test `props_rewrite_preserves_type_annotation` (line 618-631):
   - Rename to `props_rewrite_strips_type_annotation`
   - Change the assertion from `code.contains("__props: CardProps")` to `!code.contains("__props: CardProps")` AND `code.contains("__props")`
   - Update the test comment to explain the new behavior

**Acceptance criteria:**
- [ ] `props_transformer.rs` no longer copies type annotations to `__props`
- [ ] Updated test asserts that `__props` does NOT have a type annotation
- [ ] `cargo test -p vertz-compiler-core` passes

---

### Task 2: Add regression tests to typescript_strip full-compile tests
**Files:**
- `native/vertz-compiler-core/src/typescript_strip.rs` (modify — tests section)

**What to implement:**

1. In `test_full_compile_strips_type_annotations` (line 873-911), add assertions:
   ```rust
   // Verify destructured props type annotation is stripped
   assert!(
       !result.code.contains(": { task: Task }"),
       "destructured props type survived full compile: {}",
       result.code
   );
   assert!(
       !result.code.contains("__props:"),
       "props type annotation survived: {}",
       result.code
   );
   ```

2. In `test_full_compile_strips_task_card_pattern` (line 915-990), add assertions:
   ```rust
   // Verify inline object type annotation is stripped from props
   assert!(
       !result.code.contains(": { task: Task"),
       "inline object type survived: {}",
       result.code
   );
   assert!(
       !result.code.contains("onClick?:"),
       "optional callback type survived: {}",
       result.code
   );
   ```

3. Add a NEW test `test_full_compile_strips_inline_object_type` that specifically tests the pattern found in the linear example:
   ```rust
   #[test]
   fn test_full_compile_strips_inline_object_type() {
       let source = r#"export function ProjectCard({ project }: { project: Project }) {
     return <div>{project.name}</div>;
   }"#;
       let result = crate::compile(
           source,
           crate::CompileOptions {
               filename: Some("project-card.tsx".to_string()),
               target: Some("dom".to_string()),
               fast_refresh: Some(true),
               ..Default::default()
           },
       );
       assert!(
           !result.code.contains(": { project: Project }"),
           "inline type annotation survived: {}",
           result.code
       );
       assert!(
           result.code.contains("__props"),
           "props should be rewritten to __props: {}",
           result.code
       );
   }
   ```

**Acceptance criteria:**
- [ ] Both existing full-compile tests have assertions for destructured props types
- [ ] New test covers the exact inline object type pattern from the linear example
- [ ] `cargo test -p vertz-compiler-core` passes
- [ ] `cargo clippy --all-targets --release -- -D warnings` clean

---

### Task 3: Fix AOT path and verify end-to-end
**Files:**
- `native/vertz-compiler-core/src/lib.rs` (modify — `compile_for_ssr_aot` function, line 644)

**What to implement:**

1. In `compile_for_ssr_aot` (line 644), the same `transform_props` call receives `source` (original string). Since the fix in Task 1 changes `transform_props` itself to not read type annotations from source, this is automatically fixed. However, verify by adding an assertion test.

2. Add a test in `typescript_strip.rs` or `lib.rs` tests that compiles with AOT mode and verifies no TypeScript survives:
   ```rust
   #[test]
   fn test_aot_compile_strips_props_type() {
       let source = r#"export function Card({ title }: { title: string }) {
     return <div>{title}</div>;
   }"#;
       let result = crate::compile(
           source,
           crate::CompileOptions {
               filename: Some("card.tsx".to_string()),
               target: Some("dom".to_string()),
               ..Default::default()
           },
       );
       assert!(
           !result.code.contains(": { title: string }"),
           "AOT output has TS annotation: {}",
           result.code
       );
   }
   ```

3. Verify the Rust dev server can load the linear example's SSR module:
   ```bash
   cd examples/linear
   ../../native/target/release/vtz dev --port 3099 --no-typecheck --no-auto-install
   # Server log should show "SSR module loaded" not "Failed to load"
   ```

4. Verify client-side compiled output is clean:
   ```bash
   curl -s http://localhost:3099/src/components/project-card.tsx | grep '__props'
   # Should show `__props)` not `__props: { project: Project }`
   ```

**Acceptance criteria:**
- [ ] `cargo test --all` passes
- [ ] `cargo clippy --all-targets --release -- -D warnings` clean
- [ ] `cargo fmt --all -- --check` clean
- [ ] `curl http://localhost:3099/src/components/project-card.tsx` output contains `__props` without type annotation
- [ ] SSR module loads without `SyntaxError` (server log shows loaded, not failed)
