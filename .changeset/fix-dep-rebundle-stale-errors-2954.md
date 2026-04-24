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

2. The dep-watcher handler in `server::http` now clears the `Build` error
   category whenever at least one package re-bundles successfully, before
   reporting the current cycle's failures. Stale `Failed to re-bundle
   upstream dep X` entries no longer accumulate in `ErrorState` (or the
   persisted `.vertz/dev/errors.json`) across successful cycles. The
   error-broadcast side-effects were extracted into
   `watcher::dep_watcher::apply_dep_error_state` so the behavior is covered
   by regression tests without spinning up a full dev server.
