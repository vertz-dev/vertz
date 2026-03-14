---
'@vertz/theme-shadcn': patch
---

`AlertDialog.Action` and `AlertDialog.Cancel` now accept `onClick` and other event handler props. Previously these were silently ignored because `AlertDialogSlotProps` only allowed `children` and `class`.
