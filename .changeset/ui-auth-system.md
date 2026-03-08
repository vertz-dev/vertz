---
'@vertz/ui': patch
'@vertz/ui-server': patch
'@vertz/ui-compiler': patch
'@vertz/server': patch
---

Add client-side auth session management (AuthProvider, useAuth, AuthGate)

- AuthProvider wraps app with auth context, manages JWT session lifecycle
- useAuth() returns reactive state + SdkMethods (signIn, signUp, signOut, mfaChallenge, forgotPassword, resetPassword)
- SdkMethods work with form() for automatic validation and submission
- Proactive token refresh scheduling (10s before expiry, tab visibility, online/offline handling)
- AuthGate gates rendering on auth state resolution (shows fallback during loading)
- SSR hydration via window.__VERTZ_SESSION__ (no initial fetch needed)
- AccessContext integration: AuthProvider auto-manages access set when accessControl=true
- Server: signin/signup/refresh responses now include expiresAt timestamp
