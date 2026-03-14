---
'@vertz/ui-server': patch
---

Add stale module graph detection and dev server restart mechanism. When Bun's HMR retains stale import bindings after exports are removed or renamed, the error overlay now shows a "Restart Server" button that triggers a soft server restart, clearing the module graph and recovering automatically.
