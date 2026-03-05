---
'@vertz/ui-compiler': patch
---

Fix signal API variables (form(), query(), createLoader()) being incorrectly wrapped in computed() when they reference other signal API vars through closures. This caused form().__bindElement to be undefined at runtime and form state to be lost on re-evaluation.
