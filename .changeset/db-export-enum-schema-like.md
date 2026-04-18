---
'@vertz/db': patch
---

fix(db): export `EnumSchemaLike` named by the `d.enum(name, schema)` overload

The second overload of `d.enum` accepts any object with a `.values` array (e.g.
an `EnumSchema` from `@vertz/schema`) via a duck-typed `EnumSchemaLike` interface.
That interface lived as a file-local declaration in `packages/db/src/d.ts`, so
consumers who named the function type — for example by emitting `.d.ts` for a
helper that wraps `d.enum`, or by writing `typeof d.enum` — hit `TS2742` against
`@vertz/db/dist/d`. `EnumSchemaLike` is now exported from the package entry so
those references resolve to the public path.

Closes #2804.
