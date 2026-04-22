---
'@vertz/runtime': patch
---

fix(vtz): invalidate dependents' cache when a source file fails to compile

Closes [#2766](https://github.com/vertz-dev/vertz/issues/2766).

The dev-server file-watcher loop `continue`d inside the compile-error branch, bypassing `process_file_change`. Consequence: if a user introduced a syntax error in `utils.ts`, transitive dependents of `utils.ts` kept their stale compiled cache entries until they were individually re-touched. After the error was fixed, those dependents could still serve stale code.

Same shape as the delete-event bug fixed in [#2764](https://github.com/vertz-dev/vertz/pull/2768). The compile-error branch now falls through to `process_file_change` so the changed file and its transitive dependents are invalidated. The module-graph update is still skipped on error — we don't want to commit import edges scanned from broken source.

As part of this fix, the per-change handler body was moved out of the file-watcher closure in `server::http` into `server::file_change_handler::handle_file_change` so the pipeline is directly reachable from tests without spinning up `start_server_with_lifecycle`.
