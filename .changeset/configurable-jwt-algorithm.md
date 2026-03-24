---
'@vertz/server': patch
---

feat(auth): make JWT signing algorithm configurable (ES256, RS256)

Add `session.algorithm` option to `createAuth()`. Defaults to `'RS256'` (no breaking change). Supports `'ES256'` for smaller signatures and better edge runtime performance.

- `createJWT()`/`verifyJWT()` accept algorithm parameter
- Dev key generation branches on algorithm (RSA vs EC P-256)
- Key-algorithm mismatch validated at startup with clear errors
- JWKS endpoint dynamically returns correct `alg`/`kty`
- `createCloudJWTVerifier` accepts configurable `algorithms` array
- SSR resolver threads algorithm through to verification
