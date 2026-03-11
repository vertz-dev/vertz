---
'@vertz/ui-primitives': patch
---

Multi-entry build for better tree-shaking. Importing a single component (e.g. Tooltip) no longer pulls in all 30+ headless primitives. Single-import bundles drop from 100% to 16% of the full package.
