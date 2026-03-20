---
'@vertz/ui-compiler': patch
---

Remove `selected` from `<option>` IDL properties — now uses `setAttribute`/`removeAttribute` instead of `Reflect.set`, fixing happydom cascading auto-selection. Defer `<select value={...}>` IDL property assignment until after children so options exist when `select.value` is set.
