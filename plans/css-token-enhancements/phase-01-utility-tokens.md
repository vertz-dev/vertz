# Phase 1: Utility Tokens (#2642)

## Context

The Vertz `css()` function is missing common utility tokens: `font:mono/sans/serif`, `whitespace:pre`, `text-overflow:ellipsis`, `overflow-wrap:break-word`, and a `truncate` keyword. This phase adds them to both the TypeScript token tables/resolver and the Rust compiler tables.

Design doc: `plans/css-token-enhancements.md`

## Tasks

### Task 1: Add utility token types and tables (TypeScript)

**Files:**
- `packages/ui/src/css/token-tables.ts` (modified)
- `packages/ui/src/css/token-resolver.ts` (modified)
- `packages/ui/src/css/__tests__/token-resolver.test.ts` (modified)

**What to implement:**

1. **PropertyName type** — add `'whitespace' | 'text-overflow' | 'overflow-wrap'`

2. **PROPERTY_MAP** — add entries:
   - `whitespace: { properties: ['white-space'], valueType: 'raw' }`
   - `'text-overflow': { properties: ['text-overflow'], valueType: 'raw' }`
   - `'overflow-wrap': { properties: ['overflow-wrap'], valueType: 'raw' }`

3. **Keyword type** — add `'truncate' | 'whitespace-pre' | 'whitespace-pre-wrap'`

4. **KEYWORD_MAP** — add entries:
   - `truncate: [{ property: 'overflow', value: 'hidden' }, { property: 'white-space', value: 'nowrap' }, { property: 'text-overflow', value: 'ellipsis' }]`
   - `'whitespace-pre': [{ property: 'white-space', value: 'pre' }]`
   - `'whitespace-pre-wrap': [{ property: 'white-space', value: 'pre-wrap' }]`

5. **FONT_FAMILY_SCALE** — new constant:
   ```ts
   const FONT_FAMILY_SCALE: Record<string, string> = {
     mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
     sans: 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
     serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
   };
   ```

6. **resolveFont()** — check `FONT_FAMILY_SCALE` FIRST (before weight and size), return `{ property: 'font-family', value }` if matched.

**Acceptance criteria:**
- [ ] `resolveToken({ property: 'whitespace', value: 'pre', pseudo: null })` → `[{ property: 'white-space', value: 'pre' }]`
- [ ] `resolveToken({ property: 'whitespace', value: 'pre-wrap', pseudo: null })` → `[{ property: 'white-space', value: 'pre-wrap' }]`
- [ ] `resolveToken({ property: 'text-overflow', value: 'ellipsis', pseudo: null })` → `[{ property: 'text-overflow', value: 'ellipsis' }]`
- [ ] `resolveToken({ property: 'overflow-wrap', value: 'break-word', pseudo: null })` → `[{ property: 'overflow-wrap', value: 'break-word' }]`
- [ ] `resolveToken({ property: 'truncate', value: null, pseudo: null })` → 3 declarations (overflow, white-space, text-overflow)
- [ ] `resolveToken({ property: 'whitespace-pre', value: null, pseudo: null })` → `[{ property: 'white-space', value: 'pre' }]`
- [ ] `resolveToken({ property: 'whitespace-pre-wrap', value: null, pseudo: null })` → `[{ property: 'white-space', value: 'pre-wrap' }]`
- [ ] `resolveToken({ property: 'font', value: 'mono', pseudo: null })` → `[{ property: 'font-family', value: 'ui-monospace, ...' }]`
- [ ] `resolveToken({ property: 'font', value: 'sans', pseudo: null })` → `[{ property: 'font-family', value: 'ui-sans-serif, ...' }]`
- [ ] `resolveToken({ property: 'font', value: 'serif', pseudo: null })` → `[{ property: 'font-family', value: 'ui-serif, ...' }]`
- [ ] Existing `font:bold` and `font:lg` still work (no regression)
- [ ] All quality gates pass: `vtz test packages/ui && vtz run typecheck`

---

### Task 2: Add utility tokens to Rust compiler tables

**Files:**
- `native/vertz-compiler-core/src/css_token_tables.rs` (modified)
- `native/vertz-compiler-core/src/css_transform.rs` (modified, if multi-mode needs update)

**What to implement:**

1. **property_map()** — add arms:
   - `"whitespace" => Some((&["white-space"], "raw"))`
   - `"text-overflow" => Some((&["text-overflow"], "raw"))`
   - `"overflow-wrap" => Some((&["overflow-wrap"], "raw"))`

2. **keyword_map()** — add arms:
   - `"truncate" => Some(&[("overflow", "hidden"), ("white-space", "nowrap"), ("text-overflow", "ellipsis")])`
   - `"whitespace-pre" => Some(&[("white-space", "pre")])`
   - `"whitespace-pre-wrap" => Some(&[("white-space", "pre-wrap")])`

3. **resolve_multi_mode()** — update `"font"` arm to check font-family first:
   - Add `font_family_scale()` function returning `Option<&str>` for `mono`, `sans`, `serif`
   - In the `"font"` match arm: check `font_family_scale` first → `(vec!["font-family"], value)`, then weight, then size

**Acceptance criteria:**
- [ ] `cargo test --all` passes
- [ ] `cargo clippy --all-targets --release -- -D warnings` clean
- [ ] `cargo fmt --all -- --check` clean
- [ ] Font multi-mode: `resolve_multi_mode("font", "mono")` returns `Some((vec!["font-family"], ...))`
- [ ] Font multi-mode: `resolve_multi_mode("font", "bold")` still returns font-weight (no regression)
