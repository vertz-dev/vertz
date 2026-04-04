# Phase 2: Compiler Transforms (Rust)

## Context

This is the second phase of the form-level onChange with per-input debounce feature (#2151). This phase adds compiler transforms in the Rust native compiler to:
1. Transform `debounce={N}` on `<input>`, `<textarea>`, and `<select>` into `data-vertz-debounce="N"`
2. Transform `onChange={handler}` on `<form>` into `__formOnChange(el, handler)` instead of `__on(el, "change", handler)`
3. Register `__formOnChange` in the import injection system

Phase 1 (runtime helper) must be complete before this phase.

Design doc: `plans/form-onchange-debounce.md`

## Tasks

### Task 1: `debounce` prop transform in `jsx_transformer.rs`

**Files:**
- `native/vertz-compiler-core/src/jsx_transformer.rs` (modified)
- `native/vertz-compiler/__tests__/jsx-transform.test.ts` (modified)

**What to implement:**

In the `process_attr()` function (around line 1392), add handling for the `debounce` attribute when the tag is `input`, `textarea`, or `select`:

1. In the `AttrInfo::Static` branch: when `name == "debounce"` AND `tag_name` is `input`/`textarea`/`select`:
   - Rename the attribute to `data-vertz-debounce` (instead of passing `debounce` through)
   - Return `Some(format!("{}.setAttribute(\"data-vertz-debounce\", {})", el_var, json_quote(value)))`

2. In the `AttrInfo::Expression` branch: when `raw_name == "debounce"` AND `tag_name` is `input`/`textarea`/`select`:
   - Before the event handler check (`attr_name.starts_with("on")`)
   - For reactive expressions: generate `__attr(el_var, "data-vertz-debounce", () => String(expr))`
   - For static expressions: generate `{ const __v = expr; if (__v != null && __v !== false) el_var.setAttribute("data-vertz-debounce", __v === true ? "" : __v); }`
   - Use the same reactive/static logic as regular attributes, just with the renamed attribute

3. On any other element (e.g., `<div>`), `debounce` should pass through unchanged (no special handling).

**Helper function to add:**
```rust
fn is_debounce_element(tag_name: &str) -> bool {
    matches!(tag_name, "input" | "textarea" | "select")
}
```

**Acceptance criteria:**

```typescript
describe('debounce prop transform', () => {
  it('transforms static debounce on <input> to data-vertz-debounce', () => {
    // <input debounce={300} />
    // → __el.setAttribute("data-vertz-debounce", "300")
  });

  it('transforms static debounce on <textarea> to data-vertz-debounce', () => {
    // <textarea debounce={500} />
    // → __el.setAttribute("data-vertz-debounce", "500")
  });

  it('transforms static debounce on <select> to data-vertz-debounce', () => {
    // <select debounce={200} />
    // → __el.setAttribute("data-vertz-debounce", "200")
  });

  it('transforms reactive debounce expression to __attr with data-vertz-debounce', () => {
    // let ms = 300;
    // <input debounce={ms} />
    // → __attr(__el, "data-vertz-debounce", () => ...)
  });

  it('passes through debounce on non-form elements unchanged', () => {
    // <div debounce={300} />
    // → __el.setAttribute("debounce", "300")  (no transform)
  });

  it('works alongside other attributes on the same element', () => {
    // <input name="q" debounce={300} placeholder="Search" />
    // → setAttribute("name", "q"); setAttribute("data-vertz-debounce", "300"); setAttribute("placeholder", "Search")
  });
});
```

---

### Task 2: `onChange` on `<form>` transform in `jsx_transformer.rs`

**Files:**
- `native/vertz-compiler-core/src/jsx_transformer.rs` (modified)
- `native/vertz-compiler/__tests__/jsx-transform.test.ts` (modified)

**What to implement:**

In the `process_attr()` function, in the `AttrInfo::Expression` branch, before the general event handler code (line ~1434 `if attr_name.starts_with("on")`):

1. Add a special case: when `attr_name == "onChange"` AND `tag_name == "form"`:
   - Generate `__formOnChange(el_var, expr_text)` instead of `__on(el_var, "change", expr_text)`
   - Return early (don't fall through to the general event handler)

2. This must come BEFORE the general `on*` event handler check to take priority.

**Acceptance criteria:**

```typescript
describe('form onChange transform', () => {
  it('transforms onChange on <form> to __formOnChange', () => {
    // <form onChange={handleChange} />
    // → __formOnChange(__el0, handleChange)
    // NOT: __on(__el0, "change", handleChange)
  });

  it('does NOT transform onChange on other elements', () => {
    // <div onChange={handler} />
    // → __on(__el0, "change", handler)  (normal event handling)
  });

  it('does NOT transform other events on <form>', () => {
    // <form onSubmit={handler} />
    // → __on(__el0, "submit", handler)  (normal event handling)
  });

  it('works with other attributes on the same form', () => {
    // <form onChange={handler} action="/api" method="POST" />
    // → __formOnChange(__el0, handler); __el0.setAttribute("action", "/api"); ...
  });
});
```

---

### Task 3: Import injection for `__formOnChange`

**Files:**
- `native/vertz-compiler-core/src/import_injection.rs` (modified)

**What to implement:**

Add `"__formOnChange"` to the `DOM_HELPERS` array (line ~4). This array is alphabetically sorted, so insert between `__flushMountFrame` and `__insert`.

**Acceptance criteria:**

```typescript
describe('import injection for __formOnChange', () => {
  it('injects __formOnChange import when used in compiled output', () => {
    // Code containing __formOnChange(...)
    // → import { __formOnChange } from '@vertz/ui/internals';
  });

  it('does not inject when __formOnChange is not used', () => {
    // Code without __formOnChange
    // → no import added
  });
});
```

---

### Task 4: Run full Rust test suite

**Files:** (no changes — validation only)

**What to do:**
```bash
cd native && cargo test --all && cargo clippy --all-targets --release -- -D warnings && cargo fmt --all -- --check
```

**Acceptance criteria:**
- [ ] All existing tests pass (no regressions)
- [ ] All new tests pass
- [ ] No clippy warnings
- [ ] Format clean
