# @vertz/errors

## 0.1.1

### Patch Changes

- [#751](https://github.com/vertz-dev/vertz/pull/751) [`9dc2134`](https://github.com/vertz-dev/vertz/commit/9dc21349e18b35d2f254c12160c27ac89acd7f0a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Migrate auth module and access enforcer to use Result from @vertz/errors instead of throwing exceptions or using custom result types.

  - Add `AuthValidationError` to `@vertz/errors` with `field` + `constraint` discriminators, replacing per-code error types (`INVALID_EMAIL`, `PASSWORD_TOO_SHORT`, etc.)
  - Access enforcer returns `Result<void, EntityForbiddenError>` instead of throwing `ForbiddenException`
  - Auth API methods return `Result<T, AuthError>` from `@vertz/errors` instead of custom `AuthResult<T>`
  - Remove `AuthResult` and local `AuthError` types from `@vertz/server` (consumers import `AuthError` from `@vertz/errors`)

- [#746](https://github.com/vertz-dev/vertz/pull/746) [`c19527e`](https://github.com/vertz-dev/vertz/commit/c19527e815fde35bdeefad9d00ceafa35eae1b0a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - HTTP error subclasses now expose literal status types (e.g., `FetchNotFoundError.status` is `404`, not `number`), enabling type narrowing after `instanceof` checks. `__element()` now returns specific HTML element types via overloads (e.g., `__element('div')` returns `HTMLDivElement`).
