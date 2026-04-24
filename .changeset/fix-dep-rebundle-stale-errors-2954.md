---
'@vertz/runtime': patch
---

fix(vtz): recover from wiped `.vertz/deps/` and clear stale dep re-bundle errors

Closes [#2954](https://github.com/vertz-dev/vertz/issues/2954).

Two compounding bugs on the dev-server dep-watcher path caused a cluster of
`Failed to re-bundle upstream dep @vertz/ui: Failed to write entry file:
No such file or directory (os error 2)` errors to survive forever in the
error overlay across every navigation — even though the app SSRed fine.
The only cure used to be killing the dev server, deleting
`.vertz/dev/errors.json`, and restarting.

1. `prebundle_single` now calls `std::fs::create_dir_all(deps_dir)` before
   writing the temporary entry file, so a wiped or missing `.vertz/deps/`
   (manual cleanup, a clean clone, a workspace rebuild) no longer bubbles
   up as ENOENT on the first upstream change.

2. The dep-watcher handler in `server::http` now tags every re-bundle error
   with a synthetic per-package key (`<dep>:{pkg}`) in the error's file
   field, and clears that key with `clear_file(ErrorCategory::Build, …)`
   for each package it touches this cycle before reporting the current
   failure (if any). Stale `Failed to re-bundle upstream dep X` entries no
   longer accumulate in `ErrorState` (or the persisted
   `.vertz/dev/errors.json`) across successful cycles, and — crucially —
   legitimate per-file compile errors in the same `Build` category (which
   the module server and file-change handler report with real source
   paths) are left untouched. The error-broadcast side effects were
   extracted into `watcher::dep_watcher::apply_dep_error_state` so the
   behavior is covered by regression tests without spinning up a full
   dev server.
