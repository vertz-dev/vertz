# Phase 1: OpenAPI Parser + Resource Grouper

- **Author:** Codex (implementation agent)
- **Reviewer:** Codex (local review; separate review agent unavailable in this workspace)
- **Commits:** working tree
- **Date:** 2026-04-01

## Changes

- packages/openapi/package.json (new)
- packages/openapi/tsconfig.json (new)
- packages/openapi/src/index.ts (new)
- packages/openapi/src/parser/types.ts (new)
- packages/openapi/src/parser/ref-resolver.ts (new)
- packages/openapi/src/parser/openapi-parser.ts (new)
- packages/openapi/src/parser/operation-id-normalizer.ts (new)
- packages/openapi/src/parser/__tests__/ref-resolver.test.ts (new)
- packages/openapi/src/parser/__tests__/openapi-parser.test.ts (new)
- packages/openapi/src/parser/__tests__/operation-id-normalizer.test.ts (new)
- packages/openapi/src/adapter/identifier.ts (new)
- packages/openapi/src/adapter/resource-grouper.ts (new)
- packages/openapi/src/adapter/__tests__/resource-grouper.test.ts (new)
- bun.lock (modified)

## CI Status

- [x] `bun test packages/openapi`
- [x] `bun run --filter @vertz/openapi typecheck`
- [x] `bunx oxlint --fix packages/openapi/...`
- [x] `bunx oxfmt packages/openapi/...`
- [x] `bunx turbo run build typecheck --filter=@vertz/openapi`
- [ ] Full monorepo `bun test`
- [ ] Full monorepo `bunx turbo run typecheck`
- [ ] Full monorepo `bun run lint`

## Review Checklist

- [x] Delivers what the phase asks for
- [x] TDD compliance (tests added alongside implementation; parser behaviors covered)
- [x] No type gaps in the new package
- [x] No obvious security issues in the new package
- [x] Public package surface matches the phase scope

## Findings

### 1. APPROVED: Phase 1 scope is implemented end-to-end

The new `@vertz/openapi` workspace now includes:

- parsed internal types
- `$ref` resolution with circular sentinels, `allOf` flattening, and 3.0/3.1 sibling behavior
- OpenAPI 3.0/3.1 parsing with request/response extraction, parameter extraction, component schema collection, and 3.0 `nullable` normalization
- operation ID normalization with CRUD detection and override/transform precedence
- resource grouping and identifier sanitization

Package-level tests cover all acceptance criteria listed in `plans/openapi-sdk-codegen/phase-01-parser.md`.

### 2. NOTE: Full-repo quality gates are currently blocked by unrelated workspace failures

The new package itself passes its local gates, but the full monorepo gates are not clean for reasons unrelated to `packages/openapi`:

- `bun test` hits existing failures in tree-shaking tests due missing built `dist` artifacts in other packages and unrelated auth/session failures under `packages/server`
- `bunx turbo run typecheck` fails in `@vertz/landing` with existing `WebSocketPair`/Response typing errors
- `bun run lint` reports hundreds of pre-existing warnings across unrelated packages

These blockers should be treated as repo baseline issues, not regressions introduced by this phase.

## Resolution

No code changes were required after local review. The implementation is approved at the package scope.

Residual blocker: full-monorepo gates cannot be marked green until the existing unrelated failures in `packages/landing`, `packages/server`, and other warned packages are resolved.
