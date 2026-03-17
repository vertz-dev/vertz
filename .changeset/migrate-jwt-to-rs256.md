---
'@vertz/server': patch
---

Migrate JWT from symmetric HS256 to asymmetric RS256 key pairs. Config now accepts `privateKey`/`publicKey` PEM strings instead of `jwtSecret`. Dev mode auto-generates RSA key pair to `.vertz/`. Public key exposed at `/.well-known/jwks.json`.
