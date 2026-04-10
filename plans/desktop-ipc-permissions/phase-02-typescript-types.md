# Phase 2: TypeScript Permission Types

## Context

Phase 1 added Rust-side permission enforcement. This phase adds TypeScript types for the capability strings and type-level tests, giving developers IDE autocompletion and compile-time validation when working with permission configs.

Design doc: `plans/desktop-ipc-permissions.md`

## Tasks

### Task 1: Permission types

**Files:**
- `packages/desktop/src/permissions.ts` (new)
- `packages/desktop/src/index.ts` (modified — re-export permission types)

**What to implement:**
- `IpcCapabilityGroup` type (string literal union of all group capabilities)
- `IpcMethodString` type (string literal union of all wire protocol method strings)
- `IpcPermission` type (union of group + individual)
- `DesktopConfig` interface with `permissions: IpcPermission[]`

**Acceptance criteria:**
- [ ] Types are exported from `@vertz/desktop`
- [ ] `IpcPermission` accepts valid group strings like `'fs:read'`
- [ ] `IpcPermission` accepts valid method strings like `'fs.readTextFile'`

---

### Task 2: Type-level tests

**Files:**
- `packages/desktop/src/__tests__/permissions.test-d.ts` (new)

**What to implement:**
- Positive type tests for all capability groups
- Positive type tests for individual method strings
- Negative type tests (`@ts-expect-error`) for invalid capability strings
- Negative type tests for typos in method names

**Acceptance criteria:**
- [ ] `@ts-expect-error` on `'invalid:stuff'` as `IpcPermission`
- [ ] `@ts-expect-error` on `'fs.readTextfile'` (wrong case) as `IpcPermission`
- [ ] Valid strings like `'fs:read'`, `'fs.readTextFile'` accepted without error
- [ ] `vtz run typecheck` passes with all type tests
