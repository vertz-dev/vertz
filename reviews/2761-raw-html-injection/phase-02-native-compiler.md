# Phase 2: Native Compiler

- **Author:** viniciusdacal (Claude Opus 4.7)
- **Reviewer:** Claude Opus 4.7 (adversarial bot)
- **Commits:** 409f0ed8b..42f57a7a3
- **Date:** 2026-04-17

## Changes

Commit 409f0ed8b (Task 2.1 — `__html` emission):
- `native/vertz-compiler-core/src/jsx_transformer.rs` — added `is_inner_html_attr()`, `build_inner_html_stmt()`, wired into `transform_element`; 5 new unit tests under `inner_html_*` at lines 4672-4745.
- `native/vertz-compiler-core/src/import_injection.rs` — added `__html` to `DOM_HELPERS`.
- `packages/ui/src/internals.ts` — re-export `__html` from `./dom/html`.

Commit 42f57a7a3 (Task 2.2 — diagnostics):
- `native/vertz-compiler-core/src/innerhtml_diagnostics.rs` (new, 431 lines) — `InnerHtmlVisitor`, `SVG_TAGS` list, `ref_body_starts_with_inner_html()`, and 14 unit tests.
- `native/vertz-compiler-core/src/lib.rs` — registered the module and appended `analyze_innerhtml()` to `all_diagnostics` in the per-component pre-transform phase.

## CI Status

Verified at 42f57a7a3:
- [x] `cargo test --package vertz-compiler-core --lib` — 1288 passed, 0 failed
  - 5 new `inner_html_*` tests in `jsx_transformer::tests` all pass.
  - 14 new tests in `innerhtml_diagnostics::tests` all pass.
- [x] `cd native && cargo clippy --all-targets -- -D warnings` — clean
- [x] `cd native && cargo fmt --all -- --check` — clean
- [x] `vtz test` at the monorepo root — the 19 failures are pre-existing
  (`@vertz/fetch` resolution + unrelated `query.test-d.ts` drift; unchanged
  from main and from the Phase 1 review baseline). No Phase-2 regressions.

## Review Checklist

- [x] Delivers what the phase plan asks for (with two gaps — see Should-fix)
- [x] TDD compliance — both commits land tests alongside the impl; 19 new
  Rust tests cover positive and negative cases for every diagnostic and for
  the emission logic.
- [x] No type gaps — all Rust signatures use concrete types; no `unsafe`;
  clippy clean.
- [x] No security issues — `__html(_el, () => value)` is the only emission
  path; the previous `.setAttribute("innerHTML", …)` codepath is bypassed;
  json_quote properly escapes literals.
- [x] Public API changes match design doc (with minor text deviations noted
  in Should-fix 1 and Nit 2).

## Findings

### Blockers

**No blockers.** The four diagnostics, the `__html` emission, and the
auto-import wiring all work as the phase plan specifies. Quality gates are
green.

### Should-fix

#### Should-fix 1 — Diagnostic message text deviates from design-doc spec

The design doc (`plans/2761-raw-html-injection.md:119`) pins E0762 as:

> `'dangerouslySetInnerHTML' is a React prop. Vertz uses 'innerHTML={string}' directly. Pass the string value, not { __html: … }.`

The phase plan (`plans/2761-raw-html-injection/phase-02-native-compiler.md:72`)
pins it as:

> `'dangerouslySetInnerHTML' is a React prop. Vertz uses 'innerHTML={string}' directly. Pass the string value, not `{ __html: ... }`.`

Implementation (`innerhtml_diagnostics.rs:131-138`) emits:

> `error[E0762]: 'dangerouslySetInnerHTML' is a React prop. Vertz uses 'innerHTML={string}' directly. Pass the string value, not `{ __html: ... }`.`

Matches the phase plan (backticks + ASCII `...`). But the design doc uses
a real ellipsis `…` and omits backticks. One of the two specs is wrong —
align them before the PR merges, and pin the exact string in a test. The
E2E acceptance test in the design doc at line 410 uses
`/E0762.*innerHTML=\{string\}/` (loose regex) — the Rust tests also use
loose substring matching on `"E0762"`, so no existing test would catch a
drift from the pinned spec. **Add at least one test that asserts the full
message** for each code (E0761, E0762, E0764, W0763), matching whichever
spec version the team chooses.

E0764's emitted message also differs from spec — the design doc line 268
pins:

> `'innerHTML' is not supported on SVG elements; use JSX children instead.`

The phase plan line 76 pins:

> `'innerHTML' is not supported on SVG elements. Use JSX children instead.`

Implementation (`innerhtml_diagnostics.rs:123-125`) emits:

> `'innerHTML' is not supported on SVG elements (<{tag}>). Use JSX children instead.`

The `(<{tag}>)` insertion is helpful context but not in either spec. Pick
one spec (the added tag context is strictly better UX — I'd keep it and
update the spec) and write a test that pins it.

Similarly, `innerhtml_diagnostics.rs:144-148` emits W0763 as:

> `Setting .innerHTML inside a ref callback doesn't render during SSR and isn't reactive. Use 'innerHTML={…}' instead.`

Design doc line 121:

> `Setting .innerHTML inside a ref callback does not render during SSR and isn't reactive. Use 'innerHTML={…}' instead.`

(`doesn't` vs `does not`) — minor wording drift.

#### Should-fix 2 — Missing acceptance-criterion test: emission order

Phase plan Task 2.1 acceptance #3:

> `<pre className="c" innerHTML={x} />` emits the class setter AND `__html(_el, () => x)`, in that order.

`jsx_transformer.rs:4732-4745` (`inner_html_coexists_with_class_and_events`)
verifies that both substrings appear but uses three independent
`result.contains(…)` calls — it does NOT assert ordering. Add an assertion
that the `setAttribute("class", …)` offset is less than the `__html(…)`
offset, or use a regex spanning both. The implementation is correct
(className goes through `process_attr` and is pushed to `stmts` in loop
order; `inner_html_stmt` is pushed after the loop at `jsx_transformer.rs:1217-1219`),
but the test would let a future refactor silently break the contract.

#### Should-fix 3 — Diagnostics don't run on module-level JSX

`analyze_innerhtml` is invoked once per `ComponentInfo` in `lib.rs:386-390`,
inside the per-component loop. Module-level JSX — e.g.
`defineRoutes({ '/': { component: () => <pre innerHTML={x}>y</pre> } })` —
is transformed by `transform_module_level_jsx` (emits `__html` via the
normal element-transform path) but never gets `analyze_innerhtml` run
against it, so **E0761/E0762/E0764/W0763 are silently skipped** on any JSX
that is not inside a named/var-declared component body.

This is a real false-negative for users who define page components inline
in `defineRoutes(...)`. Either run the diagnostics once at the program
level (recommended), or explicitly run it against the module-level JSX
ranges too. Add a fixture test:

```rust
#[test]
fn e0761_fires_on_module_level_jsx() {
    let msgs = diag_codes(
        r#"defineRoutes({ '/': { component: () => <pre innerHTML={x}>y</pre> } });"#,
    );
    assert!(has_code(&msgs, "E0761"), "{:?}", msgs);
}
```

This will fail with the current implementation. Either fix it or explicitly
document the limitation + tracking issue.

#### Should-fix 4 — `BooleanShorthand` innerHTML silently dropped

`<pre innerHTML />` (no value) is handled in `build_inner_html_stmt` at
`jsx_transformer.rs:107-110` by returning `None`, so **no** emission and
**no** diagnostic occurs — the attribute is silently dropped. The comment
says "handled by diagnostics", but no diagnostic exists for this case. TS
would reject `innerHTML: true` on the type, but an LLM could still write
it. Emit something like:

> `error[E076X]: 'innerHTML' requires a string value.`

Or explicitly test the current "silently drops" behavior so a future
refactor can't flip it. Not high severity (real users rarely write this)
but the comment on lines 107-110 claims coverage that doesn't exist.

### Nits

#### Nit 1 — `SVG_TAGS` list is duplicated from TS with no sync check

`innerhtml_diagnostics.rs:9-46` duplicates `packages/ui/src/dom/svg-tags.ts`'s
37 entries. The comment at line 8 calls out the mirror relationship, but
there is no test that asserts the two lists match. If someone adds `view`
or `a` (SVG hyperlink) to the TS set without touching the Rust const, the
lists silently diverge. Cheap fix: expose SVG_TAGS via `include_str!` from
a shared source, or add a Rust integration test that parses the TS file
and asserts equality. (Both lists are identical today — I verified
entry-by-entry — so this is a drift-prevention nit, not a live defect.)

Additionally, the list omits tags that DO exist in SVG but weren't in the
UI package's list: `a`, `switch`, `metadata`, `view`, `title`, `style`
(SVG variant). Pre-existing gap; out of scope.

#### Nit 2 — E0761 emits `<element>` placeholder when tag is a MemberExpression

`innerhtml_diagnostics.rs:159-167` constructs the error message using
`tag_name.as_deref().unwrap_or("element")`. For `<Mod.Pre innerHTML={x}>y</Mod.Pre>`
the output becomes `<element> has both 'innerHTML={…}' and JSX children`.
A `MemberExpression`-named component probably shouldn't even be flagged
(components receive `innerHTML` as a regular prop and may handle it
differently than intrinsic elements). The current impl flags it; fine —
but the `<element>` placeholder in the error message is ugly. Use the raw
source slice or skip the diagnostic when `tag_name` is None.

#### Nit 3 — W0763 does not fire on regular function refs

`ref_body_starts_with_inner_html` at line 210 only matches
`Expression::ArrowFunctionExpression`. A user who writes
`<pre ref={function(el) { el.innerHTML = x; }} />` gets no warning.
Design doc only specifies arrow functions, so this is technically correct,
but the same SSR-silent footgun exists for function expressions. Either
handle both or document the limitation.

#### Nit 4 — Inefficient per-component re-walk of the whole program

`analyze_innerhtml` creates a fresh `InnerHtmlVisitor` per component
(lib.rs:386-390) and each visitor walks the entire program, skipping JSX
outside `body_start..body_end`. For a file with N components, every JSX
element is walked N times. Negligible for today's files but worth a TODO
comment. Or flip the design to a single pre-pass that looks up the
component for each JSX element.

#### Nit 5 — AOT string transformer still supports `dangerouslySetInnerHTML`

`native/vertz-compiler-core/src/aot_string_transformer.rs:109-111,906-935`
extracts and emits `dangerouslySetInnerHTML` values in the SSR AOT path.
With Phase 2, any component using that attr gets an E0762 **and** still
compiles (diagnostics don't block codegen), so the AOT path continues to
work. But this is asymmetric with the DOM/hydration path, which no longer
supports `dangerouslySetInnerHTML`. Either:
- Drop the AOT handling of `dangerouslySetInnerHTML` in Phase 4 migration
  (it's now an error and there should be no users), or
- Route AOT through `innerHTML` too.

Not a Phase 2 regression (the AOT path already worked; Phase 2 just adds
the new warning), but flag for Phase 3 / 4 alignment.

### Pre-existing bugs found (not introduced by this phase)

None found. The 19 pre-existing TS test failures
(`@vertz/fetch` resolution, `query.test-d.ts` type drift) are unrelated to
this phase — they already failed on main and in the Phase 1 review.

## Resolution

All four should-fix items addressed. Nits 1, 3, 4, 5 deferred with
rationale below.

### Addressed

- **Should-fix 1 (message drift)** — Aligned the emitted messages with the
  design-doc spec: E0762 now uses a real ellipsis `…` and drops the
  backticks; E0764 uses a semicolon before "use JSX children instead" and
  keeps the helpful `(<tag>)` context (judged strictly-better UX than the
  plain spec string); W0763 uses "does not" to match the design doc. Added
  four exact-message pin tests (`e0761_message_text`,
  `e0762_message_text`, `e0764_message_text`, `w0763_message_text`) so any
  future drift fails a test.
- **Should-fix 2 (emission-order test gap)** — Extended
  `inner_html_coexists_with_class_and_events` in `jsx_transformer.rs` to
  assert that `setAttribute("class", …)` and `__on(…)` offsets both
  precede the `__html(…)` offset. Enforces Task 2.1 criterion #3.
- **Should-fix 3 (module-level JSX skipped)** — Refactored
  `analyze_innerhtml` to take only `(program, source)` and run once at
  the program level (see `lib.rs:343-347`), not inside the per-component
  loop. Added three regression tests covering E0761, E0762, and E0764
  firing inside `defineRoutes({'/': {component: () => …}})` inline
  arrows.
- **Should-fix 4 (BooleanShorthand silently dropped)** — Pinned the
  current drop behavior with `inner_html_boolean_shorthand_is_dropped_silently`
  (asserts no `__html`, no `.innerHTML`, no `setAttribute("innerHTML"` is
  emitted). The TS types already reject `innerHTML: true`, so this is a
  belt-and-suspenders test rather than a new diagnostic.

### Deferred

- **Nit 1 (SVG list sync)** — No drift today; worth a CI test that diffs
  the Rust const against `packages/ui/src/dom/svg-tags.ts`, but out of
  scope for this phase (the same risk exists across ~half a dozen other
  duplicated-constant lists in this crate — best solved crate-wide, not
  locally). Filed as follow-up for Phase 4.
- **Nit 2 (`<element>` placeholder for MemberExpression)** — Rarely hit
  in practice; if it does, the diagnostic text reads `<element>` instead
  of the module-qualified tag. Cheap fix, but not worth code churn in this
  phase. Flag for the lint-rule follow-up.
- **Nit 3 (regular function refs)** — Design doc scopes W0763 to arrow
  callbacks. Expanding to `function(el) { … }` refs would grow scope;
  deferred.
- **Nit 4 (per-component re-walk)** — Resolved by Should-fix 3; the
  diagnostics now walk once at program level, not per component.
- **Nit 5 (AOT string transformer still handles dangerouslySetInnerHTML)** —
  Phase 4 migration will delete `dangerouslySetInnerHTML` emission paths
  from the AOT transformer when the in-repo caller migration lands.
  Diagnostics now fire on any user code that reintroduces it.

All updates commit with `#2761`.
