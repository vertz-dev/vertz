---
'@vertz/runtime': patch
---

fix(vtz): trigger HMR and clean module graph on file delete

The dev server's file-change loop called `compile_for_browser` on every
event, which fails for a deleted file — pushing the flow into the
compilation-error branch and skipping graph/cache cleanup. Dependents of
the deleted file were never HMR-invalidated, so clients kept using stale
modules.

`process_file_change` now cleans the module graph on `Remove` events
(under a single write lock, so a concurrent browser fetch can't re-add
the deleted node between the read and write phases). Deleting a
standalone CSS file escalates past `CssUpdate` (whose URL would 404) to
`ModuleUpdate`. The server loop branches on `Remove` to skip compilation
while still invalidating dependents, so HMR broadcasts an `Update` (or
`FullReload` when the entry file is deleted).

Closes #2764.
