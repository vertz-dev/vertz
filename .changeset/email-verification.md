---
'@vertz/server': patch
'@vertz/errors': patch
---

Add email verification and password reset flows to auth module.

- Email verification: opt-in via `emailVerification` config, sends token on signup via `onSend` callback
- POST /api/auth/verify-email — validates token, marks emailVerified: true
- POST /api/auth/resend-verification — rate limited 3/hour per userId
- Password reset: opt-in via `passwordReset` config with `onSend` callback
- POST /api/auth/forgot-password — always returns 200 (prevents email enumeration)
- POST /api/auth/reset-password — validates token, updates password, revokes sessions
- New error types: TokenExpiredError, TokenInvalidError
- New stores: InMemoryEmailVerificationStore, InMemoryPasswordResetStore
