---
'@vertz/ui': patch
---

Add RouterContext, useRouter(), and RouterView for declarative route rendering.

- `RouterContext` + `useRouter()`: Context-based router access eliminates navigate prop threading
- `RouterView`: Declarative component that reactively renders the matched route, replacing manual watch + DOM swapping
- Handles sync and async/lazy components with stale resolution guards
- Task-manager example updated to use the new APIs
