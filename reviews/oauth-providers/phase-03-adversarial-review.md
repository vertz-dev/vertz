# Adversarial Review: OAuth Providers — Phase 3

**Branch:** `feat/oauth-providers`
**Reviewer:** ben (automated)
**Date:** 2026-03-08

## Severity Levels

- **Critical** — Security vulnerability or data corruption risk
- **High** — Incorrect behavior in realistic scenarios
- **Medium** — Missing validation, incomplete error handling
- **Low** — Code quality, edge cases

---

## Findings

### [Critical] F1: Nonce generated but never validated — OIDC replay possible

The initiate handler generates a nonce and stores it in the encrypted state cookie. Google includes this nonce in the ID token. But the callback handler never passes the nonce to `getUserInfo` for validation. The `OAuthProvider.getUserInfo` interface has no `nonce` parameter.

Without nonce validation, an attacker who intercepts a legitimate Google ID token could replay it.

**Fix:** Pass `stateData.nonce` to `getUserInfo` (update interface), validate in `google.getUserInfo`.

### [Critical] F2: GitHub API calls missing required `User-Agent` header

GitHub's REST API requires a `User-Agent` header. Without it, the API returns HTTP 403. Tests pass because fetch is mocked.

**Fix:** Add `'User-Agent': 'vertz-auth/1.0'` to both fetch calls in `github.ts`.

### [High] F3: No rate limiting on OAuth routes

Design spec requires `oauth:{ip}` — 10 per 5min. OAuth routes have zero rate limiting, allowing unchecked calls to external provider APIs.

**Fix:** Add `rateLimitStore.check()` at start of both OAuth route handlers.

### [High] F4: Empty email from GitHub/Discord creates colliding user records

Users with no verified email get `email: ''`. Multiple such users share the same key in `byEmail` Map, overwriting each other. OAuth path bypasses email validation that signup enforces.

**Fix:** Validate `userInfo.email` is non-empty and contains `@` before creating user.

### [Medium] F5: User cancellation (`?error=access_denied`) handled opaquely

When user cancels OAuth, provider sends `?error=access_denied` with no `code`. Current code sends empty code to provider (unnecessary network call), fails, and returns generic `token_exchange_failed` instead of `access_denied`.

**Fix:** Check `url.searchParams.get('error')` before `try` block.

### [Medium] F6: `InMemoryOAuthAccountStore.linkAccount` allows duplicate entries

Calling `linkAccount` twice with same `(userId, provider, providerId)` creates duplicate entries in `byUserId`. No dedup check.

**Fix:** Check for existing link before pushing.

### [Medium] F7: `oauthAccountStore` not disposed in `auth.dispose()`

`dispose()` calls `sessionStore.dispose()` and `rateLimitStore.dispose()` but not `oauthAccountStore.dispose()`.

**Fix:** Call `oauthAccountStore?.dispose()` in `dispose()`.

### [Medium] F8: `oauthCallbackUrl` config is dead code

Declared in `AuthConfig` but never read anywhere in `index.ts`.

**Fix:** Remove from config or implement per-provider redirect URL construction.

### [Medium] F9: `OAuthStateData.redirectUrl` is a dead field

Declared in the type but never set or read. Suggests per-request redirect URLs were planned but not implemented.

### [Low] F10: Route matching uses substring checks rather than segment matching

`path.includes('/callback')` would incorrectly match provider IDs containing "callback" as substring.

---

## Action Items

| Finding | Severity | Action |
|---------|----------|--------|
| F1 | Critical | Fix: add nonce validation to getUserInfo |
| F2 | Critical | Fix: add User-Agent header to GitHub provider |
| F3 | High | Fix: add rate limiting to OAuth routes |
| F4 | High | Fix: validate email before creating user |
| F5 | Medium | Fix: handle `?error=` param in callback |
| F6 | Medium | Fix: dedup in linkAccount |
| F7 | Medium | Fix: dispose oauthAccountStore |
| F8 | Medium | Remove dead oauthCallbackUrl config |
| F9 | Medium | Remove dead redirectUrl field |
| F10 | Low | Defer: current providers don't trigger this edge case |
