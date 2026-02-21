# ui-026: Add AbortSignal to RouteConfig.loader context type

- **Status:** 🟢 Done
- **Assigned:** nora
- **Phase:** v0.1.x patch
- **Estimate:** 2h
- **Blocked by:** none
- **Blocks:** none
- **PR:** —
- **Source:** follow-up #5 from PR #176

## Description

`RouteConfig.loader` type at line 22 of `define-routes.ts` does not include `signal?: AbortSignal` in the context parameter. The signal is passed at runtime via an `as never` cast in `executeLoaders`, but consumers won't see `signal` in IDE autocompletion.

**Files:**
- `packages/ui/src/router/define-routes.ts` (type definition)
- `packages/ui/src/router/loader.ts` (runtime cast)

## Acceptance Criteria

- [ ] `RouteConfig.loader` context parameter includes `signal: AbortSignal`
- [ ] The `as never` cast in `executeLoaders` is removed (no longer needed)
- [ ] Test: loader receives AbortSignal in its context
- [ ] Type test: `@ts-expect-error` on accessing non-existent context property

## Progress

- 2026-02-12: Ticket created from follow-up #5 (PR #176 review)
- 2026-02-12: Already implemented — RouteConfig.loader context includes AbortSignal
