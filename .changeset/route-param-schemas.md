---
'@vertz/ui': patch
---

feat(router): schema-based route param parsing and validation

Add `ParamSchema<T>` interface and `params` field to `RouteConfig`. When a route defines a `params` schema, `matchRoute()` validates path params at the routing layer — invalid params result in no match (fallback/404 renders). Valid params are stored as `parsedParams` on `RouteMatch`.

`useParams()` gains a second overload accepting a `Record<string, unknown>` type parameter for typed parsed params: `useParams<{ id: number }>()`.
