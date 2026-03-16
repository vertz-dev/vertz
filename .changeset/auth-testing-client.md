---
'@vertz/testing': patch
---

Add `createAuthClient()` for programmatic auth in E2E tests. Wraps auth HTTP endpoints (signup, signIn, switchTenant) and returns cookies in Playwright-compatible format, eliminating raw fetch boilerplate in test setup.
