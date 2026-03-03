---
'@vertz/create-vertz-app': patch
---

Fix bin entry: change shebang to `#!/usr/bin/env bun` and import from `dist/` instead of `src/` so the published CLI actually runs.
