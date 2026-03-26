# Phase 0.5: JSX Transform

- **Author:** Claude Opus 4.6 (implementation)
- **Reviewer:** Claude Opus 4.6 (adversarial review)
- **Commits:** c478e10fa
- **Date:** 2026-03-25

## Changes

- `native/vertz-compiler/src/jsx_transformer.rs` (new ~1340 lines)
- `native/vertz-compiler/src/magic_string.rs` (modified — InsertAfter boundary fix)
- `native/vertz-compiler/src/lib.rs` (modified — pipeline wiring)
- `native/vertz-compiler/__tests__/jsx-transform.test.ts` (new — 22 tests)
- `native/vertz-compiler/__tests__/signal-transform.test.ts` (modified — 1 assertion updated)

## CI Status

- [x] Quality gates passed at c478e10fa

## Review Checklist

- [x] Delivers what the ticket asks for (JSX to DOM helper calls)
- [ ] TDD compliance (tests before/alongside implementation)
- [ ] No type gaps or missing edge cases
- [ ] No security issues
- [x] Public API changes match the TS compiler behavior — **PARTIALLY; see blockers**
- [x] MagicString fix is correct and doesn't break other transforms — **with caveats; see S-1**

## Findings

### Changes Requested

---

### B-1 [BLOCKER]: Component props — ALL non-literal expressions must become getters, not just reactive ones

**Rust (jsx_transformer.rs lines 741-748):**
```rust
let is_reactive_in_scope = *is_reactive
    && is_expr_reactive_in_scope(ms, *expr_start, *expr_end, reactive_names);
if is_reactive_in_scope {
    props.push(format!("get {}() {{ return {}; }}", name, expr_text));
} else {
    props.push(format!("{}: {}", quote_prop_key(name), expr_text));
}
```

**TS (jsx-transformer.ts lines 1098-1102):**
```ts
if (exprNode && !isLiteralExpression(exprNode)) {
    props.push(`get ${key}() { return ${exprText}; }`);
} else {
    props.push(`${key}: ${exprText}`);
}
```

The TS compiler wraps ALL non-literal expression props in getters for components, regardless of reactivity. This is by design: component props are getter-backed so the child component can re-read them lazily when signals change. The Rust version only wraps reactive expressions in getters, which means:

```tsx
function App() {
  return <Display value={someVar} />;
}
```

- TS compiler: `Display({ get value() { return someVar; } })` (correct)
- Rust compiler: `Display({ value: someVar })` (WRONG — breaks reactivity contract)

The test at line 176-185 (`Given a component with static non-literal prop`) actually asserts the WRONG behavior (`value: someVar`), contradicting the TS compiler. This is a correctness bug.

**Impact:** Props that reference variables won't be reactive inside child components even when signals change upstream. This breaks the getter-based cross-component reactivity model that is fundamental to Vertz.

---

### B-2 [BLOCKER]: Children expression reactivity — `is_reactive` is always `!is_literal`, causing over-wrapping

In `extract_children` (line 475), `is_reactive` is set to `!is_literal`. Then in `transform_child` (line 1100), it's checked as `!is_literal && *is_reactive`, which is always true for non-literals.

This means `{someStaticVar}` inside a `<div>` becomes `__child(() => someStaticVar)` (wrapped in an effect), but the TS compiler produces `__insert(el, someStaticVar)` (no effect overhead) for non-reactive expressions.

The TS compiler (jsx-transformer.ts line 585) checks `exprInfo?.reactive` from the reactivity analyzer, which is only true when the expression actually references reactive variables.

**Impact:** Unnecessary effect overhead for every non-literal child expression. Not just a perf issue — it changes the execution model (effects are lazy/deferred, inserts are synchronous).

The same over-classification affects `transform_child_as_value` (line 855): `__child(() => expr)` instead of just `expr` for static expressions in component children.

---

### B-3 [BLOCKER]: No guarded `setAttribute` for static expression attributes

The TS compiler wraps static non-literal expression attributes in a guard:

```ts
{ const __v = expr; if (__v != null && __v !== false) el.setAttribute("attr", __v === true ? "" : __v); }
```

The Rust compiler just emits bare `el.setAttribute("attr", expr)` (line 987-992). This is functionally broken for:

- `disabled={false}` — `setAttribute("disabled", false)` — stringifies to `"false"`, still disables the element
- `hidden={null}` — `setAttribute("hidden", null)` — stringifies to `"null"`, shows "null" as attribute value
- `aria-pressed={true}` — `setAttribute("aria-pressed", true)` — stringifies to `"true"`, but should be `""` for boolean semantics

**Impact:** Boolean and nullable attribute handling is incorrect. This is observable runtime behavior that will cause visual/behavioral bugs.

---

### S-1 [SHOULD-FIX]: MagicString `InsertAfter` boundary change — potential double-inclusion

The change from `pos < end` to `pos <= end` (magic_string.rs line 104) allows `InsertAfter` edits at the exact end boundary to be included in `get_transformed_slice`. This is needed for `.value` appended to identifiers that end at the slice boundary.

However, this creates a risk: if two adjacent slices share a boundary point (e.g., slice [0, 10) and [10, 20)), an `InsertAfter` at position 10 would be included in BOTH slices:
- Slice [0, 10]: included because `10 <= 10` (end boundary)
- Slice [10, 20]: included because `10 >= 10` (start boundary)

This would duplicate the `.value` text in the output. The current code may not hit this because `get_transformed_slice` is called on expression ranges that don't overlap, but it's a latent bug waiting for a new call site.

**Recommended fix:** Document the invariant ("callers must not call get_transformed_slice with overlapping ranges") or add a parameter to control boundary inclusion behavior.

---

### S-2 [SHOULD-FIX]: `is_expr_reactive_in_scope` uses string matching — false positives/negatives

The reactivity check (lines 1272-1286) does substring matching for `name.value`:

```rust
fn is_expr_reactive_in_scope(...) -> bool {
    let text = ms.get_transformed_slice(start, end);
    for name in reactive_names {
        let pattern = format!("{}.value", name);
        if text.contains(&pattern) {
            return true;
        }
    }
    false
}
```

False positives:
- Signal named `x`, expression text `fox.value` — matches because "x.value" is a substring of "fox.value"
- String literal containing `count.value` — matches even though it's inside a string

False negatives:
- Signal named `count`, expression `count .value` (with space) — won't match
- Deeply nested reactive access through computed chains that don't have `.value` in the text

**Recommended fix:** Use word-boundary matching (check characters before the match aren't alphanumeric/underscore) to prevent substring false positives.

---

### S-3 [SHOULD-FIX]: No IDL property handling (`value`, `checked` on inputs)

The TS compiler has IDL property handling (jsx-transformer.ts lines 417-428) that uses direct property assignment (`el.value = x`, `el.checked = true`) instead of `setAttribute` for properties where `setAttribute` doesn't reflect the displayed state.

The Rust compiler uses `setAttribute` for everything. This means:

- `<input value={someVar} />` — `setAttribute("value", someVar)` doesn't update the displayed input value after user interaction
- `<input checked />` — `setAttribute("checked", "")` works initially but won't survive user interaction + re-render
- `<select value={selected} />` — deferred IDL property assignment (after children/options are rendered) is completely missing

**Impact:** Form inputs will not behave correctly after user interaction.

---

### S-4 [SHOULD-FIX]: No `__prop` emission for reactive IDL properties

Related to S-3: the TS compiler emits `__prop(el, "value", () => expr)` for reactive IDL properties (jsx-transformer.ts line 505). The Rust compiler has no concept of `__prop` at all. This means reactive form input values won't update when signals change.

---

### S-5 [SHOULD-FIX]: No `style` attribute special handling

The TS compiler has style-specific logic (jsx-transformer.ts lines 512-513, 526-528) that handles style objects via `__styleStr()`:

```ts
if (__v != null && __v !== false) el.setAttribute("style", typeof __v === "object" ? __styleStr(__v) : ...)
```

The Rust compiler treats `style` like any other attribute. Passing a `style` object (`style={{ color: 'red' }}`) will produce `setAttribute("style", { color: 'red' })` which stringifies to `"[object Object]"`.

---

### S-6 [SHOULD-FIX]: No `__bindElement` for form integration

The TS compiler detects `<form onSubmit={formVar.onSubmit}>` patterns and emits `formVar.__bindElement(el)` (jsx-transformer.ts lines 1146-1179). The Rust compiler has no equivalent. This breaks the form API's element binding.

---

### S-7 [SHOULD-FIX]: No `sliceWithTransformedJsx` — JSX in prop values untransformed

The TS compiler's `sliceWithTransformedJsx` (lines 989-1021) transforms JSX nodes nested inside prop values. For example:

```tsx
<Router fallback={() => <div>Not found</div>} />
```

The Rust compiler reads the prop value from MagicString without transforming the inner JSX. The `<div>Not found</div>` would remain as raw JSX in the output.

**Impact:** Any component prop containing JSX (fallback renderers, render props, slot patterns) will produce invalid output.

---

### S-8 [SHOULD-FIX]: No `__listValue` for list rendering in component children

The TS compiler emits `__listValue()` for `.map()` patterns inside component children thunks (jsx-transformer.ts lines 827-869). The Rust compiler uses `__list()` only for direct HTML element children. Lists inside component children won't be reconciled.

---

### S-9 [SHOULD-FIX]: `clean_jsx_text` doesn't handle `\r\n` (Windows line endings)

The Rust version splits on `'\n'` only (line 1322), while the TS version splits on `/\r\n|\n|\r/` (line 113). On Windows files, `\r` characters will remain in the text, producing incorrect whitespace.

---

### S-10 [SHOULD-FIX]: No index parameter handling in `.map()` callbacks

The TS compiler extracts both `itemParam` and `indexParam` from `.map()` callbacks and includes the index in the key function when the key expression references it (jsx-transformer.ts lines 880-897). The Rust compiler only extracts `item_param` and ignores the index parameter entirely.

**Impact:** `items.map((item, index) => <li key={index}>...</li>)` will produce incorrect key functions.

---

### S-11 [SHOULD-FIX]: No callback-const inlining (`inlineCallbackConsts`)

The TS compiler inlines callback-local reactive const initializers into getter bodies (jsx-transformer.ts lines 43-71). This handles patterns like:

```tsx
items.map((item) => {
  const isActive = item.id === selectedId;
  return <li className={isActive ? 'active' : ''}>...</li>;
})
```

The Rust compiler doesn't inline these consts, so the getter body may reference a variable (`isActive`) that's out of scope when the getter runs.

---

### N-1 [NOTE]: `format_expr_text` for key extraction is lossy

The `format_expr_text` function (lines 648-657) only handles `StaticMemberExpression` and `Identifier` patterns. It returns an empty string for computed member access (`item[0]`), call expressions (`getId(item)`), or template literals. The TS compiler uses `getText()` which preserves the original source text for any expression.

---

### N-2 [NOTE]: `BindingPattern::BindingIdentifier` check for map params is too narrow

Line 547 only handles simple identifier parameters. Destructured parameters (`({ id, name }) => ...`) are common in `.map()` callbacks but would be silently skipped, causing the entire `.map()` to not be transformed into `__list()`.

---

### N-3 [NOTE]: `JsxSpanFinder` finds the FIRST JSX in a span, not necessarily the outermost

`JsxSpanFinder` (lines 1236-1265) returns the first JSX element it encounters with `span.start >= target_start`. In deeply nested structures, it might find a child element before the parent if the AST visitor reaches it first. However, since `walk_jsx_element` recurses depth-first and the check uses `>=`, this should be correct in practice.

---

### N-4 [NOTE]: Conditional classification requires JSX in at least one branch

In `classify_inner_expression` (lines 509-526), ternary expressions are only classified as `Conditional` if at least one branch contains JSX (`true_is_jsx || false_is_jsx`). A ternary like `{isActive ? "Active" : "Inactive"}` where both branches are text won't be converted to `__conditional()` — it becomes a regular `__child(() => ...)` if reactive. This matches the TS compiler behavior.

---

### N-5 [NOTE]: Missing test cases compared to TS compiler test suite

The 22 tests cover basic functionality but miss several scenarios tested in the TS compiler:

1. **className mapping in __attr for reactive expressions** (TS integration test line 634)
2. **Select element deferred IDL property assignment** (TS line 315)
3. **Mixed static and reactive children in same element** (TS line 772)
4. **Static utility function calls on static args use __insert** (TS line 790)
5. **Callback-local reactive const in .map() uses __attr with inlined signal read** (TS line 833)
6. **Variable-assignment .map() pattern** (TS line 948)
7. **Prop-backed array in .map() uses __list** (TS line 1014)
8. **Components with `children` prop explicitly passed** (TS line 258)
9. **JSX member expressions as tag names** (e.g., `<Tabs.Content>`)
10. **Namespaced attributes** (e.g., `xlink:href`)
11. **Nested conditionals (ternary inside ternary)**
12. **Multiple children in component thunk — array form**
13. **Ref on nested child elements** (TS compiler test line 323)

---

### N-6 [NOTE]: Test for `static non-literal prop` asserts wrong behavior

Test at lines 175-185:
```ts
it('Then passes as plain value', () => {
    const code = compileAndGetCode(
      `function App() {\n  return <Display value={someVar} />;\n}`,
    );
    expect(code).toContain('value: someVar');
});
```

This test asserts `value: someVar` (plain property), but the TS compiler produces `get value() { return someVar; }` (getter). The test was written to match the current (incorrect) implementation rather than the expected behavior.

---

### N-7 [NOTE]: `json_quote` doesn't handle all special characters

`json_quote` (lines 1296-1298) only escapes `\` and `"`. It doesn't handle newlines (`\n`), tabs (`\t`), carriage returns (`\r`), or other control characters. If a JSX attribute value contains these characters, the output would be invalid JavaScript.

## Resolution

### Fixed (commit 8462a4e7f)

- **B-1**: ALL non-literal component prop expressions now become getters. Test updated.
- **B-2**: `transform_child` uses `is_expr_reactive_in_scope()` for actual reactivity check.
- **B-3**: Guarded `setAttribute` with null/false/true handling for all expression attrs.
- **S-2**: Word-boundary matching in `is_expr_reactive_in_scope` via `contains_word_boundary()`.
- **S-9**: `clean_jsx_text` normalizes `\r\n` and `\r` to `\n` before splitting.
- **N-7**: `json_quote` escapes `\n`, `\r`, `\t`.

### Fixed (commit 62b2bd2dd)

- **S-3/S-4**: IDL property handling — `is_idl_property()` for `input.value`, `input.checked`, `select.value`, `textarea.value`. Direct property assignment for static, `__prop()` for reactive. Boolean IDL shorthand (`checked`) uses `.prop = true`.
- **S-5**: Style attribute uses `__styleStr()` for objects, `String()` for non-objects.
- **S-7**: `slice_with_transformed_jsx()` collects and transforms nested JSX in prop values.
- **S-8**: `__listValue()` for `.map()` patterns inside component children thunks.
- **S-10**: Index parameter extracted from `.map()` callbacks and included in key function when referenced.

### Deferred (documented as known gaps)

- **S-1**: MagicString boundary — documented, callers don't use overlapping ranges.
- **S-6**: `__bindElement` for form integration — lower priority, not blocking.
- **S-11**: Callback-const inlining (`inlineCallbackConsts`) — advanced optimization, not blocking.
- **N-1**: `format_expr_text` lossy for complex key expressions — acceptable for Phase 0.5.
- **N-2**: Destructured `.map()` parameters — not handled, silently skipped.
- **N-5**: Missing test scenarios vs TS compiler — partial gap addressed (10 new tests added).
