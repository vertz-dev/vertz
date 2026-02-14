# Discussion: Full-Stack Unification

**Status:** 🟡 Open Discussion — needs research + input from Josh
**Raised by:** CTO (Vinicius), 2026-02-14
**Context:** Spawned from package consolidation discussion (see `plans/package-consolidation-proposal.md`)

## The Vision

vertz is a full-stack framework. The question isn't just "should we merge UI packages?" — it's **"should the entire stack be one package?"**

### CTO's Key Ideas

1. **Single `vertz` package** — UI + API + DB/ORM, all in one
2. **Entity-aware UI** — the UI layer can access database entities directly, type-safely
3. **Transcend the API/UI boundary** — not just "call an endpoint from the client" but deeply integrated, where the UI *knows* about your data model
4. **Better than Next.js /api** — Next's approach is untyped loose files. No modules, no DI, no scalability. vertz has `@vertz/core` with modules, middleware, DI — a real architecture
5. **Modules are the differentiator** — users can build robust APIs for external customers alongside their UI, using the same module system

### The Hard Question

If we bring the API into the same package:
- Users building a **robust external API** alongside their UI — does that work in a single package?
- Does the module system handle the separation cleanly enough?
- Or does it create confusion between "API for my UI" and "API for my customers"?

### Comparison Points

| Framework | Approach | Weakness |
|-----------|----------|----------|
| **Next.js** | `/api` directory, plain functions | No types across boundary, no modules, doesn't scale |
| **Remix** | Loaders/actions co-located with routes | Better, but still route-coupled, no standalone API |
| **tRPC + Next** | Typed RPC layer | Bolt-on, not native. Extra package, extra concepts |
| **Blitz.js** | Zero-API layer, direct DB access from UI | Tried this, struggled with complexity |
| **Rails** | Monolith with views | Proven model, but wrong language/era |
| **vertz (vision)** | Modules + entity-aware UI + typed boundary | TBD — this is what we're designing |

### What vertz Already Has

- `@vertz/core` — modules, DI, middleware, server, router (trie-based)
- `@vertz/db` — database provider, schema derivation from tables
- `@vertz/ui` — reactivity, components, client router, hydration
- `@vertz/ui-server` — SSR rendering, streaming, critical CSS
- `@vertz/schema` — type-safe schema definitions

The pieces exist. The question is: **how do they compose into one coherent developer experience?**

### Research Needed

1. **Entity-aware UI patterns** — how would a component declare "I need User data" and get type-safe access without manual fetch/endpoint wiring?
2. **Module boundaries in a unified package** — can `createModule()` cleanly separate "API module" from "UI module" in the same app?
3. **Build implications** — server code must not leak to client bundle. How does tree-shaking/code-splitting handle this in a single package?
4. **Developer mental model** — is "one package" actually simpler, or does it create confusion about what runs where?
5. **Blitz.js post-mortem** — they tried zero-API and pivoted. What went wrong? How do we avoid it?
6. **tRPC integration model** — their typed boundary is popular. Can vertz do this natively (without a separate layer)?

### Open Questions from CTO

- Should app definition be unified (like Next.js) or separate (monorepo)?
- How does "API for my UI" coexist with "API for external customers" in the same codebase?
- What's the ideal `create-vertz-app` output for a full-stack app?
- How entity-aware should the UI be? Direct DB access? Auto-generated typed clients? Something in between?

## Next Steps

- [ ] Josh: Research how Blitz, tRPC, Remix loaders, and Rails handle the API/UI boundary
- [ ] Josh: Propose what "entity-aware UI" could look like in vertz (API sketches)
- [ ] Team discussion with CTO once research is done
- [ ] This feeds into v2.0 architecture decisions

---

*This is a foundational design discussion. No code changes yet — research and proposals first.*
