---
'@vertz/server': patch
'@vertz/agents': patch
---

Guard cloud auth and provider tests behind env var checks so they skip gracefully when credentials are missing. Also fix `describe.skip` propagation to nested suites in the vtz test runner.
