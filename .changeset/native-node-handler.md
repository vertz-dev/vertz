---
'@vertz/ui-server': patch
---

Add native Node HTTP adapter (`createNodeHandler`) that writes SSR output directly to `ServerResponse`, eliminating web Request/Response conversion overhead on Node.js. Import from `@vertz/ui-server/node`.
