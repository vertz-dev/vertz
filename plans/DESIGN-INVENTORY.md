# Design Inventory

Complete inventory of all design documents across vertz and backstage repositories.

## Format

| File | Subject | Status | Category | Package |
|------|---------|--------|----------|---------|

**Status values:** `approved`, `proposal`, `research`, `draft`, `in-review`  
**Category values:** `core` (ships now), `future` (ships later)

---

## CORE — Ships Now

### ORM / @vertz/db

| File | Subject | Status | Category | Package |
|------|---------|--------|----------|---------|
| `plans/db-design.md` | @vertz/db API Design | Approved | core | @vertz/db |
| `plans/db-implementation.md` | @vertz/db Implementation Plan | Approved | core | @vertz/db |
| `plans/db-integration-design.md` | DB Integration (DB + Core bridge) | Approved | core | @vertz/db |
| `plans/post-implementation-reviews/vertz-db-v1.md` | DB v1 Post-Implementation Review | Approved | core | @vertz/db |

### UI / @vertz/ui

| File | Subject | Status | Category | Package |
|------|---------|--------|----------|---------|
| `plans/ui-design.md` | @vertz/ui Design Plan | Approved | core | @vertz/ui |
| `plans/ui-implementation.md` | @vertz/ui Implementation Plan | Approved | core | @vertz/ui |
| `plans/ui-competitive-analysis.md` | UI Competitive Analysis | Research | core | @vertz/ui |
| `plans/post-implementation-reviews/vertz-ui-v1.md` | UI v1 Post-Implementation Review | Approved | core | @vertz/ui |

### SSR / Streaming

| File | Subject | Status | Category | Package |
|------|---------|--------|----------|---------|
| `plans/render-page.md` | renderPage API (@vertz/ui-server) | Approved | core | @vertz/ui |
| `plans/render-page-implementation.md` | renderPage Implementation | Approved | core | @vertz/ui |
| `plans/ssr-zero-config.md` | Zero-Config SSR (10/10 DX) | Draft | core | @vertz/ui |
| `plans/retro-ssr-dx-gap.md` | SSR DX Gap Retrospective | Draft | core | @vertz/ui |

### REST Framework / @vertz/server

| File | Subject | Status | Category | Package |
|------|---------|--------|----------|---------|
| `plans/vertz-core-api-design.md` | Vertz Core API Design | Approved | core | @vertz/core, @vertz/server |
| `plans/vertz-core-implementation.md` | Vertz Core Implementation | Approved | core | @vertz/core |
| `plans/vertz-features.md` | Framework Features Overview | Approved | core | @vertz/core |
| `plans/cloud-architecture.md` | Cloud Architecture Design | Proposal | core | @vertz/server |
| `plans/cloudflare-adapter.md` | Cloudflare Adapter | Proposal | core | @vertz/server |

### Schema / @vertz/schema

| File | Subject | Status | Category | Package |
|------|---------|--------|----------|---------|
| `plans/vertz-schema-design.md` | @vertz/schema Package Design | Approved | core | @vertz/schema |
| `plans/vertz-schema-implementation.md` | @vertz/schema Implementation | Approved | core | @vertz/schema |
| `plans/post-implementation-reviews/core-schema-validation-gap.md` | Schema Validation Gap Review | Draft | core | @vertz/schema |

### Errors / @vertz/errors

| File | Subject | Status | Category | Package |
|------|---------|--------|----------|---------|
| `plans/errors-as-values.md` | Errors-as-Values Across APIs | RFC | core | @vertz/errors, all packages |
| `plans/error-taxonomy-research.md` | Error Taxonomy Research | Research | core | @vertz/errors |

### CLI / @vertz/cli

| File | Subject | Status | Category | Package |
|------|---------|--------|----------|---------|
| `plans/cli/cli-design.md` | @vertz/cli Package Design | Approved | core | @vertz/cli |
| `plans/cli/phase-01-scaffold-and-config.md` | CLI Phase 1: Scaffold & Config | Approved | core | @vertz/cli |
| `plans/cli/phase-02-theme-and-ui-components.md` | CLI Phase 2: Theme & UI Components | Approved | core | @vertz/cli |
| `plans/cli/phase-03-diagnostic-display.md` | CLI Phase 3: Diagnostic Display | Approved | core | @vertz/cli |
| `plans/cli/phase-04-check-command.md` | CLI Phase 4: Check Command | Approved | core | @vertz/cli |
| `plans/cli/phase-05-build-command.md` | CLI Phase 5: Build Command | Approved | core | @vertz/cli |
| `plans/cli/phase-06-dev-server-infrastructure.md` | CLI Phase 6: Dev Server Infrastructure | Approved | core | @vertz/cli |
| `plans/cli/phase-07-dev-command.md` | CLI Phase 7: Dev Command | Approved | core | @vertz/cli |
| `plans/cli/phase-08-generate-command.md` | CLI Phase 8: Generate Command | Approved | core | @vertz/cli |
| `plans/cli/phase-09-routes-command.md` | CLI Phase 9: Routes Command | Approved | core | @vertz/cli |
| `plans/cli/phase-10-deploy-command.md` | CLI Phase 10: Deploy Command | Approved | core | @vertz/cli |
| `plans/cli/phase-11-create-vertz-app.md` | CLI Phase 11: Create Vertz App | Approved | core | @vertz/cli |

### Compiler

| File | Subject | Status | Category | Package |
|------|---------|--------|----------|---------|
| `plans/vertz-compiler-design.md` | Vertz Compiler Design | Approved | core | @vertz/compiler |
| `plans/codegen-design.md` | Codegen Design | Proposal | core | @vertz/compiler |

### Testing

| File | Subject | Status | Category | Package |
|------|---------|--------|----------|---------|
| `plans/vertz-testing-design.md` | Testing Design | Approved | core | @vertz/testing |
| `plans/vertz-testing-implementation.md` | Testing Implementation | Approved | core | @vertz/testing |
| `plans/integration-tests.md` | Integration Tests Design | Proposal | core | @vertz/testing |

### Result Types

| File | Subject | Status | Category | Package |
|------|---------|--------|----------|---------|
| `plans/result-boundaries.md` | Result Boundaries (v3) | Proposal | core | @vertz/errors |
| `plans/reviews/result-boundaries-arch-review.md` | Result Boundaries Architecture Review | Draft | core | @vertz/errors |
| `plans/reviews/result-boundaries-devils-advocate.md` | Result Boundaries Devil's Advocate | Draft | core | @vertz/errors |
| `plans/reviews/result-boundaries-dx-review.md` | Result Boundaries DX Review | Draft | core | @vertz/errors |
| `plans/reviews/result-boundaries-v2-arch-review.md` | Result Boundaries v2 Architecture Review | Draft | core | @vertz/errors |
| `plans/reviews/result-boundaries-v2-devils-advocate.md` | Result Boundaries v2 Devil's Advocate | Draft | core | @vertz/errors |
| `plans/reviews/result-boundaries-v2-dx-review.md` | Result Boundaries v2 DX Review | Draft | core | @vertz/errors |
| `plans/reviews/result-boundaries-v3-arch-review.md` | Result Boundaries v3 Architecture Review | Draft | core | @vertz/errors |
| `plans/reviews/result-boundaries-v3-devils-advocate.md` | Result Boundaries v3 Devil's Advocate | Draft | core | @vertz/errors |
| `plans/reviews/result-boundaries-v3-dx-review.md` | Result Boundaries v3 DX Review | Draft | core | @vertz/errors |
| `plans/reviews/result-types-audit.md` | Result Types Audit | Draft | core | @vertz/errors |

### Entity-Aware API

| File | Subject | Status | Category | Package |
|------|---------|--------|----------|---------|
| `plans/entity-aware-api.md` | Entity-Aware API Design | Approved | core | @vertz/server |
| `plans/entity-api-expert-debate.md` | Entity API Expert Debate | Draft | core | @vertz/server |
| `plans/entity-aware-api-review-rest.md` | Entity-Aware API REST Review | Draft | core | @vertz/server |
| `plans/entity-aware-api-review-graphql.md` | Entity-Aware API GraphQL Review | Draft | core | @vertz/server |
| `backstage/plans/prds/entity-aware-protocol.md` | PRD: Entity-Aware Protocol | In Review | core | @vertz/db, @vertz/ui |
| `backstage/plans/prds/crud-pipeline.md` | PRD: DB Integration (CRUD Pipeline) | Approved | core | @vertz/db |
| `backstage/plans/prds/browser-platform-apis.md` | PRD: Browser Platform APIs | In Review | core | @vertz/ui |

### Other Core

| File | Subject | Status | Category | Package |
|------|---------|--------|----------|---------|
| `plans/vertz-design-whys.md` | Design Decisions & Whys | Draft | core | General |
| `plans/entity-phase1-spec.md` | Entity Phase 1 Spec | Draft | core | @vertz/db |
| `plans/package-naming-strategy.md` | Package Naming Strategy | Approved | core | Monorepo |
| `plans/turborepo-migration.md` | Turborepo Migration | Draft | core | Build |
| `plans/dagger-ci-migration.md` | Dagger CI Migration | Draft | core | CI/CD |
| `plans/release-automation.md` | Release Automation | Draft | core | CI/CD |

---

## FUTURE — Ships Later

### Authentication

| File | Subject | Status | Category | Package |
|------|---------|--------|----------|---------|
| `plans/auth-module-spec.md` | Auth Module Phase 1 Spec | Draft | future | @vertz/auth |
| `plans/auth-phase2-spec.md` | Auth Phase 2 Spec | Draft | future | @vertz/auth |

### Authorization / RBAC

| File | Subject | Status | Category | Package |
|------|---------|--------|----------|---------|
| `plans/access-system.md` | Unified Access System Design | Draft | future | @vertz/access |

### Multi-tenancy / Tenant Scoping

*No specific design documents found*

### Row-level Security

*No specific design documents found*

### Resource Hierarchy / Closure Tables

| File | Subject | Status | Category | Package |
|------|---------|--------|----------|---------|
| `plans/access-system.md` | Unified Access System (includes closure tables) | Draft | future | @vertz/access |

### Plans / Billing Integration

| File | Subject | Status | Category | Package |
|------|---------|--------|----------|---------|
| `plans/access-system.md` | Unified Access System (includes plans/limits) | Draft | future | @vertz/access |

### Client SDK

| File | Subject | Status | Category | Package |
|------|---------|--------|----------|---------|
| `backstage/plans/publish-command-spec.md` | Publish Command Spec | Draft | future | @vertz/client |

### Suspense / Async Data Model

| File | Subject | Status | Category | Package |
|------|---------|--------|----------|---------|
| `plans/async-data-design.md` | Async Data State Design (query()) | Proposal | future | @vertz/ui |
| `memory/research/ssr-suspense-react-nextjs.md` | SSR/Suspense React/Next.js Research | Research | future | @vertz/ui |
| `memory/research/ssr-suspense-astro.md` | SSR/Suspense Astro Research | Research | future | @vertz/ui |
| `memory/research/ssr-suspense-solidjs.md` | SSR/Suspense SolidJS Research | Research | future | @vertz/ui |
| `memory/research/ssr-suspense-qwik.md` | SSR/Suspense Qwik Research | Research | future | @vertz/ui |
| `memory/research/ssr-suspense-tanstack-query.md` | SSR/Suspense TanStack Query Research | Research | future | @vertz/ui |

### Other Future

| File | Subject | Status | Category | Package |
|------|---------|--------|----------|---------|
| `plans/priority-queue.md` | Priority Queue Design | Draft | future | @vertz/server |
| `plans/canvas-phase-1.md` | Canvas Phase 1 Design | Draft | future | @vertz/ui |

---

## Research Files

| File | Subject | Status | Category |
|------|---------|--------|----------|
| `memory/research/README.md` | Research Index | - | - |
| `memory/research/blimu-auth-model.md` | Blimu Auth Model Research | Research | future |
| `memory/research/blimu-data-layer.md` | Blimu Data Layer Research | Research | future |

---

## Debates & Design Reviews

| File | Subject | Status | Category |
|------|---------|--------|----------|
| `plans/debate-hybrid-advocate.md` | Hybrid Approach Debate | Draft | core |
| `plans/debate-throw-advocate.md` | Throw vs Result Debate | Draft | core |
| `plans/debate-result-advocate.md` | Result Type Debate | Draft | core |

---

## Backstage (Non-Vertz)

| File | Subject | Status | Category |
|------|---------|--------|----------|
| `backstage/design/messaging-v2.md` | Messaging v2 Design | Draft | backstage |
| `backstage/plans/launch-plan.md` | Launch Plan | Draft | backstage |
| `backstage/plans/cloud-developer-experience.md` | Cloud Developer Experience | Draft | backstage |

---

## Summary

| Category | Count |
|----------|-------|
| Core (Approved) | 35 |
| Core (Draft/Proposal) | 25 |
| Future (Draft/Proposal) | 10 |
| Research | 9 |
| Reviews/Debates | 12 |
| **Total** | **91** |
