# Entity-Aware API — Review from a GraphQL Expert

> **Reviewer:** Alex Chen — Senior API Architect, 10 years GraphQL experience  
> **Date:** 2026-02-15  
> **Document reviewed:** `entity-aware-api.md` (Draft, 2026-02-15)

---

## Executive Summary

This is an ambitious, thoughtful design that correctly identifies real pain points in API development. The entity-as-the-unit-of-everything idea is compelling, and the "deny by default" auth model is something GraphQL still hasn't standardized after a decade. But the document repeatedly sets up GraphQL as a strawman while quietly reinventing most of its hard problems — and in some cases, making them harder. VertzQL in particular needs serious scrutiny before you commit to it.

**My overall take:** 70% of this design is excellent. The other 30% is either underspecified or risks becoming the thing it claims to replace.

---

## What I Love

### 1. Entity Spectrum (Section 2.1)

This is the best idea in the document. GraphQL has always struggled with the impedance mismatch between "things in a database" and "things a client needs." The spectrum from Persisted → Virtual → View → Session entities is a clean taxonomy that I wish we'd had when designing the GraphQL spec. It captures the reality that not everything is a CRUD resource and not everything is an RPC call.

The `Onboarding` virtual entity example (Section 2.2) is particularly well-chosen — this is exactly the kind of thing that becomes a rats' nest of resolvers in GraphQL.

### 2. Deny-by-Default Auth (Section 5.2)

**This is the single most important design decision in the document.** GraphQL's biggest security nightmare is that every field is public unless you explicitly protect it. I've seen production APIs at major companies where someone added a `ssn` field to a User type and forgot to add authorization — because GraphQL doesn't have a standardized auth story.

Vertz making entities private by default, with access rules co-located on the entity definition, is a genuinely better model. The fact that `access` rules apply to metrics too (Section 7.2) shows careful thinking.

### 3. Co-located Everything

Schema, relations, access rules, hooks, computed fields, metrics, cache config — all on one object. This is a direct answer to GraphQL's fragmentation problem where your type definition is in one file, your resolvers in another, your authorization in a third, and your DataLoader in a fourth. I've seen GraphQL codebases where understanding a single type requires reading 8 files. The Vertz entity model is dramatically better for maintainability.

### 4. Auto-CRUD (Section 2.3)

Generating REST endpoints from entity definitions is table stakes at this point (Supabase, Hasura, PostgREST all do it), but doing it with co-located access rules and hooks is the right evolution. The 80/20 framing in Section 4.1 is honest and correct.

---

## What Concerns Me

### 1. VertzQL Is GraphQL with Worse Tooling — Let's Be Honest

Section 3.1 claims VertzQL gives "REST the precision of GraphQL without the complexity." Let me break down why this framing is misleading:

**The wire format (Section 3.3) is a custom query language.** Look at this:

```
GET /entities/user/123?select=name,email&include=posts(select:title,createdAt;where:published=true;limit:10;orderBy:createdAt:desc)
```

This is a query language embedded in URL parameters. It has field selection, nested includes with filtering, ordering, and limits. **This is GraphQL.** You've just moved it from a POST body to a query string with a custom syntax that no existing tool understands.

GraphQL's "complexity" that you're avoiding isn't the query language — it's the ecosystem burden (schema definition, codegen, client libraries). But you're *also* building a schema definition (entity definitions), codegen (`vertz build` for client SDK), and client libraries. The complexity hasn't been removed; it's been reshuffled.

**What you've actually lost:**
- **Tooling.** GraphQL has GraphiQL, Apollo DevTools, Altair, Insomnia support, Postman support, VS Code extensions, ESLint plugins. VertzQL has none of this. You'll need to build all of it.
- **Specification.** GraphQL has a spec with formal grammar, validation rules, and execution semantics. If two implementations disagree, you can check the spec. VertzQL has... this design doc.
- **Community knowledge.** Thousands of blog posts, conference talks, and Stack Overflow answers about GraphQL patterns. Zero for VertzQL.
- **Introspection.** GraphQL's introspection system means any client can discover the schema at runtime. Your entity layer has compile-time SDK generation, which is great for first-party clients, but what about third-party consumers?

**What you've gained:**
- HTTP GET cacheability (legitimate advantage — this is real)
- Familiar REST-like URL structure (marginal — developers will still need to learn VertzQL syntax)
- No separate schema language (real advantage — TypeScript is the schema)

**My recommendation:** Be honest in the doc about what VertzQL is. It's a query language. It competes with GraphQL, OData, and FIQL. Frame it as "a simpler query language optimized for entity-based APIs" rather than "REST with enhancements." The current framing will attract REST purists who'll be surprised when they see nested includes with filter syntax, and it'll repel GraphQL users who won't see what they're gaining.

### 2. The N+1 Problem Is Not Addressed (Open Question #2)

This is mentioned as an open question, but it should be a **core design concern.** The entire VertzQL `include` system has an N+1 problem by default. When I query:

```ts
client.user.list({
  select: ['name'],
  include: { posts: { select: ['title'], limit: 5 } },
  limit: 50,
})
```

Are you doing 1 query for users + 50 queries for posts? Or 1 query with a JOIN? Or 1 query for users + 1 batched query for posts (DataLoader pattern)?

GraphQL solved this with DataLoader in 2015 — and it's *still* the source of most GraphQL performance bugs a decade later. The DataLoader pattern is subtle: you need per-request batching, you need to handle batch size limits, you need to deal with the fact that different includes might have different WHERE clauses that prevent batching.

**You need to decide this before Phase 2, not during it.** The `include` semantics determine your entire query execution model. I'd push hard for SQL-level JOINs with lateral joins for filtered/limited nested includes, falling back to batched queries only when crossing database boundaries (Section 10.1's multi-DB scenario). Don't make developers think about this — the framework should always do the right thing.

### 3. The Comparison Table (Section 12) Is Misleading

I have to call this out because it's the kind of table that ends up in marketing materials:

- **GraphQL "Field selection: ✅"** but **"Type-safe e2e: ❌ (codegen)"** — This implies codegen is bad, but Vertz *also* uses codegen (`vertz build` produces a typed client). The difference is that Vertz infers types from TypeScript definitions while GraphQL infers them from a schema language. Both require a build step for the client.
- **GraphQL "Auth built-in: ❌"** — Fair, but misleading. GraphQL deliberately doesn't include auth because it's a query language, not a framework. Comparing a framework (Vertz) to a query language (GraphQL) on framework features is apples to oranges. Compare to Apollo Server + Shield + Pothos, and the gap narrows significantly.
- **GraphQL "No boilerplate CRUD: ❌"** — Hasura, Postgraphile, and Pothos with prisma plugin all auto-generate CRUD. Again, you're comparing a framework to a spec.
- **"LLM-friendly: ❌"** for GraphQL — GraphQL schemas are *extremely* LLM-friendly. They're self-documenting, introspectable, and have a formal grammar. LLMs are arguably better at writing GraphQL queries than any custom query language because of training data volume.

**My recommendation:** Either compare Vertz to *frameworks* (Supabase, Convex, Hasura) or compare VertzQL to *query languages* (GraphQL, OData). Don't mix levels of abstraction in the same table.

### 4. Subscription Auth Is Harder Than You Think (Section 6.3)

> "Permission check on every event (access rules might change, entities might move out of your scope)"

This one sentence hides enormous complexity. At Shopify, subscription authorization was one of our hardest problems. Consider:

1. User subscribes to `posts where organizationId = X`.
2. Admin removes user from organization X.
3. A new post is created in organization X.
4. Should the user receive the event?

The answer is obviously "no," but implementing this requires:
- Re-evaluating access rules on every event emission (potentially millions of events × thousands of subscribers)
- Or maintaining a reverse index of "which subscriptions are affected by this permission change"
- Or accepting eventual consistency (user sees 1-2 events they shouldn't before the subscription is terminated)

GraphQL subscriptions have the same problem, and most implementations just... don't handle it. They check auth on subscribe and hope permissions don't change. That's a security hole, and you should be explicit about your stance here.

**My recommendation:** Define your consistency guarantee. Is it "strong" (every event is auth-checked before delivery, possible latency penalty) or "eventual" (subscription is re-authorized periodically, small window of unauthorized events)? Both are valid — but pick one and document it.

### 5. Hierarchical Permission Inheritance (Section 5.3) Gets Exponentially Complex

The org → team → project → task hierarchy looks clean in the example, but real-world hierarchies are messier:

- A user can be on multiple teams
- A project can belong to multiple teams (shared projects)
- A task can be moved between projects
- Permissions might be additive (member of any parent grants access) or restrictive (must be member of *all* parents)

At 4 levels with multi-membership, the permission graph explodes. Your "precomputed access sets" strategy (Section 5.4) is the right approach, but you need to address:
- How often are access sets recomputed? On every membership change? That's O(users × depth) work.
- What happens during the recomputation window? Stale permissions?
- How big do these sets get? A user in 10 orgs, each with 50 teams, each with 100 projects, each with 1000 tasks = 50M entries per user. That doesn't fit in memory.

**My recommendation:** Cap hierarchy depth at a reasonable level (3-4) and be explicit about the multi-membership model. Consider Zanzibar (Google's authorization system) or SpiceDB as prior art — they've solved this problem at massive scale with a relationship-tuple model that avoids precomputing the full transitive closure.

---

## What's Missing

### 1. Error Handling and Partial Responses

GraphQL's error model (return data AND errors in the same response) is one of its most underappreciated features. If I query a user and their posts, and the posts query fails, GraphQL returns the user data with `posts: null` and an error object. The client decides how to handle it.

What does VertzQL do? If an `include` fails:
- Return HTTP 500? (Loses the successfully fetched parent data)
- Return partial data with some error field? (Need to define the error format)
- Silently return null? (Hides failures)

This needs to be specified. It's not a detail — it's a core API contract.

### 2. Pagination Model

Section 3.2 shows `cursor: lastCursor` for pagination, but there's no specification of the pagination response format. GraphQL standardized on Relay-style connections (`edges`, `pageInfo`, `cursor`) which, while verbose, solved real problems:
- How does the client know if there are more pages?
- How does cursor-based pagination work with filtered/sorted results?
- What about bidirectional pagination?

Don't reinvent this. Either adopt Relay-style connections or define your own pagination contract explicitly. "Cursor pagination" is not a spec — it's a category.

### 3. Batching / Multiplexing

One of GraphQL's killer features is sending multiple queries in a single request. If a dashboard needs users, orders, and analytics, that's one HTTP request. With REST (even enhanced REST), that's three requests — three round trips, three TLS handshakes, three TCP slow-starts.

HTTP/2 multiplexing helps but doesn't eliminate the overhead entirely. Does VertzQL support request batching? If so, how? If not, this is a real disadvantage for dashboard-heavy applications.

### 4. Schema Introspection / Discovery

GraphQL's introspection query (`__schema`, `__type`) lets any client discover the API at runtime. This enables:
- Auto-generated documentation
- IDE autocomplete without a build step
- API explorers (GraphiQL)
- Client library generation in any language

The Vertz client SDK (Section 9) solves this for TypeScript first-party clients, but what about:
- Mobile clients (Swift, Kotlin)?
- Third-party integrations?
- Runtime schema discovery?

If entities are the single source of truth, you should expose entity schemas via a discovery endpoint. Something like `GET /entities/__schema` that returns entity definitions in a machine-readable format.

### 5. Deprecation and Evolution Strategy

Section 11.3 mentions breaking change detection, but the actual deprecation story is missing. GraphQL has `@deprecated(reason: "Use newField instead")` which shows up in introspection and tooling. How do you deprecate an entity field in Vertz? How do you run two versions of an entity simultaneously during migration?

### 6. File Uploads and Binary Data

Real APIs need to handle file uploads. GraphQL famously punts on this (the community built graphql-upload, but it's awkward). What's Vertz's story for:
- File upload fields on entities (e.g., user avatar)
- Large binary responses (file downloads, exports)
- Streaming responses

---

## What I'd Change

### 1. Adopt GraphQL as an Optional Transport Layer

Instead of positioning VertzQL *against* GraphQL, offer GraphQL as an alternative transport. The entity definitions already contain everything needed to auto-generate a GraphQL schema. Do this:

```ts
const app = createApp({
  entities: [User, Post, Order],
  transports: {
    rest: true,        // GET/POST /entities/...
    graphql: true,     // POST /graphql (auto-generated schema)
    vertzql: true,     // Enhanced REST with query syntax
  },
})
```

This lets teams migrate gradually, use GraphQL tooling where it's superior (IDE integration, documentation), and use REST/VertzQL where *that's* superior (caching, simplicity). It also makes the comparison table irrelevant — Vertz becomes a superset.

Apollo Federation and Hasura both show that auto-generating GraphQL from a data model is viable. You'd get the entire GraphQL ecosystem for free.

### 2. Formalize the VertzQL Grammar

If you're going to have a query language, give it a formal grammar. Even a simple EBNF would help:

```
include = entity "(" param (";" param)* ")"
param   = key ":" value
key     = "select" | "where" | "limit" | "orderBy"
```

Without this, every client implementation will interpret the syntax slightly differently, and you'll spend years on edge cases. Learn from GraphQL's mistake of starting without a formal spec — we had to retroactively formalize behavior that implementations disagreed on.

### 3. Design for DataLoader from Day One

Don't treat N+1 as an open question. Bake batched data loading into the entity layer:

```ts
// Internal: every relation automatically uses batched loading
// When resolving posts for 50 users, the framework automatically:
// 1. Collects all authorIds
// 2. Runs ONE query: SELECT * FROM posts WHERE authorId IN (...)
// 3. Distributes results back to each user

// Developer never writes a DataLoader. The entity relations ARE the DataLoader.
```

This is what Prisma does with `findMany` + `include`, and it's what makes Prisma's query performance predictable. Vertz should do the same — the entity relation definitions contain enough information to generate optimal batched queries without developer intervention.

### 4. Define Subscription Consistency Guarantees

Per my concern in Section 4 above: pick a consistency model and document it. I'd recommend:

- **Strong auth check** on subscribe
- **Periodic re-authorization** (every 30-60s) of active subscriptions
- **Immediate termination** on explicit permission revocation events (user removed from org → kill their subscriptions)
- **Accept eventual consistency** for edge cases (permission changes that aren't explicit revocation events)

This is pragmatic and covers 99% of real-world scenarios without the performance cost of per-event auth checks.

---

## The Honest Assessment

**Is VertzQL better than GraphQL?** No. It's a different set of trade-offs that are better for some scenarios and worse for others.

**Better:** HTTP cacheability, simpler mental model for CRUD-heavy apps, no separate schema language, co-located auth.

**Worse:** No ecosystem, no formal spec, no introspection, no batching story, custom syntax that tools don't understand.

**Where Vertz genuinely wins over GraphQL:** The entity layer, not the query language. The co-located schema/auth/hooks/metrics model is a real innovation. The entity spectrum is a real innovation. The deny-by-default auth is a real innovation.

**My advice:** Lead with the entity model. Make VertzQL one of several transport options. Don't die on the "we're better than GraphQL" hill — you're solving a different problem (full-stack entity management) and doing it well. The query language is the least interesting part of this design.

---

## Responses to Open Questions (Section 13)

1. **VertzQL syntax:** POST body for anything with nesting. Query params for simple field selection only (`?select=name,email`). Don't encode trees in URLs — it's a losing battle.

2. **N+1:** SQL JOINs for single-DB includes, batched queries (DataLoader pattern) for cross-DB or computed includes. Never loop. See my recommendation above.

3. **Cache invalidation:** Per-entity is the sane default. Per-field is premature optimization. Per-query is what you cache *externally* (CDN). Invalidate on mutation — the event bus handles this.

4. **Virtual entity lifecycle:** Yes, they should have IDs (even synthetic ones like `onboarding:{userId}`). Yes, they should be subscribable. Caching is the handler's responsibility since only the handler knows the freshness semantics.

5. **Permission inheritance depth:** Cap at 4 levels. Beyond that, flatten or use Zanzibar-style relationship tuples.

6. **GraphQL interop:** **Yes.** Auto-generate a GraphQL schema from entity definitions. This is your easiest ecosystem win.

7. **Offline sync:** Last-write-wins by default, entity-level merge functions as opt-in. CRDTs are overkill for most apps and introduce complexity most teams can't reason about.

8. **Multi-DB query planning:** Route at the entity level, not the query level. A query hits one DB. If you need data from two DBs, the framework makes two queries and joins in-memory. Don't build a distributed query planner — that's a multi-year project and you'll get it wrong.

9. **Wire format:** JSON for v1. Add MessagePack as opt-in for bandwidth-sensitive clients. Protobuf only if you have enterprise customers demanding it.

10. **Versioning:** Additive changes only (new fields, new entities) are non-breaking. Removing or renaming fields requires a deprecation period. Generate client SDK versions — old SDKs work until explicitly sunset.

---

*Overall: This is a strong design with a clear vision. The entity model is genuinely novel and better than anything in the GraphQL ecosystem. The query language is the weakest link — not because it's bad, but because it's competing with a decade of GraphQL tooling with zero ecosystem. Lead with your strengths.*

— Alex Chen
