# @vertz/ui

## 0.2.14

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.14

## 0.2.13

### Patch Changes

- [#1046](https://github.com/vertz-dev/vertz/pull/1046) [`337e1b3`](https://github.com/vertz-dev/vertz/commit/337e1b3dfca6768575e57cf54069beb4f37366b7) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Access Set Bootstrap + Client-Side can(): server computes global entitlement snapshots (computeAccessSet), embeds in JWT acl claim with 2KB overflow strategy, exposes GET /api/auth/access-set with ETag/304 support. Client-side can() function returns reactive AccessCheck signals, AccessGate blocks UI while loading, createAccessProvider hydrates from SSR-injected **VERTZ_ACCESS_SET**. computeEntityAccess() enables per-entity access metadata for can(entitlement, entity). Compiler recognizes can() as signal-api via reactivity manifest.

- [#950](https://github.com/vertz-dev/vertz/pull/950) [`a5ceec8`](https://github.com/vertz-dev/vertz/commit/a5ceec812613d92f7261407e86b1a39993687a7a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Automatic optimistic updates for entity mutations.

  EntityStore gains an optimistic layer stack (applyLayer/commitLayer/rollbackLayer) that overlays in-flight mutation patches on top of server-truth base data. MutationDescriptor in @vertz/fetch orchestrates the apply→fetch→commit/rollback lifecycle. The query() source switcher reads entity-backed data from EntityStore, so optimistic patches propagate reactively to all consuming queries. Generated createClient auto-wires the handler — zero boilerplate for `await api.todos.update(id, { completed: true })` to optimistically update all queries immediately.

- [#1038](https://github.com/vertz-dev/vertz/pull/1038) [`3a79c2f`](https://github.com/vertz-dev/vertz/commit/3a79c2fad5bfbaed61f252cf2b908592e12a82bd) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Deep normalization for EntityStore — cross-entity reactive resolution.

  Write-side: `merge()` extracts nested entity objects, stores them separately, and replaces inline references with bare IDs. Read-side: `resolveReferences()` inside computed signals resolves bare IDs back to live entity objects, creating reactive subscriptions that propagate cross-entity updates automatically.

  Includes relation schema registry (`registerRelationSchema`), reference counting (`addRef`/`removeRef`), smart eviction (`evictOrphans`), and codegen integration to emit `registerRelationSchema` calls in generated client code.

- [#1063](https://github.com/vertz-dev/vertz/pull/1063) [`a82b2ec`](https://github.com/vertz-dev/vertz/commit/a82b2ec1ccc94f278916796783c33d81ffead211) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Feature flag store + reactive access invalidation: InMemoryFlagStore implements per-tenant boolean feature flags. Layer 1 in createAccessContext() now evaluates flag requirements on entitlements — disabled flags produce 'flag_disabled' denial with meta.disabledFlags. computeAccessSet() populates real flag state from FlagStore. Access event broadcaster provides authenticated WebSocket broadcasting for flag_toggled, limit_updated, role_changed, and plan_changed events. Client-side access event client connects with exponential backoff reconnection (1s–30s cap, ±25% jitter). handleAccessEvent() performs inline signal updates for flag/limit changes; role/plan changes trigger jittered refetch. AuthProvider accepts accessEvents prop to wire WebSocket events into the reactive access cascade.

- [#970](https://github.com/vertz-dev/vertz/pull/970) [`1011e51`](https://github.com/vertz-dev/vertz/commit/1011e51fbfe528e35930e3dd5c32b76568b0684a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(router): schema-based route param parsing and validation

  Add `ParamSchema<T>` interface and `params` field to `RouteConfig`. When a route defines a `params` schema, `matchRoute()` validates path params at the routing layer — invalid params result in no match (fallback/404 renders). Valid params are stored as `parsedParams` on `RouteMatch`.

  `useParams()` gains a second overload accepting a `Record<string, unknown>` type parameter for typed parsed params: `useParams<{ id: number }>()`.

- [#1003](https://github.com/vertz-dev/vertz/pull/1003) [`de34f8d`](https://github.com/vertz-dev/vertz/commit/de34f8dc9d3e69b507874f33d80bf7dc4420001d) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add same-type query revalidation via MutationEventBus. Entity-backed queries now automatically revalidate when a mutation commits for the same entity type. Opt out per-mutation via `skipInvalidation: true` on MutationMeta.

- [#1052](https://github.com/vertz-dev/vertz/pull/1052) [`4eac71c`](https://github.com/vertz-dev/vertz/commit/4eac71c98369d12a0cd7a3cbbeda60ea7cc5bd05) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add client-side auth session management (AuthProvider, useAuth, AuthGate)

  - AuthProvider wraps app with auth context, manages JWT session lifecycle
  - useAuth() returns reactive state + SdkMethods (signIn, signUp, signOut, mfaChallenge, forgotPassword, resetPassword)
  - SdkMethods work with form() for automatic validation and submission
  - Proactive token refresh scheduling (10s before expiry, tab visibility, online/offline handling)
  - AuthGate gates rendering on auth state resolution (shows fallback during loading)
  - SSR hydration via window.**VERTZ_SESSION** (no initial fetch needed)
  - AccessContext integration: AuthProvider auto-manages access set when accessControl=true
  - Server: signin/signup/refresh responses now include expiresAt timestamp

- Updated dependencies [[`a5ceec8`](https://github.com/vertz-dev/vertz/commit/a5ceec812613d92f7261407e86b1a39993687a7a), [`de34f8d`](https://github.com/vertz-dev/vertz/commit/de34f8dc9d3e69b507874f33d80bf7dc4420001d)]:
  - @vertz/fetch@0.2.13

## 0.2.12

### Patch Changes

- [#937](https://github.com/vertz-dev/vertz/pull/937) [`c7e3ec2`](https://github.com/vertz-dev/vertz/commit/c7e3ec2e926b0a2cd6d35f58124f3d7f50fc6fb9) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix nested conditional DOM duplication and stable context IDs for HMR.

  Nested `__conditional` calls (from chained ternaries) returned DocumentFragments that lost children after DOM insertion, causing stale text nodes. `normalizeNode()` now wraps fragments in `<span style="display:contents">` for stable parent references.

  Framework-internal contexts (`RouterContext`, `OutletContext`, `DialogStackContext`) now have stable IDs so they survive HMR module re-evaluation without breaking `useContext()`.

- Updated dependencies []:
  - @vertz/fetch@0.2.12

## 0.2.11

### Patch Changes

- [#926](https://github.com/vertz-dev/vertz/pull/926) [`5607c59`](https://github.com/vertz-dev/vertz/commit/5607c598c1c55485222fa2da192d0e0321f8b14a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add `ListTransition` component for animated list item enter/exit. New items get `data-presence="enter"`, removed items get `data-presence="exit"` with DOM removal deferred until CSS animation completes. Initial render items are not animated. Uses comment markers (no wrapper element) and keyed reconciliation with proper scope disposal.

  Also wraps `__list` and `listTransition` items in reactive proxies backed by signals. When an item at an existing key changes (e.g., after refetch with index-based keys), the signal updates and any `domEffect` bindings inside the node re-run automatically — without re-creating the DOM node.

- Updated dependencies []:
  - @vertz/fetch@0.2.11

## 0.2.8

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.8

## 0.2.7

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.7

## 0.2.6

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.6

## 0.2.5

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.5

## 0.2.2

### Patch Changes

- [#861](https://github.com/vertz-dev/vertz/pull/861) [`b6cb0a0`](https://github.com/vertz-dev/vertz/commit/b6cb0a0e3de68974ce1747063288aef7a199f084) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix: address second-pass security audit findings — hidden field stripping in action pipeline, CSS value sanitization, empty string coercion guard

## 0.2.0

### Minor Changes

- [#267](https://github.com/vertz-dev/vertz/pull/267) [`0a33c14`](https://github.com/vertz-dev/vertz/commit/0a33c142a12a54e0da61423701ca338118ab9c98) Thanks [@vertz-dev-core](https://github.com/apps/vertz-dev-core)! - Zero-config SSR: `vertz({ ssr: true })` makes `vite dev` serve SSR'd HTML automatically.

  **@vertz/ui-server:**

  - Add `@vertz/ui-server/dom-shim` subpath with SSRElement, installDomShim, toVNode
  - Add `@vertz/ui-server/jsx-runtime` subpath for server-side JSX rendering

  **@vertz/ui-compiler:**

  - Add `ssr: boolean | SSROptions` to vertzPlugin options
  - Add `configureServer` hook that intercepts HTML requests and renders SSR'd HTML
  - Auto-generate virtual SSR entry module (`\0vertz:ssr-entry`)
  - Handle JSX runtime alias swap for SSR builds

  **@vertz/ui:**

  - Add `@vertz/ui/jsx-runtime` and `@vertz/ui/jsx-dev-runtime` subpath exports
  - Make router SSR-compatible (auto-detect `__SSR_URL__`, skip popstate in SSR)

- [#222](https://github.com/vertz-dev/vertz/pull/222) [`9ee0308`](https://github.com/vertz-dev/vertz/commit/9ee03084f71803b04eef5f05ced2f90b52a9fa8e) Thanks [@vertz-dev-front](https://github.com/apps/vertz-dev-front)! - Add subpath exports for focused imports: `@vertz/ui/router`, `@vertz/ui/form`, `@vertz/ui/query`, `@vertz/ui/css`.

### Patch Changes

- [#214](https://github.com/vertz-dev/vertz/pull/214) [`0f1c028`](https://github.com/vertz-dev/vertz/commit/0f1c028dd6bb90e37ac71f60e40ba0be774cca11) Thanks [@vertz-dev-front](https://github.com/apps/vertz-dev-front)! - Fix Suspense async error handling to propagate errors to the nearest ErrorBoundary instead of swallowing them with console.error. When no ErrorBoundary is present, errors are surfaced globally via queueMicrotask to prevent silent failures.

- [#231](https://github.com/vertz-dev/vertz/pull/231) [`7207c4c`](https://github.com/vertz-dev/vertz/commit/7207c4c44c2fc83f67459cbcba8e6010b4d05145) Thanks [@vertz-dev-front](https://github.com/apps/vertz-dev-front)! - `onCleanup()` now throws a `DisposalScopeError` when called outside a disposal scope instead of silently discarding the callback. This fail-fast behavior prevents cleanup leaks (e.g., undisposed queries on route navigation) by surfacing the mistake at the call site, similar to React's invalid hook call error.

- [#229](https://github.com/vertz-dev/vertz/pull/229) [`a454791`](https://github.com/vertz-dev/vertz/commit/a454791e0c6866cbad1d0d96bc3c0688282b021b) Thanks [@vertz-dev-front](https://github.com/apps/vertz-dev-front)! - Fix `globalCss()` to auto-inject generated CSS into `document.head` via `<style data-vertz-css>` tags, matching the existing behavior of `css()`. Previously, `globalCss()` returned the CSS string but required manual injection.

- [#230](https://github.com/vertz-dev/vertz/pull/230) [`e17ccb2`](https://github.com/vertz-dev/vertz/commit/e17ccb261ecebc1ca7d58b75365869cb29253a3c) Thanks [@vertz-dev-front](https://github.com/apps/vertz-dev-front)! - Export `compileTheme` from the public API (`@vertz/ui` and `@vertz/ui/css`). Previously it was only available from `@vertz/ui/internals`, making `defineTheme()` a dead end for users who needed to generate CSS from a theme definition.

- [#234](https://github.com/vertz-dev/vertz/pull/234) [`948f127`](https://github.com/vertz-dev/vertz/commit/948f127bf4b752274800c045d010590f1cc266d8) Thanks [@vertz-dev-front](https://github.com/apps/vertz-dev-front)! - Fix memory leak in `__conditional` — branch functions (`trueFn`/`falseFn`) are now wrapped in disposal scopes so effects and `onCleanup` handlers are properly cleaned up when the condition changes.

- [#199](https://github.com/vertz-dev/vertz/pull/199) [`63f074e`](https://github.com/vertz-dev/vertz/commit/63f074eefa96b49eb72724f8ec377a14a1f2c630) Thanks [@vertz-tech-lead](https://github.com/apps/vertz-tech-lead)! - Initial release of @vertz/ui v0.1 — a compiler-driven reactive UI framework.

  - Reactivity: `signal()`, `computed()`, `effect()`, `batch()`, `untrack()`
  - Compiler: `let` → signal, `const` derived → computed, JSX → DOM helpers, mutation → peek/notify
  - Component model: `ref()`, `onMount()`, `onCleanup()`, `watch()`, `children()`, `createContext()`
  - Error handling: `ErrorBoundary`, `Suspense` with async support
  - CSS-in-JS: `css()` with type-safe properties, `variants()`, `globalCss()`, `s()` shorthand
  - Theming: `defineTheme()`, `ThemeProvider`, CSS variable generation
  - Zero-runtime CSS extraction via compiler plugin
  - Forms: `form()` with schema validation, `formDataToObject()`, SDK method integration
  - Data fetching: `query()` with caching, `MemoryCache`, key derivation
  - SSR: `renderToStream()`, `serializeToHtml()`, `HeadCollector` for streaming HTML
  - Hydration: `hydrate()` with eager/lazy/interaction strategies, component registry
  - Router: `defineRoutes()`, `createRouter()`, `createLink()`, `createOutlet()`, search params
  - Primitives: 15 headless components (Button, Dialog, Select, Menu, Tabs, Accordion, etc.)
  - Testing: `renderTest()`, `findByText()`, `click()`, `type()`, `press()`, `createTestRouter()`
  - Vite plugin: HMR, CSS extraction, codegen watch mode
  - Curated public API: developer-facing exports in main barrel, compiler internals in `@vertz/ui/internals`
