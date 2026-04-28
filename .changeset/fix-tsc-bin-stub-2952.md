---
'@vertz/runtime': patch
---

fix(vtz): heal store entries and project bin files corrupted by old vtz versions

Closes [#2952](https://github.com/vertz-dev/vertz/issues/2952).

Pre-#2908 vtz versions could overwrite a package's own bin file with the
`.bin/<name>` shim contents — `std::fs::write` followed a stale
`.bin/<name>` symlink straight into the package, and the hardlink to the
global store carried the corruption back into `~/.vertz/cache/npm/store/`.
#2908 stopped new corruption but didn't repair existing damage, so a
fresh `vtz install` on any project would hardlink the broken bin from the
cache (e.g. `node_modules/typescript/bin/tsc` ending up as a self-exec
shell loop) and `bunx tsc` would fail with `SyntaxError: Unexpected
identifier 'node'`.

`TarballManager::is_valid_store_entry` now reads each declared bin file
and rejects entries whose first bytes match the vtz shim shape; the
existing `fetch_and_extract` flow then re-downloads a clean tarball.
Re-extracted packages are added to a new `force_relink_packages` set
threaded through `linker::link_packages_with_force` so the project's
hardlinks (which still point at the orphaned corrupt inodes) are
rebuilt from the freshly extracted store. A second pass —
`linker::detect_corrupt_project_bins` — flags projects that were already
installed against a corrupt cache and force-relinks them even if the
cache has since been healed by an earlier install on a different
project.
