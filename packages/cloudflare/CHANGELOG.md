# @vertz/cloudflare

## 0.2.29

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.29
  - @vertz/ui-server@0.2.29

## 0.2.28

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.28
  - @vertz/ui-server@0.2.28

## 0.2.27

### Patch Changes

- Updated dependencies [[`c40f504`](https://github.com/vertz-dev/vertz/commit/c40f5048e8ec551318f8daf4b98349c590c11553)]:
  - @vertz/ui-server@0.2.27
  - @vertz/core@0.2.27

## 0.2.26

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.26
  - @vertz/ui-server@0.2.26

## 0.2.25

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.25
  - @vertz/ui-server@0.2.25

## 0.2.24

### Patch Changes

- Updated dependencies [[`de3cb15`](https://github.com/vertz-dev/vertz/commit/de3cb15e9ecad1a4cec60cc21b6a9236fd4e6324)]:
  - @vertz/ui-server@0.2.24
  - @vertz/core@0.2.24

## 0.2.23

### Patch Changes

- [#1579](https://github.com/vertz-dev/vertz/pull/1579) [`bcd80af`](https://github.com/vertz-dev/vertz/commit/bcd80af9ca0007a8a21805a6cfa832aa983edb14) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Improve Cloudflare adapter DX with zero-boilerplate defaults:
  - `basePath` is now optional, defaults to `'/api'` (matches `createServer`'s `apiPrefix` default)
  - `ssr` is now required — enforces SSR-first at the type level
  - `securityHeaders` now defaults to `true` (security by default)
  - Auto-detect `requestHandler` on ServerInstance for auth-aware routing (auth routes no longer require manual wiring)
- Updated dependencies [[`7c146e6`](https://github.com/vertz-dev/vertz/commit/7c146e695b642affeb39134beb0e1eb6475f20a8)]:
  - @vertz/ui-server@0.2.23
  - @vertz/core@0.2.23

## 0.2.22

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.22
  - @vertz/ui-server@0.2.22

## 0.2.21

### Patch Changes

- [#1424](https://github.com/vertz-dev/vertz/pull/1424) [`67d1984`](https://github.com/vertz-dev/vertz/commit/67d19841241407eb8d8be7f2ddbb7e0a98ca6fe4) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add `beforeRender` middleware hook to `createHandler()` config. The hook runs before SSR rendering on non-API routes and can return a `Response` to short-circuit (e.g., redirect to `/login`). Returns `undefined`/`void` to proceed normally.

- [#1423](https://github.com/vertz-dev/vertz/pull/1423) [`bfd3e9e`](https://github.com/vertz-dev/vertz/commit/bfd3e9e00eae4b1918e7d119fe8eaa245beb85ef) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat: traffic-aware pre-rendering (TPR) for Cloudflare Workers

  Adds ISR (Incremental Static Regeneration) and TPR support:

  - **ISR caching**: Cache SSR responses in Cloudflare KV with TTL-based revalidation and stale-while-revalidate via `ctx.waitUntil()`
  - **TPR analytics**: Query Cloudflare GraphQL Analytics API to identify hot pages by traffic
  - **Pre-rendering**: Render and store hot pages in KV at deploy time with concurrency control
  - **Route classification**: Compiler-assisted classification of static vs dynamic routes for optimal pre-rendering

  New `cache` config on `createHandler()`:

  ```ts
  createHandler({
    cache: {
      kv: (env) => env.PAGE_CACHE,
      ttl: 3600,
      staleWhileRevalidate: true,
    },
  });
  ```

  New `@vertz/cloudflare/tpr` export for deploy-time pre-rendering.

- Updated dependencies [[`0704bbb`](https://github.com/vertz-dev/vertz/commit/0704bbbc5561e2e2a6a6e0fd0a5f6af343f5f178), [`30737c7`](https://github.com/vertz-dev/vertz/commit/30737c73fcf844878b6b781f3b786fac39e6a7b5), [`5eda52e`](https://github.com/vertz-dev/vertz/commit/5eda52e2a74966eb94dcca5af00cb1f1dd8c2fd7), [`0f7b4bc`](https://github.com/vertz-dev/vertz/commit/0f7b4bc228d6ebf294ab9b7a63087324f003cf86), [`6be7ce8`](https://github.com/vertz-dev/vertz/commit/6be7ce859300258b926fa7a608e2656952fea0c1), [`2ae15d1`](https://github.com/vertz-dev/vertz/commit/2ae15d116fc58c59a430472a98198377ccde1e4e), [`b5fbc7d`](https://github.com/vertz-dev/vertz/commit/b5fbc7d884b06c8a0cb0c48d22dae5fe2684a4cc)]:
  - @vertz/ui-server@0.2.21
  - @vertz/core@0.2.21

## 0.2.20

### Patch Changes

- Updated dependencies [[`9a0a313`](https://github.com/vertz-dev/vertz/commit/9a0a3131656bb22a8cdfb351013c3a7a69cdd553)]:
  - @vertz/ui-server@0.2.20
  - @vertz/core@0.2.20

## 0.2.19

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.19
  - @vertz/ui-server@0.2.19

## 0.2.18

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.18
  - @vertz/ui-server@0.2.18

## 0.2.17

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.17
  - @vertz/ui-server@0.2.17

## 0.2.16

### Patch Changes

- [#1195](https://github.com/vertz-dev/vertz/pull/1195) [`af0b64c`](https://github.com/vertz-dev/vertz/commit/af0b64c62480606cd9bb7ec9a25d7a4f0903d9cf) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add runtime image optimization for dynamic images at the edge. The `<Image>` component now rewrites absolute HTTP(S) URLs through `/_vertz/image` when `configureImageOptimizer()` is called. The Cloudflare handler supports an `imageOptimizer` config option using `cf.image` for edge transformation. Dev server includes a passthrough proxy for development.

- Updated dependencies [[`97e9fc9`](https://github.com/vertz-dev/vertz/commit/97e9fc9a80548e2be111542513802269162f4136), [`af0b64c`](https://github.com/vertz-dev/vertz/commit/af0b64c62480606cd9bb7ec9a25d7a4f0903d9cf), [`caf4647`](https://github.com/vertz-dev/vertz/commit/caf464741b53fdd65be1c558cf2330172f6d2feb), [`6c33552`](https://github.com/vertz-dev/vertz/commit/6c3355265cd072d2c5b3d41c3c60e76d75c6e21c), [`d0e9dc5`](https://github.com/vertz-dev/vertz/commit/d0e9dc5065fea630cd046ef55f279fe9fb400086), [`e1938b0`](https://github.com/vertz-dev/vertz/commit/e1938b0f86129396d22f5db57792cfa805387e62), [`02bac2a`](https://github.com/vertz-dev/vertz/commit/02bac2af689750d500f0846d700e89528a02627d), [`ab3f364`](https://github.com/vertz-dev/vertz/commit/ab3f36478018245cc9473217a9a3bf7b04c6a5cb), [`0f6d90a`](https://github.com/vertz-dev/vertz/commit/0f6d90adf785c52ff1e70187e3479941b2db896c), [`d8257a5`](https://github.com/vertz-dev/vertz/commit/d8257a5665704fa0f2c2e6646f3b5ab8c39c5cdc), [`c1c0638`](https://github.com/vertz-dev/vertz/commit/c1c06383b8ad50c833b64aa5009fe7b494bb559b)]:
  - @vertz/ui-server@0.2.16
  - @vertz/core@0.2.16

## 0.2.15

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.15
  - @vertz/ui-server@0.2.15

## 0.2.14

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.14
  - @vertz/ui-server@0.2.14

## 0.2.13

### Patch Changes

- Updated dependencies [[`337e1b3`](https://github.com/vertz-dev/vertz/commit/337e1b3dfca6768575e57cf54069beb4f37366b7), [`a5ceec8`](https://github.com/vertz-dev/vertz/commit/a5ceec812613d92f7261407e86b1a39993687a7a), [`4eac71c`](https://github.com/vertz-dev/vertz/commit/4eac71c98369d12a0cd7a3cbbeda60ea7cc5bd05)]:
  - @vertz/ui-server@0.2.13
  - @vertz/core@0.2.13

## 0.2.12

### Patch Changes

- Updated dependencies [[`c7e3ec2`](https://github.com/vertz-dev/vertz/commit/c7e3ec2e926b0a2cd6d35f58124f3d7f50fc6fb9)]:
  - @vertz/ui-server@0.2.12
  - @vertz/core@0.2.12

## 0.2.11

### Patch Changes

- Updated dependencies [[`b2878cf`](https://github.com/vertz-dev/vertz/commit/b2878cfe2acb3d1155ca5e0da13b2ee91c9aea9a), [`5ed4c1a`](https://github.com/vertz-dev/vertz/commit/5ed4c1a4c5c9ea946e97b1636011251c6287eaf4), [`1fc9e33`](https://github.com/vertz-dev/vertz/commit/1fc9e33a9aa5283898c8974084f519a3caacbabb)]:
  - @vertz/ui-server@0.2.11
  - @vertz/core@0.2.11

## 0.2.8

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.8
  - @vertz/ui-server@0.2.8

## 0.2.7

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.7
  - @vertz/ui-server@0.2.7

## 0.2.6

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.6
  - @vertz/ui-server@0.2.6

## 0.2.5

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.5
  - @vertz/ui-server@0.2.5

## 0.2.4

### Patch Changes

- Updated dependencies [[`a986d07`](https://github.com/vertz-dev/vertz/commit/a986d0788ca0210dfa4f624153d4bda72257a78c)]:
  - @vertz/ui-server@0.2.4
  - @vertz/core@0.2.4

## 0.2.3

### Patch Changes

- Updated dependencies [[`62dddcb`](https://github.com/vertz-dev/vertz/commit/62dddcbcb4943b12a04bca8466b09ae21901070b), [`2e86c55`](https://github.com/vertz-dev/vertz/commit/2e86c55e3c04f3c534bf0dc124d18dcdc5d9eefc), [`62dddcb`](https://github.com/vertz-dev/vertz/commit/62dddcbcb4943b12a04bca8466b09ae21901070b), [`b0b6115`](https://github.com/vertz-dev/vertz/commit/b0b6115e0389447ffb951e875b5ce224e4ace51c)]:
  - @vertz/core@0.2.3
  - @vertz/ui-server@0.2.3

## 0.2.2

### Patch Changes

- Updated dependencies []:
  - @vertz/ui-server@0.2.2
  - @vertz/core@0.2.2
