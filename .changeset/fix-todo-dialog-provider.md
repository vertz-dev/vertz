---
'@vertz/create-vertz-app': patch
---

fix(create-vertz-app): add DialogStackProvider to todo-app template

The todo-app template's `app.tsx` was missing `DialogStackProvider`, causing a runtime crash when the `TaskItem` component called `useDialogStack()` for delete confirmation.
