---
'@vertz/cli': patch
---

fix(cli): add esbuild dependency, use bun shebang, remove dead ink/react deps

- Added missing `esbuild` to dependencies (externalized in bundle but not declared)
- Changed CLI shebang from `#!/usr/bin/env node` to `#!/usr/bin/env bun` so the framework's Bun-dependent features (bun:sqlite, Bun.serve) work correctly
- Removed unused ink-based components (Banner, DiagnosticDisplay, DiagnosticSummary) and their ink/react dependencies
