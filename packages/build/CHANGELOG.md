# @vertz/build

## 0.2.80

### Patch Changes

- [#3020](https://github.com/vertz-dev/vertz/pull/3020) [`c53b24d`](https://github.com/vertz-dev/vertz/commit/c53b24d164d79fc2beb59798f06562630d1ece24) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(build): assert bundle outputs land inside the configured `outDir`

  Closes [#2953](https://github.com/vertz-dev/vertz/issues/2953).

  After bundling, every entry in `metafile.outputs` is now checked against
  `outDir`. If anything escapes (path equals `outDir`, parent traversal, or
  a different drive root), `bundle()` throws a descriptive error pointing
  at the issue, rather than silently overwriting a sibling package's
  `dist/`.

  The check normalizes both sides through `fs.realpathSync` so that
  symlinked layouts (devcontainers, pnpm `node_modules/.pnpm`,
  `/tmp` ↔ `/private/tmp` on macOS) and case-insensitive filesystems
  (macOS APFS, Windows) don't false-positive on a legitimate build.

  Scope: the JS bundle path only. `generateDts` (which spawns `tsc` and
  has no metafile) is not covered here — if the same race ever hits
  `.d.ts` emission, this won't catch it. We'd need a separate post-build
  walk of the dts output to extend the guard, which is left for a
  follow-up.
