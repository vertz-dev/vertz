---
'@vertz/codegen': patch
'@vertz/ui': patch
---

Generate router module augmentations so `useRouter()` picks up app route types by default after codegen.

Change router navigation to use a TanStack-style input object with route patterns
plus typed params, e.g. `navigate({ to: '/tasks/:id', params: { id: '123' } })`,
with search params passed in the same object.
