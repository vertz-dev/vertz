# @vertz/ui-auth

## 0.2.17

### Patch Changes

- [#1253](https://github.com/vertz-dev/vertz/pull/1253) [`f284697`](https://github.com/vertz-dev/vertz/commit/f284697218e3ebcc7a196e8a6633c822e206646e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Extract `@vertz/ui-auth` package for JSX-based auth components. Moves `Avatar`, `UserAvatar`, `UserName`, `OAuthButton`, `OAuthButtons`, `AuthGate`, `AccessGate`, and `ProtectedRoute` from `@vertz/ui/auth` into the new `@vertz/ui-auth` package, converting DOM-primitive components to JSX. Non-component exports (`AuthContext`, `useAuth`, `can`, `createAccessProvider`, etc.) remain in `@vertz/ui/auth`.

- Updated dependencies [[`f284697`](https://github.com/vertz-dev/vertz/commit/f284697218e3ebcc7a196e8a6633c822e206646e), [`6d6a85c`](https://github.com/vertz-dev/vertz/commit/6d6a85c0fd9f354a8d077e2eb1afdcf065344b95)]:
  - @vertz/ui@0.2.17
