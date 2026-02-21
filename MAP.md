# vertz Design Docs Map

> Central index of architectural decisions, specs, and design debates.
> **If it's not here, it's not findable.** Update this file when creating new docs.

---

## Entity/Domain Layer

| Doc | Status | Description |
|-----|--------|-------------|
| [Entity-Driven Architecture (EDA)](plans/entity-driven-architecture.md) | 🔄 In Progress | Foundational design: entity(), action(), service(), domain(). DDD alignment, REST/HATEOAS, VertzQL. PR #455. |
| [Entity Analyzer Design](plans/entity-analyzer-design.md) | ✅ Approved | Compiler analyzer for entity() calls — static extraction, IR emission, schema resolution, SDK codegen. |
| [Entity Analyzer Impl Spec](plans/entity-analyzer-impl-spec.md) | 🔄 In Progress | Implementation spec — 66 tests, 6 parts. Issue #471. |
| [Entity-Aware API](plans/entity-aware-api.md) | 📋 Draft | Entity-aware API layer design |
| [Entity-Aware API Review: REST](plans/entity-aware-api-review-rest.md) | ✅ Done | REST perspective review |
| [Entity-Aware API Review: GraphQL](plans/entity-aware-api-review-graphql.md) | ✅ Done | GraphQL perspective review |
| [Entity API Expert Debate](plans/entity-api-expert-debate.md) | ✅ Done | Expert debate on entity API design |
| [Entity Phase 1 Spec](plans/entity-phase1-spec.md) | ✅ Done | Phase 1 implementation spec |

---

## Entity Store & Client Reactivity

| Doc | Status | Description |
|-----|--------|-------------|
| [Entity Store Design](plans/entity-store-design.md) | ✅ Approved | Normalized entity cache, signal-per-entity, compiler-inferred field selection, SSR data bridge. |
| [Entity Store Impl Spec](plans/entity-store-impl-spec.md) | ✅ Done | Implementation spec. PR #466 merged. |
| [Cross-Component Tracing Spec](plans/cross-component-tracing-spec.md) | ✅ Done | Compiler extension for entity data flow across components. PR #467 merged. |

### Entity Store Reviews

| Doc | Status | Description |
|-----|--------|-------------|
| [DX Skeptic](plans/reviews/entity-store-review-dx-skeptic.md) | ✅ Done | josh — debugging visibility, testing story |
| [Devil's Advocate](plans/reviews/entity-store-review-devils-advocate.md) | ✅ Done | SSR isolation, memory scaling |
| [Compiler Expert](plans/reviews/entity-store-review-compiler-expert.md) | ✅ Done | Opaque fallback rate, computed selector overhead |
| [Impl Spec (Tech Lead)](plans/reviews/entity-store-impl-spec-review-tech-lead.md) | ✅ Done | ben — batch+untrack, merge semantics |
| [Tracing Spec (Tech Lead)](plans/reviews/cross-component-tracing-spec-review-tech-lead.md) | ✅ Done | ben — rest params, filter chains |

### Entity Analyzer Reviews

| Doc | Status | Description |
|-----|--------|-------------|
| [Compiler Expert](plans/reviews/entity-analyzer-review-compiler-expert.md) | ✅ Done | AST extraction, IR design, schema resolution |
| [DX Skeptic](plans/reviews/entity-analyzer-review-dx-skeptic.md) | ✅ Done | SDK output, error messages, debugging story |
| [Devil's Advocate](plans/reviews/entity-analyzer-review-devils-advocate.md) | ✅ Done | Architectural risk, scalability, alternatives |
| [Tech Lead](plans/reviews/entity-analyzer-review-tech-lead.md) | ✅ Done | Implementability, schema feasibility, risk areas |
| [Impl Spec (Tech Lead)](plans/reviews/entity-analyzer-impl-spec-review-tech-lead.md) | ✅ Done | 8 blocking issues → all addressed |

---

## Error Handling

| Doc | Status | Description |
|-----|--------|-------------|
| [Errors-as-Values Unification](plans/errors-as-values-unification.md) | ✅ Approved | Consolidate Result type, error classes, matchError() utility across fetch/server/entities/codegen. Tickets #532-537. |
| [Result Boundaries v3](plans/result-boundaries.md) | ✅ Approved | Where Result stops and throwing begins. |
| [Errors as Values](plans/errors-as-values.md) | 📋 Draft | Error-as-values philosophy |
| [Result Types Audit](plans/reviews/result-types-audit.md) | ✅ Done | Result type usage audit |

---

## Async Data & SSR

| Doc | Status | Description |
|-----|--------|-------------|
| [Async Data Design](plans/async-data-design.md) | ✅ Approved | Suspense model, SSR streaming, auto-skeletons. |
| [SSR Zero Config](plans/ssr-zero-config.md) | 📋 Draft | Zero-config SSR |
| [Render Page Design](plans/render-page.md) | 📋 Draft | renderPage API |
| [Render Page Implementation](plans/render-page-implementation.md) | ✅ Done | renderPage impl |
| [Retro: SSR DX Gap](plans/retro-ssr-dx-gap.md) | ✅ Done | SSR DX retrospective |

---

## UI Layer

| Doc | Status | Description |
|-----|--------|-------------|
| [UI Design](plans/ui-design.md) | 📋 Draft | UI framework design |
| [UI Implementation](plans/ui-implementation.md) | 📋 Draft | UI implementation |
| [UI Competitive Analysis](plans/ui-competitive-analysis.md) | 📋 Draft | Competitor comparison |
| [Form API — SDK Schema Integration](plans/form-attrs-api-improvement.md) | 📋 Draft | Declarative forms with SDK schema integration, progressive enhancement |
| [Canvas Phase 1](plans/canvas-phase-1.md) | ✅ Done | Canvas rendering phase 1 |
| [Canvas Phase 2](plans/canvas-phase-2.md) | 📋 Draft | Canvas phase 2 |
| [Browser Platform APIs](plans/browser-platform-apis.md) | 📋 Draft | Browser APIs |

---

## Compiler

| Doc | Status | Description |
|-----|--------|-------------|
| [Compiler Design](plans/vertz-compiler-design.md) | 📋 Draft | Compiler architecture |

---

## Schema & Database

| Doc | Status | Description |
|-----|--------|-------------|
| [Schema Design](plans/vertz-schema-design.md) | 📋 Draft | Schema system |
| [Schema Implementation](plans/vertz-schema-implementation.md) | 📋 Draft | Schema impl |
| [Database Design](plans/db-design.md) | 📋 Draft | Database layer |
| [Database Implementation](plans/db-implementation.md) | 📋 Draft | DB impl |
| [DB Integration Design](plans/db-integration-design.md) | 📋 Draft | DB integration |

---

## Auth & Access

| Doc | Status | Description |
|-----|--------|-------------|
| [Auth Module Spec](plans/auth-module-spec.md) | ⏸️ Blocked | Deprioritized to v0.2 |
| [Auth Phase 2 Spec](plans/auth-phase2-spec.md) | ⏸️ Blocked | Blocked on auth module |
| [Access System](plans/access-system.md) | 📋 Draft | Access control |

---

## Cloud & Deployment

| Doc | Status | Description |
|-----|--------|-------------|
| [Cloud Architecture](plans/cloud-architecture.md) | 📋 Draft | Cloud platform (v0.3+) |
| [Cloudflare Adapter](plans/cloudflare-adapter.md) | ✅ Done | Cloudflare Workers adapter |
| [Publish CLI Spec](plans/vertz-publish-spec.md) | 📋 Draft | `vertz publish` command |

---

## Codegen & Services

| Doc | Status | Description |
|-----|--------|-------------|
| [Codegen Design](plans/codegen-design.md) | 📋 Draft | Code generation system |
| [Codegen & Services Audit](plans/audits/codegen-and-services-audit.md) | ✅ Done | Codegen audit |
| [API Cheat Sheet](plans/api-cheat-sheet-current.md) | ✅ Done | Current API surface |

---

## Testing

| Doc | Status | Description |
|-----|--------|-------------|
| [Testing Design](plans/vertz-testing-design.md) | 📋 Draft | Testing framework |
| [Testing Implementation](plans/vertz-testing-implementation.md) | 📋 Draft | Testing impl |
| [Integration Tests](plans/integration-tests.md) | 📋 Draft | Integration strategy |

### E2E Testing DX Debates

| Doc | Status | Description |
|-----|--------|-------------|
| [Hybrid DSL](plans/debate-e2e-testing-dx-hybrid-dsl.md) | 📋 Draft | Hybrid DSL for E2E |
| [Natural Language](plans/debate-e2e-testing-dx-natural-language.md) | 📋 Draft | NL test authoring |
| [Type-Safe](plans/debate-e2e-testing-dx-type-safe.md) | 📋 Draft | Type-safe tests |

### Framework DX Debates

| Doc | Status | Description |
|-----|--------|-------------|
| [Explicit Control](plans/debate-e2e-dx-explicit-control.md) | 📋 Draft | Explicit vs implicit |
| [LLM-Native](plans/debate-e2e-dx-llm-native.md) | 📋 Draft | LLM-native tooling |
| [Zero Boilerplate](plans/debate-e2e-dx-zero-boilerplate.md) | 📋 Draft | Zero-boilerplate |

---

## Infrastructure & Process

| Doc | Status | Description |
|-----|--------|-------------|
| [Design Inventory](plans/DESIGN-INVENTORY.md) | ✅ Done | 91 documents catalogued |
| [Release Automation](plans/release-automation.md) | 📋 Draft | Release workflow |
| [Turborepo Migration](plans/turborepo-migration.md) | 📋 Draft | Build migration |
| [Dagger CI Migration](plans/dagger-ci-migration.md) | 📋 Draft | CI migration |
| [Priority Queue](plans/priority-queue.md) | 📋 Draft | Task prioritization |

---

## Decisions

| Doc | Date | Description |
|-----|------|-------------|
| [Entity-First Architecture](plans/decisions/2026-02-20-entity-first-architecture.md) | 2026-02-20 | Entities are THE way to build APIs. Modules/routers deprecated → removed. Compiler portability to Zig/Bun planned. |

---

## Legend

| Icon | Meaning |
|------|---------|
| ✅ | Done / Approved / Merged |
| 🔄 | In Progress |
| 📋 | Draft |
| ⏸️ | Blocked / Paused |
