---
'@vertz/fetch': patch
'@vertz/server': patch
---

Fix resolveVertzQL to keep where/orderBy/limit as flat query params instead of encoding them in the base64 q= parameter. Only select and include are encoded in q= (structural, not human-readable). Where is flattened to bracket notation (where[field]=value), orderBy to colon format (orderBy=field:dir), and limit stays as a raw number. Server parser updated to support comma-separated multi-field orderBy.
