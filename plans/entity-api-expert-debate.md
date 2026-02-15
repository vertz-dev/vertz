# Entity API Expert Debate — Panel Transcript

> **Date:** 2026-02-15  
> **Moderator:** Framework Architecture Review Board  
> **Panelists:**  
> 1. **Dr. Elena Vasquez** — DDD, bounded contexts, aggregates (20yr enterprise arch)  
> 2. **Marcus Chen** — API design, ex-Stripe/Twilio API platform lead  
> 3. **Prof. Aditi Sharma** — SOLID, GoF patterns, clean architecture  
> 4. **James Okafor** — Full-stack framework architect (Rails, Laravel, Next.js core)  
> 5. **Sarah Kim** — Real-time systems, event sourcing, CQRS, distributed arch  

---

## Topic 1: Naming — `entity` vs Alternatives

**Moderator:** Let's start with the fundamental question. The framework uses `entity()` as the universal abstraction. Is "entity" the right word?

**Dr. Vasquez:** I have immediate concerns. In DDD, "entity" has a very precise meaning — it's an object with identity that persists over time, distinct from value objects. When Vertz calls a checkout flow an "entity," that's a direct collision with thirty years of domain modeling literature. A checkout is a *process*, not an entity. An onboarding flow is a *saga*. Calling them entities is going to confuse every developer who's read Evans or Vernon.

**Marcus Chen:** Elena, I hear you on the academic definition, but let me push back from a DX perspective. I spent five years at Stripe building APIs consumed by millions of developers. You know what those developers call things? Resources. Everything in Stripe is a resource — a Charge, a Customer, a Checkout Session. The Checkout Session is absolutely a "thing" even though it's ephemeral and process-oriented. The word matters less than the consistency. If everything is an entity, developers learn one concept. If you split between entities, processes, sagas, and projections, you've got four concepts where one could suffice.

**Prof. Sharma:** Marcus, consistency is valuable, but not at the cost of semantic accuracy. The Liskov Substitution Principle applies to naming too — if I hand a developer an "entity" and they can't treat it like an entity in the ways they expect, the abstraction leaks. A virtual entity with only a `create` handler doesn't behave like a persisted entity. You can't `findMany` on a checkout.

**James Okafor:** Can I bring this down to earth? I've worked on Rails, Laravel, and reviewed half the frameworks in the JS ecosystem. Here's the reality: Rails calls them models. Laravel calls them models. Django calls them models. Spring calls them entities. .NET calls them entities. Prisma calls them models. Drizzle has tables. None of these are academically "correct" — they're all overloaded. The question isn't "is entity correct?" — it's "will developers understand what to do with it?" And my honest answer is: `entity()` is slightly better than `model()` for this use case because Vertz isn't just an ORM. Models imply database backing. Entity is more abstract, which actually serves the virtual entity concept.

**Sarah Kim:** I want to zoom out from naming to what the name *signals* about the system's capabilities. If I see `entity`, I expect something with identity, lifecycle, and state. Persisted entities? Sure. Session entities? Fine — they have identity and ephemeral state. But a "virtual entity" for a login flow? That's a command. It's literally the Command pattern. Calling it an entity doesn't just confuse DDD practitioners — it confuses anyone building event-sourced systems who distinguishes between commands and entities at a fundamental architectural level.

**Dr. Vasquez:** Exactly. Sarah nails it. The word "entity" carries *commitments*. It says: this thing has identity, this thing has state, this thing has a lifecycle. A login flow has none of those. It's a *command* with a *result*.

**Marcus Chen:** I want to challenge that. Stripe's Checkout Session has an ID. It has state (open, complete, expired). It has a lifecycle. And it's absolutely a process. The mental model of "everything has an ID, state, and lifecycle" isn't broken by virtual entities — it's *expanded*. The Stripe API is beloved precisely because checkout sessions, payment intents, and subscription schedules all behave like resources. Developers don't need to learn a separate pattern for each.

**James Okafor:** Here's my practical concern: if we rename `entity()` to something else, what do we call it? `resource()` maps to REST and HTTP concepts — it's actually quite good but might feel enterprise-y. `model()` is the most familiar to the target audience (JS/TS full-stack devs) but implies database backing. `domain()` is DDD-correct but nobody outside DDD circles uses it. `define()` is too generic. I keep coming back to `entity()` as the least-bad option, with the caveat that the docs need to explicitly say "an entity in Vertz is broader than the DDD definition."

**Dr. Vasquez:** Or — and hear me out — you keep `entity()` for persisted and session types, and introduce `action()` or `operation()` for virtual entities. The spec already has an `action()` function for the RPC escape hatch! Why not use `action()` for login flows and checkout, and `entity()` for things that actually have persistent identity?

**Marcus Chen:** Because then you have two concepts where one sufficed. The whole *point* of the design is that the client calls `api.checkout.create()` the same way it calls `api.user.create()`. Two abstractions means two client patterns.

**Prof. Sharma:** Unless the client SDK abstracts both behind the same interface, which it can. The implementation can differ while the consumption API remains unified.

**Sarah Kim:** I think there's a middle ground. Keep `entity()` as the function name, but rename the `virtual` variant. Instead of `virtual: true`, call them what they are: `entity('checkout', { type: 'command', ... })` or `entity('checkout', { type: 'process', ... })`. The function is the same, the client API is the same, but the type label communicates intent.

**James Okafor:** That's interesting, but `type: 'command'` is going to scare off junior developers who don't know what the Command pattern is. What about just keeping it as-is? `virtual: true` isn't claiming it's an entity in the DDD sense — it's saying "this is an entity in the Vertz sense that doesn't have a backing table." The docs define what that means.

---

## Topic 2: Virtual Entities as RPC Replacement

**Moderator:** Let's dig deeper. The design proposes that login flows, checkout, onboarding — traditionally RPC or controller actions — become virtual entities. Clean unification or overloaded abstraction?

**Prof. Sharma:** Let me be direct. This violates the Single Responsibility Principle as I understand it. The `entity()` function is now responsible for: defining database schemas, defining access rules, defining business logic orchestration, defining API contracts. That's at least four responsibilities.

**Marcus Chen:** Aditi, I'd argue SRP applies at the entity *instance* level, not the `entity()` function level. Each individual entity definition has one responsibility: "define the User resource" or "define the Checkout flow." The `entity()` function is a *factory* — its job is to produce entity definitions, and that's one responsibility.

**Prof. Sharma:** That's a stretch. The factory produces wildly different things depending on the options. A persisted entity auto-generates CRUD routes with DB queries. A virtual entity runs arbitrary async handlers. These are fundamentally different beasts sharing a trench coat.

**James Okafor:** *laughs* Best metaphor of the day. But here's the thing — this is exactly what Rails controllers do. A Rails controller action for `UsersController#create` might insert a DB record. `SessionsController#create` runs a login flow. Same `def create`, same routing pattern, completely different behavior. Developers handle this just fine. The controller is the universal adapter between HTTP and business logic, and nobody complains that a SessionsController isn't "really" a controller because it doesn't back a model.

**Dr. Vasquez:** That's a fair analogy, James, but Rails doesn't *claim* that sessions are models. There's a clear separation: models are models, controllers are controllers. In Vertz, the entity is doing both jobs. An `Onboarding` virtual entity is really a service — it orchestrates User creation, Workspace creation, email sending. In DDD, that's an *application service*, not an entity. Conflating them erodes the ubiquitous language.

**Sarah Kim:** I have a pragmatic concern. Virtual entities with `create` handlers that orchestrate multiple writes — like the Onboarding example — have completely different consistency guarantees than persisted entities. A `user.create()` is a single DB insert. An `onboarding.create()` is a saga across multiple tables plus an email side effect. If they share the same API surface, developers might expect the same transactional guarantees. "I called create and it failed halfway — is my data consistent?" That's a much harder question for virtual entities.

**Marcus Chen:** That's a real concern, Sarah, and the answer is: document it clearly. Stripe does this. `PaymentIntent.create()` kicks off a multi-step async process. It might succeed partially. The API docs explain exactly what happens in failure modes. The consistency model is different from `Customer.create()`, and developers learn that. It doesn't break the API consistency.

**Sarah Kim:** Stripe also has webhook-based eventual consistency patterns that took years to refine. Vertz is asking developers to build those patterns themselves inside virtual entity handlers, without the infrastructure Stripe spent a decade building.

**James Okafor:** Fair, but no framework can solve distributed consistency for free. The question is: does the virtual entity pattern make it *harder* to handle correctly? I'd say no — it's the same complexity whether you write it as a virtual entity handler or a standalone function. The virtual entity just gives you typed input/output, access rules, and a consistent API surface for free.

**Dr. Vasquez:** I'll concede that the *mechanism* is fine. What I'd push for is better naming. Don't call `onboarding.create()` a "create" — call it `onboarding.start()` or `onboarding.execute()`. The CRUD vocabulary implies data operations. Process orchestration deserves different verbs.

---

## Topic 3: SOLID Compliance

**Prof. Sharma:** Let me walk through each principle systematically.

**Single Responsibility:** As I mentioned, the `entity()` function carries multiple responsibilities. The EntityDefinition object bundles schema, access, handlers, and routing concerns. In clean architecture, these would be separate layers — repository, policy, use case, controller. Grade: **C+**. It works pragmatically but isn't clean.

**Open/Closed:** This is actually good. Entities are open for extension via handler overrides — you can wrap the default handler with pre/post logic without modifying the framework. The middleware stack is composable. The `expose` array controls what surfaces without modifying the entity internals. Grade: **B+**.

**Liskov Substitution:** Here's where it breaks. If I have a function that accepts an `EntityDefinition`, it cannot assume CRUD operations work uniformly. A virtual entity might not support `findMany`. A view entity only supports read. The subtypes (persisted, virtual, view, session) do NOT satisfy LSP relative to a generic EntityDefinition. Grade: **D**.

**Marcus Chen:** Hold on — LSP says subtypes should be substitutable for their base type. But if the type system encodes which operations are available — `EntityDefinition<{ operations: 'read' | 'create' }>` — then the compiler prevents misuse. LSP isn't violated if the types are honest about capabilities.

**Prof. Sharma:** Fair point. If the type system is tight enough, that upgrades to a **B-**. But the current spec shows all entities exposed via the same REST endpoints, so the *runtime* contract is violated even if the compile-time contract is preserved.

**Interface Segregation:** Moderate concern. The EntityContext interface is bloated — `db`, `services`, `user`, `tenant`, `request`, `defaultHandler`. A virtual entity handler doesn't need `db` if it's pure orchestration. A read-only view doesn't need `defaultHandler`. The context should be narrower for each entity type. Grade: **C**.

**Dependency Inversion:** Good. Entities depend on abstractions (table entries, context interfaces), not concrete implementations. The `@vertz/db` CRUD functions are injected via context, not imported directly. Grade: **A-**.

**Overall SOLID score: B-**. It's better than most frameworks. The main violations are in SRP (bundling too many concerns) and LSP (heterogeneous entity types behind a uniform interface).

**James Okafor:** For context — Rails scores about a D+ on SOLID, and it's the most productive framework ever built. SOLID is a guideline, not gospel. The right question is: does breaking SOLID create real problems for real developers?

**Prof. Sharma:** It creates problems when the codebase grows. The 500-entity enterprise app will suffer from the SRP violations that the 20-entity startup app never notices.

---

## Topic 4: Design Pattern Mapping

**Prof. Sharma:** Let me map this to established patterns.

The persisted entity with auto-CRUD is an **Active Record** variant — the entity definition contains both schema and behavior (access rules, hooks). However, unlike traditional Active Record where the object wraps a row, here the entity definition is a *factory* for handlers, which is closer to the **Repository pattern** — entity definitions produce typed data access objects.

**Dr. Vasquez:** I'd call the `d.entry()` + `entity()` combination a **Data Mapper** with a **Repository** facade. The Drizzle layer (d.entry) is the data mapper — it maps between DB rows and TS objects. The entity layer adds the repository pattern on top — `findMany`, `findOne`, `create`, `update`, `delete` with business rules.

**Prof. Sharma:** Virtual entities clearly implement the **Command pattern**. `onboarding.create(data)` is a command with a typed payload and a handler. The fact that it returns a result makes it a Command with a return value, which some purists dislike but is pragmatically fine.

The handler override with `ctx.defaultHandler()` is the **Template Method pattern** — the framework defines the algorithm skeleton (validate → check access → handle → respond), and the developer overrides specific steps.

**Sarah Kim:** The entity spectrum (persisted/virtual/view/session) maps to **CQRS** if you squint. Persisted entities handle commands (writes). Views handle queries (reads). Virtual entities are command handlers. Session entities are read models in ephemeral storage. It's not explicit CQRS, but the building blocks are there.

**Marcus Chen:** The `expose` array is essentially the **Facade pattern** — it presents a simplified, curated interface to what's actually a complex entity with many relations.

**Prof. Sharma:** The access rules are a form of the **Strategy pattern** — different access strategies per operation, injectable and configurable. And the middleware stack is the classic **Chain of Responsibility**.

Overall, this design synthesizes: Repository + Command + Template Method + Strategy + Facade + Chain of Responsibility. That's a lot of patterns under one API surface, which explains both its power and its complexity.

---

## Topic 5: Client API Naming

**Marcus Chen:** This is my territory. Let me be opinionated. The current vocabulary is `findMany`, `findOne`, `create`, `update`, `delete`. This is Prisma's vocabulary, which developers know.

However, I have two issues:

First, `findMany` and `findOne` imply searching/discovering — which is wrong for virtual entities. You're not "finding" a checkout. You're invoking it. For persisted entities, `find` is fine. For virtual ones, it's nonsensical.

Second, the REST community and most public APIs use `list` and `get`. Stripe uses `list` and `retrieve`. Google APIs use `list` and `get`. These are more universal than `findMany`/`findOne`, which are ORM-specific jargon.

My recommendation: `list`, `get`, `create`, `update`, `delete` for the client API. Reserve `findMany`/`findOne` for the server-side DB layer where Prisma conventions make sense.

**James Okafor:** I agree with Marcus. `list` and `get` are immediately understandable to any developer. `findMany` requires explanation — "find" implies a search operation, "many" is redundant with a list endpoint.

**Dr. Vasquez:** For virtual entities that only support `create`, the method should probably be `execute`, `invoke`, or `run`. Calling `checkout.create()` is semantically wrong — you're not creating a checkout, you're *initiating* one.

**Marcus Chen:** Elena, I actually disagree here. `create` for checkout makes sense if you think of it as "create a checkout session" — which is exactly what Stripe does. `POST /v1/checkout/sessions` creates a checkout session. The session is a tangible thing with an ID, state, and lifecycle. The verb "create" is appropriate if the noun is right.

**Sarah Kim:** What about `subscribe` for real-time? The spec mentions subscriptions using the same query model. I'd suggest: `list`, `get`, `create`, `update`, `delete`, `subscribe`. Clean, universal, no ORM jargon.

**Prof. Sharma:** I'd add `count` and `aggregate` for the semantic layer. Those are clearly read operations but distinct from `list`/`get`.

**Marcus Chen:** Agreed. My final recommendation for the client API vocabulary:

| Operation | Method | Persisted | Virtual | View | Session |
|-----------|--------|-----------|---------|------|---------|
| List | `list()` | ✅ | If handler defined | ✅ | ✅ |
| Get by ID | `get()` | ✅ | If handler defined | ✅ | ✅ |
| Create | `create()` | ✅ | If handler defined | ❌ | ✅ |
| Update | `update()` | ✅ | If handler defined | ❌ | ❌ |
| Delete | `delete()` | ✅ | If handler defined | ❌ | ✅ |
| Count | `count()` | ✅ | ❌ | ✅ | ❌ |
| Aggregate | `aggregate()` | ✅ | ❌ | ✅ | ❌ |
| Subscribe | `subscribe()` | ✅ | ❌ | ✅ | ❌ |

Operations not available for a type either don't appear in the TypeScript types (compile-time safety) or return a clear error at runtime.

---

## Topic 6: The Spectrum — Persisted / Virtual / View / Session

**Moderator:** Is this the right taxonomy? Missing types? Clear enough?

**Dr. Vasquez:** I think **Aggregate** is missing. In DDD, an aggregate is a cluster of entities with a root entity and a consistency boundary. An Order with OrderLines is an aggregate — you always load and save them together. The current spec doesn't distinguish between a standalone entity and an aggregate root.

**James Okafor:** That's a v2 concern. For v1, the entity + exposed relations handles the 80% case. Aggregate-level transactions are hard and I'd rather not over-engineer it. Developers can use handler overrides to enforce aggregate consistency manually.

**Sarah Kim:** I think **Projection** should be explicit, distinct from **View**. A view is a read-only slice of existing data. A projection is a materialized, eventually-consistent denormalization — like a read model in CQRS. They have different consistency semantics and different invalidation strategies.

**Marcus Chen:** For the target audience (full-stack JS/TS devs building SaaS), four types is already a lot to learn. I'd keep the taxonomy simple and let the docs explain nuances. Persisted, Virtual, View, Session covers the spectrum. If we need Projection later, it's a subtype of View.

**Prof. Sharma:** I agree with Marcus. Four types is the right number. But the naming could be clearer:

- **Persisted** → clear ✅
- **Virtual** → this word means "not real" in common English, which undersells it. Consider **Procedural**, **Composed**, or **Orchestrated**.
- **View** → clear, familiar from SQL views ✅
- **Session** → clear, but could also be called **Ephemeral** or **Transient** to emphasize the lifecycle

**James Okafor:** "Virtual" is fine. It's used in virtual DOM, virtual threads, virtual machines — developers understand "virtual = not backed by a physical thing." I wouldn't bikeshed this.

**Dr. Vasquez:** One thing I want to flag: the distinction between types should be *enforced*, not just documented. If a View entity accidentally gets a `create` handler, the type system should reject it. If a Session entity gets an `update` handler, the type system should reject it. The taxonomy only works if the compiler enforces the contracts.

**Marcus Chen:** Strong agree. The TypeScript types should make invalid states unrepresentable.

---

## Topic 7: Auth Flows as Entities

**Moderator:** The design proposes `EmailLogin`, `OAuthLogin` as virtual entities. Natural or forced?

**James Okafor:** Let me describe what other frameworks do. Rails: authentication is a controller concern — `SessionsController#create` handles login. Laravel: auth is a dedicated package (Breeze, Fortify) with its own route conventions. Next.js: NextAuth is a separate library with API routes. Django: `django.contrib.auth` with its own views.

None of them model auth as an entity. It's always a *special* thing.

**Marcus Chen:** But Stripe models authentication tokens as resources. You `POST /v1/tokens` to create an auth token. You `DELETE /v1/tokens/:id` to revoke one. The resource model works for auth primitives.

**Dr. Vasquez:** There's a key distinction: an auth *token* is a resource. A *login flow* is not. "Create a token" makes sense. "Create a login" is awkward — you're not creating a login, you're *authenticating*.

**Sarah Kim:** Auth flows have security properties that differ from normal entities. Rate limiting is critical. Timing attacks matter. Brute force protection requires stateful counting. If auth is just another entity, developers might miss these concerns. A dedicated auth system can enforce these safeguards by default.

**Prof. Sharma:** This is my SRP concern again. Authentication is a cross-cutting concern with unique security requirements. Flattening it into the entity model means either: (a) the entity system grows authentication-specific features (rate limiting per IP, lockout logic), violating SRP, or (b) developers build these safeguards manually in handlers, which they'll forget.

**James Okafor:** I'm persuaded. Auth should be a first-class module, not a virtual entity. The spec already mentions `createAuth()` with providers — that's the right pattern. Login flows, token management, session handling — these belong in a dedicated auth module with built-in security defaults. Let virtual entities handle business processes like checkout and onboarding, not security-critical flows.

**Marcus Chen:** I can accept that. Auth is special enough to deserve its own API surface. But I'd keep the *client API* consistent: `api.auth.login()` should feel like `api.user.create()` even if the server implementation is different.

**Dr. Vasquez:** Agreed. The auth module can expose an entity-like API surface without *being* an entity. Best of both worlds — consistent DX, proper separation of concerns.

---

## Conclusions

### Consensus Points (All 5 Agree)

1. **The unified API surface is the right idea.** Whether it's called entity or something else, having a single client API pattern (`api.thing.verb()`) across persisted data, business processes, and read models is a significant DX win. No expert argued against this.

2. **Deny-by-default access rules are excellent.** Every expert praised the Zeroth Law approach. No access rules = no access. This is the right default and better than any mainstream framework.

3. **`expose` for relations is the right design.** Secure by default, opt-in exposure. The Facade pattern applied correctly.

4. **Auth should NOT be a virtual entity.** Auth flows have unique security requirements that warrant a dedicated module. Virtual entities should handle business processes, not security primitives.

5. **The TypeScript type system must enforce the taxonomy.** If a View entity can't have `create`, the compiler should reject it. Invalid states should be unrepresentable.

6. **Client API should use `list`/`get` not `findMany`/`findOne`.** The ORM vocabulary is appropriate for the server-side DB layer. The client-facing API should use universally understood REST verbs.

### Split Decisions

**Naming: `entity()` — keep or rename?**

| Position | Advocates | Argument |
|----------|-----------|----------|
| **Keep `entity()`** | Marcus, James | Familiar, consistent, no perfect alternative. Document that "Vertz entity" is broader than DDD entity. The word is overloaded everywhere — own the Vertz definition. |
| **Split: `entity()` + `action()`** | Elena, Sarah | Reserve `entity()` for things with identity/state. Use `action()` or `process()` for virtual entities that are really commands/sagas. Respects established terminology. |
| **Keep `entity()` but add type labels** | Aditi | `entity('checkout', { type: 'process' })` — same function, explicit about what it is. Compiler can enforce per-type constraints. |

**Virtual entities: unified or separate abstraction?**

| Position | Advocates | Argument |
|----------|-----------|----------|
| **Unified (current design)** | Marcus, James | One concept, one API, one mental model. The Rails controller analogy holds — same abstraction, different behavior. Simplicity wins. |
| **Separate with shared interface** | Elena, Aditi, Sarah | Different things deserve different names. A thin adapter can present the same client API while the server-side definitions are honestly separate. Better for large codebases. |

### Recommendations

1. **Keep `entity()` as the function name** but seriously consider adding an explicit `type` field:
   ```ts
   entity('user', { type: 'persisted', table: ... })
   entity('checkout', { type: 'process', handlers: ... })
   entity('dashboard', { type: 'view', ... })
   entity('cart', { type: 'session', ... })
   ```
   This makes intent clear in code without splitting the API. The `virtual: true` boolean is less descriptive than `type: 'process'`.

2. **Client API vocabulary:** `list`, `get`, `create`, `update`, `delete`, `count`, `aggregate`, `subscribe`. Drop `findMany`/`findOne` from the client surface.

3. **Auth belongs in a dedicated module**, not as virtual entities. The client API can mirror entity patterns (`api.auth.login()`) without auth being an entity.

4. **Narrow the EntityContext interface** per entity type. Persisted entities get DB access. Virtual entities get service access. Views get read-only access. Use TypeScript conditional types or separate context interfaces.

5. **Enforce the taxonomy in the type system.** A `type: 'view'` entity should not compile if a `create` handler is defined. A `type: 'session'` should not compile with `update`.

6. **Document the pattern mapping clearly.** The docs should explicitly state: "Persisted entities use the Repository pattern. Virtual entities use the Command pattern. Views are read-only projections. Sessions are ephemeral state." Developers who know these patterns will feel grounded; developers who don't will learn good architecture.

7. **Consider `list`/`get` for routes too:** `GET /api/users` (list) and `GET /api/users/:id` (get) — use the verbs in the documentation and generated API docs. Don't mix `findMany` into route documentation.

### Risks Flagged

1. **Abstraction overload.** The biggest risk is that `entity()` tries to be everything — ORM, router, auth, RPC, semantic layer — and becomes a god object. Watch for the "one more feature" creep. Each addition should be measured against: "does this belong in the entity, or in a separate module?"

2. **Virtual entity consistency.** Developers will assume `checkout.create()` has the same transactional guarantees as `user.create()`. It doesn't. This needs prominent documentation, and ideally the type system should surface this difference (e.g., virtual create returns `Promise<Result<T>>` with explicit error states).

3. **List filtering with access rules.** The v1 approach (fetch page, filter in app, return fewer than requested) will cause pagination bugs in production. Teams will ship list endpoints that return 3 items when 20 were requested, confuse their frontend developers, and file GitHub issues. Prioritize SQL-level WHERE injection (planned for Phase 2) aggressively.

4. **LSP violations at runtime.** A client that iterates over all entities and calls `list()` will break on virtual entities that don't have a list handler. The REST endpoints should return `405 Method Not Allowed` (not `500`) for unsupported operations, and the generated SDK should omit unavailable methods from the type.

5. **Performance of per-row access checks.** For a list of 10,000 rows, running a synchronous access function per row is O(n). This is fine for small pages but will become a bottleneck for internal admin dashboards or export endpoints. The SQL-injection approach is essential for scale.

6. **The "entity" name will be debated forever.** Accept this. Ship with `entity()`, own the definition in docs, and don't let naming bikeshedding delay the launch. The API design is more important than the name.

7. **Framework lock-in perception.** The entity model is deeply opinionated. Unlike tRPC (which is just functions) or Prisma (which is just a query builder), adopting Vertz entities means structuring your entire backend around Vertz's conventions. This is fine — Rails has the same trade-off — but the docs should be honest about it and provide clear escape hatches (custom routes, raw DB access).

---

*End of transcript. This document should be revisited after Phase 1 implementation reveals which theoretical concerns manifest in practice.*
