# UI Auth System -- DX Re-Review (josh) -- Revision 2

## Verdict: APPROVE

Every concern from my initial review has been addressed. The revised design is clear, concrete, and ready to implement. Below is the item-by-item verification.

---

## Concern Resolution

### C1. SdkMethod factory gap -- RESOLVED

The `createAuthMethod` factory is now shown explicitly (lines 51-75). It uses `Object.assign(fn, { url, method, meta: { bodySchema: schema } })` to attach all required properties to the closure. The design doc also explains why this satisfies the `SdkMethodWithMeta` interface: callable, `.url` + `.method` for progressive enhancement, `.meta.bodySchema` for form validation. No ambiguity remains.

### C2. form() overload mismatch -- RESOLVED

Auth methods are now explicitly `SdkMethodWithMeta` (not plain `SdkMethod`). The `createAuthMethod` factory attaches `meta: { bodySchema: schema }`, so the first `form()` overload matches -- no explicit `schema` option needed. The design shows concrete schemas (`signInSchema`, `signUpSchema`, `mfaSchema`, `forgotPasswordSchema`, `resetPasswordSchema`) embedded into each method. The E2E example `form(auth.signIn)` now compiles correctly. This was my biggest DX concern and it's fully addressed.

### C3. AuthClientError undefined -- RESOLVED

`AuthClientError` is now a concrete interface with `code: AuthErrorCode`, `message: string`, `statusCode: number`, and `retryAfter?: number`. The `AuthErrorCode` union is exhaustive (10 codes covering credentials, tokens, MFA, rate limiting, network, and server errors). The error surface in forms is documented with examples showing both programmatic handling (`error.code === 'RATE_LIMITED'`) and field-level errors (`loginForm.email.error`). This is exactly what I asked for.

### C4. AuthGate/AccessGate overlap -- RESOLVED

Phase 6 (AccessContext Integration) now explicitly states that `AuthProvider` will internally provide `AccessContext`. The before/after example is clear: two providers + two gates collapses to one provider + one gate. The backward-compat story is also specified -- `AuthProvider` checks if `AccessContext` already has a value before providing one, so existing apps using separate `AccessContext.Provider` don't break.

### C5. Route guards descoped -- RESOLVED

Route guards are fully descoped to a separate design doc/issue. Phase 5 is removed (marked "Removed"). The design gives three concrete reasons why route guards are a router feature, not an auth feature. An interim pattern using `AuthGate` + conditional `navigate()` is shown. This is the right call.

### C6. signOut not SdkMethod -- RESOLVED

`signOut` is explicitly documented as `() => Promise<void>`, with a note: "NOT an SdkMethod. It takes no input and doesn't work with `form()`. Use it as a click handler." The E2E acceptance test includes `const handleLogout = () => auth.signOut()` and a type test `auth.signOut('invalid')` with `@ts-expect-error`. No developer will be confused about this.

### C7. User type loose bag -- RESOLVED (as deferred)

The `[key: string]: unknown` issue is explicitly called out as a "Known DX gap (deferred)" with a clear explanation: "A generic `User<T>` pattern requires generics flowing through context. Flagged for a follow-up design." Listed in Non-Goals as "Generic `User<T>` type (deferred -- requires generics flowing through context, separate design)." This is the right approach -- flag it, don't pretend it doesn't exist, and don't block shipping on it.

---

## Missing Use Case Resolution

### M1. returnTo pattern -- RESOLVED

The "Redirect after login pattern" section shows the exact code I suggested: read `returnTo` from `URLSearchParams`, pass to `navigate()` in `onSuccess`. Straightforward, no framework magic needed.

### M2. Auth state change events -- RESOLVED

The "Auth state change observation" section shows the `watch()` pattern for monitoring `auth.status` transitions. The example covers the exact session-expiry scenario I raised. The clarification about `auth.isLoading` vs `loginForm.submitting` is also here (which resolves M3 simultaneously).

### M3. Loading state during sign-in -- RESOLVED

Explicitly clarified: "`auth.isLoading` reflects session initialization and token refresh only. During `signIn`/`signUp` form submission, use `loginForm.submitting`." This is the right guidance.

### M4. Multi-tab sync -- RESOLVED (as non-goal)

Listed in Non-Goals: "Multi-tab auth synchronization via BroadcastChannel (deferred -- can be added later, server-side cookie invalidation already handles the security aspect)." The note about server-side cookie invalidation is a good addition -- it explains why this is safe to defer.

### M6. Email verification -- RESOLVED (as non-goal)

Listed in Non-Goals: "Email verification flow (`verifyEmail` SdkMethod -- can be added as a follow-up, server-side support exists)." Clear, explicit, no ambiguity.

---

## Additional Observations on Revision 2

**The Review Resolution Log is a nice touch.** Every finding from all three reviewers is tracked with resolution. This is the kind of design doc hygiene that prevents "wait, did we address that?" conversations.

**Reactivity manifest moved to Phase 1.** This was Mike's finding (S6) but it affects DX directly -- compiler auto-unwrapping must work from day one. Good call moving it.

**Fallback type corrected to `() => unknown`.** Nora's finding, but important for DX consistency. Matches `AccessGate` convention.

**`signal-api` vs `reactive-source` distinction.** The explanation for why `useAuth` must be `signal-api` (not `reactive-source`) is clear and correct. Without it, `auth.signIn.value` would be a runtime error. This is the kind of detail that prevents a week of debugging during implementation.

---

## One minor note (non-blocking)

The `signOut cleanup` mention says `signOut()` sets `window.__VERTZ_SESSION__ = undefined`. This is correct behavior, but the implementation should use `delete window.__VERTZ_SESSION__` rather than assigning `undefined` -- some hydration checks might use `'__VERTZ_SESSION__' in window` rather than truthiness. Either way, this is an implementation detail, not a design issue.

---

## Summary

All 7 DX concerns (C1-C7) are resolved. All relevant missing use cases (M1-M4, M6) are resolved -- either with concrete patterns or explicit non-goal declarations. The design is tight, the type flow is verified, and the phasing is sensible. Ship it.
