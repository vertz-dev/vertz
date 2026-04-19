# @vertz/native-compiler

## 0.2.73

### Patch Changes

- [#2830](https://github.com/vertz-dev/vertz/pull/2830) [`35eb962`](https://github.com/vertz-dev/vertz/commit/35eb9622670fa498e3846ab4bcaa064d1caece6c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(compiler): transform JSX inside `.map()` callbacks with destructured params

  Previously, when a `.map()` callback used destructuring in its parameter
  list, the JSX inside the callback was emitted verbatim, causing a
  `SyntaxError: Unexpected token '<'` in the browser.

  ```tsx
  const entries: [string, string][] = [
    ["a", "Alpha"],
    ["b", "Beta"],
  ];
  <div>
    {entries.map(([key, label]) => (
      <button key={key}>{label}</button>
    ))}
  </div>;
  ```

  The list classifier bailed to the generic-expression path whenever the
  first parameter wasn't a plain `BindingIdentifier`. It now accepts any
  binding pattern (array or object destructuring) and preserves the raw
  pattern source in the emitted render / key functions.

  Closes #2817.

- [#2828](https://github.com/vertz-dev/vertz/pull/2828) [`0c0cf38`](https://github.com/vertz-dev/vertz/commit/0c0cf38dfee14ce7763e5b051360ed4fa6e796db) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(compiler): don't reactify ternaries inside callback bodies in JSX branches

  When a conditional's non-JSX branch contained a nested callback with its
  own ternary (e.g., `onPick={(v) => selected = v ? env.id : null}`), the
  JSX compiler would lift that inner ternary out of its closure, rewriting
  it as `__conditional(() => v, () => env.id, () => null)` at the call site.
  This produced a runtime `ReferenceError: v is not defined` because the
  callback parameter `v` no longer existed in the outer scope.

  The branch-level `ConditionalSpanFinder` now stops descending into
  function/arrow-function bodies that are strictly nested inside the target
  branch span, so imperative ternaries inside callbacks stay in place while
  genuine JSX-level nested ternaries (`a ? <X/> : b ? <Y/> : <Z/>`) keep
  their reactive `__conditional` wrapping.

  Closes #2816.

- [#2827](https://github.com/vertz-dev/vertz/pull/2827) [`7e80041`](https://github.com/vertz-dev/vertz/commit/7e80041df6d5708fb54177edeef8bd211e368c7c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(compiler,ui): wrap multi-child component children in a DocumentFragment

  Previously, a component with multiple JSX children compiled to
  `Component({ children: () => [a, b] })`. Consumers such as
  `Context.Provider`, `Suspense`, and `ErrorBoundary` call `children()` and
  expect a single node — they got an array instead, which downstream
  `appendChild` calls rejected. This affected any component that treats
  `children` as a renderable slot, so code like

  ```tsx
  <RouterContext.Provider value={router}>
    <aside>…</aside>
    <main>…</main>
  </RouterContext.Provider>
  ```

  crashed at mount with a generic
  `TypeError: Failed to execute 'appendChild' on 'Node': parameter 1 is not of type 'Node'.`

  The compiler now emits a `DocumentFragment`-returning thunk for
  multi-child components, mirroring how `<>…</>` fragments are already
  handled. `Context.Provider` also wraps any hand-written array result in a
  `DocumentFragment` as a defensive fallback, replacing the previous
  dev-only throw (which was unreliable in the browser because
  `process.env.NODE_ENV` is not polyfilled).

  Closes #2821.

- [#2833](https://github.com/vertz-dev/vertz/pull/2833) [`5223868`](https://github.com/vertz-dev/vertz/commit/5223868cb3001349065cc246e0ca8a03ad9356f4) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(jsx): honor `defaultValue` / `defaultChecked` on `<input>` and `<textarea>`

  The React-style uncontrolled-initial-value props were silently dropped:

  ```tsx
  <textarea defaultValue="Hello world" />  // rendered empty
  <input defaultValue="initial" />          // rendered empty
  <input type="checkbox" defaultChecked /> // rendered unchecked
  ```

  Both have no HTML content attribute, so the compiler's fallback to
  `setAttribute("defaultValue", ...)` was a no-op in the browser.

  The native compiler and the test-time JSX runtime now route these through
  the IDL property path (`el.defaultValue = "..."`, `el.defaultChecked = true`),
  matching how `value` / `checked` are already handled. The SSR DOM shim
  serializes them to the correct initial HTML — `value="..."` for `<input>`,
  text content for `<textarea>`, and the `checked` attribute for
  `<input type="checkbox">` — so the value is visible before hydration.

  Closes #2820.

## 0.2.72

### Patch Changes

- [#2799](https://github.com/vertz-dev/vertz/pull/2799) [`d8e23a1`](https://github.com/vertz-dev/vertz/commit/d8e23a13049afb0a8611c63081bf799dc9790f77) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(ui,compiler): emit numeric/boolean raw CSS declarations from `css()` and `variants()`

  Raw object declarations inside nested selectors used to silently drop
  non-string values. Numeric values now flow through the same kebab-case +
  unitless/`px` rules as shorthand tokens, in both the runtime and the AOT
  compiler.

  ```ts
  css({
    card: [
      {
        "&:hover": {
          fontSize: 16, // → font-size: 16px
          opacity: 0.8, // → opacity: 0.8 (unitless)
          marginTop: -8, // → margin-top: -8px
          "--my-tone": 1, // → --my-tone: 1 (custom prop, no unit)
          padding: 0, // → padding: 0 (zero is unitless)
        },
      },
    ],
  });
  ```

  `UnaryExpression(-, NumericLiteral)` and `BooleanLiteral` are also accepted.
  The unitless property list is shared between `packages/ui/src/css/unitless-properties.ts`
  and `native/vertz-compiler-core/src/css_unitless.rs`, with a parity test
  already enforcing they stay in sync.

  Closes #2783.

- [#2795](https://github.com/vertz-dev/vertz/pull/2795) [`8bed545`](https://github.com/vertz-dev/vertz/commit/8bed5454aeeec6c374ceb43bccc92841442d87da) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - refactor(ui): drop shorthand-string CSS API in favour of object-form `css()` +
  `token.*`

  The array-form `css()` API is gone. `css()` and `variants()` now accept only
  object-form `StyleBlock` trees:

  ```tsx
  // Before
  css({ card: ["bg:background", "p:4", "rounded:lg"] });

  // After
  css({
    card: {
      backgroundColor: token.color.background,
      padding: token.spacing[4],
      borderRadius: token.radius.lg,
    },
  });
  ```

  Removed from the public API: `StyleEntry`, `StyleValue`, `UtilityClass`, `s`,
  `parseShorthand`, `resolveToken`, `ShorthandParseError`, `TokenResolveError`,
  `InlineStyleError`, `isKnownProperty`, `isValidColorToken`, and all
  token-table helpers.

  The Rust compiler (`@vertz/native-compiler`) is smaller: the array-form
  shorthand parser, the 1,900-line token tables, and the diagnostic pass that
  validated shorthand strings have all been deleted. Only object-form extraction
  remains.

  Closes #1988.

- [#2798](https://github.com/vertz-dev/vertz/pull/2798) [`e2db646`](https://github.com/vertz-dev/vertz/commit/e2db646ea254b60c9bec01d51400c1c46c328c98) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(compiler): emit valid code for callback `ref` props on host elements

  Previously, the native compiler always emitted `{expr}.current = {el}` for
  the `ref` JSX prop, assuming an object ref. For a callback ref such as
  `ref={(el) => { /* ... */ }}`, the output was the invalid JavaScript
  `(el) => { /* ... */ }.current = __el0` — a member expression cannot
  follow an arrow function with a block body, so the module failed to parse
  with "Unexpected token '.'".

  The fix routes both forms through a new `__ref(el, value)` runtime helper
  (matching the existing inline logic in `jsx-runtime/index.ts`) that calls
  the value if it is a function and otherwise assigns to `.current`.

  Closes #2788.

- [#2797](https://github.com/vertz-dev/vertz/pull/2797) [`483dbe2`](https://github.com/vertz-dev/vertz/commit/483dbe26c3af368cf70947d9f23429c967416505) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(compiler): route `innerHTML` through AOT content, not as an HTML attribute

  When a JSX element with an `innerHTML` prop was compiled through the AOT SSR
  path (for example a `<BrandedIcon>` sub-component), the attribute was being
  serialized as the HTML attribute `innerHTML="..."` rather than written into
  the element's content slot. The DOM path (via `__html()`) already handled it
  correctly; the AOT path missed it because `innerHTML` was not in the skip
  list and had no extraction helper.

  The AOT transformer now mirrors `dangerouslySetInnerHTML`: it skips
  `innerHTML` during attribute serialization and uses the expression as the
  element's content.

  Closes #2790.

## 0.2.67

### Patch Changes

- [#2725](https://github.com/vertz-dev/vertz/pull/2725) [`56e7e2f`](https://github.com/vertz-dev/vertz/commit/56e7e2f7a083f58a979a371166abceeecf204ecd) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(native-compiler): add repository/license/description fields to package.json

  npm publish with `--provenance` rejected the 0.2.66 publish with:

      npm error code E422
      Error verifying sigstore provenance bundle: Failed to validate
      repository information: package.json: "repository.url" is "",
      expected to match "https://github.com/vertz-dev/vertz" from provenance

  The `@vertz/native-compiler` package had never been published before, and its package.json was missing `repository`, `license`, and `description`. npm's provenance attestation requires the manifest's `repository.url` to match the source repo recorded in the provenance bundle. Added all three fields matching the pattern used by the other `@vertz/*` packages.

## 0.2.66

### Patch Changes

- [#2685](https://github.com/vertz-dev/vertz/pull/2685) [`4cc0aa9`](https://github.com/vertz-dev/vertz/commit/4cc0aa9d170f8fa8ae4f463fb8cff3eefcf1ee6c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix false-positive `batch` import injection when `async batch()` appears as an object method definition

## 0.1.1

### Patch Changes

- [#2265](https://github.com/vertz-dev/vertz/pull/2265) [`36b0f20`](https://github.com/vertz-dev/vertz/commit/36b0f2007822bc5c580d04a30d4ef1ecbee2146b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(ui): add form-level onChange with per-input debounce

  `<form onChange={handler}>` fires when any child input changes, receiving all current form values as a `FormValues` object. Per-input `debounce={ms}` delays the callback for text inputs while immediate controls (selects, checkboxes) flush instantly.

  **Breaking:** `onChange` on `<form>` now receives `FormValues` instead of a DOM `Event`. Use `ref` + `addEventListener` for the raw DOM event.
