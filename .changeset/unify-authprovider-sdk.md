---
'@vertz/ui': patch
---

refactor(auth): unify AuthProvider with generated auth SDK

BREAKING: AuthProvider now requires an `auth` prop (AuthSdk interface) instead of creating its own HTTP methods. The `basePath` prop is now optional (used only for access-set and auth operations not yet in the SDK like MFA, forgot/reset password).

Before:
```tsx
<AuthProvider basePath="/api/auth">
```

After:
```tsx
<AuthProvider auth={api.auth}>
```

- AuthProvider delegates signIn, signUp, signOut, refresh, and providers to the SDK
- `createAuthMethod()` removed from `@vertz/ui/auth`
- New `AuthSdk` and `AuthSdkMethod` types exported from `@vertz/ui/auth`
- `form(useAuth().signIn)` still works — AuthProvider attaches bodySchema from local validation schemas
