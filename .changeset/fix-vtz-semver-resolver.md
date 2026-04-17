---
'@vertz/runtime': patch
---

fix(vtz): semver resolver must not return versions that don't satisfy the range

`vtz install` incorrectly resolved `esbuild: ^0.27.3` to `0.25.12` when a stale
lockfile entry existed, because the lockfile-reuse fast path trusted the pinned
version without revalidating that it still satisfied the requested range. The
companion `graph_to_lockfile` path also wrote root-dep entries by name-only,
blindly accepting whichever hoisted version was present.

Both paths now verify that the chosen version satisfies the declared range. A
stale or out-of-range pin falls through to a fresh registry resolve instead of
silently being reused. Closes #2738.
