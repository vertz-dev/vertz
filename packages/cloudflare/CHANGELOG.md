# @vertz/cloudflare

## 0.2.70

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.70
  - @vertz/ui-server@0.2.70

## 0.2.69

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.69
  - @vertz/ui-server@0.2.69

## 0.2.68

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.68
  - @vertz/ui-server@0.2.68

## 0.2.67

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.67
  - @vertz/ui-server@0.2.67

## 0.2.66

### Patch Changes

- Updated dependencies [[`cc998eb`](https://github.com/vertz-dev/vertz/commit/cc998eb9a37a25335764b1250418c0727f49778a)]:
  - @vertz/ui-server@0.2.66
  - @vertz/core@0.2.66

## 0.2.65

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.65
  - @vertz/ui-server@0.2.65

## 0.2.64

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.64
  - @vertz/ui-server@0.2.64

## 0.2.63

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.63
  - @vertz/ui-server@0.2.63

## 0.2.62

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.62
  - @vertz/ui-server@0.2.62

## 0.2.61

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.61
  - @vertz/ui-server@0.2.61

## 0.2.60

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.60
  - @vertz/ui-server@0.2.60

## 0.2.59

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.59
  - @vertz/ui-server@0.2.59

## 0.2.58

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.58
  - @vertz/ui-server@0.2.58

## 0.2.57

### Patch Changes

- Updated dependencies [[`f9ac074`](https://github.com/vertz-dev/vertz/commit/f9ac0740448bbcece50886a387184898da625933)]:
  - @vertz/ui-server@0.2.57
  - @vertz/core@0.2.57

## 0.2.56

### Patch Changes

- Updated dependencies [[`52ebef6`](https://github.com/vertz-dev/vertz/commit/52ebef61c623f77becfde5bef8115a32daf027a6)]:
  - @vertz/ui-server@0.2.56
  - @vertz/core@0.2.56

## 0.2.55

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.55
  - @vertz/ui-server@0.2.55

## 0.2.54

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.54
  - @vertz/ui-server@0.2.54

## 0.2.53

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.53
  - @vertz/ui-server@0.2.53

## 0.2.52

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.52
  - @vertz/ui-server@0.2.52

## 0.2.51

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.51
  - @vertz/ui-server@0.2.51

## 0.2.50

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.50
  - @vertz/ui-server@0.2.50

## 0.2.49

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.49
  - @vertz/ui-server@0.2.49

## 0.2.48

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.48
  - @vertz/ui-server@0.2.48

## 0.2.47

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.47
  - @vertz/ui-server@0.2.47

## 0.2.46

### Patch Changes

- [#2239](https://github.com/vertz-dev/vertz/pull/2239) [`d029bfc`](https://github.com/vertz-dev/vertz/commit/d029bfcef05d9226f6740b5854827904144dc7ba) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(server): allow customizing or removing the `/api/` route prefix (#2131)

  - `createServer({ apiPrefix: '/v1' })` changes all generated routes from `/api/*` to `/v1/*`
  - API-only apps can use `apiPrefix: ''` to mount routes at the root
  - Full-stack apps require a non-empty prefix (enforced at dev server and Cloudflare handler)
  - Auth cookie paths (`Path=`) automatically follow the resolved prefix
  - Cloudflare handler reads `app.apiPrefix` at runtime when not explicitly configured
  - `basePath` option in `@vertz/cloudflare` renamed to `apiPrefix` for consistency

- Updated dependencies [[`d029bfc`](https://github.com/vertz-dev/vertz/commit/d029bfcef05d9226f6740b5854827904144dc7ba)]:
  - @vertz/core@0.2.46
  - @vertz/ui-server@0.2.46

## 0.2.45

### Patch Changes

- Updated dependencies [[`57c5b6f`](https://github.com/vertz-dev/vertz/commit/57c5b6ffe2f79fa374384567ad2e48897dbd5482)]:
  - @vertz/ui-server@0.2.45
  - @vertz/core@0.2.45

## 0.2.44

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.44
  - @vertz/ui-server@0.2.44

## 0.2.43

### Patch Changes

- Updated dependencies [[`d9380cc`](https://github.com/vertz-dev/vertz/commit/d9380cc4b09a98f83df1213b4c380f2984a53579)]:
  - @vertz/ui-server@0.2.43
  - @vertz/core@0.2.43

## 0.2.42

### Patch Changes

- Updated dependencies [[`aca62b0`](https://github.com/vertz-dev/vertz/commit/aca62b09d42330cd81a106b65082b3e17fba7c91), [`1eeec6c`](https://github.com/vertz-dev/vertz/commit/1eeec6c95c0ced4d869995dbdce205c3bde92a25), [`6e3fb13`](https://github.com/vertz-dev/vertz/commit/6e3fb1346d6a0bf5ca2d4a5bb9d5680a85e9ead1)]:
  - @vertz/ui-server@0.2.42
  - @vertz/core@0.2.42

## 0.2.41

### Patch Changes

- Updated dependencies [[`7f837fc`](https://github.com/vertz-dev/vertz/commit/7f837fc10a0acd4ad77bfc4bcaf733700c8a4f8b)]:
  - @vertz/ui-server@0.2.41
  - @vertz/core@0.2.41

## 0.2.40

### Patch Changes

- Updated dependencies [[`bee011e`](https://github.com/vertz-dev/vertz/commit/bee011e47661b31152ad3dfc589fd45eda2f3e44)]:
  - @vertz/ui-server@0.2.40
  - @vertz/core@0.2.40

## 0.2.39

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.39
  - @vertz/ui-server@0.2.39

## 0.2.38

### Patch Changes

- Updated dependencies [[`93aa341`](https://github.com/vertz-dev/vertz/commit/93aa34166ad4934ec5c7e45fd7d7327e0843d174)]:
  - @vertz/ui-server@0.2.38
  - @vertz/core@0.2.38

## 0.2.37

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.37
  - @vertz/ui-server@0.2.37

## 0.2.36

### Patch Changes

- Updated dependencies [[`0e655d6`](https://github.com/vertz-dev/vertz/commit/0e655d60183badb73103feffbc70c34f6b442e6c), [`ae4859c`](https://github.com/vertz-dev/vertz/commit/ae4859c5b836b083fd563189521ccc6c4be5ffe8)]:
  - @vertz/ui-server@0.2.36
  - @vertz/core@0.2.36

## 0.2.35

### Patch Changes

- Updated dependencies [[`bb784d0`](https://github.com/vertz-dev/vertz/commit/bb784d052fe4abf27f5f499923de0a1f20a06c1b)]:
  - @vertz/ui-server@0.2.35
  - @vertz/core@0.2.35

## 0.2.34

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.34
  - @vertz/ui-server@0.2.34

## 0.2.33

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.33
  - @vertz/ui-server@0.2.33

## 0.2.32

### Patch Changes

- Updated dependencies [[`ce47098`](https://github.com/vertz-dev/vertz/commit/ce47098edb664d7a005dbdca881efbe63fb4dda2)]:
  - @vertz/ui-server@0.2.32
  - @vertz/core@0.2.32

## 0.2.31

### Patch Changes

- Updated dependencies [[`86b1b76`](https://github.com/vertz-dev/vertz/commit/86b1b763b3b7598be442c04afe94acae0b5603c2)]:
  - @vertz/ui-server@0.2.31
  - @vertz/core@0.2.31

## 0.2.30

### Patch Changes

- Updated dependencies [[`e75e501`](https://github.com/vertz-dev/vertz/commit/e75e5014917608b33fca1668e275948e16a0d773)]:
  - @vertz/core@0.2.30
  - @vertz/ui-server@0.2.30

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
