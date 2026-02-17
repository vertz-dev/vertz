# Vertz Progressive Launch Content Calendar

## Overview

5-week progressive reveal. Each week adds a layer to the framework. Each layer is useful standalone; together they compound.

**Launch Date:** Week 1 begins immediately (Feb 16, 2026)
**Theme:** "Build in Public" — technical, confident, forward-looking

---

## Week 1: UI Library (@vertz/ui) — **Hero: Fine-Grained Reactivity Compiler**

**Focus:** The view layer — compiler-driven fine-grained reactivity

### Content

| Type | Title | Channel | Status |
|------|-------|---------|--------|
| Twitter Thread | "Building a UI framework from scratch..." | @vertzdev | Drafted |
| Blog Post | Title options + full post | vertz.dev/blog | Drafted |
| Docs Page | Getting Started | docs.vertz.dev | In Progress |

### Key Messages
- No virtual DOM — compiler handles reactivity
- Write plain `let` variables + JSX, get fine-grained updates
- Full framework features: routing, data fetching, styling, forms, primitives

### CTA
- GitHub: github.com/vertz-dev/vertz
- Docs: docs.vertz.dev
- Discord: join community

### Metrics to Track
- Tweet impressions, engagement rate
- Blog views, time on page
- GitHub stars (baseline)

---

## Week 2: Schema Validation (@vertz/schema) — **Hero: End-to-End Type Inference**

**Focus:** Type-safe validation — the bridge between runtime and compile-time

### Content

| Type | Title | Channel |
|------|-------|---------|
| Twitter Thread | "What if validation just worked?" | @vertzdev |
| Blog Post | "Why Your App Needs Schema Validation" | vertz.dev/blog |
| Docs Page | Validation Guide | docs.vertz.dev |

### Key Messages
- End-to-end type inference (like Zod, but integrated)
- Format validators (email, URL, UUID, ISO dates)
- JSON Schema generation for interoperability
- Schema registry for reusable definitions

### Code Example
```ts
const userSchema = s.object({
  name: s.string().min(1),
  email: s.string().email(),
  age: s.number().int().min(18),
});

type User = typeof userSchema._output;
// { name: string; email: string; age: number }
```

### Tease
- Connects to @vertz/ui forms (auto-validation)
- Connects to @vertz/server (request validation)
- **Next week:** Server layer

---

## Week 3: Server Layer (@vertz/server) — **Hero: Type-Safe RPC & Middleware**

**Focus:** Full-stack foundation — RPC, middleware, request handling

### Content

| Type | Title | Channel |
|------|-------|---------|
| Twitter Thread | "The missing layer between frontend and database" | @vertzdev |
| Blog Post | "Why Your Backend Needs a Compiler Too" | vertz.dev/blog |
| Docs Page | Server Quick Start | docs.vertz.dev |

### Key Messages
- Type-safe RPC between client and server
- Middleware system (auth, logging, rate limiting)
- Connects to @vertz/schema for request/response validation
- Foundation for entity-aware APIs

### Code Example
```ts
const moduleDef = createModuleDef({ name: 'users' });

moduleDef.router({ prefix: '/users' }).post('/', {
  body: createUserSchema,
  handler: (ctx) => {
    // ctx.body is fully typed
    return { created: true, user: { ... } };
  },
});
```

### Tease
- **Week 4:** Entities — the unified data model
- **Week 5:** Access control

---

## Week 4: Entities (The Data Layer) — **Hero: Unified Data Model**

**Focus:** Unified model for all data — persisted, virtual, views, sessions

### Content

| Type | Title | Channel |
|------|-------|---------|
| Twitter Thread | "Your data model is your API" | @vertzdev |
| Blog Post | "One Model for Database, Business Logic, and API" | vertz.dev/blog |
| Docs Page | Entity Guide | docs.vertz.dev |

### Key Messages
- Persisted entities (database-backed)
- Virtual entities (business processes like onboarding, checkout)
- Views (read-only projections)
- Session entities (ephemeral state)
- Unified API: `list`, `get`, `create`, `update`, `delete`

### Code Example
```ts
const User = entity('User', {
  type: 'persisted',
  fields: {
    id: field.uuid().primary(),
    email: field.string().unique(),
    name: field.string(),
  },
  relations: {
    posts: relation.many(Post),
  },
});
```

### Tease
- **Week 5:** Access control — unified permissions
- Real-time subscriptions (sneak peek)

---

## Week 5: Access Control — **Hero: Unified ctx.can() Permission System**

**Focus:** Unified security model — permissions, entitlements, row-level security

### Content

| Type | Title | Channel |
|------|-------|---------|
| Twitter Thread | "Security should be code, not configuration" | @vertzdev |
| Blog Post | "The Future of Access Control: Unified, Type-Safe, Compiled" | vertz.dev/blog |
| Docs Page | Access Control Guide | docs.vertz.dev |

### Key Messages
- Unified `ctx.can()` check for all auth decisions
- Hierarchical permissions (org → team → project → resource)
- Entitlements (`resource:action`)
- Plan-based limits
- Compiler generates RLS, role resolution

### Code Example
```ts
const permissions = definePermissions({
  admin: can('*').on('*'),
  member: can('read', 'Post').where((ctx, post) => 
    ctx.user.id === post.authorId
  ),
});
```

### Tease
- Full framework revealed — all pieces connect
- Cloud sneak peek (Vertz Cloud deployment)

---

## Summary Calendar

| Week | Dates | Package | Hero Feature | Content Type | Key CTA |
|------|-------|---------|-------------|--------------|---------|
| 1 | Feb 16-22 | @vertz/ui | Fine-Grained Reactivity Compiler | Thread + Blog + Docs | GitHub stars, Discord |
| 2 | Feb 23-Mar 1 | @vertz/schema | End-to-End Type Inference | Thread + Blog + Docs | npm downloads |
| 3 | Mar 2-8 | @vertz/server | Type-Safe RPC & Middleware | Thread + Blog + Docs | Community growth |
| 4 | Mar 9-15 | Entities | Unified Data Model | Thread + Blog + Docs | Early adopters |
| 5 | Mar 16-22 | Access Control | Unified ctx.can() Permission System | Thread + Blog + Docs | Beta signup |

---

## Priority B Alignment

> **Goal: By Fri Feb 20** — Week 1 content must be published and gathering momentum.

- **Feb 16 (Mon):** Launch Week 1 (@vertz/ui) — Hero: Fine-Grained Reactivity Compiler
- **Feb 18 (Wed):** Mid-week push - Twitter thread goes live, blog post published
- **Feb 20 (Fri):** Priority B deadline — Week 1 traction metrics collected

---

## Channel Strategy

| Platform | Purpose | Content Style |
|----------|---------|----------------|
| Twitter/X | Awareness, engagement | Short threads, code snippets, hot takes |
| Blog | Depth, SEO | Long-form, tutorial-style, technical |
| Discord | Community | Support, feedback, sneak peeks |
| GitHub | Trust, credibility | Code quality, docs, issues |
| Hacker News | Reach | Share blog posts |

---

## Key Milestones

- [ ] **Feb 16:** Week 1 content published
- [ ] **Feb 23:** Week 2 content published
- [ ] **Mar 2:** Week 3 content published
- [ ] **Mar 9:** Week 4 content published
- [ ] **Mar 16:** Week 5 content + full framework announcement
- [ ] **Mar 20:** v1.0.0 release candidate

---

## Notes

- Coordinate with Josh (DevRel) on launch narrative
- CTO quote: "When they look, they will see why Vertz, and why someone never thought about it"
- Track metrics weekly: stars, npm downloads, blog traffic, Discord members
- Adjust messaging based on community feedback
