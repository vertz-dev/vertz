# Phase 2: Native Compiler Support

## Context

Phase 1 shipped the runtime helper `__html()` and the `HTMLAttributes.innerHTML` type. This phase teaches the native Rust compiler in `native/vertz-compiler-core/` to recognize the `innerHTML` JSX attribute, emit a `__html()` call for both static and reactive cases, and emit four diagnostics for common misuse.

**Design doc:** `plans/2761-raw-html-injection.md`
**Prereq:** Phase 1 landed (so `__html()` exists in `@vertz/ui`'s `dom/index.ts`).

Key file: `native/vertz-compiler-core/src/jsx_transformer.rs`. Existing `process_attr` function (~line 1459) special-cases `className`, `ref`, `on*`, IDL props. We are adding an **element-level** pre-pass that handles `innerHTML` *before* `process_attr` runs, because mutual-exclusion and diagnostic emission need sibling visibility.

Every task is strict TDD. Compiler tests live next to the code in the same crate (search for existing `#[test]` blocks in `jsx_transformer.rs` or adjacent test modules).

Quality gates for this phase (in `native/`):
```bash
cargo test --all && cargo clippy --all-targets -- -D warnings && cargo fmt --all -- --check
```

Also run the TS-side test suite afterward because compiler changes can regress compiled output consumed by TS tests.

---

## Task 2.1: Element-level `innerHTML` detection + `__html()` emission

**Files:** (≤5)
- `native/vertz-compiler-core/src/jsx_transformer.rs` (modified — add element-level pass + emission)
- `native/vertz-compiler-core/src/runtime_helpers.rs` (modified — register `__html` as a known helper if a registry exists; otherwise skip)
- `native/vertz-compiler-core/src/diagnostics.rs` (modified or new — add `E0761`)
- New or existing compiler-fixture test file under `native/vertz-compiler-core/src/__tests__/` or `tests/` (pick the convention already in use)

**What to implement:**

1. Locate the element transform that iterates a JSX element's attributes (the caller of `process_attr`). In that function, before the attribute loop:
   - Scan attrs for a name equal to `"innerHTML"`.
   - If found AND the element has non-empty children (text or JSX children), emit diagnostic **E0761**: `"<TAG> has both 'innerHTML={…}' and JSX children. innerHTML replaces all children — delete the children, or delete innerHTML and use JSX instead."`
   - If found and no children, remove the attr from the normal attribute list and emit:
     - Static literal value → `__html(_el, () => "<literal>")`
     - Expression value → `__html(_el, () => <expr>)`
   - Always emit as a deferred helper call — never `_el.innerHTML = …` directly.

2. The emission must happen in the element assembly step so the generated code looks like:
   ```ts
   const _el = __element('pre');
   _el.setAttribute('class', 'x');
   __html(_el, () => htmlExpr);
   ```

3. `__html` must be added to the compiler's list of auto-imported runtime helpers (alongside `__attr`, `__prop`, etc.) so the emitted code resolves. Look at how `__attr` gets auto-imported and mirror it.

**Acceptance criteria (compiler unit tests — fixtures):**
- [ ] `<pre innerHTML="<b>x</b>" />` compiles to code containing `__html(_el, () => "<b>x</b>")` (exact literal preservation; escape quotes correctly).
- [ ] `<pre innerHTML={someVar} />` compiles to `__html(_el, () => someVar)`.
- [ ] `<pre className="c" innerHTML={x} />` emits the class setter AND `__html(_el, () => x)`, in that order.
- [ ] `<pre innerHTML={x}>children</pre>` produces compiler error `E0761` with the exact message.
- [ ] `<pre innerHTML={x}></pre>` (empty children array) does NOT produce E0761.
- [ ] `<pre>{/* comment */}<span /></pre>` without innerHTML: unchanged output from before this phase.
- [ ] The emitted code imports `__html` automatically.

---

## Task 2.2: Diagnostics E0762, W0763, E0764

**Files:** (≤5)
- `native/vertz-compiler-core/src/jsx_transformer.rs` (modified)
- `native/vertz-compiler-core/src/diagnostics.rs` (modified — add codes)
- Fixture tests under the existing native test harness

**What to implement:**

### E0762 — `dangerouslySetInnerHTML` attribute
Before the normal attribute loop, scan for an attribute named `"dangerouslySetInnerHTML"` on any element. Emit:
> error[E0762]: 'dangerouslySetInnerHTML' is a React prop. Vertz uses 'innerHTML={string}' directly. Pass the string value, not `{ __html: ... }`.

### E0764 — `innerHTML` on SVG elements
If the element tag is in the SVG set (reuse the existing `isSVGTag()` equivalent in Rust — there is likely a `is_svg_tag` helper in the crate; grep for `svg` in `jsx_transformer.rs`) AND `innerHTML` attr is present, emit:
> error[E0764]: 'innerHTML' is not supported on SVG elements. Use JSX children instead.

### W0763 — Ref-body pattern warning
On an element with a `ref` attribute whose value is an arrow function like `(el) => { el.innerHTML = X }` OR `(el) => el.innerHTML = X`:
- Detect via AST match: the arrow's body is either a `BlockStatement` whose first statement is an `ExpressionStatement` assigning to `<refParam>.innerHTML`, or the body is such an `AssignmentExpression` directly.
- Emit a **warning** (not error):
> warning[W0763]: Setting .innerHTML inside a ref callback doesn't render during SSR and isn't reactive. Use 'innerHTML={…}' instead.

False-positive avoidance: only match the exact first-statement pattern; multi-statement bodies that do other work first are not flagged.

**Acceptance criteria (fixtures):**
- [ ] `<pre dangerouslySetInnerHTML={{ __html: x }} />` → error E0762 with exact message.
- [ ] `<svg innerHTML={x} />` → error E0764.
- [ ] `<path innerHTML={x} />` (another SVG tag) → error E0764.
- [ ] `<div innerHTML={x} />` → no SVG error, normal emission.
- [ ] `<pre ref={(el) => { el.innerHTML = x; }} />` → warning W0763 (element still compiles).
- [ ] `<pre ref={(el) => el.innerHTML = x} />` (no block) → warning W0763.
- [ ] `<pre ref={(el) => { doSomething(); el.innerHTML = x; }} />` → **no** warning (first statement isn't the assignment).
- [ ] `<pre ref={(el) => { el.focus(); }} />` → **no** warning (no innerHTML).

---

## Phase 2 Done When

- All acceptance criteria met for tasks 2.1 and 2.2.
- `cd native && cargo test --all && cargo clippy --all-targets -- -D warnings && cargo fmt --all -- --check` passes.
- TS-side `vtz test && vtz run typecheck && vtz run lint` still passes (no regression).
- One commit per task, each referencing `#2761`.
- Adversarial review written at `reviews/2761-raw-html-injection/phase-02-native-compiler.md` and all blockers addressed.
- End-to-end smoke: compiling `<pre innerHTML={highlight(code)} />` in a fixture produces working compiled JS that sets the DOM.
