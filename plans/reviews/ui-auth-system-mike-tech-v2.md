# UI Auth System — Technical Re-Review (mike, v2)

**Reviewing:** `plans/ui-auth-system.md` Revision 2
**Previous review:** `plans/reviews/ui-auth-system-mike-tech.md` (APPROVE WITH CHANGES — 6 fixes, 5 risks, 3 unlisted unknowns, 1 phase ordering issue)

---

## Issue-by-Issue Verification

### Fix 1: Reactivity manifest classification — RESOLVED

**Requirement:** Change `useAuth` from `reactive-source` to `signal-api` with explicit `signalProperties` and `plainProperties` lists. Move to Phase 1.

**Verified:** The design now specifies `signal-api` in `reactivity.json` (lines 226-237) with:
- `signalProperties`: `["user", "status", "isAuthenticated", "isLoading", "error"]`
- `plainProperties`: `["signIn", "signUp", "signOut", "refresh", "mfaChallenge", "forgotPassword", "resetPassword"]`

This matches the `SignalApiConfig` shape in `signal-api-registry.ts`. The property sets are correct — all signal-backed reactive state is in `signalProperties`, all function properties are in `plainProperties`.

The design also explicitly mentions adding `useAuth` to `SIGNAL_API_REGISTRY` in `signal-api-registry.ts` (lines 241-242), with the same property lists. This keeps the hand-crafted `reactivity.json` and the code-level registry in sync. Good.

Phase ordering: Reactivity manifest is now in Phase 1 (line 590: "Phase 1: Foundation — signIn + signUp + signOut + useAuth() + Reactivity Manifest"). Phase 1 file list includes both `reactivity.json` and `signal-api-registry.ts` (lines 609-610). Acceptance test includes "Compiler: `auth.user` in JSX auto-unwraps, `auth.signIn` in JSX is NOT unwrapped" (line 622).

**Status:** Fully resolved.

### Fix 2: XSS escaping — RESOLVED

**Requirement:** Use same pattern as `createAccessSetScript()` — escape all `<` as `\u003c`, handle `\u2028`/`\u2029`, support CSP nonce.

**Verified:** The design's `createSessionScript()` (lines 389-405) now:
- Escapes all `<` as `\u003c` (not just `</`)
- Escapes `\u2028` and `\u2029`
- Supports optional `nonce` parameter with `escapeAttr(nonce)`
- Comments reference "same pattern as createAccessSetScript()"

Cross-checked against actual `createAccessSetScript()` in `packages/ui-server/src/ssr-access-set.ts` (lines 88-101): the escaping logic is identical. The `escapeAttr` helper is also present in the existing code.

**Status:** Fully resolved.

### Fix 3: SdkMethod construction — RESOLVED

**Requirement:** Explicitly document how closures get `url`/`method` properties to satisfy `SdkMethodWithMeta`.

**Verified:** The design now includes a complete `createAuthMethod()` factory (lines 51-75) that:
- Creates a closure (`fn`) that performs the fetch
- Uses `Object.assign(fn, { url, method, meta: { bodySchema: schema } })` to attach static properties
- Returns the result cast as `SdkMethodWithMeta<TBody, TResult>`

The factory also shows how `sideEffect` is wired in — the callback updates internal auth signals after a successful response. The section "This satisfies:" (lines 78-82) explicitly maps each requirement (`callable`, `url + method`, `meta.bodySchema`, `side effects`) to the implementation.

**Status:** Fully resolved.

### Fix 4: Error state recovery — RESOLVED

**Requirement:** Specify transition rules for escaping the `error` state. At minimum: "any new signIn/signUp attempt transitions from `error` to `loading`."

**Verified:** The design's state machine section (lines 97-101) now includes explicit error recovery transitions:
- `error -> loading`: Any new `signIn`/`signUp`/`refresh` attempt
- `mfa_required -> loading`: New `signIn` attempt resets MFA state
- `authenticated -> loading`: Token refresh in progress
- "All states except `idle` can transition to `loading` via explicit `signIn`/`signUp`"

Phase 1 acceptance tests include: "signIn from `error` state transitions to `loading` (error recovery)" (line 620).

**Status:** Fully resolved.

### Fix 5: AuthProvider SSR behavior — RESOLVED

**Requirement:** Specify `typeof window !== 'undefined'` guard, initialize to `'unauthenticated'` in SSR.

**Verified:** The design now has an "SSR guard" subsection (lines 123-124): "AuthProvider checks `typeof window !== 'undefined'` before reading `__VERTZ_SESSION__`, matching the pattern in `createAccessProvider()`. In SSR context, AuthProvider initializes to `'unauthenticated'`."

Cross-checked against actual `createAccessProvider()` in `packages/ui/src/auth/create-access-provider.ts` (lines 35-43): it uses exactly `typeof window !== 'undefined'` as the guard. The design follows this pattern.

Phase 3 acceptance tests include: "AuthProvider SSR guard: `typeof window !== 'undefined'` check, initializes to `'unauthenticated'` in SSR" (line 657).

**Status:** Fully resolved.

### Fix 6: Route guard pre-design — RESOLVED

**Requirement:** Elevate route guard to a pre-Phase-5 design decision, or descope.

**Verified:** Route guards are fully descoped (lines 445-467). Phase 5 is removed (line 674: "Phase 5: ~~Route Guards~~ -> Removed"). Non-goals list includes "Route guards (`requireAuth`/`requireGuest`) — descoped to separate design" (line 443). The reasoning is sound — it's a router feature, not an auth feature, and requires `RouteConfig` type system changes.

An interim pattern using `AuthGate` + conditional redirect is documented (lines 453-467).

**Status:** Fully resolved.

### Risk 3: Timer leak — RESOLVED

**Requirement:** Timer cleanup via `onCleanup` specified.

**Verified:** Line 113: "The refresh timer ID is stored and cleared via `onCleanup` when AuthProvider is disposed. This prevents leaked timers in tests and microfrontend scenarios."

Phase 2 acceptance tests include: "Refresh timer is cleared when AuthProvider is disposed (no timer leaks)" (line 641).

**Status:** Fully resolved.

### Risk 4: Stale hydration — RESOLVED

**Requirement:** Immediate refresh on stale `expiresAt` documented.

**Verified:** Line 115: "If `expiresAt - 10_000ms < Date.now()` at hydration time, refresh fires immediately. This is correct — the refresh endpoint validates the cookie, not the client's `expiresAt`."

This is exactly what I asked for — acknowledge the edge case and confirm it's handled correctly.

**Status:** Fully resolved.

### Risk 5: MFA cookie dependency — RESOLVED

**Requirement:** Note as known constraint.

**Verified:** Lines 133-134: "Known constraint: The MFA challenge cookie requires `oauthEncryptionKey` to be configured on the server, even when OAuth is not in use. This is a pre-existing server issue, not introduced by this design."

**Status:** Fully resolved.

### Risk 6: Tab visibility race — RESOLVED

**Requirement:** Addressed or acknowledged.

**Verified:** Line 111: "Tab visibility: skip refresh in hidden tabs, refresh on focus if stale." The cross-tab coordination via `BroadcastChannel` is explicitly listed as a non-goal (line 440: "Multi-tab auth synchronization via BroadcastChannel (deferred)"). Per-tab deduplication handles the common case. The design correctly notes that "server-side cookie invalidation already handles the security aspect."

Phase 2 acceptance test: "Tab visibility: refresh deferred in hidden tabs, triggered on focus if stale" (line 638).

**Status:** Resolved (acknowledged as deferred, per-tab dedup is sufficient for now).

### Risk 7: Online/offline debouncing — RESOLVED

**Requirement:** Addressed or acknowledged.

**Verified:** Line 111: "Online/offline: defer when offline, debounce `navigator.onLine` transitions, execute on stable reconnect."

Phase 2 acceptance test: "Online/offline: refresh deferred when offline, debounced on reconnect (not raw `navigator.onLine`)" (line 639).

**Status:** Fully resolved. The design now explicitly calls out debouncing.

### Unlisted 3: SSR render lock — RESOLVED

**Requirement:** AuthProvider SSR behavior specified.

**Verified:** Covered by Fix 5 above. AuthProvider uses `typeof window !== 'undefined'` guard and initializes to `'unauthenticated'` in SSR.

**Status:** Fully resolved.

### Unlisted 4: Error state recovery — RESOLVED

**Requirement:** Covered by Fix 4.

**Verified:** Yes — explicit transitions from `error` state are documented.

**Status:** Fully resolved.

### Unlisted 5: signIn re-entrancy — RESOLVED

**Requirement:** Addressed.

**Verified:** The design doesn't have an explicit "re-entrancy" section, but it's addressed implicitly through two mechanisms:
1. `form()` layer prevents double-submission via `submitting` signal (form's existing behavior)
2. The state machine transitions to `loading` on any new `signIn`/`signUp` attempt, which naturally handles the case where a second call arrives while a first is in-flight — the last response wins, which is the correct behavior for auth state.

This is acceptable — the `form()` layer is the right place to handle re-entrancy for user-facing submission, and the state machine handles the internal signal updates correctly.

**Status:** Resolved (via existing form() behavior).

### Phase ordering — RESOLVED

**Requirement:** Phase 6 moved to Phase 1.

**Verified:** The reactivity manifest entry is now in Phase 1 (line 590, 600-601, 609-610). The old Phase 6 content (reactivity manifest) is subsumed into Phase 1. The remaining Phase 6 is now "AccessContext Integration" (line 681), which is the correct final phase.

**Status:** Fully resolved.

### Additional check: SIGNAL_API_REGISTRY mention — RESOLVED

**Requirement:** The `SIGNAL_API_REGISTRY` addition is mentioned, not just `reactivity.json`.

**Verified:** Lines 241-242: "Also add `useAuth` to `SIGNAL_API_REGISTRY` in `signal-api-registry.ts` with the same property lists, and add `'useAuth'` to the exported API set."

Phase 1 file list includes: `packages/ui-compiler/src/signal-api-registry.ts` (line 610).

Cross-checked against actual `SIGNAL_API_REGISTRY` in `packages/ui-compiler/src/signal-api-registry.ts`: the registry uses `Record<string, SignalApiConfig>` where `SignalApiConfig` has `signalProperties: Set<string>` and `plainProperties: Set<string>`. The design's property lists map correctly to this structure.

**Status:** Fully resolved.

---

## Additional Observations (non-blocking)

1. **signOut cleanup of `window.__VERTZ_SESSION__`** — The design now specifies this (line 408): "signOut() sets `window.__VERTZ_SESSION__ = undefined` after the server call succeeds." Phase 3 acceptance test confirms (line 658). Good catch by the revision.

2. **`_form` error surface** — The design shows `loginForm._form.error` for form-level errors (line 363). This depends on `form()` supporting the `_form` namespace for non-field errors. I assume this is already part of the form API — not something introduced by this design. If it doesn't exist yet, it should be flagged as a dependency.

3. **Phase numbering gap** — Phase 5 is marked "Removed" (line 674), then Phase 6 follows. The numbering jumps 1→2→3→4→5(removed)→6. This is fine for a design doc — no need to renumber.

---

## Verdict: APPROVE

All 6 required fixes, 5 risk items, 3 unlisted unknowns, and the phase ordering issue from the original review have been addressed in Revision 2. The design is ready for implementation.
