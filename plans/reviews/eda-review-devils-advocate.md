# EDA Review: Devil's Advocate

## Overall Assessment

Entity-Driven Architecture makes bold promises — declarative entities that auto-generate CRUD, SDKs, and access control — but the design has significant blind spots around scale, migration, and the boundaries of its own abstraction. Many claims are theoretically sound but practically unproven at enterprise scale. The design works well for greenfield projects with <50 entities, but breaks down when real-world complexity hits.

## What's Architecturally Sound

- **Deny-by-default access model** — Centralizing access rules at the entity level is the right security primitive. The framework enforcing this at the HTTP boundary prevents accidental exposure.
- **Declarative over imperative** — Replacing class-heavy DDD with declarative entity definitions reduces boilerplate and makes the security surface scannable.
- **Schema annotations (.hidden(), .readOnly(), .tenant())** — These provide a single source of truth that propagates to DB constraints, API responses, and SDK types.
- **Domain as bounded context** — Using domains to group entities and control exports is a clean way to enforce module boundaries without manual discipline.
- **The narrowing hierarchy** — Starting from all DB columns and progressively narrowing through schema → entity → client query is the correct mental model.

## Attack Vectors / Failure Modes

1. **Scale kills the "single declaration" promise** — At 100+ entities, the 30-line-per-entity claim adds up. More critically, access rule evaluation on every request becomes a bottleneck. If every entity defines `(ctx, entity) => boolean` functions, that's N function calls per request. At 500 entities in a domain, each request to an aggregated dashboard could evaluate hundreds of rules.

2. **N+1 by default on relation includes** — The doc mentions `include` but doesn't address how the framework prevents N+1. If `tasks.list({ include: { assignee: true } })` runs 50 tasks, does it issue 50 JOINs or 1 query? The performance ceiling is undefined.

3. **Entity injection bypasses HTTP access rules** — The doc states: "When entity A injects entity B, A gets B's CRUD operations (internal, no HTTP roundtrip)." **This is a privilege escalation vector.** If `ordersEntity` injects `usersEntity`, does `ordersEntity`'s code run `usersEntity` access checks, or does injection skip them? The design implies injection gives full internal access — but if `ordersEntity` has weaker access rules than `usersEntity`, it can bypass `usersEntity`'s restrictions.

4. **Cross-domain transactions don't survive microservice extraction** — The doc claims domains can become microservices with "auto-generated RPC." But if `billingService` injects both `usersDomain` and `ordersDomain` and calls `users.update()` then `orders.charge()` in one transaction — extracting these to separate services means distributed transactions. The design punted on this: "The code is identical. The deployment topology is configuration." That's not true. Sagas and eventual consistency are real costs the doc ignores.

5. **TypeScript type inference breaks at entity boundaries** — The doc claims you get "entity → access → SDK → UI" inference. But `ctx.entities.users.find({ where: ... })` returning typed results requires the schema, relations, and access rules to all be encoded in TypeScript types. Any dynamic runtime value (e.g., dynamically computed fields, runtime relation expansion) will produce `any`. The "query compiler auto-selects only fields code reads" claim requires TypeScript to trace runtime data flow — which it cannot do reliably.

6. **Migration is rewrite-only** — The doc doesn't address migrating an existing app. There's no "gradual adoption" path. You can't wrap an existing Express route in an entity. You can't incrementally add entities around legacy code. You write new code with EDA or you rewrite everything. For a framework targeting real teams, this is a non-starter.

7. **No escape hatch for complex queries** — If a query can't be expressed in VertzQL (e.g., window functions, full-text search with ranking, geographic queries), the escape hatch is unclear. The doc mentions `service()` for cross-entity logic, but not for raw SQL. Developers will hit "I can't do this with the framework" walls.

8. **Testing entity logic requires mocking the world** — To unit test an entity's `beforeCreate` hook or access rule, you need a full `ctx` object with `ctx.entities`, `ctx.authenticated()`, `ctx.tenant()`. This isn't a lightweight mock — it's a framework stub. The doc doesn't address testability.

9. **Soft deletes and optimistic locking are "deferred"** — These are enterprise table-stakes. Shipping v0.1 without them means teams adopting EDA will immediately face "feature gap" migration to other tools.

## Questions the Design Must Answer

- **How does injection interact with access rules?** When entity A injects entity B and calls `B.crud()`, does A execute B's access checks, or does injection grant bypass?
- **What prevents N+1 on relation includes?** Is there a query planner, auto-batching, or is this left to developers to optimize manually?
- **What's the migration path from existing Express/Fastify apps?** Is there a gradual adoption model, or is it rewrite-only?
- **How do you write raw SQL when VertzQL isn't enough?** What's the escape hatch for complex queries?
- **How do you unit test an entity in isolation?** What's the testing story?
- **What's the cross-domain transaction strategy when domains become microservices?** Sagas? Eventual consistency? Distributed transactions?

## Verdict: Request Changes

The core ideas are sound, but the design punted on too many hard problems: cross-domain transactions, migration, testing, and the access-rule-bypass-via-injection vector. These aren't edge cases — they're enterprise reality. Address the security and migration questions before committing to this architecture.
