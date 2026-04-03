# Phase 1: Entity Error Handler Dev-Mode Support

## Context

Issue #2232: Make error handling dev-mode aware across all route handlers. This phase adds `devMode` support to `entityErrorHandler` — the foundation that all other handlers will reuse in Phase 2.

Design doc: `plans/dev-mode-error-handling.md`

## Tasks

### Task 1: Add devMode option to entityErrorHandler

**Files:**
- `packages/server/src/entity/error-handler.ts` (modified)
- `packages/server/src/entity/__tests__/error-handler.test.ts` (modified)

**What to implement:**

1. Add `ErrorHandlerOptions` interface with `devMode?: boolean`.
2. Add optional second parameter `options?: ErrorHandlerOptions` to `entityErrorHandler`.
3. In the unknown-error branch (current line 98-103):
   - When `devMode` is true AND error is an `Error` instance: return `{ code: 'InternalError', message: error.message, ...(error.stack && { stack: error.stack }) }`.
   - When `devMode` is true AND error is NOT an `Error` instance: return `{ code: 'InternalError', message: 'An unexpected error occurred (non-Error value thrown)' }`.
   - When `devMode` is false/undefined (default): keep current behavior `{ code: 'InternalError', message: 'An unexpected error occurred' }`.
4. Add `stack?: string` to the `EntityErrorResult` body's error object type with JSDoc: `/** Stack trace of the original error. Only populated when \`devMode\` is enabled. */`.
5. Existing behavior for `VertzException` and `EntityError` is unchanged — those branches don't use `devMode`.

**Acceptance criteria:**
- [ ] `entityErrorHandler(new Error('x'), { devMode: true })` returns `{ status: 500, body: { error: { code: 'InternalError', message: 'x', stack: '...' } } }`
- [ ] `entityErrorHandler(new Error('x'))` returns `{ status: 500, body: { error: { code: 'InternalError', message: 'An unexpected error occurred' } } }` (unchanged)
- [ ] `entityErrorHandler('boom', { devMode: true })` returns generic message with no stack
- [ ] `entityErrorHandler(new NotFoundException('Not found'), { devMode: true })` still returns 404 with real message (unchanged VertzException behavior)
- [ ] All existing tests continue to pass (backward compatible)
- [ ] Quality gates pass: `bun test --filter error-handler && bun run typecheck`
