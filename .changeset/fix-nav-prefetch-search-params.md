---
'@vertz/ui-server': patch
---

Fix nav pre-fetch (X-Vertz-Nav) dropping search params — both production handler and dev server now pass the full URL (pathname + query string) to SSR context so queries can read search parameters during server-side discovery.
