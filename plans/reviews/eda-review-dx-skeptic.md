# DX Skeptic Review: Entity-Driven Architecture (EDA)

## Overall Assessment

EDA brings DDD's mental model to TypeScript in a declarative package—ambitious and well-specified. But it's a paradigm shift, not an evolution. Developers coming from Prisma + tRPC will find the entity declaration elegant until they hit the learning cliff of DDD terminology, the multi-file ceremony (schema → relations → model → entity), and the magic that happens behind the curtain. The DX is strong for teams already doing DDD; brutal for everyone else.

## What Developers Will Love

- **Type-safe SDK auto-generation** — Getting `sdk.tasks.complete(id, { note })` with full TypeScript inference is genuinely delightful
- **Declarative access control** — One `access` block covers CRUD + custom actions. No more scattering authorization logic across route handlers
- **Relation narrowing at every layer** — The `{ field: true }` syntax cascading from DB → schema → entity → client is clever and prevents accidental over-exposure
- **Built-in tenant isolation** — `.tenant()` annotation handling RLS automatically is a huge win for multi-tenant apps
- **`actions` vs `methods` split** — Clear distinction between HTTP-exposed operations and internal utilities

## What Will Cause Friction

1. **The DDD vocabulary tax.** You need to understand Entity, Value Object, Bounded Context, Domain Service, Aggregate, Repository just to read the docs—then learn vertz-specific names (`entity()`, `domain()`, `service()`). A developer who just wants to fetch data from a table now needs to grok why there's no Repository and what an "Aggregate" would have been. Recommendation: Add a "DDD is optional" quickstart that treats `entity()` as a fancy table definition, not a domain modeling exercise.

2. **Multi-file choreography.** Schema in `schemas/`, relations in `models/`, entity in `entities/`. To understand one feature, you're jumping three files. Compare to Prisma: schema.prisma is one file, everything is co-located. This fragmentation will frustrate developers who value locality of behavior.

3. **The `on` vs `actions` confusion.** Section 3.6 explains it well, but the names are too similar. `on` reactions fire after operations but can't change results. `actions` overrides can transform data. These do different things but read similarly. Recommendation: Rename `on` to `reacts` or `after` to make the temporal nature obvious.

4. **Hidden is not invisible.** `.hidden()` fields are stripped from API responses but still exist in the database and SDK. A developer might accidentally log a "hidden" field or wonder why it's in their type definitions. The distinction between "never exposed" and "not currently selected" needs clearer naming—maybe `.internal()` for truly secret fields.

5. **Error messages are critical but unaddressed.** The doc doesn't explain what happens when: access rule rejects, schema validation fails, relation isn't exposed, tenant filter fails, action handler throws. These will make or break adoption. Prisma's error messages are legendary; EDA needs the same investment.

6. **No incremental migration path.** If you're on Prisma + tRPC today, you're rewriting everything. There's no "gradual adoption" mode where EDA entities wrap existing code. This is an all-or-nothing bet.

7. **Transaction boundaries are magic.** The doc recommends auto-wrapping actions in transactions but hasn't shipped it. When `ctx.entities.orders.create()` + `ctx.entities.payments.charge()` fail halfway through, developers need crystal-clear rollback behavior documented.

## Naming Feedback

- **`domain()`** — Good semantic fit for "bounded context" but risks confusion with domain names, DNS, or HTTP domains. The collision with "domain model" in DDD is real. Consider `context()` as an alternative.
- **`on`** — Too generic. As mentioned above, rename to `reacts` or `after`.
- **`service()`** — Matches DDD but overlaps with "microservice" in developers' minds. Fine in DDD-savvy teams, confusing elsewhere.
- **`entity()`** — The most intuitive name. Works well.
- **`kind: 'semantic'`** — "Semantic entity" is an oxymoron to most developers (entities have identity; semantics are calculations). Consider `metric()` or `aggregate()` instead.

## Verdict: Request Changes

EDA is well-designed and the spec is thorough, but the DX gaps are significant. The learning curve is steep (DDD + vertz vocabulary + multi-file setup), error handling is unaddressed, and there's no migration story.

What needs fixing before approval:

1. **Add a "Prisma-to-EDA" migration guide** — Show how existing Prisma schemas map to EDA, even if it's a conceptual mapping
2. **Specify error message format** — At minimum, document what a denied access check returns (403? 400? Custom error code?) and how schema violations surface
3. **Simplify the file structure for v0.1** — Allow co-located schema + model + entity in one file for simple cases. Three files for every entity is overkill
4. **Rename `on` to something clearer** — `reacts` or `after` makes the intent obvious
5. **Add a "conceptually optional" DDD quickstart** — Let developers treat `entity()` as a table + access rules without understanding Aggregate or Repository patterns

The ambition is right. The execution needs more DX polish.
