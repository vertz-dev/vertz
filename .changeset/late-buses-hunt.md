---
'@vertz/codegen': patch
'@vertz/ui': minor
---

Generate router module augmentations so `useRouter()` picks up app route types by default after codegen.

Change router navigation to use route patterns plus typed params, e.g.
`navigate('/tasks/:id', { params: { id: '123' } })`, with search params
passed via the options object.
