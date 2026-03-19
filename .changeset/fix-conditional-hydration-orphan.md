---
'@vertz/ui': patch
---

Fix nested conditional cleanup during hydration — wrap anchor + content in display:contents span to prevent orphaned DOM nodes when parent conditionals re-evaluate (#1553)
