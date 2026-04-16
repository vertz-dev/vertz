---
'@vertz/runtime': patch
---

fix(vtz): resolve JWKS-based JWT verification returning null in full chain

Two bugs prevented the full JWT chain (generate → sign → JWKS → verify) from working:

1. V8 snapshot cross-realm: after snapshot restore, `ArrayBuffer.isView()` in the crypto bootstrap IIFE failed for TypedArrays created in ES modules (different realm constructors). Replaced with duck-type property checks.

2. HTTP serve URL hostname: `Bun.serve()` hardcoded the bind address (e.g. `0.0.0.0`) in `req.url`, causing JWT issuer mismatch. Now prefers the `Host` header.
