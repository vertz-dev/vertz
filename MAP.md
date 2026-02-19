# Vertz — Project Map

> Single source of truth. If it's not linked here, it doesn't exist.  
> Last updated: 2026-02-18

---

## Company

### Vision & Strategy
- [Manifesto](MANIFESTO.md) — Why vertz exists
- [Vision](VISION.md) — Where we're going
- [Roadmap](#roadmap) — What ships when

### Team
- [User (CTO)](USER.md) — Vinicius Dacal, CTO & Co-founder
- [Mika (VP Eng)](SOUL.md) — Engineering leadership, process, architecture
- Agent team: ben (Tech Lead), ava, nora, josh, edson, riley, pm

### Process
- [Rules](/.claude/rules/) — Engineering rules (TDD, PRs, quality gates)
- [Task Assignment Checklist](/backstage/.claude/rules/task-assignment-checklist.md) — How agents pick up work
- [GitHub Projects Board](https://github.com/orgs/vertz-dev/projects/2) — Issue tracking

---

## Engineering

### Core Framework (ships now — v0.1)

The end-to-end story: schema → database → API → UI. One type system, zero seams.

| Package | What | Status | Design Docs |
|---|---|---|---|
| `@vertz/schema` | Schema definition & validation | 🟡 In progress | [Design](plans/vertz-schema-design.md), [Implementation](plans/vertz-schema-implementation.md) |
| `@vertz/db` | ORM — tables, queries, migrations | 🟡 In progress | [Design](plans/db-design.md), [Implementation](plans/db-implementation.md), [Integration](plans/db-integration-design.md), [Post-review](plans/post-implementation-reviews/vertz-db-v1.md) |
| `@vertz/server` | REST framework — routes, middleware, context | 🟡 In progress | [Core API](plans/vertz-core-api-design.md), [Entity API](plans/entity-aware-api.md), [Cloud Arch](plans/cloud-architecture.md) |
| `@vertz/ui` | UI components, JSX rendering | 🟡 In progress | [Design](plans/ui-design.md), [Implementation](plans/ui-implementation.md), [Post-review](plans/post-implementation-reviews/vertz-ui-v1.md) |
| `@vertz/ui` (SSR) | Server rendering, streaming | 🟡 In progress | [renderPage](plans/render-page.md), [Implementation](plans/render-page-implementation.md), [Zero-config SSR](plans/ssr-zero-config.md) |
| `@vertz/core` | Runtime, app-runner, request handling | 🟡 In progress | [Design](plans/vertz-core-api-design.md), [Implementation](plans/vertz-core-implementation.md), [Features](plans/vertz-features.md) |
| `@vertz/errors` | Result type, AppError, domain errors | ✅ Shipped | [Error Taxonomy](plans/error-taxonomy.md), [Result Boundaries](plans/result-boundaries.md), [Errors-as-Values RFC](plans/errors-as-values.md) |
| `@vertz/cli` | Project scaffolding, dev server, migrations | 🟡 In progress | [Design](plans/cli/cli-design.md), [Phases 1-11](plans/cli/) |
| `@vertz/compiler` | Build-time codegen & transforms | 🟡 In progress | [Design](plans/vertz-compiler-design.md), [Codegen](plans/codegen-design.md) |
| `@vertz/testing` | Test utilities & patterns | 🟡 In progress | [Design](plans/vertz-testing-design.md), [Implementation](plans/vertz-testing-implementation.md) |
| `@vertz/cloudflare` | Cloudflare Workers adapter | ✅ Shipped | [Adapter](plans/cloudflare-adapter.md) |

### Designed Features (ships later — v0.2+)

All designed, all documented. Implementations come after core is solid.

| Feature | What | Design Docs | Research |
|---|---|---|---|
| **Authentication** | JWT sessions, email/password, OAuth, MFA | [Phase 1 Spec](plans/auth-module-spec.md), [Phase 2 Spec](plans/auth-phase2-spec.md), [Strategy Research](plans/auth-strategy-research.md) | [Blimu Auth Model](memory/research/blimu-auth-model.md) |
| **Authorization / RBAC** | `ctx.can()`, entitlements, role inheritance | [Access System](plans/access-system.md) | [Blimu Auth Model](memory/research/blimu-auth-model.md) |
| **Multi-tenancy** | `d.tenant()` auto-scoping, query isolation | [DB Design](plans/db-design.md) | [Blimu Data Layer](memory/research/blimu-data-layer.md) |
| **Row-Level Security** | Postgres RLS as code | [DB Design](plans/db-design.md) | — |
| **Resource Hierarchy** | Closure tables, O(1) ancestry lookups | [Access System](plans/access-system.md) | [Blimu Auth Model](memory/research/blimu-auth-model.md) |
| **Plans & Billing** | Plan-gated entitlements, consumption wallets | [Access System](plans/access-system.md) | [Blimu Data Layer](memory/research/blimu-data-layer.md) |
| **Entity-Aware API** | Typed CRUD protocol, DB↔UI bridge | [Design](plans/entity-aware-api.md), [PRD](backstage/plans/prds/entity-aware-protocol.md), [CRUD Pipeline PRD](backstage/plans/prds/crud-pipeline.md) | [Expert Debate](plans/entity-api-expert-debate.md) |
| **Result Boundaries** | Where Result vs throw, auto HTTP mapping | [Result Boundaries](plans/result-boundaries.md) | [Debate Papers](plans/debate-result-advocate.md) |
| **Async Data / Suspense** | `query()`, streaming, auto-skeletons | [Async Data Design](plans/async-data-design.md) | [SSR Research](memory/research/) |
| **Canvas** | JSX-based canvas rendering | [Phase 1](plans/canvas-phase-1.md) | — |
| **Client SDK** | `@vertz/client` with typed errors | — (not yet designed) | — |

### Cross-Cutting Decisions

| Decision | Summary | Doc |
|---|---|---|
| Error model | Three layers: infra (throw) → domain (Result) → developer (compile-time) | [Error Taxonomy](plans/error-taxonomy.md) |
| Result type | `@vertz/errors` Result wins. Plain objects, `code`-based HTTP mapping. | [Result Boundaries](plans/result-boundaries.md) |
| Schema validation | `parse()` → Result, `assert()` → throw | [Result Boundaries](plans/result-boundaries.md) |
| DB errors | Stay as interfaces + factory functions, NOT classes | [Result Boundaries](plans/result-boundaries.md) |
| Skeleton delay | 200ms global default, per-query override | [Async Data Design](plans/async-data-design.md) |
| Auto-inferred skeletons | Framework generates from JSX structure (L1 for v1) | [Async Data Design](plans/async-data-design.md) |
| Auth approach | Build in-house (CTO has Blimu experience), NOT wrap Better Auth | Memory: 2026-02-18 |
| Multi-tenancy | `d.tenant()` auto-scoping + closure tables (from Blimu) | Memory: 2026-02-18 |
| Test infrastructure | Embedded Postgres (pglite), NOT Docker | Memory: 2026-02-18 |
| CI pipeline | `bun run ci` before every push (lefthook enforced) | [Pre-push script](scripts/pre-push.sh) |

---

## Infrastructure

| What | Where | Notes |
|---|---|---|
| Monorepo | `vertz-dev/vertz` | Turborepo + Bun |
| CI | `.github/workflows/ci.yml` | Lint + build + typecheck + test |
| Release | `.github/workflows/release.yml` | Changesets + npm provenance |
| Pre-push gate | `lefthook.yml` + `scripts/pre-push.sh` | Full CI locally |
| Bot auth | `backstage/bots/git-as.sh` | Bot identity for git/GitHub |
| Docker | `docker-compose.yml` | Postgres 16 (dev + test DBs) |

---

## Research Archive

| Topic | File | Date |
|---|---|---|
| Blimu auth/access model | [blimu-auth-model.md](memory/research/blimu-auth-model.md) | 2026-02-18 |
| Blimu data layer | [blimu-data-layer.md](memory/research/blimu-data-layer.md) | 2026-02-18 |
| Error taxonomy research | [error-taxonomy-research.md](memory/research/error-taxonomy-research.md) | 2026-02-18 |
| SSR/Suspense — SolidJS | [ssr-suspense-solidjs.md](memory/research/ssr-suspense-solidjs.md) | 2026-02-18 |
| SSR/Suspense — Qwik | [ssr-suspense-qwik.md](memory/research/ssr-suspense-qwik.md) | 2026-02-18 |
| SSR/Suspense — React/Next | [ssr-suspense-react-nextjs.md](memory/research/ssr-suspense-react-nextjs.md) | 2026-02-18 |
| SSR/Suspense — Astro | [ssr-suspense-astro.md](memory/research/ssr-suspense-astro.md) | 2026-02-18 |
| SSR/Suspense — TanStack Query | [ssr-suspense-tanstack-query.md](memory/research/ssr-suspense-tanstack-query.md) | 2026-02-18 |
| SSR Research Summary | [README.md](memory/research/README.md) | 2026-02-18 |

---

## Design Reviews

| Doc Reviewed | Round | Files |
|---|---|---|
| Result Boundaries v1 | DX, Arch, Devil's Advocate | `plans/reviews/result-boundaries-*-review.md` |
| Result Boundaries v2 | DX, Arch, Devil's Advocate | `plans/reviews/result-boundaries-v2-*-review.md` |
| Result Boundaries v3 | DX, Arch, Devil's Advocate | `plans/reviews/result-boundaries-v3-*-review.md` |
| Result Types Audit | Code audit | `plans/reviews/result-types-audit.md` |

---

## Debate Papers

Position papers from structured design debates:

| Topic | Positions | Winner |
|---|---|---|
| Service error handling | [Result](plans/debate-result-advocate.md), [Throw](plans/debate-throw-advocate.md), [Hybrid](plans/debate-hybrid-advocate.md) | Result with `code`-based mapping |

---

## Roadmap

### v0.1 — "End-to-End" (current focus)
Get schema → DB → API → UI working. Someone can build an app.
- [ ] ORM with migrations, queries, type-safe schema
- [ ] REST server with routes, middleware, context
- [ ] UI with JSX components and SSR
- [ ] CLI for scaffolding and dev workflow
- [ ] Error system with Result type
- [ ] At least one deployment target (Cloudflare)

### v0.2 — "Production Ready"
Add what apps need to go to production.
- [ ] Authentication (JWT, OAuth)
- [ ] Authorization (`ctx.can()`, RBAC)
- [ ] `d.tenant()` auto-scoping
- [ ] Async data / `query()` with streaming
- [ ] Client SDK with typed errors

### v0.3+ — "Enterprise"
- [ ] Resource hierarchy with closure tables
- [ ] Row-level security as code
- [ ] Plans & billing integration
- [ ] Consumption wallets
- [ ] MFA, passkeys

---

## Memory

- **Daily logs:** `memory/YYYY-MM-DD.md` — raw session notes
- **Long-term:** `MEMORY.md` — curated knowledge
- **Research:** `memory/research/` — deep dives and competitive analysis

---

## Full Design Inventory

**[plans/DESIGN-INVENTORY.md](plans/DESIGN-INVENTORY.md)** — Complete list of all 91 documents with status, category, and package. Use this when the tables above don't have what you need.

---

## How to Use This Map

1. **Looking for a design decision?** → Check [Cross-Cutting Decisions](#cross-cutting-decisions)
2. **Looking for a design doc?** → Check the package table or feature table
3. **Looking for research?** → Check [Research Archive](#research-archive)
4. **Looking for the current priority?** → Check [Roadmap](#roadmap)
5. **Want to add something?** → Add it here first, then write the doc

**Rule: If it's not in MAP.md, it's not findable. Update this when you create new docs.**
