# SQLite Dialect Implementation Specification

**Status:** Ready for Implementation  
**Author:** Subagent (Mika context)  
**Date:** 2026-02-20  
**Design Doc:** `sqlite-dialect-design.md`

---

## Overview

This spec details the exact code changes, tests, and execution order for adding SQLite dialect support to `@vertz/db`. The implementation is split into 5 phases matching the approved design.

**Agent Workflow:**
1. Read this spec completely before starting
2. Follow the phases in order (1 → 2 → 3 → 4 → 5)
3. Run tests after each phase — ALL tests must pass before proceeding
4. Every code change is documented below with current → new code
5. Reference function names, not line numbers (they shift)

---

## File Inventory

### New Files (7)
```
packages/db/src/dialect/types.ts
packages/db/src/dialect/postgres.ts
packages/db/src/dialect/sqlite.ts
packages/db/src/dialect/index.ts
packages/db/src/client/driver.ts
packages/db/src/client/sqlite-driver.ts
packages/db/src/client/sqlite-value-converter.ts
```

### Modified Files (11)
```
packages/db/src/sql/where.ts
packages/db/src/sql/insert.ts
packages/db/src/sql/select.ts
packages/db/src/sql/update.ts
packages/db/src/sql/delete.ts
packages/db/src/client/database.ts
packages/db/src/client/postgres-driver.ts
packages/db/src/query/crud.ts
packages/db/src/migration/sql-generator.ts
packages/db/src/index.ts
packages/db/package.json
```

---

## Phase 1: Dialect Interface + PostgresDialect Extraction

**Goal:** Extract existing Postgres-specific logic into a `Dialect` abstraction. Refactor all SQL builders to accept a `dialect` parameter. No functional changes — this is a pure refactor.

**Success Criteria:**
- All existing tests pass unchanged
- PostgresDialect produces identical SQL as before
- All SQL builders accept `dialect` parameter with default

---

### 1.1: Create Dialect Interface

**New file:** `packages/db/src/dialect/types.ts`

```typescript
/**
 * Dialect abstraction for SQL syntax differences.
 *
 * Dialects provide:
 * - Parameter placeholder formatting ($1 vs ?)
 * - SQL function mapping (NOW() vs datetime('now'))
 * - Column type mapping (uuid → UUID vs TEXT)
 * - Feature flags (RETURNING, array ops, JSONB path)
 */

export type IdStrategy = 'cuid' | 'uuid' | 'nanoid';

export interface Dialect {
  /** Dialect name. */
  readonly name: 'postgres' | 'sqlite';

  /**
   * Parameter placeholder: $1, $2 (postgres) or ? (sqlite).
   * @param index - 1-based parameter index
   */
  param(index: number): string;

  /** SQL function for current timestamp. */
  now(): string;

  /**
   * Map a vertz column sqlType to the dialect's SQL type.
   * @param sqlType - The generic sqlType from column metadata
   * @param meta - Additional metadata (enum values, length, precision)
   */
  mapColumnType(sqlType: string, meta?: ColumnTypeMeta): string;

  /** Whether the dialect supports RETURNING clause. */
  readonly supportsReturning: boolean;

  /** Whether the dialect supports array operators (@>, <@, &&). */
  readonly supportsArrayOps: boolean;

  /** Whether the dialect supports JSONB path operators (->>, ->). */
  readonly supportsJsonbPath: boolean;
}

export interface ColumnTypeMeta {
  readonly enumName?: string;
  readonly enumValues?: readonly string[];
  readonly length?: number;
  readonly precision?: number;
  readonly scale?: number;
}
```

---

### 1.2: Create PostgresDialect

**New file:** `packages/db/src/dialect/postgres.ts`

```typescript
import type { ColumnTypeMeta, Dialect } from './types';

/**
 * PostgreSQL dialect implementation.
 *
 * Extracted from existing behavior — no functional changes.
 */
export class PostgresDialect implements Dialect {
  readonly name = 'postgres' as const;
  readonly supportsReturning = true;
  readonly supportsArrayOps = true;
  readonly supportsJsonbPath = true;

  param(index: number): string {
    return `$${index}`;
  }

  now(): string {
    return 'NOW()';
  }

  mapColumnType(sqlType: string, meta?: ColumnTypeMeta): string {
    switch (sqlType) {
      case 'uuid':
        return 'UUID';
      case 'text':
        return 'TEXT';
      case 'integer':
        return 'INTEGER';
      case 'serial':
        return 'SERIAL';
      case 'boolean':
        return 'BOOLEAN';
      case 'timestamp':
        return 'TIMESTAMPTZ';
      case 'float':
        return 'DOUBLE PRECISION';
      case 'json':
        return 'JSONB';
      case 'decimal':
        return meta?.precision
          ? `NUMERIC(${meta.precision},${meta.scale ?? 0})`
          : 'NUMERIC';
      case 'varchar':
        return meta?.length ? `VARCHAR(${meta.length})` : 'VARCHAR';
      case 'enum':
        return meta?.enumName ?? 'TEXT';
      default:
        return 'TEXT';
    }
  }
}

/** Default Postgres dialect instance. */
export const defaultPostgresDialect = new PostgresDialect();
```

---

### 1.3: Create Dialect Barrel

**New file:** `packages/db/src/dialect/index.ts`

```typescript
export type { ColumnTypeMeta, Dialect, IdStrategy } from './types';
export { PostgresDialect, defaultPostgresDialect } from './postgres';
```

---

### 1.4: Refactor `where.ts` — Add Dialect Parameter

**File:** `packages/db/src/sql/where.ts`

**Change 1: Import dialect**

Current (top of file):
```typescript
import { type CasingOverrides, camelToSnake } from './casing';

export interface WhereResult {
```

New (top of file):
```typescript
import { type CasingOverrides, camelToSnake } from './casing';
import { type Dialect, defaultPostgresDialect } from '../dialect';

export interface WhereResult {
```

**Change 2: Update `buildWhere()` signature**

Current:
```typescript
export function buildWhere(
  filter: WhereFilter | undefined,
  paramOffset = 0,
  overrides?: CasingOverrides,
): WhereResult {
```

New:
```typescript
export function buildWhere(
  filter: WhereFilter | undefined,
  paramOffset = 0,
  overrides?: CasingOverrides,
  dialect: Dialect = defaultPostgresDialect,
): WhereResult {
```

**Change 3: Update `buildFilterClauses()` signature**

Current:
```typescript
function buildFilterClauses(
  filter: WhereFilter,
  paramOffset: number,
  overrides?: CasingOverrides,
): { clauses: string[]; params: unknown[]; nextIndex: number } {
```

New:
```typescript
function buildFilterClauses(
  filter: WhereFilter,
  paramOffset: number,
  overrides?: CasingOverrides,
  dialect: Dialect,
): { clauses: string[]; params: unknown[]; nextIndex: number } {
```

**Change 4: Pass `dialect` in `buildFilterClauses()` recursive calls**

Current (inside `buildFilterClauses`):
```typescript
  // Handle OR
  if (filter.OR !== undefined) {
    if (filter.OR.length === 0) {
      clauses.push('FALSE');
    } else {
      const orClauses: string[] = [];
      for (const subFilter of filter.OR) {
        const sub = buildFilterClauses(subFilter, idx, overrides);
```

New:
```typescript
  // Handle OR
  if (filter.OR !== undefined) {
    if (filter.OR.length === 0) {
      clauses.push('FALSE');
    } else {
      const orClauses: string[] = [];
      for (const subFilter of filter.OR) {
        const sub = buildFilterClauses(subFilter, idx, overrides, dialect);
```

Current (AND block):
```typescript
  // Handle AND
  if (filter.AND !== undefined) {
    if (filter.AND.length === 0) {
      clauses.push('TRUE');
    } else {
      const andClauses: string[] = [];
      for (const subFilter of filter.AND) {
        const sub = buildFilterClauses(subFilter, idx, overrides);
```

New:
```typescript
  // Handle AND
  if (filter.AND !== undefined) {
    if (filter.AND.length === 0) {
      clauses.push('TRUE');
    } else {
      const andClauses: string[] = [];
      for (const subFilter of filter.AND) {
        const sub = buildFilterClauses(subFilter, idx, overrides, dialect);
```

Current (NOT block):
```typescript
  // Handle NOT
  if (filter.NOT !== undefined) {
    const sub = buildFilterClauses(filter.NOT, idx, overrides);
```

New:
```typescript
  // Handle NOT
  if (filter.NOT !== undefined) {
    const sub = buildFilterClauses(filter.NOT, idx, overrides, dialect);
```

**Change 5: Update `buildOperatorCondition()` signature**

Current:
```typescript
function buildOperatorCondition(
  columnRef: string,
  operators: FilterOperators,
  paramIndex: number,
): { clauses: string[]; params: unknown[]; nextIndex: number } {
```

New:
```typescript
function buildOperatorCondition(
  columnRef: string,
  operators: FilterOperators,
  paramIndex: number,
  dialect: Dialect,
): { clauses: string[]; params: unknown[]; nextIndex: number } {
```

**Change 6: Replace all `$${idx + 1}` with `dialect.param(idx + 1)` in `buildOperatorCondition()`**

Find and replace EVERY occurrence in `buildOperatorCondition()`:

Current:
```typescript
  if (operators.eq !== undefined) {
    clauses.push(`${columnRef} = $${idx + 1}`);
    params.push(operators.eq);
    idx++;
  }
  if (operators.ne !== undefined) {
    clauses.push(`${columnRef} != $${idx + 1}`);
    params.push(operators.ne);
    idx++;
  }
  if (operators.gt !== undefined) {
    clauses.push(`${columnRef} > $${idx + 1}`);
    params.push(operators.gt);
    idx++;
  }
  if (operators.gte !== undefined) {
    clauses.push(`${columnRef} >= $${idx + 1}`);
    params.push(operators.gte);
    idx++;
  }
  if (operators.lt !== undefined) {
    clauses.push(`${columnRef} < $${idx + 1}`);
    params.push(operators.lt);
    idx++;
  }
  if (operators.lte !== undefined) {
    clauses.push(`${columnRef} <= $${idx + 1}`);
    params.push(operators.lte);
    idx++;
  }
  if (operators.contains !== undefined) {
    clauses.push(`${columnRef} LIKE $${idx + 1}`);
    params.push(`%${escapeLikeValue(operators.contains)}%`);
    idx++;
  }
  if (operators.startsWith !== undefined) {
    clauses.push(`${columnRef} LIKE $${idx + 1}`);
    params.push(`${escapeLikeValue(operators.startsWith)}%`);
    idx++;
  }
  if (operators.endsWith !== undefined) {
    clauses.push(`${columnRef} LIKE $${idx + 1}`);
    params.push(`%${escapeLikeValue(operators.endsWith)}`);
    idx++;
  }
  if (operators.in !== undefined) {
    if (operators.in.length === 0) {
      clauses.push('FALSE');
    } else {
      const placeholders = operators.in.map((_, i) => `$${idx + 1 + i}`).join(', ');
      clauses.push(`${columnRef} IN (${placeholders})`);
      params.push(...operators.in);
      idx += operators.in.length;
    }
  }
  if (operators.notIn !== undefined) {
    if (operators.notIn.length === 0) {
      clauses.push('TRUE');
    } else {
      const placeholders = operators.notIn.map((_, i) => `$${idx + 1 + i}`).join(', ');
      clauses.push(`${columnRef} NOT IN (${placeholders})`);
      params.push(...operators.notIn);
      idx += operators.notIn.length;
    }
  }
  if (operators.isNull !== undefined) {
    clauses.push(`${columnRef} ${operators.isNull ? 'IS NULL' : 'IS NOT NULL'}`);
  }
  if (operators.arrayContains !== undefined) {
    clauses.push(`${columnRef} @> $${idx + 1}`);
    params.push(operators.arrayContains);
    idx++;
  }
  if (operators.arrayContainedBy !== undefined) {
    clauses.push(`${columnRef} <@ $${idx + 1}`);
    params.push(operators.arrayContainedBy);
    idx++;
  }
  if (operators.arrayOverlaps !== undefined) {
    clauses.push(`${columnRef} && $${idx + 1}`);
    params.push(operators.arrayOverlaps);
    idx++;
  }
```

New (replace all `$${idx + 1}` with `dialect.param(idx + 1)` and similar):
```typescript
  if (operators.eq !== undefined) {
    clauses.push(`${columnRef} = ${dialect.param(idx + 1)}`);
    params.push(operators.eq);
    idx++;
  }
  if (operators.ne !== undefined) {
    clauses.push(`${columnRef} != ${dialect.param(idx + 1)}`);
    params.push(operators.ne);
    idx++;
  }
  if (operators.gt !== undefined) {
    clauses.push(`${columnRef} > ${dialect.param(idx + 1)}`);
    params.push(operators.gt);
    idx++;
  }
  if (operators.gte !== undefined) {
    clauses.push(`${columnRef} >= ${dialect.param(idx + 1)}`);
    params.push(operators.gte);
    idx++;
  }
  if (operators.lt !== undefined) {
    clauses.push(`${columnRef} < ${dialect.param(idx + 1)}`);
    params.push(operators.lt);
    idx++;
  }
  if (operators.lte !== undefined) {
    clauses.push(`${columnRef} <= ${dialect.param(idx + 1)}`);
    params.push(operators.lte);
    idx++;
  }
  if (operators.contains !== undefined) {
    clauses.push(`${columnRef} LIKE ${dialect.param(idx + 1)}`);
    params.push(`%${escapeLikeValue(operators.contains)}%`);
    idx++;
  }
  if (operators.startsWith !== undefined) {
    clauses.push(`${columnRef} LIKE ${dialect.param(idx + 1)}`);
    params.push(`${escapeLikeValue(operators.startsWith)}%`);
    idx++;
  }
  if (operators.endsWith !== undefined) {
    clauses.push(`${columnRef} LIKE ${dialect.param(idx + 1)}`);
    params.push(`%${escapeLikeValue(operators.endsWith)}`);
    idx++;
  }
  if (operators.in !== undefined) {
    if (operators.in.length === 0) {
      clauses.push('FALSE');
    } else {
      const placeholders = operators.in.map((_, i) => dialect.param(idx + 1 + i)).join(', ');
      clauses.push(`${columnRef} IN (${placeholders})`);
      params.push(...operators.in);
      idx += operators.in.length;
    }
  }
  if (operators.notIn !== undefined) {
    if (operators.notIn.length === 0) {
      clauses.push('TRUE');
    } else {
      const placeholders = operators.notIn.map((_, i) => dialect.param(idx + 1 + i)).join(', ');
      clauses.push(`${columnRef} NOT IN (${placeholders})`);
      params.push(...operators.notIn);
      idx += operators.notIn.length;
    }
  }
  if (operators.isNull !== undefined) {
    clauses.push(`${columnRef} ${operators.isNull ? 'IS NULL' : 'IS NOT NULL'}`);
  }
  if (operators.arrayContains !== undefined) {
    clauses.push(`${columnRef} @> ${dialect.param(idx + 1)}`);
    params.push(operators.arrayContains);
    idx++;
  }
  if (operators.arrayContainedBy !== undefined) {
    clauses.push(`${columnRef} <@ ${dialect.param(idx + 1)}`);
    params.push(operators.arrayContainedBy);
    idx++;
  }
  if (operators.arrayOverlaps !== undefined) {
    clauses.push(`${columnRef} && ${dialect.param(idx + 1)}`);
    params.push(operators.arrayOverlaps);
    idx++;
  }
```

**Change 7: Pass `dialect` to `buildOperatorCondition()` call**

Current (inside `buildFilterClauses`):
```typescript
    if (isOperatorObject(value)) {
      const result = buildOperatorCondition(columnRef, value, idx);
```

New:
```typescript
    if (isOperatorObject(value)) {
      const result = buildOperatorCondition(columnRef, value, idx, dialect);
```

Current (direct value):
```typescript
    } else {
      // Direct value -> shorthand for { eq: value }
      clauses.push(`${columnRef} = $${idx + 1}`);
      allParams.push(value);
      idx++;
    }
```

New:
```typescript
    } else {
      // Direct value -> shorthand for { eq: value }
      clauses.push(`${columnRef} = ${dialect.param(idx + 1)}`);
      allParams.push(value);
      idx++;
    }
```

**Change 8: Pass `dialect` in `buildWhere()` call to `buildFilterClauses()`**

Current:
```typescript
export function buildWhere(
  filter: WhereFilter | undefined,
  paramOffset = 0,
  overrides?: CasingOverrides,
  dialect: Dialect = defaultPostgresDialect,
): WhereResult {
  if (!filter || Object.keys(filter).length === 0) {
    return { sql: '', params: [] };
  }

  const { clauses, params } = buildFilterClauses(filter, paramOffset, overrides);
  return {
    sql: clauses.join(' AND '),
    params,
  };
}
```

New:
```typescript
export function buildWhere(
  filter: WhereFilter | undefined,
  paramOffset = 0,
  overrides?: CasingOverrides,
  dialect: Dialect = defaultPostgresDialect,
): WhereResult {
  if (!filter || Object.keys(filter).length === 0) {
    return { sql: '', params: [] };
  }

  const { clauses, params } = buildFilterClauses(filter, paramOffset, overrides, dialect);
  return {
    sql: clauses.join(' AND '),
    params,
  };
}
```

---

### 1.5: Refactor `insert.ts` — Add Dialect Parameter

**File:** `packages/db/src/sql/insert.ts`

**Change 1: Import dialect**

Current (top of file):
```typescript
import { camelToSnake } from './casing';

export interface OnConflictOptions {
```

New:
```typescript
import { camelToSnake } from './casing';
import { type Dialect, defaultPostgresDialect } from '../dialect';

export interface OnConflictOptions {
```

**Change 2: Update `buildInsert()` signature**

Current:
```typescript
export function buildInsert(options: InsertOptions): InsertResult {
```

New:
```typescript
export function buildInsert(
  options: InsertOptions,
  dialect: Dialect = defaultPostgresDialect,
): InsertResult {
```

**Change 3: Replace `$${allParams.length}` with `dialect.param(allParams.length)` in VALUES loop**

Current:
```typescript
  for (const row of rows) {
    const placeholders: string[] = [];
    for (const key of keys) {
      const value = row[key];
      if (nowSet.has(key) && value === 'now') {
        placeholders.push('NOW()');
      } else {
        allParams.push(value);
        placeholders.push(`$${allParams.length}`);
      }
    }
    valuesClauses.push(`(${placeholders.join(', ')})`);
  }
```

New:
```typescript
  for (const row of rows) {
    const placeholders: string[] = [];
    for (const key of keys) {
      const value = row[key];
      if (nowSet.has(key) && value === 'now') {
        placeholders.push(dialect.now());
      } else {
        allParams.push(value);
        placeholders.push(dialect.param(allParams.length));
      }
    }
    valuesClauses.push(`(${placeholders.join(', ')})`);
  }
```

**Change 4: Replace `$${allParams.length}` in ON CONFLICT updateValues path**

Current:
```typescript
      if (options.onConflict.updateValues) {
        // Explicit update values: parameterize each value
        const updateVals = options.onConflict.updateValues;
        const setClauses = options.onConflict.updateColumns
          .map((c) => {
            const snakeCol = camelToSnake(c);
            allParams.push(updateVals[c]);
            return `"${snakeCol}" = $${allParams.length}`;
          })
          .join(', ');
```

New:
```typescript
      if (options.onConflict.updateValues) {
        // Explicit update values: parameterize each value
        const updateVals = options.onConflict.updateValues;
        const setClauses = options.onConflict.updateColumns
          .map((c) => {
            const snakeCol = camelToSnake(c);
            allParams.push(updateVals[c]);
            return `"${snakeCol}" = ${dialect.param(allParams.length)}`;
          })
          .join(', ');
```

---

### 1.6: Refactor `select.ts` — Add Dialect Parameter

**File:** `packages/db/src/sql/select.ts`

**Change 1: Import dialect**

Current (top of file):
```typescript
import { type CasingOverrides, camelToSnake } from './casing';
import { buildWhere, type WhereResult } from './where';

export interface SelectOptions {
```

New:
```typescript
import { type CasingOverrides, camelToSnake } from './casing';
import { type Dialect, defaultPostgresDialect } from '../dialect';
import { buildWhere, type WhereResult } from './where';

export interface SelectOptions {
```

**Change 2: Update `buildSelect()` signature**

Current:
```typescript
export function buildSelect(options: SelectOptions): SelectResult {
```

New:
```typescript
export function buildSelect(
  options: SelectOptions,
  dialect: Dialect = defaultPostgresDialect,
): SelectResult {
```

**Change 3: Pass `dialect` to `buildWhere()` call**

Current:
```typescript
  if (options.where) {
    const whereResult: WhereResult = buildWhere(options.where, 0, casingOverrides);
```

New:
```typescript
  if (options.where) {
    const whereResult: WhereResult = buildWhere(options.where, 0, casingOverrides, dialect);
```

**Change 4: Replace `$${allParams.length}` in cursor WHERE and LIMIT/OFFSET**

Current (cursor WHERE):
```typescript
      const op = dir === 'desc' ? '<' : '>';
      allParams.push(value);
      whereClauses.push(`"${snakeCol}" ${op} $${allParams.length}`);
```

New:
```typescript
      const op = dir === 'desc' ? '<' : '>';
      allParams.push(value);
      whereClauses.push(`"${snakeCol}" ${op} ${dialect.param(allParams.length)}`);
```

Current (composite cursor):
```typescript
      for (const [col, value] of cursorEntries) {
        cols.push(`"${camelToSnake(col, casingOverrides)}"`);
        allParams.push(value);
        placeholders.push(`$${allParams.length}`);
      }
```

New:
```typescript
      for (const [col, value] of cursorEntries) {
        cols.push(`"${camelToSnake(col, casingOverrides)}"`);
        allParams.push(value);
        placeholders.push(dialect.param(allParams.length));
      }
```

Current (LIMIT):
```typescript
  if (effectiveLimit !== undefined) {
    allParams.push(effectiveLimit);
    parts.push(`LIMIT $${allParams.length}`);
  }
```

New:
```typescript
  if (effectiveLimit !== undefined) {
    allParams.push(effectiveLimit);
    parts.push(`LIMIT ${dialect.param(allParams.length)}`);
  }
```

Current (OFFSET):
```typescript
  if (options.offset !== undefined) {
    allParams.push(options.offset);
    parts.push(`OFFSET $${allParams.length}`);
  }
```

New:
```typescript
  if (options.offset !== undefined) {
    allParams.push(options.offset);
    parts.push(`OFFSET ${dialect.param(allParams.length)}`);
  }
```

---

### 1.7: Refactor `update.ts` — Add Dialect Parameter

**File:** `packages/db/src/sql/update.ts`

**Change 1: Import dialect**

Current (top of file):
```typescript
import { camelToSnake } from './casing';
import { buildWhere } from './where';

export interface UpdateOptions {
```

New:
```typescript
import { camelToSnake } from './casing';
import { type Dialect, defaultPostgresDialect } from '../dialect';
import { buildWhere } from './where';

export interface UpdateOptions {
```

**Change 2: Update `buildUpdate()` signature**

Current:
```typescript
export function buildUpdate(options: UpdateOptions): UpdateResult {
```

New:
```typescript
export function buildUpdate(
  options: UpdateOptions,
  dialect: Dialect = defaultPostgresDialect,
): UpdateResult {
```

**Change 3: Replace `NOW()` with `dialect.now()` and `$${allParams.length}` with `dialect.param(allParams.length)` in SET clause**

Current:
```typescript
  for (const key of keys) {
    const snakeCol = camelToSnake(key);
    const value = options.data[key];
    if (nowSet.has(key) && value === 'now') {
      setClauses.push(`"${snakeCol}" = NOW()`);
    } else {
      allParams.push(value);
      setClauses.push(`"${snakeCol}" = $${allParams.length}`);
    }
  }
```

New:
```typescript
  for (const key of keys) {
    const snakeCol = camelToSnake(key);
    const value = options.data[key];
    if (nowSet.has(key) && value === 'now') {
      setClauses.push(`"${snakeCol}" = ${dialect.now()}`);
    } else {
      allParams.push(value);
      setClauses.push(`"${snakeCol}" = ${dialect.param(allParams.length)}`);
    }
  }
```

**Change 4: Pass `dialect` to `buildWhere()` call**

Current:
```typescript
  if (options.where) {
    const whereResult = buildWhere(options.where, allParams.length);
```

New:
```typescript
  if (options.where) {
    const whereResult = buildWhere(options.where, allParams.length, undefined, dialect);
```

---

### 1.8: Refactor `delete.ts` — Add Dialect Parameter

**File:** `packages/db/src/sql/delete.ts`

**Change 1: Import dialect**

Current (top of file):
```typescript
import { camelToSnake } from './casing';
import { buildWhere } from './where';

export interface DeleteOptions {
```

New:
```typescript
import { camelToSnake } from './casing';
import { type Dialect, defaultPostgresDialect } from '../dialect';
import { buildWhere } from './where';

export interface DeleteOptions {
```

**Change 2: Update `buildDelete()` signature**

Current:
```typescript
export function buildDelete(options: DeleteOptions): DeleteResult {
```

New:
```typescript
export function buildDelete(
  options: DeleteOptions,
  dialect: Dialect = defaultPostgresDialect,
): DeleteResult {
```

**Change 3: Pass `dialect` to `buildWhere()` call**

Current:
```typescript
  if (options.where) {
    const whereResult = buildWhere(options.where);
```

New:
```typescript
  if (options.where) {
    const whereResult = buildWhere(options.where, 0, undefined, dialect);
```

---

### 1.9: Phase 1 Tests

**New file:** `packages/db/src/dialect/__tests__/postgres-dialect.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import { PostgresDialect, defaultPostgresDialect } from '../postgres';

describe('PostgresDialect', () => {
  const dialect = new PostgresDialect();

  it('has name "postgres"', () => {
    expect(dialect.name).toBe('postgres');
  });

  it('param(1) returns $1', () => {
    expect(dialect.param(1)).toBe('$1');
  });

  it('param(5) returns $5', () => {
    expect(dialect.param(5)).toBe('$5');
  });

  it('now() returns NOW()', () => {
    expect(dialect.now()).toBe('NOW()');
  });

  it('supportsReturning is true', () => {
    expect(dialect.supportsReturning).toBe(true);
  });

  it('supportsArrayOps is true', () => {
    expect(dialect.supportsArrayOps).toBe(true);
  });

  it('supportsJsonbPath is true', () => {
    expect(dialect.supportsJsonbPath).toBe(true);
  });

  it('mapColumnType: uuid -> UUID', () => {
    expect(dialect.mapColumnType('uuid')).toBe('UUID');
  });

  it('mapColumnType: text -> TEXT', () => {
    expect(dialect.mapColumnType('text')).toBe('TEXT');
  });

  it('mapColumnType: integer -> INTEGER', () => {
    expect(dialect.mapColumnType('integer')).toBe('INTEGER');
  });

  it('mapColumnType: serial -> SERIAL', () => {
    expect(dialect.mapColumnType('serial')).toBe('SERIAL');
  });

  it('mapColumnType: boolean -> BOOLEAN', () => {
    expect(dialect.mapColumnType('boolean')).toBe('BOOLEAN');
  });

  it('mapColumnType: timestamp -> TIMESTAMPTZ', () => {
    expect(dialect.mapColumnType('timestamp')).toBe('TIMESTAMPTZ');
  });

  it('mapColumnType: float -> DOUBLE PRECISION', () => {
    expect(dialect.mapColumnType('float')).toBe('DOUBLE PRECISION');
  });

  it('mapColumnType: json -> JSONB', () => {
    expect(dialect.mapColumnType('json')).toBe('JSONB');
  });

  it('mapColumnType: decimal with precision -> NUMERIC(10,2)', () => {
    expect(dialect.mapColumnType('decimal', { precision: 10, scale: 2 })).toBe('NUMERIC(10,2)');
  });

  it('mapColumnType: decimal without precision -> NUMERIC', () => {
    expect(dialect.mapColumnType('decimal')).toBe('NUMERIC');
  });

  it('mapColumnType: varchar with length -> VARCHAR(255)', () => {
    expect(dialect.mapColumnType('varchar', { length: 255 })).toBe('VARCHAR(255)');
  });

  it('mapColumnType: varchar without length -> VARCHAR', () => {
    expect(dialect.mapColumnType('varchar')).toBe('VARCHAR');
  });

  it('mapColumnType: enum with name -> enumName', () => {
    expect(dialect.mapColumnType('enum', { enumName: 'user_role' })).toBe('user_role');
  });

  it('mapColumnType: enum without name -> TEXT', () => {
    expect(dialect.mapColumnType('enum')).toBe('TEXT');
  });

  it('mapColumnType: unknown type -> TEXT', () => {
    expect(dialect.mapColumnType('unknown')).toBe('TEXT');
  });

  it('defaultPostgresDialect is an instance', () => {
    expect(defaultPostgresDialect).toBeInstanceOf(PostgresDialect);
  });
});
```

**Test count:** 25 tests

**New file:** `packages/db/src/sql/__tests__/dialect-regression.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import { defaultPostgresDialect } from '../../dialect';
import { buildDelete } from '../delete';
import { buildInsert } from '../insert';
import { buildSelect } from '../select';
import { buildUpdate } from '../update';
import { buildWhere } from '../where';

/**
 * Regression tests: PostgresDialect produces identical SQL as before refactor.
 */

describe('buildInsert with PostgresDialect (regression)', () => {
  it('produces same SQL as before for single insert', () => {
    const result = buildInsert(
      {
        table: 'users',
        data: { id: '123', name: 'Alice' },
        returning: '*',
      },
      defaultPostgresDialect,
    );

    expect(result.sql).toBe('INSERT INTO "users" ("id", "name") VALUES ($1, $2) RETURNING *');
    expect(result.params).toEqual(['123', 'Alice']);
  });

  it('produces same SQL for NOW() sentinel', () => {
    const result = buildInsert(
      {
        table: 'users',
        data: { id: '123', createdAt: 'now' },
        returning: '*',
        nowColumns: ['createdAt'],
      },
      defaultPostgresDialect,
    );

    expect(result.sql).toBe('INSERT INTO "users" ("id", "created_at") VALUES ($1, NOW()) RETURNING *');
    expect(result.params).toEqual(['123']);
  });

  it('produces same SQL for ON CONFLICT DO UPDATE', () => {
    const result = buildInsert(
      {
        table: 'users',
        data: { id: '123', name: 'Alice' },
        returning: '*',
        onConflict: {
          columns: ['id'],
          action: 'update',
          updateColumns: ['name'],
        },
      },
      defaultPostgresDialect,
    );

    expect(result.sql).toBe(
      'INSERT INTO "users" ("id", "name") VALUES ($1, $2) ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name" RETURNING *',
    );
    expect(result.params).toEqual(['123', 'Alice']);
  });
});

describe('buildSelect with PostgresDialect (regression)', () => {
  it('produces same SQL as before', () => {
    const result = buildSelect(
      {
        table: 'users',
        columns: ['id', 'name'],
        where: { id: { eq: '123' } },
        orderBy: { name: 'asc' },
        limit: 10,
      },
      defaultPostgresDialect,
    );

    expect(result.sql).toBe(
      'SELECT "id", "name" FROM "users" WHERE "id" = $1 ORDER BY "name" ASC LIMIT $2',
    );
    expect(result.params).toEqual(['123', 10]);
  });

  it('produces same SQL for IN operator', () => {
    const result = buildSelect(
      {
        table: 'users',
        where: { status: { in: ['active', 'pending'] } },
      },
      defaultPostgresDialect,
    );

    expect(result.sql).toBe('SELECT * FROM "users" WHERE "status" IN ($1, $2)');
    expect(result.params).toEqual(['active', 'pending']);
  });
});

describe('buildUpdate with PostgresDialect (regression)', () => {
  it('produces same SQL as before', () => {
    const result = buildUpdate(
      {
        table: 'users',
        data: { name: 'Bob' },
        where: { id: { eq: '123' } },
        returning: '*',
      },
      defaultPostgresDialect,
    );

    expect(result.sql).toBe('UPDATE "users" SET "name" = $1 WHERE "id" = $2 RETURNING *');
    expect(result.params).toEqual(['Bob', '123']);
  });

  it('produces same SQL for NOW() sentinel', () => {
    const result = buildUpdate(
      {
        table: 'users',
        data: { updatedAt: 'now' },
        where: { id: { eq: '123' } },
        returning: '*',
        nowColumns: ['updatedAt'],
      },
      defaultPostgresDialect,
    );

    expect(result.sql).toBe('UPDATE "users" SET "updated_at" = NOW() WHERE "id" = $2 RETURNING *');
    expect(result.params).toEqual(['123']);
  });
});

describe('buildDelete with PostgresDialect (regression)', () => {
  it('produces same SQL as before', () => {
    const result = buildDelete(
      {
        table: 'users',
        where: { id: { eq: '123' } },
        returning: '*',
      },
      defaultPostgresDialect,
    );

    expect(result.sql).toBe('DELETE FROM "users" WHERE "id" = $1 RETURNING *');
    expect(result.params).toEqual(['123']);
  });
});

describe('buildWhere with PostgresDialect (regression)', () => {
  it('produces same SQL for all standard operators', () => {
    const result = buildWhere(
      {
        age: { gt: 18, lte: 65 },
        name: { contains: 'alice' },
        status: { in: ['active', 'pending'] },
      },
      0,
      undefined,
      defaultPostgresDialect,
    );

    expect(result.sql).toBe(
      '"age" > $1 AND "age" <= $2 AND "name" LIKE $3 AND "status" IN ($4, $5)',
    );
    expect(result.params).toEqual([18, 65, '%alice%', 'active', 'pending']);
  });

  it('produces same SQL for OR/AND/NOT', () => {
    const result = buildWhere(
      {
        OR: [{ name: { eq: 'Alice' } }, { name: { eq: 'Bob' } }],
      },
      0,
      undefined,
      defaultPostgresDialect,
    );

    expect(result.sql).toBe('("name" = $1 OR "name" = $2)');
    expect(result.params).toEqual(['Alice', 'Bob']);
  });
});
```

**Test count:** 9 tests

---

### Phase 1 Success Criteria

Run tests:
```bash
cd packages/db
pnpm test
```

**Expected:**
- All existing tests pass
- 34 new tests pass (25 dialect + 9 regression)
- No functional changes in generated SQL

---

## Phase 2: SqliteDialect + Feature Guards

**Goal:** Implement SqliteDialect and add feature guards in `where.ts` to throw clear errors for unsupported operations.

---

### 2.1: Create SqliteDialect

**New file:** `packages/db/src/dialect/sqlite.ts`

```typescript
import type { ColumnTypeMeta, Dialect } from './types';

/**
 * SQLite dialect implementation.
 *
 * Differences from Postgres:
 * - Parameter placeholders: ? instead of $1, $2
 * - Timestamp function: datetime('now') instead of NOW()
 * - Type mapping: uuid→TEXT, boolean→INTEGER, timestamp→TEXT, json→TEXT
 * - RETURNING: Supported in SQLite 3.35+ (D1 supports this)
 * - Array operators: NOT supported
 * - JSONB path operators: NOT supported (use json_extract() in raw SQL)
 */
export class SqliteDialect implements Dialect {
  readonly name = 'sqlite' as const;
  readonly supportsReturning = true; // SQLite 3.35+ and D1 support RETURNING
  readonly supportsArrayOps = false;
  readonly supportsJsonbPath = false;

  param(_index: number): string {
    return '?'; // SQLite uses positional ? params
  }

  now(): string {
    return "datetime('now')";
  }

  mapColumnType(sqlType: string, _meta?: ColumnTypeMeta): string {
    switch (sqlType) {
      case 'uuid':
        return 'TEXT'; // Store UUIDs as strings
      case 'text':
        return 'TEXT';
      case 'integer':
        return 'INTEGER';
      case 'serial':
        return 'INTEGER'; // INTEGER PRIMARY KEY auto-increments in SQLite
      case 'boolean':
        return 'INTEGER'; // 0/1
      case 'timestamp':
        return 'TEXT'; // ISO 8601 strings
      case 'float':
        return 'REAL';
      case 'json':
        return 'TEXT'; // Store JSON as strings
      case 'decimal':
        return 'REAL'; // SQLite has no DECIMAL, use REAL
      case 'varchar':
        return 'TEXT'; // SQLite TEXT has no length limit
      case 'enum':
        return 'TEXT'; // Enum values stored as TEXT (with CHECK constraint in DDL)
      default:
        return 'TEXT';
    }
  }
}

/** Default SQLite dialect instance. */
export const defaultSqliteDialect = new SqliteDialect();
```

---

### 2.2: Export SqliteDialect from Barrel

**File:** `packages/db/src/dialect/index.ts`

Current:
```typescript
export type { ColumnTypeMeta, Dialect, IdStrategy } from './types';
export { PostgresDialect, defaultPostgresDialect } from './postgres';
```

New:
```typescript
export type { ColumnTypeMeta, Dialect, IdStrategy } from './types';
export { PostgresDialect, defaultPostgresDialect } from './postgres';
export { SqliteDialect, defaultSqliteDialect } from './sqlite';
```

---

### 2.3: Add Feature Guards in `where.ts`

**File:** `packages/db/src/sql/where.ts`

**Change 1: Add feature guard for array operators in `buildOperatorCondition()`**

Current (array operators block):
```typescript
  if (operators.arrayContains !== undefined) {
    clauses.push(`${columnRef} @> ${dialect.param(idx + 1)}`);
    params.push(operators.arrayContains);
    idx++;
  }
  if (operators.arrayContainedBy !== undefined) {
    clauses.push(`${columnRef} <@ ${dialect.param(idx + 1)}`);
    params.push(operators.arrayContainedBy);
    idx++;
  }
  if (operators.arrayOverlaps !== undefined) {
    clauses.push(`${columnRef} && ${dialect.param(idx + 1)}`);
    params.push(operators.arrayOverlaps);
    idx++;
  }
```

New:
```typescript
  if (operators.arrayContains !== undefined) {
    if (!dialect.supportsArrayOps) {
      throw new Error(
        'Array operators (arrayContains, arrayContainedBy, arrayOverlaps) are not supported on SQLite. ' +
          'Use a different filter strategy or switch to Postgres.',
      );
    }
    clauses.push(`${columnRef} @> ${dialect.param(idx + 1)}`);
    params.push(operators.arrayContains);
    idx++;
  }
  if (operators.arrayContainedBy !== undefined) {
    if (!dialect.supportsArrayOps) {
      throw new Error(
        'Array operators (arrayContains, arrayContainedBy, arrayOverlaps) are not supported on SQLite. ' +
          'Use a different filter strategy or switch to Postgres.',
      );
    }
    clauses.push(`${columnRef} <@ ${dialect.param(idx + 1)}`);
    params.push(operators.arrayContainedBy);
    idx++;
  }
  if (operators.arrayOverlaps !== undefined) {
    if (!dialect.supportsArrayOps) {
      throw new Error(
        'Array operators (arrayContains, arrayContainedBy, arrayOverlaps) are not supported on SQLite. ' +
          'Use a different filter strategy or switch to Postgres.',
      );
    }
    clauses.push(`${columnRef} && ${dialect.param(idx + 1)}`);
    params.push(operators.arrayOverlaps);
    idx++;
  }
```

**Change 2: Add feature guard for JSONB path in `resolveColumnRef()`**

Current (inside `resolveColumnRef()`):
```typescript
function resolveColumnRef(key: string, overrides?: CasingOverrides): string {
  if (key.includes('->')) {
    const parts = key.split('->');
```

New:
```typescript
function resolveColumnRef(
  key: string,
  overrides?: CasingOverrides,
  dialect?: Dialect,
): string {
  if (key.includes('->')) {
    if (dialect && !dialect.supportsJsonbPath) {
      throw new Error(
        'JSONB path operators (->>, ->) are not supported on SQLite. ' +
          'Use json_extract() via raw SQL or switch to Postgres.',
      );
    }
    const parts = key.split('->');
```

**Change 3: Pass `dialect` to `resolveColumnRef()` calls in `buildFilterClauses()`**

Current (inside `buildFilterClauses`, before operator check):
```typescript
    const columnRef = resolveColumnRef(key, overrides);
```

New:
```typescript
    const columnRef = resolveColumnRef(key, overrides, dialect);
```

---

### 2.4: Phase 2 Tests

**New file:** `packages/db/src/dialect/__tests__/sqlite-dialect.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import { SqliteDialect, defaultSqliteDialect } from '../sqlite';

describe('SqliteDialect', () => {
  const dialect = new SqliteDialect();

  it('has name "sqlite"', () => {
    expect(dialect.name).toBe('sqlite');
  });

  it('param(1) returns ?', () => {
    expect(dialect.param(1)).toBe('?');
  });

  it('param(5) returns ?', () => {
    expect(dialect.param(5)).toBe('?');
  });

  it('now() returns datetime("now")', () => {
    expect(dialect.now()).toBe("datetime('now')");
  });

  it('supportsReturning is true', () => {
    expect(dialect.supportsReturning).toBe(true);
  });

  it('supportsArrayOps is false', () => {
    expect(dialect.supportsArrayOps).toBe(false);
  });

  it('supportsJsonbPath is false', () => {
    expect(dialect.supportsJsonbPath).toBe(false);
  });

  it('mapColumnType: uuid -> TEXT', () => {
    expect(dialect.mapColumnType('uuid')).toBe('TEXT');
  });

  it('mapColumnType: boolean -> INTEGER', () => {
    expect(dialect.mapColumnType('boolean')).toBe('INTEGER');
  });

  it('mapColumnType: timestamp -> TEXT', () => {
    expect(dialect.mapColumnType('timestamp')).toBe('TEXT');
  });

  it('mapColumnType: json -> TEXT', () => {
    expect(dialect.mapColumnType('json')).toBe('TEXT');
  });

  it('mapColumnType: serial -> INTEGER', () => {
    expect(dialect.mapColumnType('serial')).toBe('INTEGER');
  });

  it('mapColumnType: decimal -> REAL', () => {
    expect(dialect.mapColumnType('decimal')).toBe('REAL');
  });

  it('mapColumnType: float -> REAL', () => {
    expect(dialect.mapColumnType('float')).toBe('REAL');
  });

  it('defaultSqliteDialect is an instance', () => {
    expect(defaultSqliteDialect).toBeInstanceOf(SqliteDialect);
  });
});
```

**Test count:** 15 tests

**New file:** `packages/db/src/sql/__tests__/sqlite-builders.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import { defaultSqliteDialect } from '../../dialect';
import { buildDelete } from '../delete';
import { buildInsert } from '../insert';
import { buildSelect } from '../select';
import { buildUpdate } from '../update';
import { buildWhere } from '../where';

describe('buildInsert with SqliteDialect', () => {
  it('uses ? params and datetime("now")', () => {
    const result = buildInsert(
      {
        table: 'users',
        data: { id: '123', name: 'Alice', createdAt: 'now' },
        returning: '*',
        nowColumns: ['createdAt'],
      },
      defaultSqliteDialect,
    );

    expect(result.sql).toBe(
      'INSERT INTO "users" ("id", "name", "created_at") VALUES (?, ?, datetime(\'now\')) RETURNING *',
    );
    expect(result.params).toEqual(['123', 'Alice']);
  });

  it('handles ON CONFLICT with SqliteDialect', () => {
    const result = buildInsert(
      {
        table: 'users',
        data: { id: '123', name: 'Alice' },
        returning: '*',
        onConflict: {
          columns: ['id'],
          action: 'update',
          updateColumns: ['name'],
        },
      },
      defaultSqliteDialect,
    );

    expect(result.sql).toBe(
      'INSERT INTO "users" ("id", "name") VALUES (?, ?) ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name" RETURNING *',
    );
    expect(result.params).toEqual(['123', 'Alice']);
  });
});

describe('buildSelect with SqliteDialect', () => {
  it('uses ? params', () => {
    const result = buildSelect(
      {
        table: 'users',
        columns: ['id', 'name'],
        where: { id: { eq: '123' } },
        limit: 10,
      },
      defaultSqliteDialect,
    );

    expect(result.sql).toBe('SELECT "id", "name" FROM "users" WHERE "id" = ? LIMIT ?');
    expect(result.params).toEqual(['123', 10]);
  });
});

describe('buildUpdate with SqliteDialect', () => {
  it('uses ? params and datetime("now")', () => {
    const result = buildUpdate(
      {
        table: 'users',
        data: { name: 'Bob', updatedAt: 'now' },
        where: { id: { eq: '123' } },
        returning: '*',
        nowColumns: ['updatedAt'],
      },
      defaultSqliteDialect,
    );

    expect(result.sql).toBe(
      'UPDATE "users" SET "name" = ?, "updated_at" = datetime(\'now\') WHERE "id" = ? RETURNING *',
    );
    expect(result.params).toEqual(['Bob', '123']);
  });
});

describe('buildDelete with SqliteDialect', () => {
  it('uses ? params', () => {
    const result = buildDelete(
      {
        table: 'users',
        where: { id: { eq: '123' } },
        returning: '*',
      },
      defaultSqliteDialect,
    );

    expect(result.sql).toBe('DELETE FROM "users" WHERE "id" = ? RETURNING *');
    expect(result.params).toEqual(['123']);
  });
});

describe('buildWhere with SqliteDialect', () => {
  it('uses ? params for all standard operators', () => {
    const result = buildWhere(
      {
        age: { gt: 18 },
        name: { contains: 'alice' },
        status: { in: ['active', 'pending'] },
      },
      0,
      undefined,
      defaultSqliteDialect,
    );

    expect(result.sql).toBe('"age" > ? AND "name" LIKE ? AND "status" IN (?, ?)');
    expect(result.params).toEqual([18, '%alice%', 'active', 'pending']);
  });
});

describe('buildWhere feature guards', () => {
  it('throws error for arrayContains on SQLite', () => {
    expect(() =>
      buildWhere(
        { tags: { arrayContains: ['admin'] } },
        0,
        undefined,
        defaultSqliteDialect,
      ),
    ).toThrow('Array operators (arrayContains, arrayContainedBy, arrayOverlaps) are not supported on SQLite');
  });

  it('throws error for arrayContainedBy on SQLite', () => {
    expect(() =>
      buildWhere(
        { tags: { arrayContainedBy: ['admin', 'user'] } },
        0,
        undefined,
        defaultSqliteDialect,
      ),
    ).toThrow('Array operators (arrayContains, arrayContainedBy, arrayOverlaps) are not supported on SQLite');
  });

  it('throws error for arrayOverlaps on SQLite', () => {
    expect(() =>
      buildWhere(
        { tags: { arrayOverlaps: ['admin'] } },
        0,
        undefined,
        defaultSqliteDialect,
      ),
    ).toThrow('Array operators (arrayContains, arrayContainedBy, arrayOverlaps) are not supported on SQLite');
  });

  it('throws error for JSONB path on SQLite', () => {
    expect(() =>
      buildWhere(
        { 'metadata->role': { eq: 'admin' } },
        0,
        undefined,
        defaultSqliteDialect,
      ),
    ).toThrow('JSONB path operators (->>, ->) are not supported on SQLite');
  });
});
```

**Test count:** 9 tests

---

### Phase 2 Success Criteria

Run tests:
```bash
cd packages/db
pnpm test
```

**Expected:**
- All Phase 1 tests still pass
- 24 new tests pass (15 dialect + 9 builder/guards)
- Feature guards throw clear errors

---

## Phase 3: D1 Driver + Value Converter + createDb()

**Goal:** Create the SQLite driver for D1, value converter for boolean/timestamp coercion, and update `createDb()` to support dialect selection.

---

### 3.1: Create DbDriver Interface

**New file:** `packages/db/src/client/driver.ts`

```typescript
import type { QueryFn } from '../query/executor';

/**
 * Generic database driver interface.
 *
 * Abstracts Postgres-specific naming. Both PostgresDriver and SqliteDriver
 * implement this interface.
 */
export interface DbDriver {
  /** The QueryFn adapter for use with createDb. */
  readonly queryFn: QueryFn;
  /** Close all connections. */
  close(): Promise<void>;
  /** Check connection health. */
  isHealthy(): Promise<boolean>;
}

/**
 * @deprecated Use DbDriver instead
 */
export type PostgresDriver = DbDriver;
```

---

### 3.2: Update `postgres-driver.ts` to Implement DbDriver

**File:** `packages/db/src/client/postgres-driver.ts`

**Change: Update interface and import**

Current (interface section):
```typescript
export interface PostgresDriver {
  /** The QueryFn adapter for use with createDb. */
  readonly queryFn: QueryFn;
  /** Close all connections in the pool. */
  close(): Promise<void>;
  /** Check connection health with SELECT 1. */
  isHealthy(): Promise<boolean>;
}
```

New:
```typescript
import type { DbDriver } from './driver';

// Remove the old PostgresDriver interface definition — it's now in driver.ts
// Keep the rest of the file unchanged
```

Update the return type:

Current:
```typescript
export function createPostgresDriver(url: string, pool?: PoolConfig): PostgresDriver {
```

New:
```typescript
export function createPostgresDriver(url: string, pool?: PoolConfig): DbDriver {
```

---

### 3.3: Create Value Converter

**New file:** `packages/db/src/client/sqlite-value-converter.ts`

```typescript
/**
 * SQLite value converter for boolean and timestamp coercion.
 *
 * SQLite stores:
 * - Booleans as INTEGER (0/1)
 * - Timestamps as TEXT (ISO 8601 strings)
 *
 * This converter translates between JS types (boolean, Date) and SQLite types.
 *
 * **Column-type awareness:** The converter uses the table registry to lookup
 * column sqlTypes. This ensures we only coerce columns declared as boolean or
 * timestamp, avoiding false positives (e.g., a TEXT column with a timestamp-like
 * value won't be coerced).
 */

import type { ColumnMetadata } from '../schema/column';
import type { TableDef } from '../schema/table';

export interface ValueConverter {
  /** Convert a JS value to a SQLite-compatible value before INSERT/UPDATE. */
  toDb(tableName: string, columnName: string, value: unknown): unknown;
  /** Convert a SQLite value to the correct JS type after SELECT. */
  fromDb(tableName: string, columnName: string, value: unknown): unknown;
}

export interface TableRegistry {
  readonly [tableName: string]: {
    readonly table: TableDef<Record<string, { readonly _meta: ColumnMetadata }>>;
  };
}

/**
 * Create a value converter from the table registry.
 */
export function createValueConverter(tables: TableRegistry): ValueConverter {
  // Pre-build lookup: tableName -> columnName -> sqlType
  const typeLookup = new Map<string, Map<string, string>>();

  for (const [tableName, entry] of Object.entries(tables)) {
    const columnMap = new Map<string, string>();
    for (const [colName, col] of Object.entries(entry.table._columns)) {
      columnMap.set(colName, col._meta.sqlType);
    }
    typeLookup.set(entry.table._name, columnMap);
  }

  return {
    toDb(tableName, columnName, value) {
      const columnMap = typeLookup.get(tableName);
      const sqlType = columnMap?.get(columnName);

      if (sqlType === 'boolean') {
        if (typeof value === 'boolean') {
          return value ? 1 : 0;
        }
        return value; // Already a number or null
      }

      if (sqlType === 'timestamp') {
        if (value instanceof Date) {
          return value.toISOString();
        }
        return value; // Already a string or null
      }

      return value;
    },

    fromDb(tableName, columnName, value) {
      const columnMap = typeLookup.get(tableName);
      const sqlType = columnMap?.get(columnName);

      if (sqlType === 'boolean') {
        if (typeof value === 'number') {
          return value === 1 || value === true;
        }
        if (typeof value === 'boolean') {
          return value;
        }
        return null;
      }

      if (sqlType === 'timestamp') {
        if (typeof value === 'string') {
          return new Date(value);
        }
        return value; // Already a Date or null
      }

      return value;
    },
  };
}
```

---

### 3.4: Create SQLite Driver

**New file:** `packages/db/src/client/sqlite-driver.ts`

```typescript
/**
 * SQLite driver for Cloudflare D1.
 *
 * Adapts D1's `.prepare()` API to the QueryFn interface, with value conversion
 * for booleans (0/1) and timestamps (ISO strings).
 *
 * **D1 API notes:**
 * - `.all()` for reads — returns { results: Row[], success, meta }
 * - `.run()` for writes — returns { results: Row[], success, meta: { changes } }
 * - RETURNING data comes in `results` even for writes
 */

import type { ExecutorResult, QueryFn } from '../query/executor';
import type { DbDriver } from './driver';
import { type TableRegistry, createValueConverter } from './sqlite-value-converter';

/**
 * D1Database interface from @cloudflare/workers-types.
 * Re-declared here to avoid requiring the types in the package.
 */
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
}

export interface D1Result<T = Record<string, unknown>> {
  results?: T[];
  success: boolean;
  meta?: {
    changes?: number;
    duration?: number;
    last_row_id?: number;
    rows_read?: number;
    rows_written?: number;
  };
  error?: string;
}

export interface SqliteDriverOptions {
  readonly binding: D1Database;
  readonly tables: TableRegistry;
}

/**
 * Create a SQLite driver for Cloudflare D1.
 */
export function createSqliteDriver(options: SqliteDriverOptions): DbDriver {
  const converter = createValueConverter(options.tables);

  const queryFn: QueryFn = async <T>(sqlStr: string, params: readonly unknown[]) => {
    // Detect table name from SQL (heuristic: first quoted identifier after FROM/INTO/UPDATE)
    const tableMatch = sqlStr.match(
      /(?:FROM|INTO|UPDATE)\s+"([^"]+)"/i,
    );
    const tableName = tableMatch?.[1] ?? '';

    // Convert params (booleans, dates) before sending to D1
    // Note: We don't have column names for params, so we pass 'param' as a placeholder
    // Real conversion happens on row read
    const convertedParams = params.map((p) => {
      if (typeof p === 'boolean') return p ? 1 : 0;
      if (p instanceof Date) return p.toISOString();
      return p;
    });

    const stmt = options.binding.prepare(sqlStr).bind(...convertedParams);

    // Determine if read or write based on SQL keyword
    const isRead = sqlStr.trimStart().toUpperCase().startsWith('SELECT');

    if (isRead) {
      const result = await stmt.all<Record<string, unknown>>();
      if (!result.success) {
        throw new Error(result.error ?? 'D1 query failed');
      }
      const rows = (result.results ?? []).map((row) =>
        convertRowFromDb(row, tableName, converter),
      );
      return { rows, rowCount: rows.length } as ExecutorResult<T>;
    } else {
      // INSERT/UPDATE/DELETE — use .run() for writes
      const result = await stmt.run<Record<string, unknown>>();
      if (!result.success) {
        throw new Error(result.error ?? 'D1 write failed');
      }
      // D1 .run() returns RETURNING data in `results`
      const rows = (result.results ?? []).map((row) =>
        convertRowFromDb(row, tableName, converter),
      );
      return { rows, rowCount: result.meta?.changes ?? rows.length } as ExecutorResult<T>;
    }
  };

  return {
    queryFn,
    async close() {
      // D1 connections are managed by Workers runtime — no-op
    },
    async isHealthy() {
      try {
        await options.binding.prepare('SELECT 1').all();
        return true;
      } catch {
        return false;
      }
    },
  };
}

/**
 * Convert a row from SQLite types to JS types.
 */
function convertRowFromDb(
  row: Record<string, unknown>,
  tableName: string,
  converter: ReturnType<typeof createValueConverter>,
): Record<string, unknown> {
  const converted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    converted[key] = converter.fromDb(tableName, key, value);
  }
  return converted;
}
```

---

### 3.5: Update `createDb()` Options and Logic

**File:** `packages/db/src/client/database.ts`

**Change 1: Import dialect and SQLite driver**

Current (top of file):
```typescript
import { err, ok, type Result } from '@vertz/schema';
import { type ReadError, toReadError, toWriteError, type WriteError } from '../errors';
```

New:
```typescript
import { err, ok, type Result } from '@vertz/schema';
import {
  type Dialect,
  PostgresDialect,
  SqliteDialect,
  defaultPostgresDialect,
} from '../dialect';
import { type ReadError, toReadError, toWriteError, type WriteError } from '../errors';
```

Add after existing imports:
```typescript
import type { DbDriver } from './driver';
import type { D1Database } from './sqlite-driver';
import { createSqliteDriver } from './sqlite-driver';
```

**Change 2: Update CreateDbOptions interface**

Current:
```typescript
export interface CreateDbOptions<TTables extends Record<string, TableEntry>> {
  /** PostgreSQL connection URL. */
  readonly url?: string;
  /** Table registry mapping logical names to table definitions + relations. */
  readonly tables: TTables;
  /** Connection pool configuration. */
  readonly pool?: PoolConfig;
  /** Column name casing strategy. */
  readonly casing?: 'snake_case' | 'camelCase';
  /**
   * Custom casing overrides for edge cases (e.g., OAuth, ID).
   * Maps camelCase keys to snake_case column names.
   * These overrides run BEFORE auto-casing logic.
   * Example: { 'oAuthToken': 'oauth_token', 'userID': 'user_id' }
   */
  readonly casingOverrides?: Record<string, string>;
  /** Log function for notices (e.g., unscoped table warnings). */
  readonly log?: (message: string) => void;
  /**
   * Raw query function injected by the driver layer.
   * If not provided, query methods will throw.
   * @internal — primarily for testing with PGlite.
   */
  readonly _queryFn?: QueryFn;
}
```

New:
```typescript
export interface CreateDbOptions<TTables extends Record<string, TableEntry>> {
  /** PostgreSQL connection URL (for Postgres dialect). */
  readonly url?: string;
  /** Table registry mapping logical names to table definitions + relations. */
  readonly tables: TTables;
  /** Connection pool configuration (Postgres only). */
  readonly pool?: PoolConfig;
  /** Column name casing strategy. */
  readonly casing?: 'snake_case' | 'camelCase';
  /**
   * Custom casing overrides for edge cases (e.g., OAuth, ID).
   * Maps camelCase keys to snake_case column names.
   * These overrides run BEFORE auto-casing logic.
   * Example: { 'oAuthToken': 'oauth_token', 'userID': 'user_id' }
   */
  readonly casingOverrides?: Record<string, string>;
  /** Log function for notices (e.g., unscoped table warnings). */
  readonly log?: (message: string) => void;
  /**
   * Raw query function injected by the driver layer.
   * If not provided, query methods will throw.
   * @internal — primarily for testing with PGlite.
   */
  readonly _queryFn?: QueryFn;

  // --- New options for dialect support ---

  /** Dialect: 'postgres' or 'sqlite'. Defaults to 'postgres' when url is provided. */
  readonly dialect?: 'postgres' | 'sqlite';
  /** Cloudflare D1 binding (required when dialect is 'sqlite'). */
  readonly d1?: D1Database;
}
```

**Change 3: Update createDb() implementation with dialect logic**

Current (beginning of createDb):
```typescript
export function createDb<TTables extends Record<string, TableEntry>>(
  options: CreateDbOptions<TTables>,
): DatabaseInstance<TTables> {
  const { tables, log } = options;

  // Compute tenant graph from table registry metadata
  const tenantGraph = computeTenantGraph(tables);
```

New:
```typescript
export function createDb<TTables extends Record<string, TableEntry>>(
  options: CreateDbOptions<TTables>,
): DatabaseInstance<TTables> {
  const { tables, log } = options;

  // Validate dialect/url/d1 combinations
  if (options.dialect === 'sqlite') {
    if (!options.d1) {
      throw new Error(
        'SQLite dialect requires a D1 binding. Pass d1: env.DB to createDb().',
      );
    }
    if (options.url) {
      throw new Error(
        'SQLite dialect uses D1, not a connection URL. Remove url or use dialect: "postgres".',
      );
    }
  }

  if (options.dialect === 'postgres' && options.d1) {
    throw new Error(
      'Postgres dialect does not use D1. Remove d1 or use dialect: "sqlite".',
    );
  }

  // Determine dialect instance
  let dialect: Dialect;
  if (options.dialect === 'sqlite') {
    dialect = new SqliteDialect();
  } else if (options.dialect === 'postgres') {
    dialect = new PostgresDialect();
  } else {
    // Default: Postgres (backward compatible)
    dialect = defaultPostgresDialect;
  }

  // Compute tenant graph from table registry metadata
  const tenantGraph = computeTenantGraph(tables);
```

**Change 4: Update driver creation logic**

Current (driver creation section):
```typescript
  // Create the postgres driver if _queryFn is not provided
  let driver: PostgresDriver | null = null;
  let replicaDrivers: PostgresDriver[] = [];
  let replicaIndex = 0;

  const queryFn: QueryFn = (() => {
    // If _queryFn is explicitly provided (e.g., PGlite for testing), use it
    if (options._queryFn) {
      return options._queryFn;
    }

    // Otherwise, create a real postgres driver from the URL
    if (options.url) {
      driver = createPostgresDriver(options.url, options.pool);
```

New:
```typescript
  // Create the driver based on dialect
  let driver: DbDriver | null = null;
  let replicaDrivers: DbDriver[] = [];
  let replicaIndex = 0;

  const queryFn: QueryFn = (() => {
    // If _queryFn is explicitly provided (e.g., PGlite for testing), use it
    if (options._queryFn) {
      return options._queryFn;
    }

    // SQLite dialect: use D1 driver
    if (options.dialect === 'sqlite' && options.d1) {
      driver = createSqliteDriver({
        binding: options.d1,
        tables: tables as unknown as Parameters<typeof createSqliteDriver>[0]['tables'],
      });
      return driver.queryFn;
    }

    // Postgres dialect: create a real postgres driver from the URL
    if (options.url) {
      driver = createPostgresDriver(options.url, options.pool);
```

---

### 3.6: Pass Dialect to CRUD Functions

**File:** `packages/db/src/query/crud.ts`

**Change: Add dialect parameter to all CRUD functions**

Each function needs to accept `dialect: Dialect = defaultPostgresDialect` and pass it to the SQL builders.

Current (example: `create` function):
```typescript
export async function create<T>(
  queryFn: QueryFn,
  table: TableDef<ColumnRecord>,
  options: CreateArgs,
): Promise<T> {
  const returningColumns = resolveSelectColumns(table, options.select);
  const nowColumns = getTimestampColumns(table);
  const readOnlyCols = getReadOnlyColumns(table);

  const filteredData = Object.fromEntries(
    Object.entries(options.data).filter(([key]) => !readOnlyCols.includes(key)),
  );

  const result = buildInsert({
    table: table._name,
    data: filteredData,
    returning: returningColumns,
    nowColumns,
  });
```

New:
```typescript
import { type Dialect, defaultPostgresDialect } from '../dialect';

export async function create<T>(
  queryFn: QueryFn,
  table: TableDef<ColumnRecord>,
  options: CreateArgs,
  dialect: Dialect = defaultPostgresDialect,
): Promise<T> {
  const returningColumns = resolveSelectColumns(table, options.select);
  const nowColumns = getTimestampColumns(table);
  const readOnlyCols = getReadOnlyColumns(table);

  const filteredData = Object.fromEntries(
    Object.entries(options.data).filter(([key]) => !readOnlyCols.includes(key)),
  );

  const result = buildInsert(
    {
      table: table._name,
      data: filteredData,
      returning: returningColumns,
      nowColumns,
    },
    dialect,
  );
```

**Apply the same change to ALL CRUD functions:**
- `get`
- `getOrThrow`
- `list`
- `listAndCount`
- `create`
- `createMany`
- `createManyAndReturn`
- `update`
- `updateMany`
- `upsert`
- `deleteOne`
- `deleteMany`

Each function signature adds `dialect: Dialect = defaultPostgresDialect` and passes `dialect` to the SQL builder call.

**Change: Pass dialect in database.ts calls to CRUD**

In `database.ts`, store the dialect instance and pass it to CRUD calls:

Current (example: `get` method):
```typescript
    async get(name, opts): Promise<AnyResult> {
      try {
        const entry = resolveTable(tables, name);
        const result = await crud.get(queryFn, entry.table, opts as crud.GetArgs);
```

New:
```typescript
    async get(name, opts): Promise<AnyResult> {
      try {
        const entry = resolveTable(tables, name);
        const result = await crud.get(queryFn, entry.table, opts as crud.GetArgs, dialect);
```

Apply this to all CRUD method calls in `createDb()` (get, getRequired, list, listAndCount, create, createMany, createManyAndReturn, update, updateMany, upsert, delete, deleteMany).

---

### 3.7: Phase 3 Tests

**New file:** `packages/db/src/client/__tests__/sqlite-value-converter.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import { d } from '../../d';
import { createValueConverter } from '../sqlite-value-converter';

describe('createValueConverter', () => {
  const tables = {
    users: {
      table: d.table('users', {
        id: d.uuid().primary(),
        active: d.boolean(),
        createdAt: d.timestamp(),
        name: d.text(),
      }),
    },
  };

  const converter = createValueConverter(tables);

  it('toDb: boolean true -> 1', () => {
    expect(converter.toDb('users', 'active', true)).toBe(1);
  });

  it('toDb: boolean false -> 0', () => {
    expect(converter.toDb('users', 'active', false)).toBe(0);
  });

  it('toDb: Date -> ISO string', () => {
    const date = new Date('2024-01-15T10:30:00Z');
    expect(converter.toDb('users', 'createdAt', date)).toBe('2024-01-15T10:30:00.000Z');
  });

  it('toDb: non-boolean/timestamp columns pass through', () => {
    expect(converter.toDb('users', 'name', 'Alice')).toBe('Alice');
  });

  it('fromDb: 1 -> true (boolean column)', () => {
    expect(converter.fromDb('users', 'active', 1)).toBe(true);
  });

  it('fromDb: 0 -> false (boolean column)', () => {
    expect(converter.fromDb('users', 'active', 0)).toBe(false);
  });

  it('fromDb: ISO string -> Date (timestamp column)', () => {
    const result = converter.fromDb('users', 'createdAt', '2024-01-15T10:30:00.000Z');
    expect(result).toBeInstanceOf(Date);
    expect((result as Date).toISOString()).toBe('2024-01-15T10:30:00.000Z');
  });

  it('fromDb: non-boolean/timestamp columns pass through', () => {
    expect(converter.fromDb('users', 'name', 'Alice')).toBe('Alice');
  });
});
```

**Test count:** 8 tests

**New file:** `packages/db/src/client/__tests__/sqlite-driver.test.ts`

```typescript
import { describe, expect, it, vi } from 'vitest';
import { d } from '../../d';
import type { D1Database, D1PreparedStatement, D1Result } from '../sqlite-driver';
import { createSqliteDriver } from '../sqlite-driver';

describe('createSqliteDriver', () => {
  const tables = {
    users: {
      table: d.table('users', {
        id: d.uuid().primary(),
        name: d.text(),
        active: d.boolean(),
        createdAt: d.timestamp(),
      }),
    },
  };

  function createMockD1(): D1Database {
    return {
      prepare: vi.fn((sql: string) => {
        const stmt: D1PreparedStatement = {
          bind: vi.fn(() => stmt),
          all: vi.fn(async () => ({
            results: [],
            success: true,
          })),
          run: vi.fn(async () => ({
            results: [],
            success: true,
            meta: { changes: 0 },
          })),
          first: vi.fn(async () => null),
        };
        return stmt;
      }),
    };
  }

  it('SELECT returns rows', async () => {
    const mockD1 = createMockD1();
    const stmt = mockD1.prepare('SELECT * FROM "users"');
    vi.mocked(stmt.all).mockResolvedValue({
      results: [{ id: '123', name: 'Alice', active: 1, created_at: '2024-01-15T10:30:00.000Z' }],
      success: true,
    });

    const driver = createSqliteDriver({ binding: mockD1, tables });
    const result = await driver.queryFn('SELECT * FROM "users"', []);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      id: '123',
      name: 'Alice',
      active: true,
      created_at: expect.any(Date),
    });
  });

  it('INSERT with RETURNING uses run()', async () => {
    const mockD1 = createMockD1();
    const stmt = mockD1.prepare('INSERT INTO "users" ...');
    vi.mocked(stmt.run).mockResolvedValue({
      results: [{ id: '123', name: 'Alice' }],
      success: true,
      meta: { changes: 1 },
    });

    const driver = createSqliteDriver({ binding: mockD1, tables });
    const result = await driver.queryFn('INSERT INTO "users" ("id", "name") VALUES (?, ?)', [
      '123',
      'Alice',
    ]);

    expect(result.rows).toHaveLength(1);
    expect(result.rowCount).toBe(1);
  });

  it('empty result set returns empty array', async () => {
    const mockD1 = createMockD1();
    const stmt = mockD1.prepare('SELECT * FROM "users" WHERE 1=0');
    vi.mocked(stmt.all).mockResolvedValue({
      results: [],
      success: true,
    });

    const driver = createSqliteDriver({ binding: mockD1, tables });
    const result = await driver.queryFn('SELECT * FROM "users" WHERE 1=0', []);

    expect(result.rows).toEqual([]);
  });

  it('isHealthy() returns true on success', async () => {
    const mockD1 = createMockD1();
    const driver = createSqliteDriver({ binding: mockD1, tables });
    expect(await driver.isHealthy()).toBe(true);
  });

  it('isHealthy() returns false on failure', async () => {
    const mockD1 = createMockD1();
    const stmt = mockD1.prepare('SELECT 1');
    vi.mocked(stmt.all).mockRejectedValue(new Error('Connection failed'));

    const driver = createSqliteDriver({ binding: mockD1, tables });
    expect(await driver.isHealthy()).toBe(false);
  });
});
```

**Test count:** 5 tests

**New file:** `packages/db/src/client/__tests__/createDb-dialect.test.ts`

```typescript
import { describe, expect, it, vi } from 'vitest';
import { d } from '../../d';
import { createDb } from '../database';

describe('createDb dialect validation', () => {
  const tables = {
    users: {
      table: d.table('users', {
        id: d.uuid().primary(),
        name: d.text(),
      }),
      relations: {},
    },
  };

  it('throws when dialect is sqlite without d1', () => {
    expect(() =>
      createDb({
        dialect: 'sqlite',
        tables,
      }),
    ).toThrow('SQLite dialect requires a D1 binding');
  });

  it('throws when dialect is sqlite with url', () => {
    const mockD1 = { prepare: vi.fn() };
    expect(() =>
      createDb({
        dialect: 'sqlite',
        url: 'postgres://localhost/test',
        d1: mockD1 as any,
        tables,
      }),
    ).toThrow('SQLite dialect uses D1, not a connection URL');
  });

  it('throws when dialect is postgres with d1', () => {
    const mockD1 = { prepare: vi.fn() };
    expect(() =>
      createDb({
        dialect: 'postgres',
        url: 'postgres://localhost/test',
        d1: mockD1 as any,
        tables,
      }),
    ).toThrow('Postgres dialect does not use D1');
  });

  it('defaults to Postgres when url is provided without dialect', () => {
    const db = createDb({
      url: 'postgres://localhost/test',
      tables,
    });

    expect(db).toBeDefined();
    // No error thrown — backward compatible
  });
});
```

**Test count:** 4 tests

---

### Phase 3 Success Criteria

Run tests:
```bash
cd packages/db
pnpm test
```

**Expected:**
- All Phase 1 & 2 tests still pass
- 17 new tests pass (8 converter + 5 driver + 4 createDb)
- createDb() validates dialect/d1/url combinations

---

## Phase 4: Migration Generator

**Goal:** Make `sql-generator.ts` dialect-aware for CREATE TABLE DDL. SQLite gets CHECK constraints for enums.

---

### 4.1: Update `generateMigrationSql()` to Accept Dialect

**File:** `packages/db/src/migration/sql-generator.ts`

**Change 1: Import dialect**

Current (top of file):
```typescript
import { camelToSnake } from '../sql/casing';
import type { DiffChange } from './differ';
import type { ColumnSnapshot, TableSnapshot } from './snapshot';

/**
 * Context needed by the SQL generator to produce full DDL.
 */
export interface SqlGeneratorContext {
```

New:
```typescript
import { camelToSnake } from '../sql/casing';
import { type Dialect, defaultPostgresDialect } from '../dialect';
import type { DiffChange } from './differ';
import type { ColumnSnapshot, TableSnapshot } from './snapshot';

/**
 * Context needed by the SQL generator to produce full DDL.
 */
export interface SqlGeneratorContext {
```

**Change 2: Update `generateMigrationSql()` signature**

Current:
```typescript
export function generateMigrationSql(changes: DiffChange[], ctx?: SqlGeneratorContext): string {
```

New:
```typescript
export function generateMigrationSql(
  changes: DiffChange[],
  ctx?: SqlGeneratorContext,
  dialect: Dialect = defaultPostgresDialect,
): string {
```

**Change 3: Update `generateRollbackSql()` signature**

Current:
```typescript
export function generateRollbackSql(changes: DiffChange[], ctx?: SqlGeneratorContext): string {
```

New:
```typescript
export function generateRollbackSql(
  changes: DiffChange[],
  ctx?: SqlGeneratorContext,
  dialect: Dialect = defaultPostgresDialect,
): string {
```

**Change 4: Pass dialect to `generateMigrationSql()` in rollback**

Current (end of `generateRollbackSql`):
```typescript
  return generateMigrationSql(reverseChanges, ctx);
```

New:
```typescript
  return generateMigrationSql(reverseChanges, ctx, dialect);
```

**Change 5: Update `columnDef()` to use dialect.mapColumnType()**

Current:
```typescript
function columnDef(name: string, col: ColumnSnapshot): string {
  const snakeName = camelToSnake(name);
  const parts: string[] = [`"${snakeName}" ${col.type}`];
```

New:
```typescript
function columnDef(name: string, col: ColumnSnapshot, dialect: Dialect): string {
  const snakeName = camelToSnake(name);
  const sqlType = dialect.mapColumnType(col.type, {
    enumName: col.enumName,
    enumValues: col.enumValues,
    length: col.length,
    precision: col.precision,
    scale: col.scale,
  });
  const parts: string[] = [`"${snakeName}" ${sqlType}`];
```

**Change 6: Add SQLite enum CHECK constraint in CREATE TABLE**

Current (inside `table_added` case):
```typescript
        for (const [colName, col] of Object.entries(table.columns)) {
          cols.push(`  ${columnDef(colName, col)}`);
          if (col.primary) {
            primaryKeys.push(`"${camelToSnake(colName)}"`);
          }
        }
```

New:
```typescript
        for (const [colName, col] of Object.entries(table.columns)) {
          cols.push(`  ${columnDef(colName, col, dialect)}`);
          if (col.primary) {
            primaryKeys.push(`"${camelToSnake(colName)}"`);
          }

          // Add CHECK constraint for enum columns on SQLite
          if (col.type === 'enum' && col.enumValues && dialect.name === 'sqlite') {
            const snakeCol = camelToSnake(colName);
            const values = col.enumValues.map((v) => `'${escapeSqlString(v)}'`).join(', ');
            cols.push(`  CHECK("${snakeCol}" IN (${values}))`);
          }
        }
```

**Change 7: Update `column_added` case to use dialect**

Current:
```typescript
      case 'column_added': {
        if (!change.table || !change.column) break;
        const col = tables?.[change.table]?.columns[change.column];
        if (!col) break;
        statements.push(
          `ALTER TABLE "${camelToSnake(change.table)}" ADD COLUMN ${columnDef(change.column, col)};`,
        );
        break;
      }
```

New:
```typescript
      case 'column_added': {
        if (!change.table || !change.column) break;
        const col = tables?.[change.table]?.columns[change.column];
        if (!col) break;
        statements.push(
          `ALTER TABLE "${camelToSnake(change.table)}" ADD COLUMN ${columnDef(change.column, col, dialect)};`,
        );
        break;
      }
```

---

### 4.2: Phase 4 Tests

**New file:** `packages/db/src/migration/__tests__/sql-generator-dialect.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import { PostgresDialect, SqliteDialect } from '../../dialect';
import type { DiffChange, TableSnapshot } from '../index';
import { generateMigrationSql } from '../sql-generator';

describe('generateMigrationSql with Postgres (regression)', () => {
  it('generates CREATE TABLE with Postgres types', () => {
    const changes: DiffChange[] = [
      { type: 'table_added', table: 'users' },
    ];

    const ctx = {
      tables: {
        users: {
          name: 'users',
          columns: {
            id: { type: 'uuid', nullable: false, primary: true },
            name: { type: 'text', nullable: false },
            active: { type: 'boolean', nullable: false },
          },
          indexes: [],
          foreignKeys: [],
        } as TableSnapshot,
      },
    };

    const sql = generateMigrationSql(changes, ctx, new PostgresDialect());

    expect(sql).toContain('CREATE TABLE "users"');
    expect(sql).toContain('"id" UUID NOT NULL');
    expect(sql).toContain('"name" TEXT NOT NULL');
    expect(sql).toContain('"active" BOOLEAN NOT NULL');
    expect(sql).toContain('PRIMARY KEY ("id")');
  });
});

describe('generateMigrationSql with SQLite', () => {
  it('generates CREATE TABLE with SQLite types', () => {
    const changes: DiffChange[] = [
      { type: 'table_added', table: 'users' },
    ];

    const ctx = {
      tables: {
        users: {
          name: 'users',
          columns: {
            id: { type: 'uuid', nullable: false, primary: true },
            name: { type: 'text', nullable: false },
            active: { type: 'boolean', nullable: false },
            createdAt: { type: 'timestamp', nullable: false },
          },
          indexes: [],
          foreignKeys: [],
        } as TableSnapshot,
      },
    };

    const sql = generateMigrationSql(changes, ctx, new SqliteDialect());

    expect(sql).toContain('CREATE TABLE "users"');
    expect(sql).toContain('"id" TEXT NOT NULL');
    expect(sql).toContain('"name" TEXT NOT NULL');
    expect(sql).toContain('"active" INTEGER NOT NULL');
    expect(sql).toContain('"created_at" TEXT NOT NULL');
    expect(sql).toContain('PRIMARY KEY ("id")');
  });

  it('generates CHECK constraint for enum on SQLite', () => {
    const changes: DiffChange[] = [
      { type: 'table_added', table: 'users' },
    ];

    const ctx = {
      tables: {
        users: {
          name: 'users',
          columns: {
            id: { type: 'uuid', nullable: false, primary: true },
            role: {
              type: 'enum',
              nullable: false,
              enumName: 'user_role',
              enumValues: ['admin', 'user', 'guest'],
            },
          },
          indexes: [],
          foreignKeys: [],
        } as TableSnapshot,
      },
    };

    const sql = generateMigrationSql(changes, ctx, new SqliteDialect());

    expect(sql).toContain('"role" TEXT NOT NULL');
    expect(sql).toContain('CHECK("role" IN (\'admin\', \'user\', \'guest\'))');
  });

  it('generates CREATE TYPE for enum on Postgres', () => {
    const changes: DiffChange[] = [
      { type: 'enum_added', enumName: 'user_role' },
    ];

    const ctx = {
      enums: {
        user_role: ['admin', 'user', 'guest'],
      },
    };

    const sql = generateMigrationSql(changes, ctx, new PostgresDialect());

    expect(sql).toContain('CREATE TYPE "user_role" AS ENUM (\'admin\', \'user\', \'guest\')');
  });

  it('generates CREATE INDEX identically for both dialects', () => {
    const changes: DiffChange[] = [
      { type: 'index_added', table: 'users', columns: ['email'] },
    ];

    const sqlPg = generateMigrationSql(changes, undefined, new PostgresDialect());
    const sqlLite = generateMigrationSql(changes, undefined, new SqliteDialect());

    expect(sqlPg).toBe(sqlLite);
    expect(sqlPg).toContain('CREATE INDEX "idx_users_email" ON "users" ("email")');
  });
});
```

**Test count:** 5 tests

---

### Phase 4 Success Criteria

Run tests:
```bash
cd packages/db
pnpm test
```

**Expected:**
- All Phase 1-3 tests still pass
- 5 new tests pass
- CREATE TABLE DDL respects dialect types

---

## Phase 5: Integration Tests

**Goal:** End-to-end entity CRUD on SQLite via D1 mock. Postgres regression suite.

---

### 5.1: Export Dialect Types from Index

**File:** `packages/db/src/index.ts`

Add dialect exports:

```typescript
// Dialect (new)
export type { ColumnTypeMeta, Dialect } from './dialect';
export { PostgresDialect, SqliteDialect, defaultPostgresDialect, defaultSqliteDialect } from './dialect';
```

---

### 5.2: Add `@cloudflare/workers-types` as Dev Dependency

**File:** `packages/db/package.json`

Current (devDependencies):
```json
  "devDependencies": {
    "@electric-sql/pglite": "^0.3.14",
    "@types/node": "^25.2.1",
    "@vitest/coverage-v8": "^4.0.18",
    "bunup": "latest",
    "typescript": "^5.7.0",
    "vitest": "^4.0.18"
  },
```

New:
```json
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20250110.0",
    "@electric-sql/pglite": "^0.3.14",
    "@types/node": "^25.2.1",
    "@vitest/coverage-v8": "^4.0.18",
    "bunup": "latest",
    "typescript": "^5.7.0",
    "vitest": "^4.0.18"
  },
```

---

### 5.3: Integration Test — SQLite CRUD

**New file:** `packages/db/src/__tests__/integration-sqlite.test.ts`

```typescript
import { describe, expect, it, vi } from 'vitest';
import { d } from '../d';
import { createDb } from '../client/database';
import type { D1Database, D1PreparedStatement } from '../client/sqlite-driver';

describe('SQLite integration (via D1 mock)', () => {
  const tables = {
    users: {
      table: d.table('users', {
        id: d.uuid().primary(),
        name: d.text(),
        active: d.boolean().default(true),
        createdAt: d.timestamp().default('now'),
      }),
      relations: {},
    },
  };

  function createMockD1(): D1Database {
    const store = new Map<string, Record<string, unknown>>();

    return {
      prepare: vi.fn((sql: string) => {
        const stmt: D1PreparedStatement = {
          bind: vi.fn((...values: unknown[]) => stmt),
          all: vi.fn(async () => {
            const isSelect = sql.trim().toUpperCase().startsWith('SELECT');
            if (isSelect) {
              return {
                results: Array.from(store.values()),
                success: true,
              };
            }
            return { results: [], success: true };
          }),
          run: vi.fn(async () => {
            // Mock INSERT RETURNING
            const row = {
              id: '123',
              name: 'Alice',
              active: 1,
              created_at: '2024-01-15T10:30:00.000Z',
            };
            store.set('123', row);
            return {
              results: [row],
              success: true,
              meta: { changes: 1 },
            };
          }),
          first: vi.fn(async () => null),
        };
        return stmt;
      }),
    };
  }

  it('creates a user with SQLite dialect', async () => {
    const mockD1 = createMockD1();
    const db = createDb({
      dialect: 'sqlite',
      d1: mockD1,
      tables,
    });

    const result = await db.create('users', {
      data: { id: '123', name: 'Alice', active: true, createdAt: 'now' },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe('123');
      expect(result.value.name).toBe('Alice');
      expect(result.value.active).toBe(true);
      expect(result.value.createdAt).toBeInstanceOf(Date);
    }
  });

  it('lists users with SQLite dialect', async () => {
    const mockD1 = createMockD1();
    const db = createDb({
      dialect: 'sqlite',
      d1: mockD1,
      tables,
    });

    const result = await db.list('users');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Array.isArray(result.value)).toBe(true);
    }
  });
});
```

**Test count:** 2 tests

---

### 5.4: Postgres Regression Test

**New file:** `packages/db/src/__tests__/integration-postgres-regression.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { d } from '../d';
import { createDb } from '../client/database';

describe('Postgres regression (PGlite)', () => {
  const tables = {
    users: {
      table: d.table('users', {
        id: d.uuid().primary(),
        name: d.text(),
        active: d.boolean().default(true),
        createdAt: d.timestamp().default('now'),
      }),
      relations: {},
    },
  };

  it('creates and lists users on Postgres', async () => {
    const pg = new PGlite();
    await pg.exec(`
      CREATE TABLE users (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const db = createDb({
      tables,
      _queryFn: async (sql, params) => {
        const result = await pg.query(sql, params);
        return { rows: result.rows, rowCount: result.rows.length };
      },
    });

    const createResult = await db.create('users', {
      data: { id: '123', name: 'Alice', active: true, createdAt: 'now' },
    });

    expect(createResult.ok).toBe(true);

    const listResult = await db.list('users');

    expect(listResult.ok).toBe(true);
    if (listResult.ok) {
      expect(listResult.value).toHaveLength(1);
      expect(listResult.value[0].name).toBe('Alice');
    }

    await pg.close();
  });
});
```

**Test count:** 1 test

---

### Phase 5 Success Criteria

Run tests:
```bash
cd packages/db
pnpm test
```

**Expected:**
- All Phase 1-4 tests still pass
- 3 new tests pass (2 SQLite CRUD + 1 Postgres regression)
- **Total test count:** 34 + 24 + 17 + 5 + 3 = **83 new tests**

---

## Execution Order

1. **Phase 1:** Dialect interface + PostgresDialect extraction (1.1 → 1.9)
   - Run tests after 1.9 — all existing tests must pass
2. **Phase 2:** SqliteDialect + feature guards (2.1 → 2.4)
   - Run tests after 2.4
3. **Phase 3:** D1 driver + value converter + createDb() (3.1 → 3.7)
   - Run tests after 3.7
4. **Phase 4:** Migration generator (4.1 → 4.2)
   - Run tests after 4.2
5. **Phase 5:** Integration tests (5.1 → 5.4)
   - Run tests after 5.4
6. **Final:** Run full test suite + typecheck

```bash
cd packages/db
pnpm test
pnpm typecheck
```

---

## Addendum: Dialect Propagation (Tech Lead Review Fix)

The tech lead review identified that the spec didn't close the loop on how `dialect` flows from `createDb()` to CRUD functions to SQL builders. Here's the complete propagation path:

### How `createDb()` captures the dialect

In `database.ts`, `createDb()` returns an object whose methods call CRUD functions. The dialect is captured in the closure:

```typescript
// In createDb(), after creating queryFn:
const dialect: Dialect = options.dialect === 'sqlite'
  ? new SqliteDialect()
  : defaultPostgresDialect;
```

### How CRUD functions receive the dialect

The CRUD functions in `crud.ts` already receive `queryFn` and `table`. We add `dialect` as a 4th parameter with a default:

```typescript
// crud.ts — every function gets dialect:
export async function create<T>(
  queryFn: QueryFn,
  table: TableDef<ColumnRecord>,
  options: CreateArgs,
  dialect: Dialect = defaultPostgresDialect,
): Promise<T> { ... }
```

### How `createDb()` passes dialect to CRUD

Every CRUD call inside the returned object passes the captured `dialect`:

```typescript
// Current:
async create(name, opts): Promise<AnyResult> {
  const entry = resolveTable(tables, name);
  const result = await crud.create(queryFn, entry.table, opts as crud.CreateArgs);
  return ok(result);
}

// New:
async create(name, opts): Promise<AnyResult> {
  const entry = resolveTable(tables, name);
  const result = await crud.create(queryFn, entry.table, opts as crud.CreateArgs, dialect);
  return ok(result);
}
```

This applies to ALL methods that call CRUD functions: `get`, `getRequired`, `list`, `listAndCount`, `create`, `createMany`, `createManyAndReturn`, `update`, `updateMany`, `upsert`, `delete`, `deleteMany`.

### How CRUD passes dialect to SQL builders

Inside `crud.ts`, each function passes `dialect` to the SQL builder:

```typescript
// Current:
const result = buildInsert({ table: table._name, data: filteredData, ... });

// New:
const result = buildInsert({ table: table._name, data: filteredData, ... }, dialect);
```

And `buildInsert`/`buildSelect`/etc. pass dialect to `buildWhere`:

```typescript
// Current:
const whereResult = buildWhere(options.where, allParams.length, options.casingOverrides);

// New:
const whereResult = buildWhere(options.where, allParams.length, options.casingOverrides, dialect);
```

### Complete flow:

```
createDb({ dialect: 'sqlite', d1: env.DB })
  → captures `dialect = new SqliteDialect()` in closure
    → db.create('todos', { data }) 
      → crud.create(queryFn, table, opts, dialect)
        → buildInsert(options, dialect) uses dialect.param()
          → buildWhere(filter, offset, overrides, dialect) uses dialect.param()
```

### Phase 3 createDb() changes — exact diff:

**In `CreateDbOptions` interface, add:**
```typescript
/** Database dialect. Defaults to 'postgres'. */
readonly dialect?: 'postgres' | 'sqlite';
/** Cloudflare D1 binding. Required when dialect is 'sqlite'. */
readonly d1?: D1Database;
```

**In `createDb()` function body, after `const { tables, log } = options;` add:**
```typescript
// Resolve dialect
const dialect: Dialect = options.dialect === 'sqlite'
  ? new SqliteDialect()
  : defaultPostgresDialect;

// Validate dialect/driver combinations
if (options.dialect === 'sqlite' && !options.d1) {
  throw new Error(
    "SQLite dialect requires a D1 binding. Pass d1: env.DB to createDb()."
  );
}
if (options.dialect === 'sqlite' && options.url) {
  throw new Error(
    "SQLite dialect uses D1, not a connection URL. Remove url or use dialect: 'postgres'."
  );
}
```

**In the queryFn IIFE, add D1 driver path:**
```typescript
const queryFn: QueryFn = (() => {
  if (options._queryFn) {
    return options._queryFn;
  }

  // D1 SQLite driver
  if (options.dialect === 'sqlite' && options.d1) {
    const sqliteDriver = createSqliteDriver({ binding: options.d1, tables });
    driver = sqliteDriver; // store for close/isHealthy
    return sqliteDriver.queryFn;
  }

  // Existing Postgres path...
  if (options.url) {
    driver = createPostgresDriver(options.url, options.pool);
    // ... rest unchanged
  }
  // ...
})();
```

**In every CRUD call inside the returned object, add `dialect` as the last argument.**

---

## Notes for Implementing Agent

- **Reference function names, not line numbers** (they shift during editing)
- **Show exact current code → new code** for every modification
- **Run tests after each phase** — do not proceed if tests fail
- **Every test has a clear description** of what it verifies
- **This spec is self-contained** — you should need ONLY this document

---

## Summary

This spec covers:
- **7 new files** (dialect types, Postgres/SQLite dialects, D1 driver, value converter)
- **11 modified files** (all SQL builders, database.ts, postgres-driver.ts, crud.ts, sql-generator.ts, index.ts, package.json)
- **83 new tests** across 5 phases
- **Zero breaking changes** — defaults to PostgresDialect for backward compatibility

The implementation is fully backward compatible. Existing code continues to work unchanged. SQLite support is opt-in via `dialect: 'sqlite'` and `d1: env.DB`.

---

**End of Specification**
