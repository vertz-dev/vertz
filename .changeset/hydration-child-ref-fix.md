---
'@vertz/ui-primitives': patch
---

Remove getElementById workarounds from Dialog, AlertDialog, and Sheet composed components. Share dialog ref through context so showModal/close use ref directly instead of document.getElementById. JSX event handlers on CSR-rendered elements inside __child wrappers are already on DOM-connected elements, making the imperative onMount+getElementById wiring unnecessary.
