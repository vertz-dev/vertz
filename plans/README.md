# Design Docs & Plans

> Last updated: 2026-03-14

## Active Work

Plans currently being implemented or with approved implementation in progress.

| Plan | Description |
|------|-------------|
| [action-standalone-cleanup](./action-standalone-cleanup.md) | Implement `action()` with entity DI, remove modules/routers from public API |
| [cross-file-reactivity-analysis](./cross-file-reactivity-analysis.md) | Fix cross-file signal wrapping bugs in the compiler |
| [library-build-plan](./library-build-plan.md) | Bun plugin for library compilation with transforms |
| [linear-clone](./linear-clone.md) | Linear clone as primary Vertz showcase app |
| [linear-clone-projects-issues](./linear-clone-projects-issues.md) | Add Projects & Issues entities to Linear clone |
| [security-auth-hardening-implementation](./security-auth-hardening-implementation.md) | Signup privilege stripping and session hardening |
| [sqlite-dialect-impl-spec](./sqlite-dialect-impl-spec.md) | SQLite dialect implementation — 5 phases |

## Approved / Ready for Implementation

Design reviewed, approved, and ready to be picked up.

| Plan | Description |
|------|-------------|
| [955-move-tenant-to-model](./955-move-tenant-to-model.md) | Move tenant scoping to model-level `d.model` |
| [db-backed-auth-stores](./db-backed-auth-stores.md) | DB persistence layer for auth stores |
| [errors-as-values-unification](./errors-as-values-unification.md) | Unify error handling across the stack |
| [hydration-jsx-children-thunks](./hydration-jsx-children-thunks.md) | Compiler children thunk wrapping for hydration |
| [indirect-tenant-scoping](./indirect-tenant-scoping.md) | Auto-filter entities via relation chains |
| [route-param-schemas](./route-param-schemas.md) | Schema-based route param parsing and validation |
| [security-auth-hardening](./security-auth-hardening.md) | Framework-owned privilege protection design |
| [server-nav-implementation](./server-nav-implementation.md) | Data-only pre-fetch via SSE for client navigations |
| [server-rendered-client-navigations](./server-rendered-client-navigations.md) | Server-rendered data for client navigations |
| [sqlite-dialect-design](./sqlite-dialect-design.md) | SQLite dialect abstraction design |
| [ssr-per-request-isolation](./ssr-per-request-isolation.md) | Dependency inversion for SSR isolation |
| [tenant-isolation-and-entity-access](./tenant-isolation-and-entity-access.md) | Descriptor-based access rules + auto tenant filtering |
| [theme-system-architecture](./theme-system-architecture.md) | Primitive-based theme with shadcn inspiration |
| [ui-auth-system](./ui-auth-system.md) | Client-side auth session management |

## Design Draft

In design discussion — not yet approved for implementation.

| Plan | Description |
|------|-------------|
| [1268-sdk-expose-types](./1268-sdk-expose-types.md) | SDK types reflect entity expose.select config |
| [auto-migrate-dev-server](./auto-migrate-dev-server.md) | Wire auto-migrate into dev server pipeline |
| [browser-platform-apis](./browser-platform-apis.md) | Replace JS polyfills with native browser APIs |
| [canvas-phase-2](./canvas-phase-2.md) | JSX-based canvas rendering on PixiJS |
| [component-streaming](./component-streaming.md) | Stream resolved data for slow SSR queries |
| [design-schema-migrations](./design-schema-migrations.md) | Schema migration system design |
| [entity-todo-cloudflare-deployment](./entity-todo-cloudflare-deployment.md) | Deploy entity-todo on Cloudflare Workers |
| [hydration-jsx-ordering](./hydration-jsx-ordering.md) | Fix evaluation order conflict between JSX and hydration |
| [migration-system-architecture](./migration-system-architecture.md) | Unify auto-migrate and file-based migrations |
| [package-runtime-hardening](./package-runtime-hardening.md) | Cross-cutting distribution and runtime hardening |
| [package-runtime-hardening-implementation](./package-runtime-hardening-implementation.md) | Implementation plan for package distribution |
| [platform-agnosticism-runtime-audit](./platform-agnosticism-runtime-audit.md) | Guard Node.js-specific APIs in runtime packages |
| [raw-service-actions](./raw-service-actions.md) | Content descriptors for non-JSON service actions |
| [server-only-components](./server-only-components.md) | Islands architecture for static/interactive separation |
| [typed-views-semantic-layer](./typed-views-semantic-layer.md) | Typed views as primary read abstraction |
| [universal-rendering-model](./universal-rendering-model.md) | One pipeline for CSR/SSR/hydration |
| [vertzql-auto-field-selection](./vertzql-auto-field-selection.md) | Compiler-driven automatic field selection |

## Reference

Audits, cheat sheets, PRDs, and other reference material.

| Plan | Description |
|------|-------------|
| [adversarial-review-schema-migrations](./adversarial-review-schema-migrations.md) | Adversarial review of schema migrations design |
| [api-cheat-sheet-current](./api-cheat-sheet-current.md) | Current state of package APIs |
| [auth-ui-framework-gaps](./auth-ui-framework-gaps.md) | Patterns from Linear clone for framework elevation |
| [docs-entity-field-exposure](./docs-entity-field-exposure.md) | Documentation page for field exposure and relations |
| [prd-schema-migrations](./prd-schema-migrations.md) | Product requirements for schema migrations |

## Subdirectories

| Directory | Description |
|-----------|-------------|
| [access-redesign/](./access-redesign/) | Multi-phase access system redesign (phases 1-7) |
| [cli/](./cli/) | CLI tool design and implementation phases (1-11) |
| [audits/](./audits/) | Code audits |
| [decisions/](./decisions/) | Architecture Decision Records |
| [post-implementation-reviews/](./post-implementation-reviews/) | Retrospectives for shipped features |
| [reviews/](./reviews/) | Design doc review feedback |
| [archived/](./archived/) | Completed/shipped design docs (52 files) |
