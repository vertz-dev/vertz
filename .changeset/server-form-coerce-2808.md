---
'@vertz/schema': patch
'@vertz/core': patch
'@vertz/server': patch
'@vertz/ui': patch
---

feat(server): coerce form-encoded bodies on the server using the route schema

Closes [#2808](https://github.com/vertz-dev/vertz/issues/2808).

`coerceFormDataToSchema` and `coerceLeaf` now live in `@vertz/schema` so the same kernel that powers client-side `form()` coercion (#2771) runs on the server. `parseBody` in `@vertz/core` accepts an optional `coerceSchema` and now handles `multipart/form-data` in addition to `application/x-www-form-urlencoded`; entity and service route generators populate `coerceSchema` from the route's expected input shape.

End result: the same entity works across three submit modes without validation drift.

```ts
// Entity
d.table('tasks', {
  id: d.uuid().primary(),
  title: d.text(),
  done: d.boolean().default(false),
});

// 1. JS form() path — already coerced on the client, sent as JSON
fetch('/api/tasks', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'buy milk', done: true }),
});

// 2. Progressive-enhancement no-JS submit — browser sends urlencoded strings
// <form method="post" action="/api/tasks">...</form>
// body: title=buy+milk&done=on

// 3. curl / agent — urlencoded with a different boolean spelling
// curl -X POST /api/tasks --data-urlencode 'title=buy milk' --data-urlencode 'done=true'
```

All three hit the handler with `{ title: 'buy milk', done: true }`. Previously modes 2 and 3 failed schema validation because checkboxes and numeric inputs arrived as strings. The coercion step runs before the CRUD pipeline's strict validation, so `EntityValidationError` semantics are unchanged when a body is actually malformed.

The new `coerceSchema` field on `EntityRouteEntry` is separate from `bodySchema` on purpose — it coerces without enforcing app-runner-level validation, which lets entity routes keep their existing error format.
