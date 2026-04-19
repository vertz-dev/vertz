# @vertz/ui-auth

## 0.2.20

### Patch Changes

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

- [#2791](https://github.com/vertz-dev/vertz/pull/2791) [`36a459d`](https://github.com/vertz-dev/vertz/commit/36a459d191d732370cb4020533c7f8494622f1b5) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(ui): add `innerHTML` JSX prop for raw HTML injection

  Vertz now supports rendering raw HTML via an `innerHTML` prop on any HTML
  host element — the equivalent of React's `dangerouslySetInnerHTML`, but
  spelled as a single plain prop:

  ```tsx
  <div innerHTML={trustedMarkup} />
  ```

  The value is inserted verbatim. Callers are responsible for trust and
  sanitization; a `trusted()` helper is exported from `@vertz/ui` for
  marking already-sanitized values. The compiler rejects the React spelling
  (`dangerouslySetInnerHTML`) with a clear error (E0762), blocks pairing
  with children (E0761), and forbids the prop on SVG elements (E0764).
  The prop is reactive — bound signals update the element in place — and
  safe across SSR + hydration (server content is preserved until after
  hydration completes).

  Closes #2761.

- Updated dependencies [[`d8e23a1`](https://github.com/vertz-dev/vertz/commit/d8e23a13049afb0a8611c63081bf799dc9790f77), [`8bed545`](https://github.com/vertz-dev/vertz/commit/8bed5454aeeec6c374ceb43bccc92841442d87da), [`e2db646`](https://github.com/vertz-dev/vertz/commit/e2db646ea254b60c9bec01d51400c1c46c328c98), [`8d8976d`](https://github.com/vertz-dev/vertz/commit/8d8976dd3d2d2475f37d0df79f8477fd3f58395f), [`36a459d`](https://github.com/vertz-dev/vertz/commit/36a459d191d732370cb4020533c7f8494622f1b5)]:
  - @vertz/ui@0.2.72
  - @vertz/icons@0.2.72

## 0.2.19

### Patch Changes

- [#1345](https://github.com/vertz-dev/vertz/pull/1345) [`0704bbb`](https://github.com/vertz-dev/vertz/commit/0704bbbc5561e2e2a6a6e0fd0a5f6af343f5f178) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Adopt `className` as the standard JSX prop for CSS classes, matching React convention. The `class` prop remains as a deprecated alias. All components, examples, and docs updated.

- Updated dependencies [[`a16511c`](https://github.com/vertz-dev/vertz/commit/a16511cd78256fe86d0d69393dd923353d6f445a), [`796ef1a`](https://github.com/vertz-dev/vertz/commit/796ef1a9826f401c6d0b08f424d53609debda029), [`a5b9cbe`](https://github.com/vertz-dev/vertz/commit/a5b9cbe68202345ab09002f7e42c2a5be0c917bf), [`520444e`](https://github.com/vertz-dev/vertz/commit/520444e3bdbbf3140b75ed3754870166544b5f88), [`0704bbb`](https://github.com/vertz-dev/vertz/commit/0704bbbc5561e2e2a6a6e0fd0a5f6af343f5f178), [`fa3d23c`](https://github.com/vertz-dev/vertz/commit/fa3d23ca2e92a4b734c4908ab274d8e75e45cbc0), [`823e301`](https://github.com/vertz-dev/vertz/commit/823e3016dcb4487a7cdf9af61aea940566ffb21c), [`86d33bd`](https://github.com/vertz-dev/vertz/commit/86d33bd56934d62441b031fb72dd86687f0d0845), [`4390036`](https://github.com/vertz-dev/vertz/commit/4390036144176fab7aa869ddcde621eece6f904c), [`a7e37c3`](https://github.com/vertz-dev/vertz/commit/a7e37c3dd29ac75183a085d34b0621d339f8402a), [`6be7ce8`](https://github.com/vertz-dev/vertz/commit/6be7ce859300258b926fa7a608e2656952fea0c1), [`301c401`](https://github.com/vertz-dev/vertz/commit/301c40192ddec0a306bba997a7f9e4ce4253aa95), [`c9d6c7e`](https://github.com/vertz-dev/vertz/commit/c9d6c7ef368efdc905b4e96302798b2db65522aa), [`9ccbe74`](https://github.com/vertz-dev/vertz/commit/9ccbe743c3c4eee109b69c9e3aff5df5f64c572e), [`e9cfc6a`](https://github.com/vertz-dev/vertz/commit/e9cfc6ad9b4b5dd5c518bea3c1982082d7e96e10), [`2ae15d1`](https://github.com/vertz-dev/vertz/commit/2ae15d116fc58c59a430472a98198377ccde1e4e), [`b5fbc7d`](https://github.com/vertz-dev/vertz/commit/b5fbc7d884b06c8a0cb0c48d22dae5fe2684a4cc), [`f356523`](https://github.com/vertz-dev/vertz/commit/f356523f7054b1b72d7936e3a7e13147904087dc), [`f9eccd5`](https://github.com/vertz-dev/vertz/commit/f9eccd56b2ecc4467b36b8e78bb3a072141ef93c), [`4079d6b`](https://github.com/vertz-dev/vertz/commit/4079d6b7567479f5f59648e81773f098c7696d02)]:
  - @vertz/ui@0.2.21
  - @vertz/icons@0.2.21

## 0.2.18

### Patch Changes

- [#1260](https://github.com/vertz-dev/vertz/pull/1260) [`b4cb6b6`](https://github.com/vertz-dev/vertz/commit/b4cb6b6826583c05efcdfd0af0e046a49f6eed91) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - refactor(ui): add canSignals() to avoid double-cast in ProtectedRoute

  Extracted signal-creation logic from can() into shared createAccessCheckRaw() helper.
  Added canSignals() that returns raw ReadonlySignal properties for framework code
  that runs without compiler transforms. Updated createEntitlementGuard to use
  canSignals() — eliminates the `as unknown as ReadonlySignal<boolean>` double-cast.

- [#1256](https://github.com/vertz-dev/vertz/pull/1256) [`c2355f9`](https://github.com/vertz-dev/vertz/commit/c2355f9d3e13feac615b00d48406e4626e92869b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(ui): components returning Node or Signal can now be used as JSX

  Narrowed Outlet return type to HTMLElement. Tightened Suspense and ErrorBoundary
  prop/return types from Node to JSX.Element.
  Refactored ProtectedRoute, AuthGate, AccessGate, UserName, and UserAvatar (in
  @vertz/ui-auth) from manual primitives to compiled Vertz JSX patterns — the
  compiler now handles reactive transforms automatically.

- [#1264](https://github.com/vertz-dev/vertz/pull/1264) [`e5ac67e`](https://github.com/vertz-dev/vertz/commit/e5ac67e24a05e0342a8c470ef741d7729ebeaf58) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - refactor(ui): UserName/UserAvatar update in-place instead of rebuilding subtree

  \_\_child now updates Text.data in-place when the reactive expression returns a
  primitive and the existing content is a single text node, avoiding DOM removal
  and recreation.

  Avatar always renders the img element and toggles visibility via CSS, so
  reactive src/alt changes update attributes in-place instead of rebuilding
  the entire element via \_\_conditional.

- Updated dependencies [[`b4cb6b6`](https://github.com/vertz-dev/vertz/commit/b4cb6b6826583c05efcdfd0af0e046a49f6eed91), [`c2355f9`](https://github.com/vertz-dev/vertz/commit/c2355f9d3e13feac615b00d48406e4626e92869b), [`e5ac67e`](https://github.com/vertz-dev/vertz/commit/e5ac67e24a05e0342a8c470ef741d7729ebeaf58)]:
  - @vertz/ui@0.2.18

## 0.2.17

### Patch Changes

- [#1253](https://github.com/vertz-dev/vertz/pull/1253) [`f284697`](https://github.com/vertz-dev/vertz/commit/f284697218e3ebcc7a196e8a6633c822e206646e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Extract `@vertz/ui-auth` package for JSX-based auth components. Moves `Avatar`, `UserAvatar`, `UserName`, `OAuthButton`, `OAuthButtons`, `AuthGate`, `AccessGate`, and `ProtectedRoute` from `@vertz/ui/auth` into the new `@vertz/ui-auth` package, converting DOM-primitive components to JSX. Non-component exports (`AuthContext`, `useAuth`, `can`, `createAccessProvider`, etc.) remain in `@vertz/ui/auth`.

- Updated dependencies [[`f284697`](https://github.com/vertz-dev/vertz/commit/f284697218e3ebcc7a196e8a6633c822e206646e), [`6d6a85c`](https://github.com/vertz-dev/vertz/commit/6d6a85c0fd9f354a8d077e2eb1afdcf065344b95)]:
  - @vertz/ui@0.2.17
