---
'@vertz/runtime': patch
---

fix(pm): install optional platform-specific dependencies from stale v1 lockfiles

Packages using the `optionalDependencies` pattern for platform-specific native binaries
(e.g., lefthook, @typescript/native-preview, oxfmt) were not getting their binaries installed
because v1 lockfiles didn't record optional dependencies. Added lockfile versioning (v1/v2)
and a migration path that discovers missing optional deps from the registry for direct
dependencies when upgrading from a v1 lockfile.
