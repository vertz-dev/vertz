---
'@vertz/runtime': patch
---

fix(install): remove macOS quarantine xattr and ad-hoc sign binaries in CI to prevent Gatekeeper from killing the vtz binary after curl install
