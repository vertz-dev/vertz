---
'@vertz/ui-compiler': patch
'@vertz/ui-server': patch
---

Fix HMR fast-refresh stability: SSR module reload now uses .ts wrapper to preserve plugin processing, compiler unwraps NonNullExpression in reactivity analyzer, and dev server includes diagnostic logging (VERTZ_DEBUG) and health check endpoint (/__vertz_diagnostics).
