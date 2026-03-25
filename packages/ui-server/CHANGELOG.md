# @vertz/ui-server

## 0.2.31

### Patch Changes

- [#1846](https://github.com/vertz-dev/vertz/pull/1846) [`86b1b76`](https://github.com/vertz-dev/vertz/commit/86b1b763b3b7598be442c04afe94acae0b5603c2) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add native Node HTTP adapter (`createNodeHandler`) that writes SSR output directly to `ServerResponse`, eliminating web Request/Response conversion overhead on Node.js. Import from `@vertz/ui-server/node`.

- Updated dependencies []:
  - @vertz/core@0.2.31
  - @vertz/ui@0.2.31
  - @vertz/ui-compiler@0.2.31

## 0.2.30

### Patch Changes

- Updated dependencies [[`3bf1c88`](https://github.com/vertz-dev/vertz/commit/3bf1c882c258ba9989feac2b27d00809af1d6415), [`e75e501`](https://github.com/vertz-dev/vertz/commit/e75e5014917608b33fca1668e275948e16a0d773), [`0ba086d`](https://github.com/vertz-dev/vertz/commit/0ba086d9bca13cac9e0a27a1cbd199c8b5ca6a07), [`1d36182`](https://github.com/vertz-dev/vertz/commit/1d36182b0678378d50d9a063d6471a9114712b6a)]:
  - @vertz/ui-compiler@0.2.30
  - @vertz/core@0.2.30
  - @vertz/ui@0.2.30

## 0.2.29

### Patch Changes

- Updated dependencies [[`7771170`](https://github.com/vertz-dev/vertz/commit/777117093d783aaeecc905ec65c4c85363746494)]:
  - @vertz/ui@0.2.29
  - @vertz/ui-compiler@0.2.29
  - @vertz/core@0.2.29

## 0.2.28

### Patch Changes

- Updated dependencies [[`a5ac6e1`](https://github.com/vertz-dev/vertz/commit/a5ac6e19f5642e3981c0bb96ae8de8bf574c60dc)]:
  - @vertz/ui-compiler@0.2.28
  - @vertz/core@0.2.28
  - @vertz/ui@0.2.28

## 0.2.27

### Patch Changes

- [#1770](https://github.com/vertz-dev/vertz/pull/1770) [`c40f504`](https://github.com/vertz-dev/vertz/commit/c40f5048e8ec551318f8daf4b98349c590c11553) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(ui-server): populate entitlements in toPrefetchSession from access set

- Updated dependencies []:
  - @vertz/core@0.2.27
  - @vertz/ui@0.2.27
  - @vertz/ui-compiler@0.2.27

## 0.2.26

### Patch Changes

- Updated dependencies [[`8552f21`](https://github.com/vertz-dev/vertz/commit/8552f217350e2acb0caac26ac215a49736b07e55)]:
  - @vertz/ui@0.2.26
  - @vertz/core@0.2.26
  - @vertz/ui-compiler@0.2.26

## 0.2.25

### Patch Changes

- Updated dependencies [[`04673a3`](https://github.com/vertz-dev/vertz/commit/04673a32a4849db08d80bb39caf801295fec9832), [`841c9ae`](https://github.com/vertz-dev/vertz/commit/841c9ae69b559d25ed443d3c5fa8e21b2fd174bf)]:
  - @vertz/ui@0.2.25
  - @vertz/ui-compiler@0.2.25
  - @vertz/core@0.2.25

## 0.2.24

### Patch Changes

- [#1695](https://github.com/vertz-dev/vertz/pull/1695) [`de3cb15`](https://github.com/vertz-dev/vertz/commit/de3cb15e9ecad1a4cec60cc21b6a9236fd4e6324) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix auto field selection not tracking field accesses in child components. Previously, when query data was passed to child components via props, the child's field accesses were silently missed, causing the query to under-fetch (only fields accessed directly in the parent were included in `select`).

  **What changed:**

  - Cross-file field resolution now falls back to fetching all fields (opaque) when a child component's field accesses can't be determined, instead of silently under-fetching
  - Barrel file re-exports (`export { Foo } from './bar'`) are now followed to find the actual component definition
  - Renamed re-exports (`export { Internal as Public }`) are handled correctly
  - The plugin pre-pass now scans `.ts` files (not just `.tsx`) to capture barrel file re-exports
  - HMR updates now process `.ts` file changes for field selection manifest updates

- Updated dependencies [[`a73dd79`](https://github.com/vertz-dev/vertz/commit/a73dd792de1876513914b89ef896fc88243b4cc8), [`d58a100`](https://github.com/vertz-dev/vertz/commit/d58a100f18762189be4319b58a4b86f8a774ac95), [`0e33400`](https://github.com/vertz-dev/vertz/commit/0e33400d96a9f778f3b936124d7544804f731db9), [`e24615a`](https://github.com/vertz-dev/vertz/commit/e24615a8619ae84b993c18dbdca2671ca254f9bb), [`adea2f1`](https://github.com/vertz-dev/vertz/commit/adea2f15f306d09ecebc56fc1f3841ff4b14b2ba)]:
  - @vertz/ui@0.2.24
  - @vertz/ui-compiler@0.2.24
  - @vertz/core@0.2.24

## 0.2.23

### Patch Changes

- [#1588](https://github.com/vertz-dev/vertz/pull/1588) [`7c146e6`](https://github.com/vertz-dev/vertz/commit/7c146e695b642affeb39134beb0e1eb6475f20a8) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix reactive form element properties (`value`, `checked`, `selected`) to use DOM property assignment instead of `setAttribute`. This fixes `<select value={signal}>`, `<input value={signal}>`, `<input checked={signal}>`, and `<option selected={signal}>` not updating the displayed state reactively.

- Updated dependencies [[`eb1e2d6`](https://github.com/vertz-dev/vertz/commit/eb1e2d6df1923c2fd7525c58281bb1b13e52750a), [`10f6309`](https://github.com/vertz-dev/vertz/commit/10f6309790bff69c7a1a0ab92e50f78f34b129c3), [`1709f6d`](https://github.com/vertz-dev/vertz/commit/1709f6d933f04600d1b959b51660f2f8f33805d8), [`1e26cca`](https://github.com/vertz-dev/vertz/commit/1e26cca7eca00291633a2fa6257fc80a1f409b60), [`83c3a67`](https://github.com/vertz-dev/vertz/commit/83c3a67ca7de53a7c79fb650250b33b0ed05329f), [`82055ae`](https://github.com/vertz-dev/vertz/commit/82055aefc19e4c3a115152f2e7157389486e792e), [`e085298`](https://github.com/vertz-dev/vertz/commit/e085298955cdc027e1db6117c83912b9fc0cb0b0), [`4ff38bb`](https://github.com/vertz-dev/vertz/commit/4ff38bbdb34204b6de388a09152a174b7e16406c), [`a21f762`](https://github.com/vertz-dev/vertz/commit/a21f76239e5c4b112c7be9a4ebea8327c3d2230b), [`7c146e6`](https://github.com/vertz-dev/vertz/commit/7c146e695b642affeb39134beb0e1eb6475f20a8)]:
  - @vertz/ui-compiler@0.2.23
  - @vertz/ui@0.2.23
  - @vertz/core@0.2.23

## 0.2.22

### Patch Changes

- Updated dependencies [[`8ed55f6`](https://github.com/vertz-dev/vertz/commit/8ed55f6fc8aa691758606fe044a8b1d74b7bb9bc), [`5d64812`](https://github.com/vertz-dev/vertz/commit/5d6481233006f67c21375f3879fda600c86c0cdd), [`cd8b41b`](https://github.com/vertz-dev/vertz/commit/cd8b41bb9900f364cd562be9ae64b9644096881a), [`180ac91`](https://github.com/vertz-dev/vertz/commit/180ac91f4fbc562581136dd8256f67fcc724fa69), [`6d32565`](https://github.com/vertz-dev/vertz/commit/6d32565c2818f9235d02af14a616279f018d0ff5), [`2e99e39`](https://github.com/vertz-dev/vertz/commit/2e99e3943830d2e2e0b2b44a1b32d8641e63dbe3), [`1c4916b`](https://github.com/vertz-dev/vertz/commit/1c4916b04eaaef0ee2e27eda1b73c36ae24e665e)]:
  - @vertz/ui@0.2.22
  - @vertz/ui-compiler@0.2.22
  - @vertz/core@0.2.22

## 0.2.21

### Patch Changes

- [#1345](https://github.com/vertz-dev/vertz/pull/1345) [`0704bbb`](https://github.com/vertz-dev/vertz/commit/0704bbbc5561e2e2a6a6e0fd0a5f6af343f5f178) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Adopt `className` as the standard JSX prop for CSS classes, matching React convention. The `class` prop remains as a deprecated alias. All components, examples, and docs updated.

- [#1325](https://github.com/vertz-dev/vertz/pull/1325) [`30737c7`](https://github.com/vertz-dev/vertz/commit/30737c73fcf844878b6b781f3b786fac39e6a7b5) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add `dataset` property to SSR DOM shim elements, fixing crashes when components access `el.dataset.*` during SSR

- [#1314](https://github.com/vertz-dev/vertz/pull/1314) [`5eda52e`](https://github.com/vertz-dev/vertz/commit/5eda52e2a74966eb94dcca5af00cb1f1dd8c2fd7) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add automatic restart for stale module graph errors (Phase 3). When a stale-graph error is detected, the server and client now auto-trigger a restart without user interaction. Includes restart loop prevention (max 3 auto-restarts within 10s window) with fallback to the manual "Restart Server" button.

- [#1310](https://github.com/vertz-dev/vertz/pull/1310) [`0f7b4bc`](https://github.com/vertz-dev/vertz/commit/0f7b4bc228d6ebf294ab9b7a63087324f003cf86) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add stale module graph detection and dev server restart mechanism. When Bun's HMR retains stale import bindings after exports are removed or renamed, the error overlay now shows a "Restart Server" button that triggers a soft server restart, clearing the module graph and recovering automatically.

- [#1365](https://github.com/vertz-dev/vertz/pull/1365) [`6be7ce8`](https://github.com/vertz-dev/vertz/commit/6be7ce859300258b926fa7a608e2656952fea0c1) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix duplicate route components during production hydration with lazy (code-split) routes. RouterView and Outlet now re-enter hydration when lazy routes resolve, claiming SSR nodes instead of recreating DOM. Add route-aware chunk preloading via route-chunk manifest.

- [#1396](https://github.com/vertz-dev/vertz/pull/1396) [`2ae15d1`](https://github.com/vertz-dev/vertz/commit/2ae15d116fc58c59a430472a98198377ccde1e4e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(ui,ui-server,cli): add generateParams for dynamic route SSG

  Routes can now define `generateParams` to pre-render dynamic routes at build time. The build pipeline expands these into concrete paths and pre-renders each one to static HTML files.

- [#1346](https://github.com/vertz-dev/vertz/pull/1346) [`b5fbc7d`](https://github.com/vertz-dev/vertz/commit/b5fbc7d884b06c8a0cb0c48d22dae5fe2684a4cc) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Support React-style `style` objects with camelCase properties. `style={{ backgroundColor: 'red' }}` now converts to a CSS string at all levels: JSX runtime, compiler-generated code, reactive `__attr()` bindings, and SSR. Includes auto-px for dimensional numeric values, unitless property detection, and vendor prefix handling.

- Updated dependencies [[`a16511c`](https://github.com/vertz-dev/vertz/commit/a16511cd78256fe86d0d69393dd923353d6f445a), [`796ef1a`](https://github.com/vertz-dev/vertz/commit/796ef1a9826f401c6d0b08f424d53609debda029), [`a5b9cbe`](https://github.com/vertz-dev/vertz/commit/a5b9cbe68202345ab09002f7e42c2a5be0c917bf), [`520444e`](https://github.com/vertz-dev/vertz/commit/520444e3bdbbf3140b75ed3754870166544b5f88), [`0704bbb`](https://github.com/vertz-dev/vertz/commit/0704bbbc5561e2e2a6a6e0fd0a5f6af343f5f178), [`fa3d23c`](https://github.com/vertz-dev/vertz/commit/fa3d23ca2e92a4b734c4908ab274d8e75e45cbc0), [`823e301`](https://github.com/vertz-dev/vertz/commit/823e3016dcb4487a7cdf9af61aea940566ffb21c), [`86d33bd`](https://github.com/vertz-dev/vertz/commit/86d33bd56934d62441b031fb72dd86687f0d0845), [`4390036`](https://github.com/vertz-dev/vertz/commit/4390036144176fab7aa869ddcde621eece6f904c), [`a7e37c3`](https://github.com/vertz-dev/vertz/commit/a7e37c3dd29ac75183a085d34b0621d339f8402a), [`6be7ce8`](https://github.com/vertz-dev/vertz/commit/6be7ce859300258b926fa7a608e2656952fea0c1), [`301c401`](https://github.com/vertz-dev/vertz/commit/301c40192ddec0a306bba997a7f9e4ce4253aa95), [`c9d6c7e`](https://github.com/vertz-dev/vertz/commit/c9d6c7ef368efdc905b4e96302798b2db65522aa), [`cac4e45`](https://github.com/vertz-dev/vertz/commit/cac4e452bd12b726c077ce2f48605bbc410a680f), [`9ccbe74`](https://github.com/vertz-dev/vertz/commit/9ccbe743c3c4eee109b69c9e3aff5df5f64c572e), [`e9cfc6a`](https://github.com/vertz-dev/vertz/commit/e9cfc6ad9b4b5dd5c518bea3c1982082d7e96e10), [`427e519`](https://github.com/vertz-dev/vertz/commit/427e5194a7f783c2accc246409bf146dcfa2f1b7), [`2ae15d1`](https://github.com/vertz-dev/vertz/commit/2ae15d116fc58c59a430472a98198377ccde1e4e), [`b5fbc7d`](https://github.com/vertz-dev/vertz/commit/b5fbc7d884b06c8a0cb0c48d22dae5fe2684a4cc), [`f356523`](https://github.com/vertz-dev/vertz/commit/f356523f7054b1b72d7936e3a7e13147904087dc), [`f9eccd5`](https://github.com/vertz-dev/vertz/commit/f9eccd56b2ecc4467b36b8e78bb3a072141ef93c), [`4079d6b`](https://github.com/vertz-dev/vertz/commit/4079d6b7567479f5f59648e81773f098c7696d02)]:
  - @vertz/ui@0.2.21
  - @vertz/ui-compiler@0.2.21
  - @vertz/core@0.2.21

## 0.2.20

### Patch Changes

- [#1281](https://github.com/vertz-dev/vertz/pull/1281) [`9a0a313`](https://github.com/vertz-dev/vertz/commit/9a0a3131656bb22a8cdfb351013c3a7a69cdd553) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add favicon to scaffold template and auto-detect it in the dev server

- Updated dependencies []:
  - @vertz/core@0.2.20
  - @vertz/ui@0.2.20
  - @vertz/ui-compiler@0.2.20

## 0.2.19

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.19
  - @vertz/ui@0.2.19
  - @vertz/ui-compiler@0.2.19

## 0.2.18

### Patch Changes

- Updated dependencies [[`b4cb6b6`](https://github.com/vertz-dev/vertz/commit/b4cb6b6826583c05efcdfd0af0e046a49f6eed91), [`c2355f9`](https://github.com/vertz-dev/vertz/commit/c2355f9d3e13feac615b00d48406e4626e92869b), [`e5ac67e`](https://github.com/vertz-dev/vertz/commit/e5ac67e24a05e0342a8c470ef741d7729ebeaf58)]:
  - @vertz/ui@0.2.18
  - @vertz/core@0.2.18
  - @vertz/ui-compiler@0.2.18

## 0.2.17

### Patch Changes

- Updated dependencies [[`f284697`](https://github.com/vertz-dev/vertz/commit/f284697218e3ebcc7a196e8a6633c822e206646e), [`6d6a85c`](https://github.com/vertz-dev/vertz/commit/6d6a85c0fd9f354a8d077e2eb1afdcf065344b95)]:
  - @vertz/ui@0.2.17
  - @vertz/core@0.2.17
  - @vertz/ui-compiler@0.2.17

## 0.2.16

### Patch Changes

- [#1108](https://github.com/vertz-dev/vertz/pull/1108) [`97e9fc9`](https://github.com/vertz-dev/vertz/commit/97e9fc9a80548e2be111542513802269162f4136) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add LRU eviction to MemoryCache with configurable maxSize (default 1000) to prevent unbounded cache growth in query().

- [#1195](https://github.com/vertz-dev/vertz/pull/1195) [`af0b64c`](https://github.com/vertz-dev/vertz/commit/af0b64c62480606cd9bb7ec9a25d7a4f0903d9cf) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add runtime image optimization for dynamic images at the edge. The `<Image>` component now rewrites absolute HTTP(S) URLs through `/_vertz/image` when `configureImageOptimizer()` is called. The Cloudflare handler supports an `imageOptimizer` config option using `cf.image` for edge transformation. Dev server includes a passthrough proxy for development.

- [#1173](https://github.com/vertz-dev/vertz/pull/1173) [`caf4647`](https://github.com/vertz-dev/vertz/commit/caf464741b53fdd65be1c558cf2330172f6d2feb) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add optional onMiss telemetry callback to FieldSelectionTracker for compiler miss detection, and recordFieldMiss method to DiagnosticsCollector for surfacing misses via /\_\_vertz_diagnostics endpoint

- [#1170](https://github.com/vertz-dev/vertz/pull/1170) [`6c33552`](https://github.com/vertz-dev/vertz/commit/6c3355265cd072d2c5b3d41c3c60e76d75c6e21c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add automatic font fallback metric overrides for zero-CLS font loading. The framework now extracts font metrics from .woff2 files at server startup and generates adjusted fallback @font-face blocks with ascent-override, descent-override, line-gap-override, and size-adjust. This eliminates layout shift when custom fonts load with font-display: swap.

- [#1168](https://github.com/vertz-dev/vertz/pull/1168) [`d0e9dc5`](https://github.com/vertz-dev/vertz/commit/d0e9dc5065fea630cd046ef55f279fe9fb400086) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(ui): Image component with build-time optimization

  Add `<Image>` component to `@vertz/ui` that renders an `<img>` element with sensible defaults (lazy loading, async decoding). At build time, the Bun plugin detects static `<Image>` usage and replaces it with optimized `<picture>` markup containing WebP 1x/2x variants and an original-format fallback.

  - Runtime `<Image>` component with priority prop, pass-through attributes
  - AST-based transform using ts-morph for reliable detection
  - Sharp-based image processor with content-hash caching
  - `/__vertz_img/` route for serving optimized images with path traversal protection
  - HTML attribute escaping to prevent XSS in generated markup

- [#1109](https://github.com/vertz-dev/vertz/pull/1109) [`e1938b0`](https://github.com/vertz-dev/vertz/commit/e1938b0f86129396d22f5db57792cfa805387e62) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add incremental HMR manifest updates — regenerate changed file's reactivity manifest on save before SSR re-import, with change detection to skip unnecessary cache invalidation

- [#1193](https://github.com/vertz-dev/vertz/pull/1193) [`02bac2a`](https://github.com/vertz-dev/vertz/commit/02bac2af689750d500f0846d700e89528a02627d) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add automatic route code splitting: `defineRoutes()` component factories are rewritten to lazy `import()` calls at build time, enabling per-page code splitting without manual dynamic imports.

- [#1131](https://github.com/vertz-dev/vertz/pull/1131) [`ab3f364`](https://github.com/vertz-dev/vertz/commit/ab3f36478018245cc9473217a9a3bf7b04c6a5cb) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Export EntitySchemaManifest, EntitySchemaManifestEntry, and EntitySchemaRelation types from @vertz/codegen. Update @vertz/ui-server to import from the canonical source instead of maintaining duplicate definitions.

- [#1176](https://github.com/vertz-dev/vertz/pull/1176) [`0f6d90a`](https://github.com/vertz-dev/vertz/commit/0f6d90adf785c52ff1e70187e3479941b2db896c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - SSR delivery optimizations: consolidate CSS into max 3 style tags, add structured PreloadItem data for HTTP Link headers, support modulepreload injection and Cache-Control headers in SSR handler.

- [#1220](https://github.com/vertz-dev/vertz/pull/1220) [`d8257a5`](https://github.com/vertz-dev/vertz/commit/d8257a5665704fa0f2c2e6646f3b5ab8c39c5cdc) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add `isBrowser()` SSR detection utility and migrate all `typeof window/document` guards. Remove `addEventListener`/`removeEventListener` no-op stubs from the SSR DOM shim — browser-only code no longer runs during SSR.

- [#1216](https://github.com/vertz-dev/vertz/pull/1216) [`c1c0638`](https://github.com/vertz-dev/vertz/commit/c1c06383b8ad50c833b64aa5009fe7b494bb559b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - SSR session injection to eliminate auth loading flash. JWT session data is now injected as `window.__VERTZ_SESSION__` during SSR, so `AuthProvider` hydrates with session data immediately instead of showing a loading state. Zero-config: the CLI auto-wires the session resolver when auth is configured.

- Updated dependencies [[`97e9fc9`](https://github.com/vertz-dev/vertz/commit/97e9fc9a80548e2be111542513802269162f4136), [`d2f6baf`](https://github.com/vertz-dev/vertz/commit/d2f6baf560db958f56257879d5d69da200ed519d), [`24b81a2`](https://github.com/vertz-dev/vertz/commit/24b81a26f0064863c1e50cdd17c0fe0fc022f6ea), [`af0b64c`](https://github.com/vertz-dev/vertz/commit/af0b64c62480606cd9bb7ec9a25d7a4f0903d9cf), [`caf4647`](https://github.com/vertz-dev/vertz/commit/caf464741b53fdd65be1c558cf2330172f6d2feb), [`b061fc4`](https://github.com/vertz-dev/vertz/commit/b061fc4d04e851ae1ec6addd9342cec7b1a698f8), [`d44234d`](https://github.com/vertz-dev/vertz/commit/d44234de726d5dfa786103b3e5a311754753f08e), [`6c33552`](https://github.com/vertz-dev/vertz/commit/6c3355265cd072d2c5b3d41c3c60e76d75c6e21c), [`d0e9dc5`](https://github.com/vertz-dev/vertz/commit/d0e9dc5065fea630cd046ef55f279fe9fb400086), [`9f6f292`](https://github.com/vertz-dev/vertz/commit/9f6f292137d89064c1d86c2231e1f416fa1abd61), [`02bac2a`](https://github.com/vertz-dev/vertz/commit/02bac2af689750d500f0846d700e89528a02627d), [`0f6d90a`](https://github.com/vertz-dev/vertz/commit/0f6d90adf785c52ff1e70187e3479941b2db896c), [`d8257a5`](https://github.com/vertz-dev/vertz/commit/d8257a5665704fa0f2c2e6646f3b5ab8c39c5cdc)]:
  - @vertz/ui@0.2.16
  - @vertz/ui-compiler@0.2.16
  - @vertz/core@0.2.16

## 0.2.15

### Patch Changes

- Updated dependencies [[`4a2d5b5`](https://github.com/vertz-dev/vertz/commit/4a2d5b504791ee772396248789b9ad65bd078abf), [`d0f0941`](https://github.com/vertz-dev/vertz/commit/d0f09419950bd0d6d9229a11fa9bf07f632fb85d)]:
  - @vertz/ui@0.2.15
  - @vertz/core@0.2.15
  - @vertz/ui-compiler@0.2.15

## 0.2.14

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.14
  - @vertz/ui@0.2.14
  - @vertz/ui-compiler@0.2.14

## 0.2.13

### Patch Changes

- [#1046](https://github.com/vertz-dev/vertz/pull/1046) [`337e1b3`](https://github.com/vertz-dev/vertz/commit/337e1b3dfca6768575e57cf54069beb4f37366b7) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Access Set Bootstrap + Client-Side can(): server computes global entitlement snapshots (computeAccessSet), embeds in JWT acl claim with 2KB overflow strategy, exposes GET /api/auth/access-set with ETag/304 support. Client-side can() function returns reactive AccessCheck signals, AccessGate blocks UI while loading, createAccessProvider hydrates from SSR-injected **VERTZ_ACCESS_SET**. computeEntityAccess() enables per-entity access metadata for can(entitlement, entity). Compiler recognizes can() as signal-api via reactivity manifest.

- [#950](https://github.com/vertz-dev/vertz/pull/950) [`a5ceec8`](https://github.com/vertz-dev/vertz/commit/a5ceec812613d92f7261407e86b1a39993687a7a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Automatic optimistic updates for entity mutations.

  EntityStore gains an optimistic layer stack (applyLayer/commitLayer/rollbackLayer) that overlays in-flight mutation patches on top of server-truth base data. MutationDescriptor in @vertz/fetch orchestrates the apply→fetch→commit/rollback lifecycle. The query() source switcher reads entity-backed data from EntityStore, so optimistic patches propagate reactively to all consuming queries. Generated createClient auto-wires the handler — zero boilerplate for `await api.todos.update(id, { completed: true })` to optimistically update all queries immediately.

- [#1052](https://github.com/vertz-dev/vertz/pull/1052) [`4eac71c`](https://github.com/vertz-dev/vertz/commit/4eac71c98369d12a0cd7a3cbbeda60ea7cc5bd05) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add client-side auth session management (AuthProvider, useAuth, AuthGate)

  - AuthProvider wraps app with auth context, manages JWT session lifecycle
  - useAuth() returns reactive state + SdkMethods (signIn, signUp, signOut, mfaChallenge, forgotPassword, resetPassword)
  - SdkMethods work with form() for automatic validation and submission
  - Proactive token refresh scheduling (10s before expiry, tab visibility, online/offline handling)
  - AuthGate gates rendering on auth state resolution (shows fallback during loading)
  - SSR hydration via window.**VERTZ_SESSION** (no initial fetch needed)
  - AccessContext integration: AuthProvider auto-manages access set when accessControl=true
  - Server: signin/signup/refresh responses now include expiresAt timestamp

- Updated dependencies [[`337e1b3`](https://github.com/vertz-dev/vertz/commit/337e1b3dfca6768575e57cf54069beb4f37366b7), [`a5ceec8`](https://github.com/vertz-dev/vertz/commit/a5ceec812613d92f7261407e86b1a39993687a7a), [`3a79c2f`](https://github.com/vertz-dev/vertz/commit/3a79c2fad5bfbaed61f252cf2b908592e12a82bd), [`a9211ca`](https://github.com/vertz-dev/vertz/commit/a9211ca751305f541987b93d493d349838cf4822), [`a82b2ec`](https://github.com/vertz-dev/vertz/commit/a82b2ec1ccc94f278916796783c33d81ffead211), [`1011e51`](https://github.com/vertz-dev/vertz/commit/1011e51fbfe528e35930e3dd5c32b76568b0684a), [`de34f8d`](https://github.com/vertz-dev/vertz/commit/de34f8dc9d3e69b507874f33d80bf7dc4420001d), [`4eac71c`](https://github.com/vertz-dev/vertz/commit/4eac71c98369d12a0cd7a3cbbeda60ea7cc5bd05)]:
  - @vertz/ui@0.2.13
  - @vertz/ui-compiler@0.2.13
  - @vertz/core@0.2.13

## 0.2.12

### Patch Changes

- [#937](https://github.com/vertz-dev/vertz/pull/937) [`c7e3ec2`](https://github.com/vertz-dev/vertz/commit/c7e3ec2e926b0a2cd6d35f58124f3d7f50fc6fb9) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix nested conditional DOM duplication and stable context IDs for HMR.

  Nested `__conditional` calls (from chained ternaries) returned DocumentFragments that lost children after DOM insertion, causing stale text nodes. `normalizeNode()` now wraps fragments in `<span style="display:contents">` for stable parent references.

  Framework-internal contexts (`RouterContext`, `OutletContext`, `DialogStackContext`) now have stable IDs so they survive HMR module re-evaluation without breaking `useContext()`.

- Updated dependencies [[`c7e3ec2`](https://github.com/vertz-dev/vertz/commit/c7e3ec2e926b0a2cd6d35f58124f3d7f50fc6fb9)]:
  - @vertz/ui@0.2.12
  - @vertz/core@0.2.12
  - @vertz/ui-compiler@0.2.12

## 0.2.11

### Patch Changes

- [#919](https://github.com/vertz-dev/vertz/pull/919) [`b2878cf`](https://github.com/vertz-dev/vertz/commit/b2878cfe2acb3d1155ca5e0da13b2ee91c9aea9a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix source map line offset in dev server

  Breakpoints in browser DevTools were landing 2-3 lines below the intended position. The Bun plugin prepends CSS import and Fast Refresh preamble lines before the compiled code, but the source map was not adjusted for these extra lines. Now the source map mappings are offset by the number of prepended lines, so breakpoints land on the correct line.

- [#917](https://github.com/vertz-dev/vertz/pull/917) [`5ed4c1a`](https://github.com/vertz-dev/vertz/commit/5ed4c1a4c5c9ea946e97b1636011251c6287eaf4) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix HMR fast-refresh stability: SSR module reload now uses .ts wrapper to preserve plugin processing, compiler unwraps NonNullExpression in reactivity analyzer, and dev server includes diagnostic logging (VERTZ_DEBUG) and health check endpoint (/\_\_vertz_diagnostics).

- [#918](https://github.com/vertz-dev/vertz/pull/918) [`1fc9e33`](https://github.com/vertz-dev/vertz/commit/1fc9e33a9aa5283898c8974084f519a3caacbabb) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Remove index.html from the framework

  UI apps no longer require an `index.html` file in the project root. The production build now generates the HTML shell programmatically with the correct asset references, eliminating the need for:

  - Manual `index.html` maintenance
  - Fast Refresh runtime stripping during build
  - Dev script tag replacement with hashed entries
  - `./public/` path rewriting

  The `createIndexHtmlStasher` dev server mechanism (which renamed `index.html` during development to prevent Bun from auto-serving it) has been removed entirely.

  `UIBuildConfig` gains an optional `title` field (default: `'Vertz App'`) to set the HTML page title.

- Updated dependencies [[`275e4c7`](https://github.com/vertz-dev/vertz/commit/275e4c770f55b9e75b44d90f2cb586fff3eaeede), [`5ed4c1a`](https://github.com/vertz-dev/vertz/commit/5ed4c1a4c5c9ea946e97b1636011251c6287eaf4), [`5607c59`](https://github.com/vertz-dev/vertz/commit/5607c598c1c55485222fa2da192d0e0321f8b14a), [`523bbcb`](https://github.com/vertz-dev/vertz/commit/523bbcb12c1866a8334d5dac278cb51b157a5c7b), [`5607c59`](https://github.com/vertz-dev/vertz/commit/5607c598c1c55485222fa2da192d0e0321f8b14a), [`859e3da`](https://github.com/vertz-dev/vertz/commit/859e3dae660629d5d4f1e13c305c9201ee1d738d)]:
  - @vertz/ui-compiler@0.2.11
  - @vertz/ui@0.2.11
  - @vertz/core@0.2.11

## 0.2.8

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.8
  - @vertz/ui@0.2.8
  - @vertz/ui-compiler@0.2.8

## 0.2.7

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.7
  - @vertz/ui@0.2.7
  - @vertz/ui-compiler@0.2.7

## 0.2.6

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.6
  - @vertz/ui@0.2.6
  - @vertz/ui-compiler@0.2.6

## 0.2.5

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.5
  - @vertz/ui@0.2.5
  - @vertz/ui-compiler@0.2.5

## 0.2.4

### Patch Changes

- [#894](https://github.com/vertz-dev/vertz/pull/894) [`a986d07`](https://github.com/vertz-dev/vertz/commit/a986d0788ca0210dfa4f624153d4bda72257a78c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix HMR fast-refresh stability: SSR module reload now uses .ts wrapper to preserve plugin processing, compiler unwraps NonNullExpression in reactivity analyzer, and dev server includes diagnostic logging (VERTZ_DEBUG) and health check endpoint (/\_\_vertz_diagnostics).

- Updated dependencies [[`a986d07`](https://github.com/vertz-dev/vertz/commit/a986d0788ca0210dfa4f624153d4bda72257a78c)]:
  - @vertz/ui-compiler@0.2.4
  - @vertz/core@0.2.4
  - @vertz/ui@0.2.2

## 0.2.3

### Patch Changes

- [#880](https://github.com/vertz-dev/vertz/pull/880) [`2e86c55`](https://github.com/vertz-dev/vertz/commit/2e86c55e3c04f3c534bf0dc124d18dcdc5d9eefc) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Preserve DOM state (form values, focus, scroll positions) across fast refresh hot updates. Previously, `replaceChild` created an entirely new DOM tree, losing transient state like input values, cursor position, and scroll offsets. Now captures state by `name`/`id` attributes before replacement and restores it after.

- [#878](https://github.com/vertz-dev/vertz/pull/878) [`62dddcb`](https://github.com/vertz-dev/vertz/commit/62dddcbcb4943b12a04bca8466b09ae21901070b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Remove `private: true` so the package is published to npm. Required by `@vertz/cli` at runtime.

- Updated dependencies [[`62dddcb`](https://github.com/vertz-dev/vertz/commit/62dddcbcb4943b12a04bca8466b09ae21901070b), [`62dddcb`](https://github.com/vertz-dev/vertz/commit/62dddcbcb4943b12a04bca8466b09ae21901070b), [`b0b6115`](https://github.com/vertz-dev/vertz/commit/b0b6115e0389447ffb951e875b5ce224e4ace51c)]:
  - @vertz/core@0.2.3
  - @vertz/ui-compiler@0.2.3
  - @vertz/ui@0.2.2

## 0.2.2

### Patch Changes

- Updated dependencies [[`b6cb0a0`](https://github.com/vertz-dev/vertz/commit/b6cb0a0e3de68974ce1747063288aef7a199f084)]:
  - @vertz/ui@0.2.2
  - @vertz/ui-compiler@0.2.2
  - @vertz/core@0.2.2

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

### Patch Changes

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

- Updated dependencies [[`a207936`](https://github.com/vertz-dev/vertz/commit/a2079362c54a8b61ea2368039abcb08681448380), [`b2d43d4`](https://github.com/vertz-dev/vertz/commit/b2d43d4f265e4b1a806b3e96f00721cc38cc07e8), [`c8efe6b`](https://github.com/vertz-dev/vertz/commit/c8efe6b4aef9ea9b9b4e3de414297ce2f829f7bb), [`3407afd`](https://github.com/vertz-dev/vertz/commit/3407afdf543481cd559e550454144d16e6a26e06), [`4f780bb`](https://github.com/vertz-dev/vertz/commit/4f780bba6bee7a493c9a1e0b8463ea2126a7285b), [`0a33c14`](https://github.com/vertz-dev/vertz/commit/0a33c142a12a54e0da61423701ca338118ab9c98), [`c1e38d0`](https://github.com/vertz-dev/vertz/commit/c1e38d010da1bea95ed9246968fabc22e300a6e9), [`0f1c028`](https://github.com/vertz-dev/vertz/commit/0f1c028dd6bb90e37ac71f60e40ba0be774cca11), [`7207c4c`](https://github.com/vertz-dev/vertz/commit/7207c4c44c2fc83f67459cbcba8e6010b4d05145), [`a454791`](https://github.com/vertz-dev/vertz/commit/a454791e0c6866cbad1d0d96bc3c0688282b021b), [`e17ccb2`](https://github.com/vertz-dev/vertz/commit/e17ccb261ecebc1ca7d58b75365869cb29253a3c), [`948f127`](https://github.com/vertz-dev/vertz/commit/948f127bf4b752274800c045d010590f1cc266d8), [`9ee0308`](https://github.com/vertz-dev/vertz/commit/9ee03084f71803b04eef5f05ced2f90b52a9fa8e), [`63f074e`](https://github.com/vertz-dev/vertz/commit/63f074eefa96b49eb72724f8ec377a14a1f2c630)]:
  - @vertz/core@0.2.0
  - @vertz/server@0.2.0
  - @vertz/ui@0.2.0

## 0.1.0 (2026-02-13)

### Features

- **SSR Core:** Initial server-side rendering implementation

  - `renderToStream()` — Streaming HTML renderer returning `ReadableStream<Uint8Array>`
  - Component-to-HTML serialization with proper escaping
  - Void element handling (no closing tags for `<input>`, `<br>`, etc.)
  - Raw text element handling (`<script>`, `<style>` content not escaped)

- **Out-of-Order Streaming:** Suspense boundary support

  - Slot placeholders (`v-slot-N`) for async content
  - Template chunks (`v-tmpl-N`) streamed when data resolves
  - Client-side replacement scripts with DOM manipulation

- **Hydration Markers:** Atomic component hydration

  - `data-v-id` attributes for component identification
  - `data-v-key` for unique instance tracking
  - Serialized props embedded as `<script type="application/json">`
  - Static components produce zero hydration markers

- **Head Management:** `<head>` metadata collection

  - `HeadCollector` for collecting `<title>`, `<meta>`, `<link>` during render
  - `renderHeadToHtml()` for serializing head entries

- **Asset Pipeline:** Script and stylesheet injection

  - `renderAssetTags()` for generating `<script>` and `<link>` tags
  - Support for `async` and `defer` attributes on scripts

- **Critical CSS:** Above-the-fold CSS inlining

  - `inlineCriticalCss()` with injection prevention
  - Escapes `</style>` sequences to prevent breakout

- **CSP Nonce Support:** Content Security Policy compliance

  - Optional `nonce` parameter on `renderToStream()`
  - All inline scripts include `nonce` attribute when provided
  - Nonce value escaping to prevent attribute injection

- **Testing Utilities:** SSR testing helpers
  - `streamToString()` — Convert stream to string for assertions
  - `collectStreamChunks()` — Collect chunks as array for ordering tests
  - `encodeChunk()` — UTF-8 encoding helper

### Test Coverage

- 66 tests across 10 test files
- 5 integration tests validating all acceptance criteria (IT-5A-1 through IT-5A-5)
- CSP nonce security tests
- Streaming chunk ordering tests
- Hydration marker tests for interactive vs static components
- Edge case handling (empty trees, void elements, raw text elements)

### Documentation

- Comprehensive README with usage examples
- API reference for all public exports
- Security guidance for `rawHtml()` usage
- Examples for Suspense streaming, hydration markers, head management, asset injection, and critical CSS
