---
'@vertz/runtime': patch
---

fix(vtz): `vtz ci` now loads `ci.config.ts` through vtz itself (no more bun/tsx dependency)

`vtz ci`'s config loader used to spawn an external JS runtime to evaluate
`ci.config.ts` — preferring bun, falling back to `node --import tsx`. That
made bun (or a tsx devDependency) a hard requirement for `vtz ci`, even
though vtz is itself a TypeScript runtime. The fallback chain was
discovered in #2739 while trying to drop bun from CI; the `@vertz/ci`
package.json's exports field also doesn't satisfy strict-Node ESM, which
tsx uses, so the fallback was fragile.

This PR makes vtz self-host:

- **New hidden subcommand `vtz __exec <file> [args...]`** — runs a
  single JS/TS file through the vtz runtime with `process.argv` populated.
  Not intended for end-user use; exists to support internal tooling like
  `vtz ci`.
- **`find_runtime()` in `ci/config.rs`** now prefers the current vtz binary
  via `std::env::current_exe()` with `__exec`. bun/node+tsx stay as
  fallbacks for the edge case where `current_exe()` is unavailable.
- **`process.exit(code)` is now implemented** (via a new `op_process_exit`
  op). It previously threw. The existing `.pipe/_loader.mjs` calls
  `process.exit(0)` at the end of its run, so this is necessary for the
  loader to terminate cleanly under vtz.

After this lands, `vtz ci` has zero external-runtime dependencies — vtz
alone is sufficient. Unblocks migrating CI from `bun install` to
`vtz install --frozen` (tracked separately).
