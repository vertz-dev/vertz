---
'@vertz/desktop': patch
---

Add Windows platform handling for `app.dataDir()` and `app.cacheDir()` using `APPDATA` and `LOCALAPPDATA` environment variables. Error messages now include the specific missing environment variable name.
