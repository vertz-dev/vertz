# vertz Design Docs Map

> Central index of active design work, architectural decisions, and reference material.
> Last updated: 2026-03-14
>
> For the full categorized index of all plans (including archived), see [plans/README.md](plans/README.md).
> Shipped designs live in [plans/archived/](plans/archived/).

---

## Active Work

Features currently being implemented or with approved implementation in progress.

| Doc | Status | Description |
|-----|--------|-------------|
| [Action Standalone Cleanup](plans/action-standalone-cleanup.md) | 🔄 In Progress | Implement `action()` with entity DI, remove modules/routers from public API |
| [Cross-File Reactivity Analysis](plans/cross-file-reactivity-analysis.md) | 🔄 Approved | Fix cross-file signal wrapping bugs in the compiler |
| [Library Build Plan](plans/library-build-plan.md) | 🔄 Approved | Bun plugin for library compilation with transforms |
| [Linear Clone](plans/linear-clone.md) | 🔄 In Progress | Linear clone as primary Vertz showcase app |
| [Linear Clone: Projects & Issues](plans/linear-clone-projects-issues.md) | 🔄 In Progress | Add Projects & Issues entities to Linear clone |
| [Security Auth Hardening (Impl)](plans/security-auth-hardening-implementation.md) | 🔄 Ready | Signup privilege stripping and session hardening |
| [SQLite Dialect Impl Spec](plans/sqlite-dialect-impl-spec.md) | 🔄 Ready | SQLite dialect implementation — 5 phases |

---

## Entity/Domain Layer

| Doc | Status | Description |
|-----|--------|-------------|
| [Tenant Isolation & Entity Access](plans/tenant-isolation-and-entity-access.md) | 📋 Approved | Descriptor-based access rules + automatic tenant scoping |
| [955 — Move Tenant to Model](plans/955-move-tenant-to-model.md) | 📋 Approved | Move tenant scoping to model-level `d.model` |
| [Indirect Tenant Scoping](plans/indirect-tenant-scoping.md) | 📋 Approved | Auto-filter entities via relation chains |
| [Action Standalone Cleanup](plans/action-standalone-cleanup.md) | 🔄 In Progress | Entity-scoped `action()`, remove modules/routers |

---

## Entity Store & Client Reactivity

| Doc | Status | Description |
|-----|--------|-------------|
| [VertzQL Auto Field Selection](plans/vertzql-auto-field-selection.md) | 📋 Draft (Rev 2) | Compiler-driven query narrowing: automatic `select` injection based on field access analysis |
| [1268 — SDK Expose Types](plans/1268-sdk-expose-types.md) | 📋 Draft | SDK types reflect entity `expose.select` for end-to-end type safety |

---

## Error Handling

| Doc | Status | Description |
|-----|--------|-------------|
| [Errors-as-Values Unification](plans/errors-as-values-unification.md) | 📋 Approved | Consolidate Result type, error classes, `matchError()` across the stack. Tickets #532-537. |

---

## SSR & Rendering

| Doc | Status | Description |
|-----|--------|-------------|
| [SSR Zero Config](plans/ssr-zero-config.md) | 📋 Draft | Zero-config SSR setup |
| [SSR Per-Request Isolation](plans/ssr-per-request-isolation.md) | 📋 Approved | Dependency inversion for SSR isolation, mutex bottleneck removal |
| [Server-Rendered Client Navigations](plans/server-rendered-client-navigations.md) | 📋 Approved | Server-rendered data for client navigations via SSE |
| [Server Nav Implementation](plans/server-nav-implementation.md) | 📋 Approved | Data-only pre-fetch via SSE for client navigations |
| [Component Streaming](plans/component-streaming.md) | 📋 Draft | Stream resolved data for slow SSR queries |
| [Hydration JSX Children Thunks](plans/hydration-jsx-children-thunks.md) | 📋 Approved | Compiler children thunk wrapping for hydration |
| [Hydration JSX Ordering](plans/hydration-jsx-ordering.md) | 📋 Draft | Fix evaluation order conflict between JSX and hydration |
| [Universal Rendering Model](plans/universal-rendering-model.md) | 📋 Draft | One pipeline for CSR/SSR/hydration |
| [Server-Only Components](plans/server-only-components.md) | 📋 Approved | Islands architecture for static/interactive separation |

---

## UI Layer

| Doc | Status | Description |
|-----|--------|-------------|
| [UI Auth System](plans/ui-auth-system.md) | 📋 Approved | Client-side auth session management |
| [Canvas Phase 2](plans/canvas-phase-2.md) | 📋 Draft | JSX-based canvas rendering on PixiJS |
| [Browser Platform APIs](plans/browser-platform-apis.md) | 📋 Draft | Replace JS polyfills with native browser APIs |
| [Theme System Architecture](plans/theme-system-architecture.md) | 📋 Approved | Primitive-based theme with shadcn inspiration |
| [Typed Views / Semantic Layer](plans/typed-views-semantic-layer.md) | 📋 Draft | Typed views as primary read abstraction |
| [Catalog Router Refactor](plans/catalog-router-refactor.md) | 📋 Draft | Replace manual routing in catalog with RouterView |

---

## Compiler

| Doc | Status | Description |
|-----|--------|-------------|
| [Cross-File Reactivity Analysis](plans/cross-file-reactivity-analysis.md) | 🔄 Approved | Fix cross-file signal wrapping bugs |
| [Library Build Plan](plans/library-build-plan.md) | 🔄 Approved | Bun plugin for library compilation |

---

## Schema & Database

| Doc | Status | Description |
|-----|--------|-------------|
| [SQLite Dialect Design](plans/sqlite-dialect-design.md) | 📋 Approved | SQLite dialect abstraction design (v3) |
| [SQLite Dialect Impl Spec](plans/sqlite-dialect-impl-spec.md) | 🔄 Ready | Implementation spec — 5 phases |
| [Schema Migrations Architecture](plans/migration-system-architecture.md) | 📋 Draft | Unify auto-migrate and file-based migrations |
| [Schema Migrations Design](plans/design-schema-migrations.md) | 📋 Draft | Schema migration system design |
| [Schema Migrations PRD](plans/prd-schema-migrations.md) | 📋 Reference | Product requirements for schema migrations |
| [Schema Migrations Review](plans/adversarial-review-schema-migrations.md) | 📋 Reference | Adversarial review — verdict: needs major revision |
| [Auto-Migrate Dev Server](plans/auto-migrate-dev-server.md) | 📋 Draft | Wire auto-migrate into dev server pipeline |

---

## Auth & Access

| Doc | Status | Description |
|-----|--------|-------------|
| [Tenant Isolation & Entity Access](plans/tenant-isolation-and-entity-access.md) | 📋 Approved | Bridge entity access to `rules.*` descriptors, automatic tenant scoping |
| [955 — Move Tenant to Model](plans/955-move-tenant-to-model.md) | 📋 Approved | Move tenant scoping to model-level |
| [Security Auth Hardening](plans/security-auth-hardening.md) | 📋 Approved | Framework-owned privilege protection design |
| [Security Auth Hardening (Impl)](plans/security-auth-hardening-implementation.md) | 🔄 Ready | Implementation plan for auth hardening |
| [DB-Backed Auth Stores](plans/db-backed-auth-stores.md) | 📋 Approved | DB persistence layer for auth stores |
| [UI Auth System](plans/ui-auth-system.md) | 📋 Approved | Client-side auth session management |

### User-Facing Docs

| Doc | Status | Description |
|-----|--------|-------------|
| [Server Auth & Access Guide](packages/docs/guides/server/auth.mdx) | ✅ Done | Authentication, `defineAccess()`, plans, `canAndConsume()` |
| [Client Access Control Guide](packages/docs/guides/ui/access-control.mdx) | ✅ Done | `can()`, `AccessGate`, SSR hydration, denial reasons |

---

## Routing

| Doc | Status | Description |
|-----|--------|-------------|
| [Route Param Schemas](plans/route-param-schemas.md) | 📋 Approved | Schema-based route param parsing and validation |

---

## Cloud & Deployment

| Doc | Status | Description |
|-----|--------|-------------|
| [Entity-Todo Cloudflare Deployment](plans/entity-todo-cloudflare-deployment.md) | 📋 Draft | Deploy entity-todo on Cloudflare Workers |
| [Platform Agnosticism Audit](plans/platform-agnosticism-runtime-audit.md) | 📋 Draft | Guard Node.js-specific APIs in runtime packages |

---

## Infrastructure

| Doc | Status | Description |
|-----|--------|-------------|
| [Package Runtime Hardening](plans/package-runtime-hardening.md) | 📋 Draft | Cross-package distribution and runtime hardening |
| [Package Runtime Hardening (Impl)](plans/package-runtime-hardening-implementation.md) | 📋 Draft | Implementation plan for package distribution |
| [Raw Service Actions](plans/raw-service-actions.md) | 📋 Draft | Content descriptors for non-JSON service actions |

---

## Reference

| Doc | Description |
|-----|-------------|
| [API Cheat Sheet](plans/api-cheat-sheet-current.md) | Current state of package APIs |
| [Auth UI Framework Gaps](plans/auth-ui-framework-gaps.md) | Patterns from Linear clone for framework elevation |
| [Docs: Entity Field Exposure](plans/docs-entity-field-exposure.md) | Documentation page for field exposure and relations |
| [Codegen & Services Audit](plans/audits/codegen-and-services-audit.md) | Codegen audit |

---

## Showcase Apps

| Doc | Status | Description |
|-----|--------|-------------|
| [Linear Clone](plans/linear-clone.md) | 🔄 In Progress | Primary Vertz showcase app |
| [Linear Clone: Projects & Issues](plans/linear-clone-projects-issues.md) | 🔄 In Progress | Projects & Issues CRUD for Linear clone |

---

## Decisions

| Doc | Date | Description |
|-----|------|-------------|
| [Entity-First Architecture](plans/decisions/2026-02-20-entity-first-architecture.md) | 2026-02-20 | Entities are THE way to build APIs. Modules/routers deprecated → removed. |

---

## Retrospectives

See [plans/post-implementation-reviews/](plans/post-implementation-reviews/) for shipped feature retrospectives.

---

## Legend

| Icon | Meaning |
|------|---------|
| ✅ | Done / Shipped |
| 🔄 | In Progress / Ready for implementation |
| 📋 | Draft / Approved but not started |
| ⏸️ | Blocked / Paused |
