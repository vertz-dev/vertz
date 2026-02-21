# Implementation Spec: Auto ID Generation in @vertz/db

**Design doc:** `plans/db-id-generation.md` (Approved v3)
**Author:** mike
**Date:** 2026-02-20

---

## Overview

Add `.primary({ generate: 'cuid' | 'uuid' | 'nanoid' })` to `@vertz/db`. When a primary key column has a generate strategy and the user doesn't provide a value, the DB package auto-generates an ID before INSERT.

## Part 1: ID Generators Module

### New file: `packages/db/src/id/generators.ts`

```typescript
import { createId } from '@paralleldrive/cuid2';
import { v7 as uuidv7 } from 'uuid';
import { nanoid } from 'nanoid';

/** Supported application-side ID generation strategies. */
export type IdStrategy = 'cuid' | 'uuid' | 'nanoid';

/**
 * Generate a unique ID using the given strategy.
 *
 * - `'cuid'`   — CUID2 (24 chars, URL-safe, collision-resistant)
 * - `'uuid'`   — UUID v7 (time-sortable, RFC 9562)
 * - `'nanoid'` — Nano ID (21 chars, URL-safe)
 */
export function generateId(strategy: IdStrategy): string {
  switch (strategy) {
    case 'cuid':
      return createId();
    case 'uuid':
      return uuidv7();
    case 'nanoid':
      return nanoid();
  }
}
```

### New file: `packages/db/src/id/index.ts`

```typescript
export { generateId, type IdStrategy } from './generators';
```

### Tests: `packages/db/src/__tests__/id-generators.test.ts`

```
Test 1: generateId('cuid') returns a string matching cuid2 format (/^[a-z0-9]{24,}$/)
Test 2: generateId('uuid') returns a string matching UUID format (/^[0-9a-f]{8}-.../)
Test 3: generateId('uuid') returns a v7 UUID (version nibble = 7)
Test 4: generateId('nanoid') returns a string of length 21
Test 5: generateId — 1000 calls per strategy produce 1000 unique values
Test 6: generateId — unknown strategy throws (runtime guard, cast past TS)
```

---

## Part 2: Column Metadata Extension

### File: `packages/db/src/schema/column.ts`

**2a. Add `generate` to `ColumnMetadata` interface:**

```typescript
interface ColumnMetadata {
  // ... all existing fields unchanged ...
  readonly generate?: IdStrategy;
}
```

Import `IdStrategy` from `'../id/generators'`.

**2b. Add `generate` to `DefaultMeta`:**

In the `DefaultMeta` type, add:
```typescript
readonly generate?: undefined;
```

**2c. Update `.primary()` implementation:**

Current (`createColumnWithMeta` function, inside the returned object):
```typescript
primary() {
  return cloneWith(this, { primary: true, hasDefault: true }) as ReturnType<
    ColumnBuilder<unknown, ColumnMetadata>['primary']
  >;
},
```

New:
```typescript
primary(options?: { generate?: IdStrategy }) {
  return cloneWith(this, {
    primary: true,
    hasDefault: true,
    ...(options?.generate ? { generate: options.generate } : {}),
  }) as ReturnType<ColumnBuilder<unknown, ColumnMetadata>['primary']>;
},
```

**2d. Update `ColumnBuilder` interface — `.primary()` signature:**

Current:
```typescript
primary(): ColumnBuilder<
  TType,
  Omit<TMeta, 'primary' | 'hasDefault'> & { readonly primary: true; readonly hasDefault: true }
>;
```

New — add options parameter. For the type guard on integer columns, we use a conditional approach. Since the current builder uses generic `TType`, we add the options param unconditionally at the type level (the runtime check is what matters for safety). If we want compile-time rejection for integers, that requires a more invasive type refactor — defer to a follow-up.

```typescript
primary(options?: { generate?: IdStrategy }): ColumnBuilder<
  TType,
  Omit<TMeta, 'primary' | 'hasDefault' | 'generate'> & {
    readonly primary: true;
    readonly hasDefault: true;
    readonly generate: IdStrategy | undefined;
  }
>;
```

> **Note:** The design doc mentions a TypeScript overload to reject `generate` on integer columns. After inspecting the actual column builder, this would require threading `TType` constraints through `cloneWith` and `createColumnWithMeta`, which is a significant type-level refactor. For v1, we accept the options on any column but add a **runtime validation** in `fillGeneratedIds`: if a column has `generate` set but `sqlType` is `'integer'` or `'serial'`, throw a descriptive error at startup/first-use. The compile-time guard can be added in a follow-up when the builder types are refactored.

### Tests: `packages/db/src/__tests__/column-generate.test.ts`

```
Test 7:  d.text().primary({ generate: 'cuid' })._meta.generate === 'cuid'
Test 8:  d.text().primary({ generate: 'uuid' })._meta.generate === 'uuid'
Test 9:  d.text().primary({ generate: 'nanoid' })._meta.generate === 'nanoid'
Test 10: d.text().primary()._meta.generate === undefined (no generate)
Test 11: d.text().primary({ generate: 'cuid' })._meta.primary === true
Test 12: d.text().primary({ generate: 'cuid' })._meta.hasDefault === true
Test 13: d.uuid().primary({ generate: 'uuid' })._meta works correctly
```

---

## Part 3: ID Generation in CRUD

### File: `packages/db/src/query/crud.ts`

**3a. New helper function — add near top of file, after imports:**

```typescript
import { generateId } from '../id/generators';
import type { ColumnBuilder } from '../schema/column';
import type { ColumnMetadata } from '../schema/column';

/**
 * Fill in auto-generated IDs for primary key columns that have a `generate` strategy.
 * Only fills when the value is `undefined` (missing). Explicit values (including `null`) are respected.
 */
function fillGeneratedIds(
  table: TableDef<ColumnRecord>,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const filled = { ...data };
  for (const [name, col] of Object.entries(table._columns)) {
    const meta = (col as ColumnBuilder<unknown, ColumnMetadata>)._meta;
    if (meta.generate && filled[name] === undefined) {
      // Runtime guard: reject generate on non-string column types
      if (meta.sqlType === 'integer' || meta.sqlType === 'serial' || meta.sqlType === 'bigint') {
        throw new Error(
          `Column "${name}" has generate: '${meta.generate}' but is type '${meta.sqlType}'. ` +
          `ID generation is only supported on string column types (text, uuid, varchar).`
        );
      }
      filled[name] = generateId(meta.generate);
    }
  }
  return filled;
}
```

**3b. Update `create()` — fill IDs before readOnly filter:**

In `create()` function, current code:
```typescript
const filteredData = Object.fromEntries(
  Object.entries(options.data).filter(([key]) => !readOnlyCols.includes(key)),
);
```

New:
```typescript
const withIds = fillGeneratedIds(table, options.data);
const filteredData = Object.fromEntries(
  Object.entries(withIds).filter(([key]) => !readOnlyCols.includes(key)),
);
```

**3c. Update `createMany()` — fill IDs per row before readOnly filter:**

In `createMany()` function, current code:
```typescript
const filteredData = (options.data as Record<string, unknown>[]).map((row) =>
  Object.fromEntries(Object.entries(row).filter(([key]) => !readOnlyCols.includes(key))),
);
```

New:
```typescript
const filteredData = (options.data as Record<string, unknown>[]).map((row) => {
  const withIds = fillGeneratedIds(table, row);
  return Object.fromEntries(Object.entries(withIds).filter(([key]) => !readOnlyCols.includes(key)));
});
```

**3d. Update `createManyAndReturn()` — same pattern as createMany:**

In `createManyAndReturn()` function, current code:
```typescript
const filteredData = (options.data as Record<string, unknown>[]).map((row) =>
  Object.fromEntries(Object.entries(row).filter(([key]) => !readOnlyCols.includes(key))),
);
```

New:
```typescript
const filteredData = (options.data as Record<string, unknown>[]).map((row) => {
  const withIds = fillGeneratedIds(table, row);
  return Object.fromEntries(Object.entries(withIds).filter(([key]) => !readOnlyCols.includes(key)));
});
```

**3e. Update `upsert()` — fill IDs on the create data path:**

In `upsert()` function, current code:
```typescript
const filteredCreate = Object.fromEntries(
  Object.entries(options.create).filter(([key]) => !readOnlyCols.includes(key)),
);
```

New:
```typescript
const createWithIds = fillGeneratedIds(table, options.create);
const filteredCreate = Object.fromEntries(
  Object.entries(createWithIds).filter(([key]) => !readOnlyCols.includes(key)),
);
```

### Tests: `packages/db/src/__tests__/crud-id-generation.test.ts`

These tests use a real DB (pglite) to verify end-to-end behavior.

```
Test 14: create() with generate:'cuid' — insert without ID → returned row has cuid-format ID
Test 15: create() with generate:'uuid' — insert without ID → returned row has UUIDv7-format ID
Test 16: create() with generate:'nanoid' — insert without ID → returned row has nanoid-format ID
Test 17: create() with user-provided ID — explicit ID is used, not overwritten
Test 18: create() with explicit null ID — null is passed through, not generated (DB decides)
Test 19: create() without generate — omitting ID on a .primary() column without generate works (existing behavior, hasDefault:true)
Test 20: createMany() — batch of 10 rows without IDs → 10 unique generated IDs
Test 21: createManyAndReturn() — batch of 5 → all returned rows have unique generated IDs
Test 22: upsert() create path — missing ID in create data → ID generated
Test 23: upsert() with user-provided ID in create — explicit ID respected
Test 24: fillGeneratedIds on integer column with generate → throws descriptive error
Test 25: fillGeneratedIds runs before readOnly filter — PK with generate + readOnly works
Test 26: Transaction — generated ID available within tx scope, consistent after commit
```

---

## Part 4: Package Dependencies

### File: `packages/db/package.json`

Add to `dependencies`:
```json
{
  "@paralleldrive/cuid2": "^2.2.2",
  "uuid": "^11.1.0",
  "nanoid": "^5.1.5"
}
```

Run `bun install` after updating.

---

## Part 5: Exports

### File: `packages/db/src/index.ts`

Add export:
```typescript
export { generateId, type IdStrategy } from './id';
```

This lets users call `generateId('cuid')` directly if they need IDs outside of inserts (e.g., pre-generating for optimistic UI).

---

## Execution Order

1. Part 4 — Add dependencies, `bun install`
2. Part 1 — ID generators module + tests (6 tests)
3. Part 2 — Column metadata + tests (7 tests)
4. Part 3 — CRUD integration + tests (13 tests)
5. Part 5 — Exports
6. Run `bun run ci` — full pipeline

**Total: 26 tests across 3 test files.**

## Files Summary

| File | Action |
|------|--------|
| `packages/db/src/id/generators.ts` | **Create** |
| `packages/db/src/id/index.ts` | **Create** |
| `packages/db/src/schema/column.ts` | **Modify** — add `generate` to metadata, update `.primary()` |
| `packages/db/src/query/crud.ts` | **Modify** — add `fillGeneratedIds`, update 4 functions |
| `packages/db/src/index.ts` | **Modify** — add export |
| `packages/db/package.json` | **Modify** — add 3 deps |
| `packages/db/src/__tests__/id-generators.test.ts` | **Create** |
| `packages/db/src/__tests__/column-generate.test.ts` | **Create** |
| `packages/db/src/__tests__/crud-id-generation.test.ts` | **Create** |

## Deferred

- **Compile-time rejection of `generate` on integer columns** — requires column builder type refactor. Runtime error covers this for now.
- **JSDoc on `.primary()` options** — add during implementation.
- **Lazy-loading generators** — not worth the async complexity. Total dep size ~30KB, acceptable for a DB package.
