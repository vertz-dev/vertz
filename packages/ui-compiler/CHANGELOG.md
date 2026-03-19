# @vertz/ui-compiler

## 0.2.22

### Patch Changes

- [#1536](https://github.com/vertz-dev/vertz/pull/1536) [`cd8b41b`](https://github.com/vertz-dev/vertz/commit/cd8b41bb9900f364cd562be9ae64b9644096881a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix signal/computed transforms incorrectly adding .value to callback-local variables that shadow component-level names

- Updated dependencies [[`8ed55f6`](https://github.com/vertz-dev/vertz/commit/8ed55f6fc8aa691758606fe044a8b1d74b7bb9bc), [`5d64812`](https://github.com/vertz-dev/vertz/commit/5d6481233006f67c21375f3879fda600c86c0cdd), [`180ac91`](https://github.com/vertz-dev/vertz/commit/180ac91f4fbc562581136dd8256f67fcc724fa69), [`6d32565`](https://github.com/vertz-dev/vertz/commit/6d32565c2818f9235d02af14a616279f018d0ff5), [`2e99e39`](https://github.com/vertz-dev/vertz/commit/2e99e3943830d2e2e0b2b44a1b32d8641e63dbe3), [`1c4916b`](https://github.com/vertz-dev/vertz/commit/1c4916b04eaaef0ee2e27eda1b73c36ae24e665e)]:
  - @vertz/ui@0.2.22

## 0.2.21

### Patch Changes

- [#1345](https://github.com/vertz-dev/vertz/pull/1345) [`0704bbb`](https://github.com/vertz-dev/vertz/commit/0704bbbc5561e2e2a6a6e0fd0a5f6af343f5f178) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Adopt `className` as the standard JSX prop for CSS classes, matching React convention. The `class` prop remains as a deprecated alias. All components, examples, and docs updated.

- [#1316](https://github.com/vertz-dev/vertz/pull/1316) [`4390036`](https://github.com/vertz-dev/vertz/commit/4390036144176fab7aa869ddcde621eece6f904c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Simplify css() nested selector object shape from `{ property: 'x', value: 'y' }` to plain `{ 'x': 'y' }`. Remove RawDeclaration type. Support both direct object and array-with-objects forms for nested selectors.

- [#1320](https://github.com/vertz-dev/vertz/pull/1320) [`cac4e45`](https://github.com/vertz-dev/vertz/commit/cac4e452bd12b726c077ce2f48605bbc410a680f) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Hyphenated JSX prop names (e.g. `data-testid`, `aria-label`) on custom components are now quoted in compiled output, producing valid JavaScript object literals.

- [#1391](https://github.com/vertz-dev/vertz/pull/1391) [`427e519`](https://github.com/vertz-dev/vertz/commit/427e5194a7f783c2accc246409bf146dcfa2f1b7) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(ui-compiler): object/array literals no longer incorrectly wrapped in computed()

  The ReactivityAnalyzer now skips object and array literal initializers during
  computed classification, matching the existing behavior for function definitions.
  This removes the need for `build*Ctx()` helper workarounds in composed primitives.

- [#1346](https://github.com/vertz-dev/vertz/pull/1346) [`b5fbc7d`](https://github.com/vertz-dev/vertz/commit/b5fbc7d884b06c8a0cb0c48d22dae5fe2684a4cc) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Support React-style `style` objects with camelCase properties. `style={{ backgroundColor: 'red' }}` now converts to a CSS string at all levels: JSX runtime, compiler-generated code, reactive `__attr()` bindings, and SSR. Includes auto-px for dimensional numeric values, unitless property detection, and vendor prefix handling.

- Updated dependencies [[`a16511c`](https://github.com/vertz-dev/vertz/commit/a16511cd78256fe86d0d69393dd923353d6f445a), [`796ef1a`](https://github.com/vertz-dev/vertz/commit/796ef1a9826f401c6d0b08f424d53609debda029), [`a5b9cbe`](https://github.com/vertz-dev/vertz/commit/a5b9cbe68202345ab09002f7e42c2a5be0c917bf), [`520444e`](https://github.com/vertz-dev/vertz/commit/520444e3bdbbf3140b75ed3754870166544b5f88), [`0704bbb`](https://github.com/vertz-dev/vertz/commit/0704bbbc5561e2e2a6a6e0fd0a5f6af343f5f178), [`fa3d23c`](https://github.com/vertz-dev/vertz/commit/fa3d23ca2e92a4b734c4908ab274d8e75e45cbc0), [`823e301`](https://github.com/vertz-dev/vertz/commit/823e3016dcb4487a7cdf9af61aea940566ffb21c), [`86d33bd`](https://github.com/vertz-dev/vertz/commit/86d33bd56934d62441b031fb72dd86687f0d0845), [`4390036`](https://github.com/vertz-dev/vertz/commit/4390036144176fab7aa869ddcde621eece6f904c), [`a7e37c3`](https://github.com/vertz-dev/vertz/commit/a7e37c3dd29ac75183a085d34b0621d339f8402a), [`6be7ce8`](https://github.com/vertz-dev/vertz/commit/6be7ce859300258b926fa7a608e2656952fea0c1), [`301c401`](https://github.com/vertz-dev/vertz/commit/301c40192ddec0a306bba997a7f9e4ce4253aa95), [`c9d6c7e`](https://github.com/vertz-dev/vertz/commit/c9d6c7ef368efdc905b4e96302798b2db65522aa), [`9ccbe74`](https://github.com/vertz-dev/vertz/commit/9ccbe743c3c4eee109b69c9e3aff5df5f64c572e), [`e9cfc6a`](https://github.com/vertz-dev/vertz/commit/e9cfc6ad9b4b5dd5c518bea3c1982082d7e96e10), [`2ae15d1`](https://github.com/vertz-dev/vertz/commit/2ae15d116fc58c59a430472a98198377ccde1e4e), [`b5fbc7d`](https://github.com/vertz-dev/vertz/commit/b5fbc7d884b06c8a0cb0c48d22dae5fe2684a4cc), [`f356523`](https://github.com/vertz-dev/vertz/commit/f356523f7054b1b72d7936e3a7e13147904087dc), [`f9eccd5`](https://github.com/vertz-dev/vertz/commit/f9eccd56b2ecc4467b36b8e78bb3a072141ef93c), [`4079d6b`](https://github.com/vertz-dev/vertz/commit/4079d6b7567479f5f59648e81773f098c7696d02)]:
  - @vertz/ui@0.2.21

## 0.2.20

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.20

## 0.2.19

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.19

## 0.2.18

### Patch Changes

- Updated dependencies [[`b4cb6b6`](https://github.com/vertz-dev/vertz/commit/b4cb6b6826583c05efcdfd0af0e046a49f6eed91), [`c2355f9`](https://github.com/vertz-dev/vertz/commit/c2355f9d3e13feac615b00d48406e4626e92869b), [`e5ac67e`](https://github.com/vertz-dev/vertz/commit/e5ac67e24a05e0342a8c470ef741d7729ebeaf58)]:
  - @vertz/ui@0.2.18

## 0.2.17

### Patch Changes

- Updated dependencies [[`f284697`](https://github.com/vertz-dev/vertz/commit/f284697218e3ebcc7a196e8a6633c822e206646e), [`6d6a85c`](https://github.com/vertz-dev/vertz/commit/6d6a85c0fd9f354a8d077e2eb1afdcf065344b95)]:
  - @vertz/ui@0.2.17

## 0.2.16

### Patch Changes

- [#1193](https://github.com/vertz-dev/vertz/pull/1193) [`02bac2a`](https://github.com/vertz-dev/vertz/commit/02bac2af689750d500f0846d700e89528a02627d) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add automatic route code splitting: `defineRoutes()` component factories are rewritten to lazy `import()` calls at build time, enabling per-page code splitting without manual dynamic imports.

- Updated dependencies [[`97e9fc9`](https://github.com/vertz-dev/vertz/commit/97e9fc9a80548e2be111542513802269162f4136), [`d2f6baf`](https://github.com/vertz-dev/vertz/commit/d2f6baf560db958f56257879d5d69da200ed519d), [`24b81a2`](https://github.com/vertz-dev/vertz/commit/24b81a26f0064863c1e50cdd17c0fe0fc022f6ea), [`af0b64c`](https://github.com/vertz-dev/vertz/commit/af0b64c62480606cd9bb7ec9a25d7a4f0903d9cf), [`caf4647`](https://github.com/vertz-dev/vertz/commit/caf464741b53fdd65be1c558cf2330172f6d2feb), [`b061fc4`](https://github.com/vertz-dev/vertz/commit/b061fc4d04e851ae1ec6addd9342cec7b1a698f8), [`d44234d`](https://github.com/vertz-dev/vertz/commit/d44234de726d5dfa786103b3e5a311754753f08e), [`6c33552`](https://github.com/vertz-dev/vertz/commit/6c3355265cd072d2c5b3d41c3c60e76d75c6e21c), [`d0e9dc5`](https://github.com/vertz-dev/vertz/commit/d0e9dc5065fea630cd046ef55f279fe9fb400086), [`9f6f292`](https://github.com/vertz-dev/vertz/commit/9f6f292137d89064c1d86c2231e1f416fa1abd61), [`0f6d90a`](https://github.com/vertz-dev/vertz/commit/0f6d90adf785c52ff1e70187e3479941b2db896c), [`d8257a5`](https://github.com/vertz-dev/vertz/commit/d8257a5665704fa0f2c2e6646f3b5ab8c39c5cdc)]:
  - @vertz/ui@0.2.16

## 0.2.15

### Patch Changes

- Updated dependencies [[`4a2d5b5`](https://github.com/vertz-dev/vertz/commit/4a2d5b504791ee772396248789b9ad65bd078abf), [`d0f0941`](https://github.com/vertz-dev/vertz/commit/d0f09419950bd0d6d9229a11fa9bf07f632fb85d)]:
  - @vertz/ui@0.2.15

## 0.2.14

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.14

## 0.2.13

### Patch Changes

- [#1046](https://github.com/vertz-dev/vertz/pull/1046) [`337e1b3`](https://github.com/vertz-dev/vertz/commit/337e1b3dfca6768575e57cf54069beb4f37366b7) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Access Set Bootstrap + Client-Side can(): server computes global entitlement snapshots (computeAccessSet), embeds in JWT acl claim with 2KB overflow strategy, exposes GET /api/auth/access-set with ETag/304 support. Client-side can() function returns reactive AccessCheck signals, AccessGate blocks UI while loading, createAccessProvider hydrates from SSR-injected **VERTZ_ACCESS_SET**. computeEntityAccess() enables per-entity access metadata for can(entitlement, entity). Compiler recognizes can() as signal-api via reactivity manifest.

- [#1007](https://github.com/vertz-dev/vertz/pull/1007) [`a9211ca`](https://github.com/vertz-dev/vertz/commit/a9211ca751305f541987b93d493d349838cf4822) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Skip effect wrapping for static JSX expressions. Non-reactive attributes now emit guarded `setAttribute` instead of `__attr()`, and non-reactive children emit `__insert()` instead of `__child(() => ...)`. This eliminates unnecessary `domEffect()` allocations and wrapper `<span>` elements for static expressions like `css()` style references, imported constants, and utility calls. Also fixes a JsxAnalyzer blind spot where destructured props were not classified as reactive sources.

- [#1052](https://github.com/vertz-dev/vertz/pull/1052) [`4eac71c`](https://github.com/vertz-dev/vertz/commit/4eac71c98369d12a0cd7a3cbbeda60ea7cc5bd05) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add client-side auth session management (AuthProvider, useAuth, AuthGate)

  - AuthProvider wraps app with auth context, manages JWT session lifecycle
  - useAuth() returns reactive state + SdkMethods (signIn, signUp, signOut, mfaChallenge, forgotPassword, resetPassword)
  - SdkMethods work with form() for automatic validation and submission
  - Proactive token refresh scheduling (10s before expiry, tab visibility, online/offline handling)
  - AuthGate gates rendering on auth state resolution (shows fallback during loading)
  - SSR hydration via window.**VERTZ_SESSION** (no initial fetch needed)
  - AccessContext integration: AuthProvider auto-manages access set when accessControl=true
  - Server: signin/signup/refresh responses now include expiresAt timestamp

- Updated dependencies [[`337e1b3`](https://github.com/vertz-dev/vertz/commit/337e1b3dfca6768575e57cf54069beb4f37366b7), [`a5ceec8`](https://github.com/vertz-dev/vertz/commit/a5ceec812613d92f7261407e86b1a39993687a7a), [`3a79c2f`](https://github.com/vertz-dev/vertz/commit/3a79c2fad5bfbaed61f252cf2b908592e12a82bd), [`a82b2ec`](https://github.com/vertz-dev/vertz/commit/a82b2ec1ccc94f278916796783c33d81ffead211), [`1011e51`](https://github.com/vertz-dev/vertz/commit/1011e51fbfe528e35930e3dd5c32b76568b0684a), [`de34f8d`](https://github.com/vertz-dev/vertz/commit/de34f8dc9d3e69b507874f33d80bf7dc4420001d), [`4eac71c`](https://github.com/vertz-dev/vertz/commit/4eac71c98369d12a0cd7a3cbbeda60ea7cc5bd05)]:
  - @vertz/ui@0.2.13

## 0.2.12

### Patch Changes

- Updated dependencies [[`c7e3ec2`](https://github.com/vertz-dev/vertz/commit/c7e3ec2e926b0a2cd6d35f58124f3d7f50fc6fb9)]:
  - @vertz/ui@0.2.12

## 0.2.11

### Patch Changes

- [#909](https://github.com/vertz-dev/vertz/pull/909) [`275e4c7`](https://github.com/vertz-dev/vertz/commit/275e4c770f55b9e75b44d90f2cb586fff3eaeede) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix signal API variables (form(), query(), createLoader()) being incorrectly wrapped in computed() when they reference other signal API vars through closures. This caused form().\_\_bindElement to be undefined at runtime and form state to be lost on re-evaluation.

- [#917](https://github.com/vertz-dev/vertz/pull/917) [`5ed4c1a`](https://github.com/vertz-dev/vertz/commit/5ed4c1a4c5c9ea946e97b1636011251c6287eaf4) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix HMR fast-refresh stability: SSR module reload now uses .ts wrapper to preserve plugin processing, compiler unwraps NonNullExpression in reactivity analyzer, and dev server includes diagnostic logging (VERTZ_DEBUG) and health check endpoint (/\_\_vertz_diagnostics).

- [#920](https://github.com/vertz-dev/vertz/pull/920) [`523bbcb`](https://github.com/vertz-dev/vertz/commit/523bbcb12c1866a8334d5dac278cb51b157a5c7b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(compiler): classify signal API variables passed as function arguments as reactive

  Expressions like `{queryMatch(todosQuery, ...)}` were classified as static because
  `todosQuery` (a signal API variable from `query()`) was only recognized via property
  accesses (`.data`, `.loading`), not when passed as a bare argument. This caused the
  compiler to emit `__insert()` instead of `__child()`, breaking hydration — the SSR
  `<span style="display:contents">` wrapper was never claimed, so reactive content
  (delete dialogs, form updates, checkbox toggles) was invisible after hydration.

- [#926](https://github.com/vertz-dev/vertz/pull/926) [`5607c59`](https://github.com/vertz-dev/vertz/commit/5607c598c1c55485222fa2da192d0e0321f8b14a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Replace reactive-vs-static classification with literal-vs-non-literal for JSX codegen decisions.

  Previously, the compiler used static analysis to determine if an expression was reactive (depends on signals) and only wrapped reactive expressions in `__child()` / `__attr()` / getters. This broke when reactive values flowed through function boundaries (callback parameters, HOFs, proxy-backed objects) because the parameter was classified as static.

  Now, the compiler only checks if an expression is a **literal** (string, number, boolean, null). All non-literal expressions get reactive wrappers (`__child`, `__attr`, getters), and the runtime (`domEffect`) handles actual tracking. Idle effects with no signal dependencies have zero ongoing cost.

  This fixes `.map()` render function parameters, `queryMatch` data handler parameters, and any user-defined HOF that receives reactive data — without workarounds.

- [#913](https://github.com/vertz-dev/vertz/pull/913) [`859e3da`](https://github.com/vertz-dev/vertz/commit/859e3dae660629d5d4f1e13c305c9201ee1d738d) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Distinguish reactive reads from stable closure references in computed classification. Callbacks that only call plain methods (`.refetch()`, `.revalidate()`) on signal API vars now stay `static` instead of being unnecessarily wrapped in `computed()`. Only accesses to signal properties (`.data`, `.error`, `.loading`) trigger computed classification.

- Updated dependencies [[`5607c59`](https://github.com/vertz-dev/vertz/commit/5607c598c1c55485222fa2da192d0e0321f8b14a)]:
  - @vertz/ui@0.2.11

## 0.2.8

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.8

## 0.2.7

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.7

## 0.2.6

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.6

## 0.2.5

### Patch Changes

- Updated dependencies []:
  - @vertz/ui@0.2.5

## 0.2.4

### Patch Changes

- [#894](https://github.com/vertz-dev/vertz/pull/894) [`a986d07`](https://github.com/vertz-dev/vertz/commit/a986d0788ca0210dfa4f624153d4bda72257a78c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix HMR fast-refresh stability: SSR module reload now uses .ts wrapper to preserve plugin processing, compiler unwraps NonNullExpression in reactivity analyzer, and dev server includes diagnostic logging (VERTZ_DEBUG) and health check endpoint (/\_\_vertz_diagnostics).

- Updated dependencies []:
  - @vertz/ui@0.2.2

## 0.2.3

### Patch Changes

- [#878](https://github.com/vertz-dev/vertz/pull/878) [`62dddcb`](https://github.com/vertz-dev/vertz/commit/62dddcbcb4943b12a04bca8466b09ae21901070b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Remove `private: true` so the package is published to npm. Required by `@vertz/cli` and `@vertz/ui-server` at runtime.

- Updated dependencies []:
  - @vertz/ui@0.2.2

## 0.2.2

### Patch Changes

- Updated dependencies [[`b6cb0a0`](https://github.com/vertz-dev/vertz/commit/b6cb0a0e3de68974ce1747063288aef7a199f084)]:
  - @vertz/ui@0.2.2

## 1.0.0

### Major Changes

- [#283](https://github.com/vertz-dev/vertz/pull/283) [`c38def6`](https://github.com/vertz-dev/vertz/commit/c38def6b6e060f63afeaacd93afa85aae9154833) Thanks [@vertz-dev-core](https://github.com/apps/vertz-dev-core)! - **BREAKING CHANGE:** Eliminate `.value` from public API — signal properties auto-unwrap at compile time

  The compiler now automatically inserts `.value` when accessing signal properties from `query()`, `form()`, and `createLoader()`, eliminating boilerplate from the public API.

  **Before:**

  ```ts
  const tasks = query("/api/tasks");
  const isLoading = tasks.loading.value; // Manual .value access
  const data = tasks.data.value;
  ```

  **After:**

  ```ts
  const tasks = query("/api/tasks");
  const isLoading = tasks.loading; // Compiler inserts .value automatically
  const data = tasks.data;
  ```

  **Supported APIs:**

  - `query()`: `.data`, `.loading`, `.error` (auto-unwrap) | `.refetch` (plain)
  - `form()`: `.submitting`, `.errors`, `.values` (auto-unwrap) | `.reset`, `.submit`, `.handleSubmit` (plain)
  - `createLoader()`: `.data`, `.loading`, `.error` (auto-unwrap) | `.refetch` (plain)

  **Features:**

  - Works with import aliases: `import { query as fetchData } from '@vertz/ui'`
  - Plain properties (like `.refetch`) are NOT unwrapped
  - Zero runtime overhead - pure compile-time transformation

  ## ⚠️ Breaking Change

  This is a **BREAKING CHANGE** because existing code that manually uses `.value` will need to be updated.

  ### Migration Guide

  **Required action:** Remove `.value` from signal property accesses on `query()`, `form()`, and `createLoader()` results.

  #### Before (old code):

  ```ts
  const tasks = query("/api/tasks");
  const isLoading = tasks.loading.value; // ❌ Remove .value
  const data = tasks.data.value; // ❌ Remove .value
  ```

  #### After (new code):

  ```ts
  const tasks = query("/api/tasks");
  const isLoading = tasks.loading; // ✅ Compiler auto-inserts .value
  const data = tasks.data; // ✅ Compiler auto-inserts .value
  ```

  **Why this is breaking:** If you don't remove the manual `.value`, the compiler will transform `tasks.data.value` into `tasks.data.value.value`, causing runtime errors.

  **Automated migration:** The compiler includes guard logic to detect existing `.value` usage and skip double-transformation, providing a grace period during migration. However, you should still update your code to remove manual `.value` for long-term maintainability.

  **Affected APIs:**

  - `query()` → `.data`, `.loading`, `.error`
  - `form()` → `.submitting`, `.errors`, `.values`
  - `createLoader()` → `.data`, `.loading`, `.error`

  **Non-breaking:** Plain properties like `.refetch`, `.reset`, `.submit`, `.handleSubmit` are NOT affected.

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

### Patch Changes

- [#293](https://github.com/vertz-dev/vertz/pull/293) [`259e250`](https://github.com/vertz-dev/vertz/commit/259e2501116f805fed49b95471aaeb4f80515256) Thanks [@vertz-dev-core](https://github.com/apps/vertz-dev-core)! - fix(ui-compiler): SSR routing — correct URL normalization and middleware order

  - Register SSR middleware BEFORE Vite internals (pre-hook) to prevent SPA fallback from rewriting URLs
  - Normalize URLs in SSR entry: strip /index.html suffix
  - Use surgical module invalidation (only SSR entry module, not entire module graph)

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

- Updated dependencies [[`0a33c14`](https://github.com/vertz-dev/vertz/commit/0a33c142a12a54e0da61423701ca338118ab9c98), [`0f1c028`](https://github.com/vertz-dev/vertz/commit/0f1c028dd6bb90e37ac71f60e40ba0be774cca11), [`7207c4c`](https://github.com/vertz-dev/vertz/commit/7207c4c44c2fc83f67459cbcba8e6010b4d05145), [`a454791`](https://github.com/vertz-dev/vertz/commit/a454791e0c6866cbad1d0d96bc3c0688282b021b), [`e17ccb2`](https://github.com/vertz-dev/vertz/commit/e17ccb261ecebc1ca7d58b75365869cb29253a3c), [`948f127`](https://github.com/vertz-dev/vertz/commit/948f127bf4b752274800c045d010590f1cc266d8), [`9ee0308`](https://github.com/vertz-dev/vertz/commit/9ee03084f71803b04eef5f05ced2f90b52a9fa8e), [`63f074e`](https://github.com/vertz-dev/vertz/commit/63f074eefa96b49eb72724f8ec377a14a1f2c630)]:
  - @vertz/ui@0.2.0
