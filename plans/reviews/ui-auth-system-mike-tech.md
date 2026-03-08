# UI Auth System — Technical Review (mike)

## Verdict: APPROVE WITH CHANGES

The design is architecturally sound. It follows existing patterns (AccessContext/AccessGate, SSR injection, SdkMethod + form()), which keeps integration risk low. But there are several concrete issues that need resolution before implementation starts. None are blockers to the overall approach — they're gaps in the spec that, if left unaddressed, will cause rework mid-implementation.

---

## Architecture Assessment

**Good:**
- Placing auth alongside the existing `packages/ui/src/auth/` access control code is correct. One import path for all auth concerns.
- Reusing `SdkMethod` + `form()` is elegant — no new form primitive, and the pattern is already proven and tested.
- The SSR hydration approach mirrors `createAccessProvider()` / `createAccessSetScript()` exactly. Low surprise factor.
- Single `useAuth()` hook returning both state and actions avoids the split-hook problem. Good DX call.
- The `AuthContext` with manual `__stableId` follows the HMR stability rule for `@vertz/ui` internal contexts.

**Concerns:**

1. **AuthProvider nesting with AccessContext.Provider** — The design says Phase 7 integrates AuthProvider with AccessContext, but doesn't specify the Provider nesting order. Right now, apps wrap with `<AccessContext.Provider value={createAccessProvider()}>`. After this feature, presumably `<AuthProvider>` should wrap AccessContext (since auth state drives access set refresh). But Phase 1 ships AuthProvider *without* AccessContext integration, meaning for 6 phases developers have two separate providers that aren't coordinated. Recommend: clarify in the design whether AuthProvider should *contain* an AccessContext.Provider internally (making it the single wrapper), or whether they remain siblings with explicit coordination. The answer affects the Phase 1 component tree shape.

2. **`useAuth()` reactivity classification** — The design registers `useAuth` as `reactive-source` in `reactivity.json` (like `useContext`). But looking at the API surface, `useAuth()` returns an object with signal properties (`user`, `status`, `isAuthenticated`, `isLoading`, `error`) AND plain function properties (`signIn`, `signUp`, `signOut`, `refresh`, `mfaChallenge`, `forgotPassword`, `resetPassword`). That's the `signal-api` pattern (like `query()`, `form()`, `can()`), not `reactive-source`. With `reactive-source`, the compiler treats the entire return value as reactive but doesn't know which specific properties are signals vs. plain. With `signal-api`, it knows exactly which properties to `.value`-unwrap and which to leave alone. **This is likely a bug in the design that will cause compiler transform issues.** The `SdkMethod` properties should NOT be `.value`-unwrapped. Fix: register as `signal-api` with explicit `signalProperties` and `plainProperties` lists.

---

## Security Review

**CSRF:** The design includes `X-VTZ-Request: 1` header on all auth requests, which matches the server's CSRF validation (`x-vtz-request` check). Correct. The `credentials: 'include'` ensures cookies are sent. Both are necessary and sufficient for the current server implementation.

**XSS via SSR injection:** The design's `createSessionScript()` escapes `</` and `<!--` in the JSON. But the existing `createAccessSetScript()` uses a more thorough escaping strategy — it escapes ALL `<` characters (not just `</`) and also handles `\u2028`/`\u2029`. The design's escaping is **weaker** than the existing pattern. Recommend: copy the exact escaping from `createAccessSetScript()` — replace `<` with `\u003c`, not `</` with `<\\/`. Also support the optional CSP nonce parameter.

**Token storage:** httpOnly cookies are correct — client can't read JWT content. The `expiresAt` in the response body is a good approach for scheduling refresh without exposing token contents. No localStorage/sessionStorage token storage. Clean.

**Session data in `window.__VERTZ_SESSION__`:** The `user` object is serialized into a global script tag. The `User` type has `[key: string]: unknown` — meaning arbitrary data gets injected into the HTML. If the server user object contains user-supplied strings (e.g., display name with `<script>` in it), the `createSessionScript()` escaping must handle this. The design's escaping is insufficient (see above). **Medium severity.**

**signOut cleanup:** The design doesn't specify whether `signOut()` clears `window.__VERTZ_SESSION__`. If it doesn't, a user who signs out and then refreshes the page (without a new SSR render) could re-hydrate the stale session from the global. The `signOut` SdkMethod should set `window.__VERTZ_SESSION__ = undefined` after the server call succeeds. **Low severity** (cookie is cleared server-side, so the refresh endpoint would fail, but the UI would briefly show stale user data).

---

## Risk Areas

### High

1. **`form()` compatibility with closures as SdkMethod** — `form()` reads `sdkMethod.url` and `sdkMethod.method` for the `action` and `method` form attributes (progressive enhancement). `auth.signIn` must have these as static properties on the closure. The design doesn't show how these are attached. A plain closure `(body: SignInInput) => fetch(...)` doesn't have `.url` or `.method`. The implementation will need to use `Object.assign(fn, { url, method })` or define them as getters. This is solvable but easy to miss — failing silently (form renders with `action=undefined`) rather than type-erroring. Recommend: explicitly document how the SdkMethod interface is satisfied, including the `url`/`method` properties, in the design doc's `auth-client.ts` description.

2. **Reactivity manifest classification (repeated from above)** — Wrong `reactive-source` vs `signal-api` classification will cause the compiler to attempt `.value` unwrap on function properties like `signIn`, `signOut`, etc. This produces runtime errors (`signIn.value` is `undefined`). **Must fix before Phase 6.**

### Medium

3. **Timer leak on unmount** — `setTimeout` for token refresh isn't cleaned up if AuthProvider unmounts. In practice, AuthProvider lives at the root and never unmounts, but in tests or microfrontend scenarios, leaked timers cause flaky tests and unexpected fetch calls. The design should specify that the refresh timer is stored in a ref and cleared via `onCleanup` / disposal.

4. **Race: hydration + stale `expiresAt`** — If the SSR render happens at time T, and the client hydrates at time T+30s (slow network, CDN cache), the `expiresAt` from the SSR-injected session might already be past. If `expiresAt - 10_000ms < Date.now()`, the client schedules refresh with a negative timeout (fires immediately). This is actually fine — the refresh endpoint validates the cookie, not the client's `expiresAt`. But the design should explicitly state this as handled (immediate refresh on stale hydration).

5. **MFA challenge cookie dependency on `oauthEncryptionKey`** — Looking at the server code (line 813), the MFA challenge cookie is only set when `oauthEncryptionKey` is configured. If a user doesn't have OAuth configured but uses MFA, the challenge cookie won't be set, and `auth.mfaChallenge` will fail because the server uses that cookie to identify the user. This is a server-side bug that pre-exists this design, but the UI auth design should note it as a known constraint or fix it in Phase 4.

### Low

6. **Tab visibility race** — The design says "skip refresh in hidden tabs, refresh on focus if stale." But if two tabs both become visible simultaneously (user splits screen), both will fire refresh. The deduplication (single in-flight promise) handles this at the per-tab level but not across tabs. Cross-tab coordination via `BroadcastChannel` or `localStorage` event would prevent double refresh. Not critical — the refresh endpoint handles concurrent calls safely (it just wastes a request).

7. **Offline → online reconnect timing** — "defer when offline, execute immediately on reconnect." If the token expired while offline and the user comes back online, the immediate refresh fires. But `navigator.onLine` transitions can be flaky (fires multiple times). The implementation should debounce the online handler. The design doesn't mention this.

---

## Phase Assessment

### Phase ordering is mostly correct, with one issue:

**Phase 6 (Reactivity Manifest) should be Phase 1 or Phase 2.** The reactivity manifest entry determines how the compiler handles `useAuth()` return values. Without it, developers using `auth.user` in JSX during Phases 1-5 will see raw signal objects instead of auto-unwrapped values. They'd have to manually write `auth.user.value` — which contradicts the framework's core principle that signals are invisible.

If the intent is that Phases 1-5 work without the compiler (plain TS tests only), then this ordering is fine. But if any phase's acceptance tests involve JSX rendering with `auth.user` in templates, Phase 6 must come first. **Recommend: move the reactivity manifest entry to Phase 1.**

### Phase-specific notes:

- **Phase 1** — Solid foundation. Acceptance tests are concrete and testable. The server change (adding `expiresAt`) is small and low-risk.

- **Phase 2** — Timer management is the riskiest part. The deduplication + visibility + offline logic is a non-trivial state machine. Recommend: add explicit acceptance test for "refresh timer is cleared when AuthProvider is disposed." AuthGate is straightforward — the existing `AccessGate` is a clear template.

- **Phase 3** — Clean. Mirrors `createAccessProvider()` exactly. One subtlety: the design says "no `/api/auth/session` fetch" when hydrated, but doesn't specify what happens when `window.__VERTZ_SESSION__` is missing (user not logged in on SSR). In that case, the client should transition to `'unauthenticated'` immediately, not `'loading'`. The acceptance tests should cover this case.

- **Phase 4** — MFA flow depends on server behavior (403 + `MFA_REQUIRED` code + challenge cookie). The acceptance tests should mock the server responses. Password reset flows are stateless from the client perspective — clean.

- **Phase 5** — **This is the riskiest phase.** The router has NO `guard` concept today. `RouteConfig` doesn't have a `guard` property. This phase requires extending the router type system, the `defineRoutes` function, and the `RouterView` rendering logic. The design acknowledges this as an unknown but defers resolution to Phase 5. This is fine — but the Phase 5 scope may be larger than expected. The guard must integrate with the route matching pipeline (sync check before component render), and it needs access to auth state (which means RouterView needs to know about AuthContext, introducing a cross-module dependency). Recommend: design the guard API in a separate mini-design before Phase 5 starts. The guard should be generic (not auth-specific) so it can be used for other gating patterns.

- **Phase 6** — Should be Phase 1 (see above). Otherwise trivial — it's a JSON file edit.

- **Phase 7** — AccessContext integration is the right final phase. The coupling between auth refresh and access set refresh is real — when tokens refresh, permissions may change. The acceptance test ("can() checks reflect updated access after refresh") is the right thing to verify.

---

## Type Safety

### Type flow is sound with one gap:

1. **`User` type drift** — The client `User` interface is defined separately from the server `AuthUser`. The server has `AuthUser` with `createdAt: Date`, `updatedAt: Date`, and `[key: string]: unknown`. The client `User` has `id`, `email`, `role`, `emailVerified?`, `[key: string]: unknown`. This is intentional (client doesn't need all server fields), but the `[key: string]: unknown` index signature on both means the types accept anything — there's no compile-time enforcement that the server actually sends the fields the client expects. The `JSON.stringify({ user: result.data.user })` on the server serializes `Date` objects as ISO strings, but the client `User` doesn't have `createdAt: string`. This is fine because of the index signature, but it means `user.createdAt` is typed as `unknown` on the client, not `string`. **Low severity** — the index signature is pragmatic, and users who need typed fields will extend the `User` interface.

2. **`SdkMethod` return type mismatch** — `SdkMethod<SignInInput, AuthResponse>` means `(body: SignInInput) => PromiseLike<Result<AuthResponse, Error>>`. But the actual server response for signin is `{ user: AuthUser }` today (no `expiresAt`). Phase 1 adds `expiresAt` to the response, making it `{ user: AuthUser, expiresAt: number }`, which matches `AuthResponse`. This dependency is correctly sequenced — the server change happens in Phase 1.

3. **`UnwrapSignals<AuthContextValue>` type** — The design says `useAuth()` returns `UnwrapSignals<AuthContextValue>`. But `AuthContextValue` needs to contain both signal properties (user, status, etc.) and plain function properties (signIn, signOut, etc.). `UnwrapSignals` strips `.value` from signal-like properties. Functions don't have `.value`, so they pass through unchanged. This should work correctly **if** the `wrapSignalProps` function in context.ts correctly identifies functions as non-signal (they lack `.peek()`). Verified: `isSignalLike` checks for `.peek` — functions don't have it. **This is safe.**

---

## Unknowns Assessment

### Listed unknowns:

1. **Route guard API shape** — This is a REAL unknown and it's undersized. The design says "check router implementation in Phase 5," but the router has no guard concept, and adding one requires type system changes to `RouteConfig`, rendering changes to `RouterView`, and a decision about sync vs. async guards. This is a mini-feature, not a quick check. Recommend: elevate this to a design decision that should be resolved before Phase 5, potentially with a POC.

2. **`form()` compatibility with closures** — This is NOT a real unknown. Closures in JavaScript are objects. You can attach properties to them. `SdkMethod` is a callable type with `url` and `method` properties. `Object.assign(fn, { url, method })` satisfies the interface. The only subtlety is that the closure must also return `PromiseLike<Result<T, E>>`, which means the `auth-client.ts` fetch wrappers must parse server responses into `Result` shape. This is straightforward.

### Unlisted unknowns:

3. **SSR render lock interaction** — The SSR render process (`ssrRenderToString`) is a two-pass sequential operation. If `AuthProvider` is in the component tree, it runs during both passes. In Pass 1 (discovery), it reads `window.__VERTZ_SESSION__` — but there's no `window` in SSR. The design needs to specify how AuthProvider behaves in SSR. Options: (a) check `typeof window !== 'undefined'` like `createAccessProvider()` does, or (b) inject session data into `SSRRenderContext` and read from there. The current `createAccessProvider()` uses approach (a) — AuthProvider should do the same for consistency.

4. **Error state recovery** — The state machine has an `error` state, but the design doesn't specify how to recover from it. Can the user retry signIn after an error? Does error auto-clear? If the token refresh fails with a network error (status `error`), does the app remain in `error` forever, or does it transition to `unauthenticated`? The state machine needs explicit transition rules for error recovery.

5. **`auth.signIn` re-entrancy** — What happens if the user clicks "Sign In" twice quickly? `form()` handles this with `submitting` signal, but what about the auth state transitions? If `signIn` is called while a previous `signIn` is in flight, both closures will try to update the same signals. The second call's response may arrive after the first, causing the state to flip between `authenticated` and whatever the second call's result is. This is a general problem with SdkMethod closures that have side effects beyond the normal form flow. Recommend: document that the `submitting` signal on `form()` prevents double-submission, so this is handled by the form layer.

---

## Recommendation

Approve with the following changes before implementation starts:

1. **Fix reactivity manifest classification**: Change `useAuth` from `reactive-source` to `signal-api` with explicit `signalProperties` and `plainProperties` lists. Move manifest entry to Phase 1.

2. **Fix `createSessionScript()` XSS escaping**: Use the same pattern as `createAccessSetScript()` — escape all `<` as `\u003c`, handle `\u2028`/`\u2029`, support CSP nonce.

3. **Document SdkMethod construction**: Explicitly show how `auth.signIn` satisfies `SdkMethod<SignInInput, AuthResponse>` including `.url` and `.method` properties.

4. **Add error state recovery rules**: Specify transition rules for escaping the `error` state. At minimum: "any new signIn/signUp attempt transitions from `error` to `loading`."

5. **Clarify AuthProvider SSR behavior**: Specify that AuthProvider checks `typeof window !== 'undefined'` before reading `__VERTZ_SESSION__`, and in SSR context, initializes to `unauthenticated` (or reads session from SSRRenderContext if the server middleware provides it).

6. **Elevate route guard to a pre-Phase-5 design decision**: Don't discover the guard API during implementation. Design it explicitly, since it touches the router type system.

Everything else is solid. The core approach (signals + context + SdkMethod + form()) is architecturally correct and follows established patterns. The implementation should be relatively smooth once these spec gaps are closed.
