---
'@vertz/runtime': patch
---

fix(pm): `vtz install` now writes resolved npm dist-tag specs (`"latest"`, `"next"`, custom tags) to `vertz.lock` instead of silently dropping them (#2794). Previously, a `package.json` dep like `"@types/bun": "latest"` resolved and installed correctly but never landed in the lockfile, causing subsequent `vtz install --frozen` to fail with "lockfile is out of date".
