---
'@vertz/build': patch
---

fix(build): assert bundle outputs land inside the configured `outDir`

Closes [#2953](https://github.com/vertz-dev/vertz/issues/2953).

Adds a defensive guard around `bundle()`:

- `outdir` is now passed to esbuild as the absolute path that was already being
  computed, instead of the relative `'dist'` string. Same for `entryPoints`,
  which are pre-resolved against the supplied `cwd`.
- After bundling, every entry in `metafile.outputs` is checked against `outDir`
  via `path.relative`. If anything escapes (empty/`.`, parent traversal, or a
  different drive root), the build now throws a descriptive error pointing at
  the issue, rather than silently overwriting a sibling package's `dist/`.

This is a safety net for the corruption seen in #2953, where
`packages/ui/dist/index.js` ended up byte-identical to
`packages/ui-primitives/dist/index.js` after a tangled `vtz install` +
workspace rebuild session. The exact race wasn't reproducible, but the
asymmetric exposure was real — a relative `outdir` combined with `absWorkingDir`
left no audit trail if anything ever wrote outside the package's own dist.
Future occurrences will fail loudly instead.
