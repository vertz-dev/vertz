# @vertz/schema

## 0.2.25

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.25

## 0.2.24

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.24

## 0.2.23

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.23

## 0.2.22

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.22

## 0.2.21

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.21

## 0.2.20

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.20

## 0.2.19

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.19

## 0.2.18

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.18

## 0.2.17

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.17

## 0.2.16

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.16

## 0.2.15

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.15

## 0.2.14

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.14

## 0.2.13

### Patch Changes

- Updated dependencies [[`efda760`](https://github.com/vertz-dev/vertz/commit/efda76032901138dca7a22acd60ad947a4bdf02a), [`3d2799a`](https://github.com/vertz-dev/vertz/commit/3d2799ac4c3e0d8f65d864b4471e205a64db886a), [`7b125db`](https://github.com/vertz-dev/vertz/commit/7b125db968ba9157ce97932b392cb3be7fcc0344)]:
  - @vertz/errors@0.2.13

## 0.2.12

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.12

## 0.2.11

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.11

## 0.2.8

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.8

## 0.2.7

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.7

## 0.2.6

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.6

## 0.2.5

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.5

## 0.2.4

## 0.2.3

## 0.2.2

### Patch Changes

- [#861](https://github.com/vertz-dev/vertz/pull/861) [`b6cb0a0`](https://github.com/vertz-dev/vertz/commit/b6cb0a0e3de68974ce1747063288aef7a199f084) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix: address second-pass security audit findings — hidden field stripping in action pipeline, CSS value sanitization, empty string coercion guard

## 0.2.0

### Minor Changes

- [#295](https://github.com/vertz-dev/vertz/pull/295) [`3407afd`](https://github.com/vertz-dev/vertz/commit/3407afdf543481cd559e550454144d16e6a26e06) Thanks [@vertz-dev-dx](https://github.com/apps/vertz-dev-dx)! - Add `s.fromDbEnum()` to create validation schemas directly from `@vertz/db` enum columns, eliminating value duplication between database and validation layers.

### Patch Changes

- [#200](https://github.com/vertz-dev/vertz/pull/200) [`b2d43d4`](https://github.com/vertz-dev/vertz/commit/b2d43d4f265e4b1a806b3e96f00721cc38cc07e8) Thanks [@vertz-dev-core](https://github.com/apps/vertz-dev-core)! - Published types now correctly preserve generic type parameters in `.d.ts` files. Switched DTS bundler to use `inferTypes` mode, preventing potential erasure of generics to `Record<string, unknown>` or `unknown` in the emitted declarations.

- [#193](https://github.com/vertz-dev/vertz/pull/193) [`6443339`](https://github.com/vertz-dev/vertz/commit/64433394142ddff76d8021b25259c9c901d62b1e) Thanks [@vertz-dev-core](https://github.com/apps/vertz-dev-core)! - Format schemas (email, uuid, url, etc.) now inherit string methods like `.trim()`, `.toLowerCase()`, `.min()`, `.max()`. Previously chaining these methods on format schemas lost the specific type.
