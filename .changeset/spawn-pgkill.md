---
'@vertz/runtime': patch
---

fix(desktop): shell.spawn now kills entire process group on kill(), preventing orphaned subprocesses
