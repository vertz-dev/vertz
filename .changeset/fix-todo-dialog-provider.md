---
'@vertz/create-vertz-app': patch
'@vertz/ui': patch
'@vertz/theme-shadcn': patch
---

fix(create-vertz-app): add DialogStackProvider and `w:full` to todo-app template

fix(ui): fix DialogStackProvider hydration — add `display:contents` so wrapper doesn't break layout

fix(theme-shadcn): fix dialog centering — add `margin: auto` to wrapper, use explicit panel width `min(28rem, calc(100vw - 2rem))`
