---
'@vertz/server': patch
'@vertz/ui-server': patch
'@vertz/cli': patch
---

SSR session injection to eliminate auth loading flash. JWT session data is now injected as `window.__VERTZ_SESSION__` during SSR, so `AuthProvider` hydrates with session data immediately instead of showing a loading state. Zero-config: the CLI auto-wires the session resolver when auth is configured.
