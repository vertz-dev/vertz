---
'vertz': patch
'@vertz/create-vertz-app': patch
---

Fix package release correctness: vertz subpath exports now point to built dist artifacts instead of raw .ts source, Turbo test inputs include out-of-src test directories, and create-vertz-app exposes test/typecheck scripts
