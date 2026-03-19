---
'@vertz/ui': patch
'@vertz/ui-compiler': patch
---

Defer onMount callbacks until after JSX evaluation so refs and DOM elements are available inside the callback. The compiler now injects mount frame push/flush around component return expressions. No public API change — onMount keeps its existing signature. Outside compiled components (event handlers, watch), onMount still runs immediately for backward compat.
