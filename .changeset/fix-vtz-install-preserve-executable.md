---
'@vertz/runtime': patch
---

fix(vtz): preserve executable mode from tar headers during `vtz install`

npm package tarballs encode `bin/*` files with mode 0o755 in their tar
headers. The extractor in `native/vtz/src/pm/tarball.rs` was creating
each file via `File::create` and copying bytes, but never applying the
header mode — so every extracted file came out at the process umask
(typically 0o644). This made shipped binaries non-executable and spawn
failed with `EACCES`, e.g. `@esbuild/linux-x64/bin/esbuild`, which
blocked any build that shelled out to esbuild after `vtz install
--frozen` in CI.

Fix: read `entry.header().mode()` before writing, and apply the masked
file-permission bits (0o777, excluding setuid/sticky for safety) via
`set_permissions` after the write completes. Applied to both
`extract_tarball` (npm) and `extract_github_tarball` (GitHub refs).

No-op on Windows (permissions are gated by `#[cfg(unix)]`). Regression
test builds a tar with a 0o755 exec file and a 0o644 data file,
extracts, and asserts both modes are preserved.
