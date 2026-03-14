# @vertz/ui-auth

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
