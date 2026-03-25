# @vertz/ui

## 0.2.33

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.33

## 0.2.32

### Patch Changes

- [#1850](https://github.com/vertz-dev/vertz/pull/1850) [`ca59e8b`](https://github.com/vertz-dev/vertz/commit/ca59e8b824806cc222521677abbdcbb753347969) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(ui): prevent TDZ error in query() with reactive descriptor closures (#1819)

  Moved `unsubscribeBus` and `unregisterFromRegistry` declarations to the
  top of the `query()` function body and converted the inner `dispose`
  function from a hoisted function declaration to a const arrow. This
  prevents bundler scope-hoisting from reordering `let` declarations past
  references, which re-created the TDZ in compiled output despite the
  earlier fix in PR #1822.

- Updated dependencies []:
  - @vertz/fetch@0.2.32

## 0.2.31

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.31

## 0.2.30

### Patch Changes

- [#1817](https://github.com/vertz-dev/vertz/pull/1817) [`0ba086d`](https://github.com/vertz-dev/vertz/commit/0ba086d9bca13cac9e0a27a1cbd199c8b5ca6a07) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix SSR hydration dropping static text between adjacent reactive expressions (#1812)

  Added `<!--/child-->` end markers to precisely bound each `__child`'s content during hydration. Previously, the browser would merge adjacent text nodes across `<!--child-->` comment boundaries, causing the hydration cleanup to consume static text that didn't belong to the reactive expression (e.g., "Showing 1–{a} of {b} items" would render as "Showing 1–11 items").

- [#1822](https://github.com/vertz-dev/vertz/pull/1822) [`1d36182`](https://github.com/vertz-dev/vertz/commit/1d36182b0678378d50d9a063d6471a9114712b6a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix TDZ error when using `query()` with a thunk that returns a descriptor with entity metadata on the first synchronous effect run. Also prevents a double-subscription leak by guarding the eager subscription path.

- Updated dependencies []:
  - @vertz/fetch@0.2.30

## 0.2.29

### Patch Changes

- [#1781](https://github.com/vertz-dev/vertz/pull/1781) [`7771170`](https://github.com/vertz-dev/vertz/commit/777117093d783aaeecc905ec65c4c85363746494) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add reactive search params via `useSearchParams()` — a Proxy-based API that reads typed, reactive search params from the URL and writes back on assignment. Includes `ExtractSearchParams` type utility for route-path-generic inference, codegen augmentation, and compiler reactive source registration.

- Updated dependencies []:
  - @vertz/fetch@0.2.29

## 0.2.28

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.28

## 0.2.27

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.27

## 0.2.26

### Patch Changes

- [#1752](https://github.com/vertz-dev/vertz/pull/1752) [`8552f21`](https://github.com/vertz-dev/vertz/commit/8552f217350e2acb0caac26ac215a49736b07e55) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add `revalidateOn` option to `form()` for per-field re-validation after submit. Fields with errors now re-validate on blur (default), change, or only on submit. Includes single-field validation via schema `.shape` traversal with `OptionalSchema`/`DefaultSchema` unwrapping.

- Updated dependencies []:
  - @vertz/fetch@0.2.26

## 0.2.25

### Patch Changes

- [#1734](https://github.com/vertz-dev/vertz/pull/1734) [`04673a3`](https://github.com/vertz-dev/vertz/commit/04673a32a4849db08d80bb39caf801295fec9832) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Remove deprecated `ListTransition` component — use `<List animate>` instead

  `ListTransition` and `ListTransitionProps` are no longer exported from `@vertz/ui`. Use `<List animate>` from `@vertz/ui/components`:

  ```tsx
  // Before
  import { ListTransition } from "@vertz/ui";

  <ListTransition
    each={items}
    keyFn={(item) => item.id}
    children={(item) => <TodoItem task={item} />}
  />;

  // After
  import { List } from "@vertz/ui/components";

  <List animate>
    {items.map((item) => (
      <List.Item key={item.id}>
        <TodoItem task={item} />
      </List.Item>
    ))}
  </List>;
  ```

- [#1732](https://github.com/vertz-dev/vertz/pull/1732) [`841c9ae`](https://github.com/vertz-dev/vertz/commit/841c9ae69b559d25ed443d3c5fa8e21b2fd174bf) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Remove `queryMatch` primitive — use direct conditional rendering instead

  `queryMatch()` has been removed. Replace with direct conditionals on query signal properties:

  ```tsx
  // Before
  {
    queryMatch(tasks, {
      loading: () => <Spinner />,
      error: (err) => <Error error={err} />,
      data: (data) => <List items={data.items} />,
    });
  }

  // After
  {
    tasks.loading && <Spinner />;
  }
  {
    tasks.error && <Error error={tasks.error} />;
  }
  {
    tasks.data && <List items={tasks.data.items} />;
  }
  ```

- Updated dependencies []:
  - @vertz/fetch@0.2.25

## 0.2.24

### Patch Changes

- [#1712](https://github.com/vertz-dev/vertz/pull/1712) [`a73dd79`](https://github.com/vertz-dev/vertz/commit/a73dd792de1876513914b89ef896fc88243b4cc8) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(ui): add EmptyState compound component and Skeleton.Text/Circle sub-components

  New `EmptyState` compound component with Icon, Title, Description, and Action slots for empty-data placeholders. New `Skeleton.Text` (multi-line text placeholder) and `Skeleton.Circle` (circular avatar placeholder) sub-components. Skeleton `base` class key renamed to `root` for consistency.

- [#1685](https://github.com/vertz-dev/vertz/pull/1685) [`d58a100`](https://github.com/vertz-dev/vertz/commit/d58a100f18762189be4319b58a4b86f8a774ac95) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(ui): register \_\_on event listener cleanup with disposal scope

  Event listeners attached via `__on()` (the compiler's output for `onClick`, `onSubmit`, etc.) now register their cleanup function with the current disposal scope. This ensures listeners are properly removed when components or dialogs are unmounted, preventing memory leaks in dynamically-opened dialogs.

- [#1704](https://github.com/vertz-dev/vertz/pull/1704) [`0e33400`](https://github.com/vertz-dev/vertz/commit/0e33400d96a9f778f3b936124d7544804f731db9) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(ui): full-replacement mode for unkeyed lists prevents stale DOM

  When no `key` prop is provided on list items, `__list` now uses full-replacement mode (dispose all nodes, create all new) instead of reusing by position index. This prevents stale DOM content when list items are filtered, reordered, or replaced. A dev warning is emitted once to encourage adding keys for optimal performance.

- [#1684](https://github.com/vertz-dev/vertz/pull/1684) [`e24615a`](https://github.com/vertz-dev/vertz/commit/e24615a8619ae84b993c18dbdca2671ca254f9bb) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(ui-compiler): support JSX spread attributes on intrinsic elements and components

  JSX spread attributes (`<button {...rest}>`, `<Button {...props}>`) were silently dropped by the compiler. Spread attributes now work correctly:

  - **Component calls**: spread emits `...expr` in the props object literal
  - **Intrinsic elements**: spread emits `__spread(el, props)` runtime call that handles event handlers, style, class/className, ref, SVG attributes, and standard HTML attributes
  - **theme-shadcn Button**: removed `applyProps` workaround in favor of native JSX spread

- [#1707](https://github.com/vertz-dev/vertz/pull/1707) [`adea2f1`](https://github.com/vertz-dev/vertz/commit/adea2f15f306d09ecebc56fc1f3841ff4b14b2ba) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Auto-invalidate tenant-scoped queries on tenant switch. When `switchTenant()` succeeds, all active queries with `tenantScoped: true` metadata are automatically cleared and refetched, preventing stale cross-tenant data from being visible.

  **What changed:**

  - `EntityQueryMeta` now includes an optional `tenantScoped` boolean field
  - `registerActiveQuery()` accepts an optional `clearData` callback for data clearing before refetch
  - `invalidateTenantQueries()` exported from `@vertz/ui` — clears data + refetches all tenant-scoped queries
  - `TenantProvider.switchTenant()` calls `invalidateTenantQueries()` automatically on success
  - Codegen emits `tenantScoped: true/false` in entity SDK descriptors based on entity configuration
  - `QueryEnvelopeStore` gains a `delete(queryKey)` method for per-key cleanup

- Updated dependencies [[`adea2f1`](https://github.com/vertz-dev/vertz/commit/adea2f15f306d09ecebc56fc1f3841ff4b14b2ba), [`99c90d9`](https://github.com/vertz-dev/vertz/commit/99c90d9d9176722d60d998a5a8d1eeaf4146c8de)]:
  - @vertz/fetch@0.2.24

## 0.2.23

### Patch Changes

- [#1571](https://github.com/vertz-dev/vertz/pull/1571) [`10f6309`](https://github.com/vertz-dev/vertz/commit/10f6309790bff69c7a1a0ab92e50f78f34b129c3) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Expand CSS utility tokens with overflow axis variants, transform scale keywords, fraction dimensions, and color opacity modifiers

- [#1545](https://github.com/vertz-dev/vertz/pull/1545) [`1709f6d`](https://github.com/vertz-dev/vertz/commit/1709f6d933f04600d1b959b51660f2f8f33805d8) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Defer onMount callbacks until after JSX evaluation so refs and DOM elements are available inside the callback. The compiler now injects mount frame push/flush around component return expressions. No public API change — onMount keeps its existing signature. Outside compiled components (event handlers, watch), onMount still runs immediately for backward compat.

- [#1556](https://github.com/vertz-dev/vertz/pull/1556) [`1e26cca`](https://github.com/vertz-dev/vertz/commit/1e26cca7eca00291633a2fa6257fc80a1f409b60) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix nested conditional cleanup during hydration — wrap anchor + content in display:contents span to prevent orphaned DOM nodes when parent conditionals re-evaluate (#1553)

- [#1584](https://github.com/vertz-dev/vertz/pull/1584) [`82055ae`](https://github.com/vertz-dev/vertz/commit/82055aefc19e4c3a115152f2e7157389486e792e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(ui): preserve prototype chain in `__list` item proxies (#1581)

  `createItemProxy` used `{}` as the Proxy target, which broke `instanceof` checks
  (e.g., `val instanceof Date`) and `Array.isArray()` for proxied list items.
  Changed to use the initial item value as the target and added a `getPrototypeOf`
  trap that reads from the live signal value. Also added a read-only `set` trap to
  prevent accidental mutation of original items through the proxy.

- [#1634](https://github.com/vertz-dev/vertz/pull/1634) [`a21f762`](https://github.com/vertz-dev/vertz/commit/a21f76239e5c4b112c7be9a4ebea8327c3d2230b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add post-hydration onMount queue and Foreign component for unmanaged DOM subtrees. Fix scope safety in mount/router hydration paths.

- [#1588](https://github.com/vertz-dev/vertz/pull/1588) [`7c146e6`](https://github.com/vertz-dev/vertz/commit/7c146e695b642affeb39134beb0e1eb6475f20a8) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix reactive form element properties (`value`, `checked`, `selected`) to use DOM property assignment instead of `setAttribute`. This fixes `<select value={signal}>`, `<input value={signal}>`, `<input checked={signal}>`, and `<option selected={signal}>` not updating the displayed state reactively.

- Updated dependencies []:
  - @vertz/fetch@0.2.23

## 0.2.22

### Patch Changes

- [#1498](https://github.com/vertz-dev/vertz/pull/1498) [`8ed55f6`](https://github.com/vertz-dev/vertz/commit/8ed55f6fc8aa691758606fe044a8b1d74b7bb9bc) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert collapsible factory to declarative JSX component with sub-components (Collapsible.Trigger, Collapsible.Content)

- [#1505](https://github.com/vertz-dev/vertz/pull/1505) [`5d64812`](https://github.com/vertz-dev/vertz/commit/5d6481233006f67c21375f3879fda600c86c0cdd) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert DatePicker factory to declarative JSX component with sub-components (DatePicker.Trigger, DatePicker.Content)

- [#1500](https://github.com/vertz-dev/vertz/pull/1500) [`180ac91`](https://github.com/vertz-dev/vertz/commit/180ac91f4fbc562581136dd8256f67fcc724fa69) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert HoverCard factory to JSX component with composed primitives

- [#1507](https://github.com/vertz-dev/vertz/pull/1507) [`6d32565`](https://github.com/vertz-dev/vertz/commit/6d32565c2818f9235d02af14a616279f018d0ff5) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert ResizablePanel factory to JSX component with context-based sub-components

- [#1502](https://github.com/vertz-dev/vertz/pull/1502) [`2e99e39`](https://github.com/vertz-dev/vertz/commit/2e99e3943830d2e2e0b2b44a1b32d8641e63dbe3) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert ScrollArea factory to JSX component with composed primitives

- [#1503](https://github.com/vertz-dev/vertz/pull/1503) [`1c4916b`](https://github.com/vertz-dev/vertz/commit/1c4916b04eaaef0ee2e27eda1b73c36ae24e665e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert ToggleGroup factory to JSX component with composed primitives

- Updated dependencies []:
  - @vertz/fetch@0.2.22

## 0.2.21

### Patch Changes

- [#1422](https://github.com/vertz-dev/vertz/pull/1422) [`a16511c`](https://github.com/vertz-dev/vertz/commit/a16511cd78256fe86d0d69393dd923353d6f445a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - perf(ui): batch effect registration during tolerant hydration

  Add `deferredDomEffect()` variant that defers the first run during hydration.
  `__text` and `__attr` now use deferred effects — SSR content is already correct,
  so the first execution is skipped during the hydration walk. Effects are flushed
  synchronously at `endHydration()`, establishing dependency tracking so reactive
  updates work immediately after.

  Benchmark: 2.5x faster hydration walk phase for 1000 reactive nodes.

- [#1485](https://github.com/vertz-dev/vertz/pull/1485) [`796ef1a`](https://github.com/vertz-dev/vertz/commit/796ef1a9826f401c6d0b08f424d53609debda029) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert calendar from factory API to declarative JSX component. `Calendar` is now a PascalCase component importable from `@vertz/ui/components`, replacing the lowercase `calendar` factory.

- [#1488](https://github.com/vertz-dev/vertz/pull/1488) [`a5b9cbe`](https://github.com/vertz-dev/vertz/commit/a5b9cbe68202345ab09002f7e42c2a5be0c917bf) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert carousel from factory pattern to declarative JSX component with Carousel.Slide, Carousel.Previous, and Carousel.Next sub-components

- [#1461](https://github.com/vertz-dev/vertz/pull/1461) [`520444e`](https://github.com/vertz-dev/vertz/commit/520444e3bdbbf3140b75ed3754870166544b5f88) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(ui): add centralized theme API — registerTheme() + @vertz/ui/components

  Adds `registerTheme()` to `@vertz/ui` and a new `@vertz/ui/components` subpath export. Developers can now register a theme once and import components from a single, stable path instead of threading theme references through local modules.

  `@vertz/theme-shadcn` now provides module augmentation for `@vertz/ui/components`, giving full type safety to centralized component imports when the theme package is installed.

- [#1345](https://github.com/vertz-dev/vertz/pull/1345) [`0704bbb`](https://github.com/vertz-dev/vertz/commit/0704bbbc5561e2e2a6a6e0fd0a5f6af343f5f178) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Adopt `className` as the standard JSX prop for CSS classes, matching React convention. The `class` prop remains as a deprecated alias. All components, examples, and docs updated.

- [#1497](https://github.com/vertz-dev/vertz/pull/1497) [`fa3d23c`](https://github.com/vertz-dev/vertz/commit/fa3d23ca2e92a4b734c4908ab274d8e75e45cbc0) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert command factory to declarative JSX component with sub-components (Command.Input, Command.List, Command.Empty, Command.Item, Command.Group, Command.Separator)

- [#1489](https://github.com/vertz-dev/vertz/pull/1489) [`823e301`](https://github.com/vertz-dev/vertz/commit/823e3016dcb4487a7cdf9af61aea940566ffb21c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(theme-shadcn): convert contextMenu factory to JSX component

  Convert the `contextMenu` primitive from an imperative factory function to a
  declarative JSX component with `.Trigger`, `.Content`, `.Item`, `.Group`,
  `.Label`, and `.Separator` sub-components.

  - Add `ComposedContextMenu` in `@vertz/ui-primitives` (context-based sub-component wiring)
  - Replace imperative `createThemedContextMenu` factory with `withStyles()` wrapper
  - Promote from lowercase `contextMenu` factory to PascalCase `ContextMenu` compound proxy
  - Importable from `@vertz/ui/components` as `ContextMenu`
  - No `document.createElement` — fully declarative JSX

- [#1487](https://github.com/vertz-dev/vertz/pull/1487) [`86d33bd`](https://github.com/vertz-dev/vertz/commit/86d33bd56934d62441b031fb72dd86687f0d0845) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert drawer factory to declarative JSX component with sub-components (Trigger, Content, Header, Title, Description, Footer, Handle)

- [#1316](https://github.com/vertz-dev/vertz/pull/1316) [`4390036`](https://github.com/vertz-dev/vertz/commit/4390036144176fab7aa869ddcde621eece6f904c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Simplify css() nested selector object shape from `{ property: 'x', value: 'y' }` to plain `{ 'x': 'y' }`. Remove RawDeclaration type. Support both direct object and array-with-objects forms for nested selectors.

- [#1311](https://github.com/vertz-dev/vertz/pull/1311) [`a7e37c3`](https://github.com/vertz-dev/vertz/commit/a7e37c3dd29ac75183a085d34b0621d339f8402a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - **Breaking:** `DialogStack.open()` now returns `Promise<DialogResult<T>>` instead of `Promise<T>`. Dismissal resolves with `{ ok: false }` instead of rejecting with `DialogDismissedError`. Use `if (result.ok) { result.data }` instead of try/catch.

- [#1365](https://github.com/vertz-dev/vertz/pull/1365) [`6be7ce8`](https://github.com/vertz-dev/vertz/commit/6be7ce859300258b926fa7a608e2656952fea0c1) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix duplicate route components during production hydration with lazy (code-split) routes. RouterView and Outlet now re-enter hydration when lazy routes resolve, claiming SSR nodes instead of recreating DOM. Add route-aware chunk preloading via route-chunk manifest.

- [#1392](https://github.com/vertz-dev/vertz/pull/1392) [`301c401`](https://github.com/vertz-dev/vertz/commit/301c40192ddec0a306bba997a7f9e4ce4253aa95) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(ui): add mismatch fallback to sync path during hydration re-entry in Outlet and RouterView

- [#1357](https://github.com/vertz-dev/vertz/pull/1357) [`c9d6c7e`](https://github.com/vertz-dev/vertz/commit/c9d6c7ef368efdc905b4e96302798b2db65522aa) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Hydration claim functions (`claimElement`, `claimText`, `claimComment`) now restore the cursor on failure instead of exhausting it. This fixes cursor corruption when composed primitives use `resolveChildren` + `scanSlots` during hydration, where failed slot marker claims would break all subsequent claims.

- [#1490](https://github.com/vertz-dev/vertz/pull/1490) [`9ccbe74`](https://github.com/vertz-dev/vertz/commit/9ccbe743c3c4eee109b69c9e3aff5df5f64c572e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert menubar from factory to declarative JSX component with sub-components (Menubar.Menu, Menubar.Trigger, Menubar.Content, Menubar.Item, Menubar.Group, Menubar.Label, Menubar.Separator)

- [#1495](https://github.com/vertz-dev/vertz/pull/1495) [`e9cfc6a`](https://github.com/vertz-dev/vertz/commit/e9cfc6ad9b4b5dd5c518bea3c1982082d7e96e10) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Convert `navigationMenu` factory to declarative `NavigationMenu` JSX component with `.List`, `.Item`, `.Trigger`, `.Content`, `.Link`, `.Viewport` sub-components. Importable from `@vertz/ui/components`.

- [#1396](https://github.com/vertz-dev/vertz/pull/1396) [`2ae15d1`](https://github.com/vertz-dev/vertz/commit/2ae15d116fc58c59a430472a98198377ccde1e4e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(ui,ui-server,cli): add generateParams for dynamic route SSG

  Routes can now define `generateParams` to pre-render dynamic routes at build time. The build pipeline expands these into concrete paths and pre-renders each one to static HTML files.

- [#1346](https://github.com/vertz-dev/vertz/pull/1346) [`b5fbc7d`](https://github.com/vertz-dev/vertz/commit/b5fbc7d884b06c8a0cb0c48d22dae5fe2684a4cc) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Support React-style `style` objects with camelCase properties. `style={{ backgroundColor: 'red' }}` now converts to a CSS string at all levels: JSX runtime, compiler-generated code, reactive `__attr()` bindings, and SSR. Includes auto-px for dimensional numeric values, unitless property detection, and vendor prefix handling.

- [#1468](https://github.com/vertz-dev/vertz/pull/1468) [`f356523`](https://github.com/vertz-dev/vertz/commit/f356523f7054b1b72d7936e3a7e13147904087dc) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add type-safe CSS utility validation: `css()` and `variants()` now reject invalid utility class names at compile time with full editor autocomplete. The `UtilityClass` union type is exported for custom type definitions.

- [#1467](https://github.com/vertz-dev/vertz/pull/1467) [`f9eccd5`](https://github.com/vertz-dev/vertz/commit/f9eccd56b2ecc4467b36b8e78bb3a072141ef93c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - refactor(auth): unify AuthProvider with generated auth SDK

  BREAKING: AuthProvider now requires an `auth` prop (AuthSdk interface) instead of creating its own HTTP methods. The `basePath` prop is now optional (used only for access-set and auth operations not yet in the SDK like MFA, forgot/reset password).

  Before:

  ```tsx
  <AuthProvider basePath="/api/auth">
  ```

  After:

  ```tsx
  <AuthProvider auth={api.auth}>
  ```

  - AuthProvider delegates signIn, signUp, signOut, refresh, and providers to the SDK
  - `createAuthMethod()` removed from `@vertz/ui/auth`
  - New `AuthSdk` and `AuthSdkMethod` types exported from `@vertz/ui/auth`
  - `form(useAuth().signIn)` still works — AuthProvider attaches bodySchema from local validation schemas

- [#1297](https://github.com/vertz-dev/vertz/pull/1297) [`4079d6b`](https://github.com/vertz-dev/vertz/commit/4079d6b7567479f5f59648e81773f098c7696d02) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add View Transitions API integration to the router. Navigations can optionally wrap DOM updates in `document.startViewTransition()` for animated page transitions. Supports global, per-route, and per-navigation config with graceful degradation for unsupported browsers, reduced motion, and SSR. Adds `vt-name` CSS shorthand for `view-transition-name`.

- Updated dependencies []:
  - @vertz/fetch@0.2.21

## 0.2.20

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.20

## 0.2.19

### Patch Changes

- Updated dependencies []:
  - @vertz/fetch@0.2.19

## 0.2.18

### Patch Changes

- [#1260](https://github.com/vertz-dev/vertz/pull/1260) [`b4cb6b6`](https://github.com/vertz-dev/vertz/commit/b4cb6b6826583c05efcdfd0af0e046a49f6eed91) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - refactor(ui): add canSignals() to avoid double-cast in ProtectedRoute

  Extracted signal-creation logic from can() into shared createAccessCheckRaw() helper.
  Added canSignals() that returns raw ReadonlySignal properties for framework code
  that runs without compiler transforms. Updated createEntitlementGuard to use
  canSignals() — eliminates the `as unknown as ReadonlySignal<boolean>` double-cast.

- [#1256](https://github.com/vertz-dev/vertz/pull/1256) [`c2355f9`](https://github.com/vertz-dev/vertz/commit/c2355f9d3e13feac615b00d48406e4626e92869b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(ui): components returning Node or Signal can now be used as JSX

  Narrowed Outlet return type to HTMLElement. Tightened Suspense and ErrorBoundary
  prop/return types from Node to JSX.Element.
  Refactored ProtectedRoute, AuthGate, AccessGate, UserName, and UserAvatar (in
  @vertz/ui-auth) from manual primitives to compiled Vertz JSX patterns — the
  compiler now handles reactive transforms automatically.

- [#1264](https://github.com/vertz-dev/vertz/pull/1264) [`e5ac67e`](https://github.com/vertz-dev/vertz/commit/e5ac67e24a05e0342a8c470ef741d7729ebeaf58) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - refactor(ui): UserName/UserAvatar update in-place instead of rebuilding subtree

  \_\_child now updates Text.data in-place when the reactive expression returns a
  primitive and the existing content is a single text node, avoiding DOM removal
  and recreation.

  Avatar always renders the img element and toggles visibility via CSS, so
  reactive src/alt changes update attributes in-place instead of rebuilding
  the entire element via \_\_conditional.

- Updated dependencies []:
  - @vertz/fetch@0.2.18

## 0.2.17

### Patch Changes

- [#1253](https://github.com/vertz-dev/vertz/pull/1253) [`f284697`](https://github.com/vertz-dev/vertz/commit/f284697218e3ebcc7a196e8a6633c822e206646e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Extract `@vertz/ui-auth` package for JSX-based auth components. Moves `Avatar`, `UserAvatar`, `UserName`, `OAuthButton`, `OAuthButtons`, `AuthGate`, `AccessGate`, and `ProtectedRoute` from `@vertz/ui/auth` into the new `@vertz/ui-auth` package, converting DOM-primitive components to JSX. Non-component exports (`AuthContext`, `useAuth`, `can`, `createAccessProvider`, etc.) remain in `@vertz/ui/auth`.

- [#1236](https://github.com/vertz-dev/vertz/pull/1236) [`6d6a85c`](https://github.com/vertz-dev/vertz/commit/6d6a85c0fd9f354a8d077e2eb1afdcf065344b95) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add user profile display helpers: `UserAvatar`, `UserName`, `Avatar`, `getUserDisplayName`, `getUserInitials`, and `getUserIcon` to `@vertz/ui/auth`. These composable components eliminate defensive boilerplate for displaying authenticated user info (avatars with fallbacks, display names with fallback chains).

- Updated dependencies []:
  - @vertz/fetch@0.2.17

## 0.2.16

### Patch Changes

- [#1108](https://github.com/vertz-dev/vertz/pull/1108) [`97e9fc9`](https://github.com/vertz-dev/vertz/commit/97e9fc9a80548e2be111542513802269162f4136) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add LRU eviction to MemoryCache with configurable maxSize (default 1000) to prevent unbounded cache growth in query().

- [#1219](https://github.com/vertz-dev/vertz/pull/1219) [`d2f6baf`](https://github.com/vertz-dev/vertz/commit/d2f6baf560db958f56257879d5d69da200ed519d) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Auto-detect `initialPath` in `createRouter` — the second argument is now optional. When omitted or when options are passed as the second argument, the router auto-detects the URL from `window.location` (browser) or SSR context. Explicit `initialUrl` string still works for backward compatibility.

- [#1116](https://github.com/vertz-dev/vertz/pull/1116) [`24b81a2`](https://github.com/vertz-dev/vertz/commit/24b81a26f0064863c1e50cdd17c0fe0fc022f6ea) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add `AccessAnalyzer` to extract `defineAccess()` config and `AccessTypesGenerator` to emit typed entitlement unions, making `ctx.can('typo')` a compile error. Add `RlsPolicyGenerator` to generate RLS policies from `rules.where()` conditions. Add `EntitlementRegistry` + `Entitlement` type to `@vertz/server` and `@vertz/ui/auth` for type-safe entitlement narrowing.

- [#1195](https://github.com/vertz-dev/vertz/pull/1195) [`af0b64c`](https://github.com/vertz-dev/vertz/commit/af0b64c62480606cd9bb7ec9a25d7a4f0903d9cf) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add runtime image optimization for dynamic images at the edge. The `<Image>` component now rewrites absolute HTTP(S) URLs through `/_vertz/image` when `configureImageOptimizer()` is called. The Cloudflare handler supports an `imageOptimizer` config option using `cf.image` for edge transformation. Dev server includes a passthrough proxy for development.

- [#1173](https://github.com/vertz-dev/vertz/pull/1173) [`caf4647`](https://github.com/vertz-dev/vertz/commit/caf464741b53fdd65be1c558cf2330172f6d2feb) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add optional onMiss telemetry callback to FieldSelectionTracker for compiler miss detection, and recordFieldMiss method to DiagnosticsCollector for surfacing misses via /\_\_vertz_diagnostics endpoint

- [#1226](https://github.com/vertz-dev/vertz/pull/1226) [`b061fc4`](https://github.com/vertz-dev/vertz/commit/b061fc4d04e851ae1ec6addd9342cec7b1a698f8) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix `isBrowser()` returning `true` on server when module-scope code runs outside `ssrStorage.run()` (e.g., HMR re-imports). Now checks `hasSSRResolver()` instead of `getSSRContext()` to correctly identify all server-side code.

- [#1146](https://github.com/vertz-dev/vertz/pull/1146) [`d44234d`](https://github.com/vertz-dev/vertz/commit/d44234de726d5dfa786103b3e5a311754753f08e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Change font() default font-display from 'optional' to 'swap' for better first-visit font rendering.

- [#1170](https://github.com/vertz-dev/vertz/pull/1170) [`6c33552`](https://github.com/vertz-dev/vertz/commit/6c3355265cd072d2c5b3d41c3c60e76d75c6e21c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add automatic font fallback metric overrides for zero-CLS font loading. The framework now extracts font metrics from .woff2 files at server startup and generates adjusted fallback @font-face blocks with ascent-override, descent-override, line-gap-override, and size-adjust. This eliminates layout shift when custom fonts load with font-display: swap.

- [#1168](https://github.com/vertz-dev/vertz/pull/1168) [`d0e9dc5`](https://github.com/vertz-dev/vertz/commit/d0e9dc5065fea630cd046ef55f279fe9fb400086) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(ui): Image component with build-time optimization

  Add `<Image>` component to `@vertz/ui` that renders an `<img>` element with sensible defaults (lazy loading, async decoding). At build time, the Bun plugin detects static `<Image>` usage and replaces it with optimized `<picture>` markup containing WebP 1x/2x variants and an original-format fallback.

  - Runtime `<Image>` component with priority prop, pass-through attributes
  - AST-based transform using ts-morph for reliable detection
  - Sharp-based image processor with content-hash caching
  - `/__vertz_img/` route for serving optimized images with path traversal protection
  - HTML attribute escaping to prevent XSS in generated markup

- [#1114](https://github.com/vertz-dev/vertz/pull/1114) [`9f6f292`](https://github.com/vertz-dev/vertz/commit/9f6f292137d89064c1d86c2231e1f416fa1abd61) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Wire on-demand entity eviction into EntityStore.merge(). Orphaned entities (unreferenced for longer than 5 minutes with no pending optimistic layers) are automatically cleaned up whenever new data is merged — no timer or manual calls needed.

- [#1176](https://github.com/vertz-dev/vertz/pull/1176) [`0f6d90a`](https://github.com/vertz-dev/vertz/commit/0f6d90adf785c52ff1e70187e3479941b2db896c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - SSR delivery optimizations: consolidate CSS into max 3 style tags, add structured PreloadItem data for HTTP Link headers, support modulepreload injection and Cache-Control headers in SSR handler.

- [#1220](https://github.com/vertz-dev/vertz/pull/1220) [`d8257a5`](https://github.com/vertz-dev/vertz/commit/d8257a5665704fa0f2c2e6646f3b5ab8c39c5cdc) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add `isBrowser()` SSR detection utility and migrate all `typeof window/document` guards. Remove `addEventListener`/`removeEventListener` no-op stubs from the SSR DOM shim — browser-only code no longer runs during SSR.

- Updated dependencies [[`541305e`](https://github.com/vertz-dev/vertz/commit/541305e8f98f2cdcc3bbebd992418680402677fb)]:
  - @vertz/fetch@0.2.16

## 0.2.15

### Patch Changes

- [#1086](https://github.com/vertz-dev/vertz/pull/1086) [`4a2d5b5`](https://github.com/vertz-dev/vertz/commit/4a2d5b504791ee772396248789b9ad65bd078abf) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Redesign access control system with entity-centric `defineAccess()`, plan features/limits with multi-limit resolution, override store with overage billing, plan versioning with grandfathering and grace periods, billing adapter interface with Stripe implementation, and client-side plan event broadcasting.

- [#1102](https://github.com/vertz-dev/vertz/pull/1102) [`d0f0941`](https://github.com/vertz-dev/vertz/commit/d0f09419950bd0d6d9229a11fa9bf07f632fb85d) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Generate router module augmentations so `useRouter()` picks up app route types by default after codegen.

  Change router navigation to use a TanStack-style input object with route patterns
  plus typed params, e.g. `navigate({ to: '/tasks/:id', params: { id: '123' } })`,
  with search params passed in the same object.

- Updated dependencies []:
  - @vertz/fetch@0.2.15

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
