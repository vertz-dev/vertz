---
'@vertz/ui': patch
---

fix(ui): register __on event listener cleanup with disposal scope

Event listeners attached via `__on()` (the compiler's output for `onClick`, `onSubmit`, etc.) now register their cleanup function with the current disposal scope. This ensures listeners are properly removed when components or dialogs are unmounted, preventing memory leaks in dynamically-opened dialogs.
