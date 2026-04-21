---
'@vertz/db': patch
---

fix(db): stringify primitive values written to `d.jsonb<T>()` columns on SQLite

Closes [#2889](https://github.com/vertz-dev/vertz/issues/2889).

`d.jsonb<T>()` on SQLite stores values as TEXT and the read path always runs `JSON.parse` on the raw cell. Writes only stringified plain objects and arrays, so primitives (strings, numbers, booleans) were persisted raw and blew up with `JsonbParseError` on read-back: `db.str.create({ data: { note: 'hello' } })` followed by `list()` threw `JSON.parse('hello')`. Postgres's JSONB driver encodes everything automatically, so SQLite now matches.

The fix adds a CRUD-layer marshaling pass that runs after `runJsonbValidators` and wraps every non-null, non-DbExpr value for `jsonb` / `json` columns in `JSON.stringify` when the dialect is SQLite. `null` values still pass through to emit SQL `NULL`; `DbExpr` SQL fragments are left alone. All six write call sites (`create` / `createMany` / `createManyAndReturn` / `update` / `updateMany` / `upsert` — including the upsert `updateValues` path) go through the new pass. Postgres writes are unchanged.
