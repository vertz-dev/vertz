# @vertz/schema

## 0.1.1

### Patch Changes

- [#200](https://github.com/vertz-dev/vertz/pull/200) [`b2d43d4`](https://github.com/vertz-dev/vertz/commit/b2d43d4f265e4b1a806b3e96f00721cc38cc07e8) Thanks [@vertz-dev-core](https://github.com/apps/vertz-dev-core)! - Published types now correctly preserve generic type parameters in `.d.ts` files. Switched DTS bundler to use `inferTypes` mode, preventing potential erasure of generics to `Record<string, unknown>` or `unknown` in the emitted declarations.

- [#193](https://github.com/vertz-dev/vertz/pull/193) [`6443339`](https://github.com/vertz-dev/vertz/commit/64433394142ddff76d8021b25259c9c901d62b1e) Thanks [@vertz-dev-core](https://github.com/apps/vertz-dev-core)! - Format schemas (email, uuid, url, etc.) now inherit string methods like `.trim()`, `.toLowerCase()`, `.min()`, `.max()`. Previously chaining these methods on format schemas lost the specific type.
