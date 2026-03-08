---
'@vertz/server': patch
'@vertz/errors': patch
---

Add MFA/TOTP support with backup codes and step-up authentication.

- TOTP (RFC 6238) generation and verification
- MFA setup, verify, disable, and backup code routes
- MFA challenge flow: signIn returns MFA_REQUIRED when MFA is enabled
- Step-up authentication with `fva` (factor verification age) JWT claim
- `checkFva()` utility for protecting sensitive operations
- `InMemoryMFAStore` for development/testing
- New MFA error types: MFA_REQUIRED, MFA_INVALID_CODE, MFA_ALREADY_ENABLED, MFA_NOT_ENABLED
