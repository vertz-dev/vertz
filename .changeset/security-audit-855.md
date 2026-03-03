---
'@vertz/schema': patch
'@vertz/server': patch
'@vertz/ui': patch
---

fix: address security audit findings — prototype pollution, Link XSS, auth hardening

- **@vertz/schema**: Filter `__proto__` key in ObjectSchema passthrough/catchall and RecordSchema to prevent prototype pollution via `JSON.parse`
- **@vertz/server**: Default-deny for undefined entitlements, ownership validation in `canWithResource()`, auto-generated dev JWT secret persisted to `.vertz/jwt-secret`
- **@vertz/ui**: Block dangerous URL schemes (`javascript:`, `data:`, `vbscript:`) and protocol-relative URLs in Link component href
