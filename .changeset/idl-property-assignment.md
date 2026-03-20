---
'@vertz/ui': patch
'@vertz/ui-compiler': patch
'@vertz/ui-server': patch
---

Fix reactive form element properties (`value`, `checked`, `selected`) to use DOM property assignment instead of `setAttribute`. This fixes `<select value={signal}>`, `<input value={signal}>`, `<input checked={signal}>`, and `<option selected={signal}>` not updating the displayed state reactively.
