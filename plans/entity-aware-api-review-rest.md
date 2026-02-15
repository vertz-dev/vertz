# Entity-Aware API — Review from a REST/MVC Perspective

> **Reviewer:** Sarah Martinez, Principal Engineer  
> **Background:** 12 years building REST APIs at Stripe, Twilio, and fintech  
> **Date:** 2026-02-15  
> **Verdict:** Ambitious and thoughtful, but dangerously close to building a framework that's harder to learn than the problems it solves.

---

## What I Love

### 1. Deny-by-Default Access (Section 5.1)

This is the single best decision in the entire document. Every REST framework I've worked on at scale eventually had a security incident because some intern added an endpoint without auth. "If you forget to define access rules, the entity is private" — that's exactly right. Stripe does this. If your new resource doesn't have explicit scoping, it doesn't ship.

### 2. The Entity Spectrum (Section 2.1)

The taxonomy of Persisted / Virtual / View / Session entities is genuinely useful. Most frameworks pretend everything is a database table, and then you end up with god-awful hacks for computed resources. At Twilio, we had "Verification" as a resource — it wasn't a table, it was an orchestration across SMS providers, rate limiters, and fraud detection. It took months to make that fit cleanly into our REST layer. Virtual entities solve this elegantly.

### 3. RPC Escape Hatch (Section 8)

Thank god. Every framework that says "everything is a resource!" eventually hits `POST /actions/calculate-shipping` and contorts itself into knots. Having a first-class escape hatch for non-entity operations is pragmatic and honest.

### 4. Auto-CRUD with Override (Section 2.3)

The 80/20 split philosophy (Section 4.1) is correct. Most CRUD is boring. Auto-generating `GET/POST/PATCH/DELETE` for persisted entities and letting developers override with hooks when needed — this is the right default. Django REST Framework got this right years ago. Good to see it here.

---

## What Concerns Me

### 1. VertzQL Is GraphQL in Disguise (Section 3)

I need to be blunt: **VertzQL is GraphQL with REST URLs bolted on.** Let me show you why.

The document says:

> "VertzQL gives REST the precision of GraphQL without the complexity."

Then immediately demonstrates:
- Field selection (`select`)
- Nested includes with their own filters, limits, and ordering
- Aggregation queries
- A wire protocol that falls back to `POST /entities/user/query` with a JSON body

That POST endpoint? It's a GraphQL endpoint. You've just renamed `query { user { posts { title } } }` to `{ "select": ["name"], "include": { "posts": { "select": ["title"] } } }`. The complexity didn't go away — you moved it.

**The GET URL encoding is a red flag:**
```
GET /entities/user/123?select=name,email&include=posts(select:title,createdAt;where:published=true;limit:10;orderBy:createdAt:desc)
```

This is not a URL anyone will debug, cache-key, or log meaningfully. CDNs will cache it, sure — but the cache hit rate on URLs this specific will be near zero. You're getting the *theoretical* benefit of HTTP caching while losing the *practical* simplicity of REST.

**What Stripe does instead:** Different endpoints for different representations. `GET /v1/customers/:id` returns the customer. `GET /v1/customers/:id/charges` returns their charges. No query language. No field selection. The response is the response. If mobile clients need less data, we version the API or use `expand[]` for relations — a much simpler mechanism.

**My recommendation:** Ship VertzQL Phase 1 with *only* field selection (`select`) and simple filtering (`where`). No nested includes. No aggregations in the query language. If you need related data, use `/entities/user/:id/posts` — a proper REST sub-resource. Add includes later *only if* real users scream for it. I suspect they won't.

### 2. One Endpoint Pattern for Everything (Section 2.3)

```
GET /entities/user
GET /entities/user/:id
POST /entities/user
```

The `/entities/` prefix is a smell. It screams "I am a generic framework" rather than "I am a domain API." Stripe's API isn't `POST /entities/customer` — it's `POST /v1/customers`. Twilio's isn't `GET /entities/message` — it's `GET /2010-04-01/Accounts/{AccountSid}/Messages`.

Why does this matter?
- **Discoverability** — `/entities/` tells you nothing about the domain
- **Versioning** — How do you version entity APIs? `/entities/v2/user`? `/v2/entities/user`?
- **URL design is API design** — The URL communicates the resource hierarchy. `/entities/` flattens everything into a soup

**Recommendation:** Let developers define their own URL patterns with sensible defaults. Default to `/api/users`, `/api/posts` — pluralized, no prefix. Or at minimum make `/entities/` configurable.

### 3. Application-Level RLS Is a Footgun (Section 5.2)

The doc says:

> "Instead of database-level RLS policies (which are opaque, hard to test, and PostgreSQL-specific), Vertz implements RLS at the application layer."

I've heard this argument before. I've also seen what happens when you rely on application-level security as your *only* layer:

1. **Bypass risk** — Every raw SQL query, every migration script, every data export job, every background worker that touches the database *directly* bypasses your access rules. At my fintech company, we had application-level permissions. A data engineer ran a one-off query for a report and accidentally exposed PII across tenants because nothing in the database prevented it.

2. **"Hard to test" is wrong** — Supabase and PostgREST have made Postgres RLS very testable. You write policies, you test them with `SET ROLE`, done. They're SQL — the most well-understood query language on earth.

3. **"PostgreSQL-specific" is a feature, not a bug** — You said in Section 10.1 that PostgreSQL is the default and v1 is Postgres-only. If you're all-in on Postgres, *use Postgres*. RLS is battle-tested, kernel-level enforcement. Your application-level equivalent is a JavaScript function that a single bug could bypass.

**What I'd do:** Defense in depth. Generate Postgres RLS policies *from* the entity access rules. The entity definition is the source of truth (great!), but the enforcement happens at *both* layers. Application layer for fast checks and UX (nice error messages), database layer as the safety net.

The doc's performance argument (Section 5.4) about precomputed access sets and WHERE clause injection is actually describing what database RLS already does — but worse, because now *you* have to implement it correctly, cache-invalidate it correctly, and test it across every code path.

### 4. The Semantic Layer Is Scope Creep (Section 7)

I respect the ambition, but this section scares me. You're building:
- An API framework
- A query language
- An auth system
- A real-time subscription system
- A caching layer
- **AND** a semantic/BI layer that replaces Cube.js

This is too much for one framework. The semantic layer alone (pre-aggregations, materialized views, refresh scheduling) is a *company-sized problem*. Cube.js has 50+ engineers working on it. You're proposing to subsume that into a section of your entity definition.

**The "triple bookkeeping" argument** — yes, maintaining schemas in three places sucks. But the solution isn't to put everything in one place; it's to generate the other places from a single source. Prisma generates from schema.prisma. dbt generates from SQL models. You can generate a Cube.js config from entity definitions without *being* Cube.js.

**Recommendation:** Cut Section 7 from v1 entirely. Ship computed fields, sure — those are just derived properties. But pre-aggregations, refresh schedules, and metric-level access rules? That's a separate product. Build a `@vertz/cube` adapter instead.

### 5. Real-Time Auth Is Deceptively Hard (Section 6.3)

> "Permission check on every event (access rules might change, entities might move out of your scope)"

Do you understand what this means at scale? If you have 10,000 active subscriptions and an admin changes a role, you need to re-evaluate every single subscription to see if it's still valid. The doc waves at this with "event bus" but doesn't address:

- What happens when a permission change affects 50,000 subscriptions?
- How do you batch re-evaluation without dropping events?
- What's the latency budget for "your access was revoked, stop sending events"?

GitHub's API doesn't even try real-time subscriptions for this reason — they use webhooks, which are fire-and-forget. Stripe uses webhooks too. The only companies that do real-time entity subscriptions at scale (Firebase, Supabase, Convex) have dedicated teams for just this feature.

**Recommendation:** Ship SSE-only in v1. It's simpler, stateless, and works through every proxy. Make subscriptions optimistic (check on subscribe, not on every event) with periodic revalidation. Full per-event auth can come in v2 when you understand your real-world access patterns.

### 6. Comparison Table Is Marketing, Not Engineering (Section 12)

The comparison table has Vertz winning every column. That should be a red flag, not a feature. GraphQL's ❌ for "type-safe e2e" is wrong — `graphql-codegen` with TypeScript has full e2e type safety. Convex's ❌ for "field selection" is misleading — Convex queries return exactly what you query for.

**Recommendation:** Be honest in comparisons. Acknowledge where others are genuinely better. Stripe's API wins on simplicity and developer experience *because* it doesn't try to do everything. tRPC wins on type safety *because* it doesn't try to be REST-compatible. Where are *your* genuine trade-offs?

---

## What's Missing

### 1. API Versioning

Not a single mention of versioning. This is the #1 problem in API management at scale. How do you handle:
- Adding a required field to a persisted entity?
- Renaming a field?
- Changing a relation from one-to-one to one-to-many?
- Deprecating an entity?

Stripe uses date-based versioning (`Stripe-Version: 2025-12-01`). Every breaking change gets a version boundary, and the API gateway transforms requests/responses between versions. Twilio uses URL versioning (`/2010-04-01/`). The GitHub API uses header-based versioning.

Entity-aware APIs need versioning even *more* than traditional REST because the schema IS the API. If you change the entity, you break every client. Section 11.3 mentions "Breaking change detection" as an "unexplored opportunity" — this is not an opportunity, it's a requirement for production use.

### 2. Rate Limiting Strategy

Section 4.3 mentions `rateLimitMiddleware()` as a one-liner. But VertzQL makes rate limiting dramatically harder:
- Is `GET /entities/user?select=name` the same rate limit bucket as `GET /entities/user?select=name&include=posts,comments,likes`?
- Can a single VertzQL query with deeply nested includes consume 100x the resources of a simple query?
- How do you prevent a `POST /entities/user/query` with a pathological aggregation from DOSing your database?

GraphQL solved this with query complexity analysis and depth limiting. If you're building GraphQL-like query capabilities, you need GraphQL-like protections.

### 3. Error Responses

No mention of error format. REST APIs live and die by their error responses. Stripe's errors are famous for being helpful:
```json
{
  "error": {
    "type": "invalid_request_error",
    "code": "resource_missing",
    "message": "No such customer: 'cus_xxx'",
    "param": "customer",
    "doc_url": "https://stripe.com/docs/error-codes/resource-missing"
  }
}
```

What does a Vertz access denial look like? What about a VertzQL syntax error? A partial failure in a nested include? Define your error contract early — it's harder to change than any feature.

### 4. Pagination

The doc shows `cursor: lastCursor` in Section 3.2 but doesn't discuss pagination strategy. Cursor-based? Offset? Keyset? What's the default page size? What happens when a filtered list spans millions of rows?

This matters because VertzQL's `where` clause can create arbitrarily expensive queries. Without pagination defaults and limits, every list endpoint is a potential full table scan.

### 5. Idempotency

No mention of idempotency keys for create/update operations. At Stripe, every POST request accepts an `Idempotency-Key` header. This is essential for reliable payment processing and, frankly, for any mutation in a distributed system. If a client retries a `POST /entities/order`, do you get one order or two?

### 6. Bulk Operations

Real applications need to create/update/delete hundreds of entities at once. CSV imports, batch status updates, mass deletions. The current model is one entity at a time. How do you handle bulk? Is it N individual requests? A batch endpoint? Transactions?

---

## One Thing I'd Change

**Kill the custom query language. Use JSON:API or OData instead.**

I know this is heresy given the document's vision, but hear me out.

VertzQL is a custom query language that every developer must learn. It has its own syntax, its own wire format, its own edge cases. You'll spend years documenting it, debugging it, and explaining why it's *not quite* GraphQL.

JSON:API (`jsonapi.org`) already solves field selection, includes, filtering, sorting, and pagination with standardized query parameters. OData does the same with Microsoft's backing. Both have existing client libraries, existing documentation, and existing developer familiarity.

```
# JSON:API — field selection + includes
GET /users/123?fields[users]=name,email&include=posts&fields[posts]=title,createdAt

# OData — filtering + selection
GET /users?$select=name,email&$filter=role eq 'editor'&$expand=posts($select=title;$top=10)
```

These aren't as pretty as VertzQL's syntax, but they're *standards*. They have RFCs. They have battle-tested implementations. They have answers to every edge case you haven't thought of yet.

**The Vertz value-add** — entity definitions, auto-CRUD, access rules, hooks, virtual entities — is genuinely novel and valuable. You don't need a custom query language to make it work. Use a standard wire format and focus your innovation budget on what makes Vertz unique: the entity model itself.

If you insist on keeping VertzQL, at minimum make the client SDK the canonical interface and treat the wire protocol as an implementation detail. Don't document or encourage raw URL construction. Let the SDK abstract the query language so you can change it without breaking anyone.

---

## Summary

| Aspect | Grade | Notes |
|--------|-------|-------|
| Entity model | **A** | The spectrum concept is genuinely good |
| Access control design | **A-** | Deny-by-default is great, but needs DB-level enforcement too |
| Auto-CRUD | **A** | Right default, right escape hatches |
| VertzQL | **C+** | Reinventing GraphQL without admitting it |
| Semantic layer | **D** | Massive scope creep — cut it |
| Real-time | **B-** | Good design, underestimates operational complexity |
| RPC escape hatch | **A** | Pragmatic and honest |
| Versioning | **F** | Not addressed at all |
| Error handling | **F** | Not addressed at all |
| Overall scope | **C** | Trying to be 5 products at once |

**Bottom line:** The entity model and access control design are strong. Build that. Ship that. Resist the urge to build a query language, a BI tool, and a real-time platform in the same sprint. The best API frameworks succeed by doing *less* extremely well, not by doing *everything* adequately.

Stripe's API is beloved not because it has field selection or subscriptions — it doesn't. It's beloved because every endpoint does exactly what you expect, errors are clear, docs are perfect, and nothing is surprising. That's the bar.

---

*— Sarah Martinez, 2026-02-15*
