# UI Auth System — Frontend & API Review (nora)

## Verdict: APPROVE WITH CHANGES

The design is solid overall. The core approach -- `useAuth()` returning SdkMethods that work with `form()`, context-based state management, SSR hydration -- is well aligned with existing patterns. But there are several concrete type flow issues and API inconsistencies that need to be resolved before implementation.

## API Consistency

**Good:**
- `AuthContext` follows the `createContext` + `useContext` + `use*` hook pattern established by `AccessContext` and `RouterContext`.
- `AuthGate` mirrors `AccessGate` (props with `fallback` and `children`).
- `form(auth.signIn)` integration matches the existing form-as-primitive convention.
- Single import path `@vertz/ui/auth` extending the existing subpath.

**Issues:**

1. **`AuthGate` semantics diverge from `AccessGate`.** The design says AuthGate "gates on auth session loading", but `AccessGate` gates on the access set being loaded (not loading state). They behave identically conceptually, but `AuthGate` has richer status to consider. The doc should specify: does `AuthGate` render children when status is `unauthenticated`? Or only when `authenticated`? If it only renders when authenticated, it's a route guard, not a loading gate. If it renders for any resolved state (anything except `idle`/`loading`), it's consistent with `AccessGate`.

   **Suggestion:** `AuthGate` should render children once auth state is *resolved* (not loading/idle), regardless of authenticated or not. That matches `AccessGate` semantics. Route-level gating is handled by `requireAuth()`.

2. **`children` type inconsistency.** `AuthProviderProps` uses `children: (() => unknown) | unknown`, which is correct (matches `ProviderJsxProps`). But `AccessGateProps` uses the same pattern. Good -- consistent.

3. **`fallback` type inconsistency.** The design shows `<AuthGate fallback={<LoadingScreen />}>`. But `AccessGateProps` defines `fallback?: () => unknown` (a thunk). The JSX in the design doc passes a raw element, not a thunk. This would fail at the type level. Either follow AccessGate's convention (`fallback?: () => unknown` and document that users write `fallback={() => <LoadingScreen />}`), or decide to change the convention for both gates.

   **Suggestion:** Check whether the Vertz compiler wraps JSX attribute values in thunks. If it does (like children), `fallback={<LoadingScreen />}` works at runtime but needs the type `(() => unknown) | unknown`. If it doesn't, keep the thunk type and document the pattern.

## Type Flow Analysis

**Critical issue: `UnwrapSignals` applied to `AuthContextValue` will break SdkMethod types.**

The design states `useAuth()` returns `UnwrapSignals<AuthContextValue>`. Let's trace the type:

```ts
interface AuthContextValue {
  user: Signal<User | null>;
  status: Signal<AuthStatus>;
  isAuthenticated: ReadonlySignal<boolean>;
  isLoading: ReadonlySignal<boolean>;
  error: Signal<AuthClientError | null>;
  signIn: SdkMethod<SignInInput, AuthResponse>;
  signUp: SdkMethod<SignUpInput, AuthResponse>;
  signOut: () => Promise<void>;
  // ...
}
```

`UnwrapSignals<T>` does `{ [K in keyof T]: Unwrapped<T[K]> }`. `Unwrapped<T>` is `T extends ReadonlySignal<infer U> ? U : T`.

- `user: Signal<User | null>` -> `Signal` extends `ReadonlySignal` -> unwrapped to `User | null`. Correct.
- `signIn: SdkMethod<SignInInput, AuthResponse>` -> `SdkMethod` does NOT extend `ReadonlySignal`, so `Unwrapped` returns `SdkMethod<...>` unchanged. Correct.
- `signOut: () => Promise<void>` -> function doesn't extend `ReadonlySignal`, passes through. Correct.

So `UnwrapSignals` actually works correctly here -- it only strips the `Signal`/`ReadonlySignal` wrapper from signal properties and leaves non-signal properties alone. **This is fine.** My initial concern was unfounded on closer inspection.

**However**, there's a subtler issue: `SdkMethod` has a `url: string` and `method: string` property. When the compiler processes `auth.signIn`, will it try to auto-unwrap `.url` or `.method`? Since `useAuth` is registered as `reactive-source`, the compiler treats ALL property accesses on `auth` as reactive. But `auth.signIn` is a nested object -- will `auth.signIn.url` be treated as reactive too?

**Answer:** The reactive-source classification marks the variable as reactive, meaning `const auth = useAuth()` makes `auth` a reactive source. Property accesses like `auth.user` are reactive (getter-backed). But `auth.signIn` returns the `SdkMethod` object, and further property accesses on that (`auth.signIn.url`) are on a plain object, not on a reactive source. The compiler doesn't recursively mark nested objects. So this should be fine.

**form() compatibility check:**

`SdkMethod` requires:
```ts
interface SdkMethod<TBody, TResult> {
  (body: TBody): PromiseLike<Result<TResult, Error>>;
  url: string;
  method: string;
  meta?: { bodySchema?: FormSchema<TBody> };
}
```

The auth closures must satisfy ALL of these:
1. Callable: `(body: SignInInput) => PromiseLike<Result<AuthResponse, Error>>` -- achievable via closure.
2. `url: string` -- must be attached as a property on the closure function.
3. `method: string` -- must be attached as a property.
4. `meta?.bodySchema?` -- optional but needed for auto-validation (or user must pass `schema` option to `form()`).

**Concern:** The design doc says `auth.signIn` is an SdkMethod, but doesn't show how `url` and `method` are attached to the closure. Regular arrow functions don't have `url`/`method`. You need to either:
- Create the closure as a regular function and assign properties: `const fn = (body) => ...; fn.url = '/api/auth/signin'; fn.method = 'POST';`
- Or use `Object.assign(async (body) => { ... }, { url: '/api/auth/signin', method: 'POST' })`

This is implementable but the design doc should explicitly mention this pattern. Without `url`/`method`, `form()` will produce `action: undefined` and `method: undefined` on the form instance, breaking progressive enhancement.

**No `meta.bodySchema` means `schema` is required in `form()`.** The `form()` overloads enforce this at the type level: when `SdkMethod` (not `SdkMethodWithMeta`) is passed, the `schema` option is required. The design doc's examples omit `schema`:

```tsx
const loginForm = form(auth.signIn, {
  onSuccess: () => navigate('/dashboard'),
});
```

This will be a **TypeScript error** because `auth.signIn` is `SdkMethod` (not `SdkMethodWithMeta`), so the second overload kicks in, requiring `schema`. The design doc either needs to:
- Show `schema` in the examples, or
- Make auth methods return `SdkMethodWithMeta` with embedded schemas, or
- Document that users must always pass a schema for auth forms.

**Suggestion:** Either embed `bodySchema` in `meta` (preferred -- less boilerplate for users) or update all examples to include `schema`.

## Signal/Reactivity Correctness

**`useAuth` as `reactive-source` in the manifest:**

The design proposes adding `useAuth` as `reactive-source` in `reactivity.json`. But `useAuth` is NOT in the `REACTIVE_SOURCE_APIS` set in `signal-api-registry.ts`, which means the manifest generator (`generateFrameworkManifest()`) won't include it. The hand-crafted `reactivity.json` and the auto-generated one will diverge.

This is a structural problem. Currently, only `useContext` is in `REACTIVE_SOURCE_APIS`. The manifest consistency test (`manifest-generation-consistency.test.ts`) verifies that the generated manifest matches the hand-crafted one. Adding `useAuth` to `reactivity.json` without also adding it to `REACTIVE_SOURCE_APIS` will **break that test**.

**But wait -- should `useAuth` even be a `reactive-source`?** Let's think about this:

- `useAuth()` is just `useContext(AuthContext)` with a non-null assertion. The compiler already knows `useContext` is a `reactive-source`. So `const auth = useContext(AuthContext)` already marks `auth` as reactive. Writing `const auth = useAuth()` would NOT be recognized unless `useAuth` is also in the manifest.
- Adding `useAuth` as `reactive-source` is correct for the same reason `useContext` is -- it returns a getter-wrapped object where all property accesses are reactive.

**Resolution:** Add `useAuth` to `REACTIVE_SOURCE_APIS` in `signal-api-registry.ts` AND to `reactivity.json`. But this raises a design question: should EVERY custom `use*` hook that wraps `useContext` be added to the registry? That doesn't scale. The manifest generator can detect `useAuth` returning `useContext(...)` and auto-classify it as `reactive-source` -- that's exactly what the manifest generator already does (see `manifest-generator.ts` line 537: `'reactive-source': 3` priority).

**Better approach:** Don't hardcode `useAuth` in `REACTIVE_SOURCE_APIS`. Instead, rely on the manifest generator's cross-file analysis to detect that `useAuth` calls `useContext` and auto-classify it. This is the pattern that `plans/cross-file-reactivity-analysis.md` was designed for. The hand-crafted `reactivity.json` should only contain framework-level primitives (`useContext`), not every wrapper hook.

If cross-file analysis isn't implemented yet, then as a stopgap, adding `useAuth` to `REACTIVE_SOURCE_APIS` works. But the design doc should acknowledge this as tech debt.

**`wrapSignalProps` behavior:**

The `Provider` calls `wrapSignalProps(value)` automatically. So when `AuthProvider` does:
```tsx
<AuthContext.Provider value={{ user, status, signIn, ... }}>
```
`wrapSignalProps` will iterate the object and wrap any property that has a `.peek` method (signal-like) in a getter. Non-signal properties (like `signIn`, `signOut`) pass through as-is. This is correct.

But there's a nuance: `isAuthenticated` and `isLoading` are `ReadonlySignal` (computed), which DO have `.peek`. They'll be wrapped in getters too. This is the intended behavior.

## Context Pattern

**HMR-stable ID: correct.** The design uses `'@vertz/ui::AuthContext'` as the stable ID, following the convention in `context-stable-ids.md`. Format matches: `@vertz/ui::<ConstName>`.

**The context-stable-ids rule applies:** Since `AuthContext` lives in `packages/ui/src/auth/`, it's framework-internal code shipped in `dist/`. The dev server plugin won't process it, so a manual stable ID is required.

**Checklist compliance:** The design doc should be updated to include the HMR verification step: "edit a file in the example app, navigate, confirm no 'must be called within Provider' error."

## form() / SdkMethod Compatibility

As detailed above, the core compatibility question is answered: closures CAN satisfy `SdkMethod` if `url` and `method` are attached as properties.

**But the `form()` overload will reject auth methods without `schema`.** This is the most actionable issue. The two `form()` overloads are:

1. `form(SdkMethodWithMeta, options?)` -- schema optional because it's in `meta.bodySchema`.
2. `form(SdkMethod, options: { schema: required, ...rest })` -- schema required because no embedded schema.

Auth closures won't have `meta.bodySchema`, so overload 2 applies. Users MUST pass `schema`. The design doc examples don't show this.

**Impact:** Every auth form example in the E2E acceptance test section will fail typecheck.

## Existing Code Integration

**Good integration points:**
- Extends `packages/ui/src/auth/` naturally alongside existing access control code.
- SSR hydration pattern (`createSessionScript`) mirrors `createAccessSetScript` in `packages/ui-server/src/ssr-access-set.ts`.
- `createAccessProvider` pattern provides a model for hydration bootstrap.
- Existing `public.ts` barrel export pattern is extended cleanly.

**Potential issue with Phase 7 (AccessContext integration):**

The design says on token refresh, the access set should be re-fetched. But `createAccessProvider()` currently returns a simple `{ accessSet, loading }` with no refresh capability. To coordinate auth refresh with access set refresh, either:
- `AuthProvider` needs to know about `AccessContext` (coupling concern), or
- `createAccessProvider` needs to return a refresh method, or
- A higher-level provider wraps both.

The design doc defers this to Phase 7 but doesn't propose a concrete API. This should at least have a sketch.

**`public.ts` export structure:**

The existing `public.ts` exports only access-related symbols. Adding `useAuth`, `AuthProvider`, `AuthGate`, `AuthContext`, type exports is clean. However, the doc should list exactly which exports are added. Current `public.ts` has:
- `AccessContextValue` (type)
- `AccessContext`, `can`, `useAccessContext` (values)
- `AccessGateProps` (type)
- `AccessGate` (value)
- Access set types
- `createAccessProvider` (value)

New additions should follow the same pattern: types first, then values, grouped by source file.

## Concerns

### 1. (Blocking) form() schema requirement not reflected in examples

Every `form(auth.signIn)` call without a `schema` option will fail typecheck due to the `SdkMethod` vs `SdkMethodWithMeta` overload. Either embed schemas in auth methods or update all examples to include `schema`.

### 2. (Blocking) SdkMethod closure construction unspecified

The design says auth methods are SdkMethods but doesn't show how `url`, `method`, and optionally `meta` are attached to closures. This is a critical implementation detail that affects progressive enhancement.

**Suggestion:** Add a concrete code snippet in the design showing how `auth.signIn` is constructed:

```ts
function createSignInMethod(basePath: string, userSignal: Signal<User | null>): SdkMethod<SignInInput, AuthResponse> {
  const fn = async (body: SignInInput): Promise<Result<AuthResponse, Error>> => {
    const result = await fetch(`${basePath}/signin`, { ... });
    if (result.ok) userSignal.value = result.data.user;
    return result;
  };
  return Object.assign(fn, {
    url: `${basePath}/signin`,
    method: 'POST',
  });
}
```

### 3. (Non-blocking) reactive-source manifest registration strategy

Hardcoding `useAuth` in `REACTIVE_SOURCE_APIS` doesn't scale. For now it works, but every new `use*` wrapper around `useContext` will need manual registration. The cross-file manifest generator should handle this automatically.

### 4. (Non-blocking) AuthGate render semantics need clarification

When does `AuthGate` render children? On any resolved state? Or only when authenticated? The design says "when auth state is resolved" but the example implies loading-only gating. Be explicit.

### 5. (Non-blocking) `AuthClientError` type undefined

The design references `AuthClientError` in the `error` property but never defines it. Is it a plain `Error`? A structured error? This type needs a definition in `auth-types.ts`.

### 6. (Non-blocking) E2E acceptance test has scope error

The test shows:
```tsx
// @ts-expect-error -- signIn requires email and password
form(auth.signIn)({ notEmail: 'test' });
```

But `auth` is defined inside `LoginPage` -- it's not in scope at the module level where this `@ts-expect-error` sits. This test needs to be inside a component body or the `auth` variable needs to be hoisted.

### 7. (Non-blocking) Missing `createAuthProvider` bootstrap pattern

`createAccessProvider()` exists as a separate factory function that creates the signal pair for `AccessContext.Provider`. Should there be an analogous `createAuthProvider()` that the user calls, or does `<AuthProvider>` handle everything internally? The design implies AuthProvider is self-contained, which is simpler -- but it means token refresh lifecycle is hidden from the user. If the user needs to control refresh timing (e.g., manual refresh on specific events), they need an escape hatch.

### 8. (Non-blocking) XSS escaping inconsistency

`createSessionScript` in the design uses `replace(/<\//g, ...)` and `replace(/<!--/g, ...)`, but `createAccessSetScript` uses `replace(/</g, '\\u003c')` which is more thorough (covers all `<` characters, not just `</` and `<!--`). Use the same escaping strategy.

## Recommendation

Address the two blocking concerns before implementation:

1. **Decide on form() schema strategy** -- either embed `bodySchema` in auth SdkMethods or update all examples. I recommend embedding schemas: it aligns with the codegen SdkMethodWithMeta pattern and removes boilerplate for users.
2. **Specify SdkMethod closure construction** -- show how `url`/`method` are attached. This is the one piece where the "closures as SdkMethods" design needs concrete implementation guidance.

The remaining concerns are non-blocking and can be addressed during implementation phases.
