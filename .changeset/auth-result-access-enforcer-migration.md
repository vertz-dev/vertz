---
'@vertz/errors': patch
'@vertz/server': patch
---

Migrate auth module and access enforcer to use Result from @vertz/errors instead of throwing exceptions or using custom result types.

- Add `AuthValidationError` to `@vertz/errors` with `field` + `constraint` discriminators, replacing per-code error types (`INVALID_EMAIL`, `PASSWORD_TOO_SHORT`, etc.)
- Access enforcer returns `Result<void, EntityForbiddenError>` instead of throwing `ForbiddenException`
- Auth API methods return `Result<T, AuthError>` from `@vertz/errors` instead of custom `AuthResult<T>`
- Remove `AuthResult` and local `AuthError` types from `@vertz/server` (consumers import `AuthError` from `@vertz/errors`)
