# Design Doc: Column-Level Validation Constraints in `@vertz/db`

**Status:** Approved (post-review v2)
**Author:** claude
**Feature:** Column-level validation constraints [#1470]
**Related:** #1450 (SDK-generated schemas for forms), #1449 (client codegen integration)

---

## 1. API Surface

### 1.1 String constraint methods on `d.text()`, `d.varchar()`, and `d.email()`

```ts
const projects = d.table('projects', {
  key: d.text().min(1).max(5).regex(/^[A-Z0-9]+$/i),
  title: d.text().min(1),
  description: d.text().nullable(),
  slug: d.text().min(3).max(50).regex(/^[a-z0-9-]+$/),
  contactEmail: d.email().min(5).max(255),
});
```

New chainable methods on string columns (`text`, `varchar`, `email`):

```ts
.min(n: number)          // Minimum string length
.max(n: number)          // Maximum string length
.regex(pattern: RegExp)  // Must match regular expression
```

`d.varchar(n)` already carries an implicit `max(n)` via the `length` metadata. An explicit `.max()` overrides the semantic constraint for validation — the `length` stays for SQL DDL, but `.max()` controls the `@vertz/schema` validator. If `.max()` is not called on a `varchar`, the existing `length` is used for validation (current behavior, preserved).

**Guidance:** Use `.min()` / `.max()` / `.regex()` for application-level validation (API + SDK + forms). Use `.check(sql)` for database-level enforcement.

### 1.2 Numeric constraint methods on `d.integer()`, `d.real()`, `d.doublePrecision()`, `d.serial()`

```ts
const metrics = d.table('metrics', {
  score: d.integer().min(0).max(100),
  rating: d.real().min(0).max(5),
  priority: d.integer().min(0).max(4),
});
```

New chainable methods on numeric columns:

```ts
.min(n: number)     // Minimum value (inclusive, maps to gte)
.max(n: number)     // Maximum value (inclusive, maps to lte)
```

**Excluded types:** `d.decimal()` (TS type is `string` — use `.check(sql)` or manual schema for decimal validation) and `d.bigint()` (TS type is `bigint`, not `number` — type mismatch with `@vertz/schema` NumberSchema). These may be added in a follow-up.

### 1.3 Type-safe constraint scoping

Constraints are scoped to the column types they make sense for. You cannot call `.regex()` on an integer column or `.min()` with different semantics across types:

```ts
d.text().min(3)          // ✓ min string length = 3
d.text().regex(/^[A-Z]/) // ✓ must match pattern
d.email().min(5)         // ✓ min email length = 5
d.integer().min(0)       // ✓ value >= 0
d.integer().max(100)     // ✓ value <= 100

// These should NOT compile:
d.integer().regex(/abc/) // ✗ regex is string-only
d.boolean().min(1)       // ✗ min makes no sense on boolean
d.timestamp().max(5)     // ✗ max makes no sense on timestamp
```

This is achieved by adding the constraint methods only to `StringColumnBuilder` and `NumericColumnBuilder` sub-interfaces, not to the base `ColumnBuilder`.

**Type-chaining strategy:** At the runtime level, ALL column builders have `min()`, `max()`, `regex()` methods (they just set metadata). At the type level, only `StringColumnBuilder` and `NumericColumnBuilder` expose them. Each sub-interface redeclares the base chainable methods (`.unique()`, `.nullable()`, `.default()`, etc.) to return the specialized type, ensuring constraint methods survive chaining in any order: `d.text().min(1).unique().max(5)` compiles correctly.

### 1.4 Full example — Linear clone before/after

**Before (manual schemas):**

```ts
// schema.ts
const projects = d.table('projects', {
  id: d.uuid().primary({ generate: 'uuid' }),
  name: d.text(),
  key: d.text().unique(),
  // ...
});

// create-project-dialog.tsx — manual schema
const createProjectSchema = createProjectsInputSchema.extend({
  key: s.string().min(1).max(5).regex(/^[A-Z0-9]+$/i),
});
```

**After (constraints on DB schema, no manual schemas):**

```ts
// schema.ts — single source of truth
const projects = d.table('projects', {
  id: d.uuid().primary({ generate: 'uuid' }),
  name: d.text().min(1),
  key: d.text().min(1).max(5).regex(/^[A-Z0-9]+$/i).unique(),
  // ...
});

// create-project-dialog.tsx — uses generated schema directly
const taskForm = form(projectsApi.create);
// No manual schema needed. Change max(5) to max(8)?
// One place. Enforced everywhere.
```

---

## 2. Manifesto Alignment

### Principles addressed

1. **"If it builds, it works"** — Validation constraints are defined once at the schema layer and enforced everywhere (API, SDK, UI). No mismatch between manual schemas and DB definitions.

2. **"One way to do things"** — Today there are two sources of validation truth: the DB schema (type + nullable + default) and manual Zod schemas (min/max/regex). This change collapses them into one: the DB schema IS the validation source.

3. **"AI agents are first-class users"** — An LLM defining a table with `d.text().min(1).max(5).regex(...)` gets validation for free. No need to discover and maintain a separate schema file.

4. **"No ceilings"** — Rather than accepting that DB schemas can't carry validation metadata, we extend them.

### Tradeoffs

- **Convention over configuration:** We're being opinionated that validation belongs at the schema layer, not scattered across form components. This is the right call — it's the single source of truth principle.

- **Explicit over implicit:** Constraints are explicitly declared on each column. No magic defaults (except existing `varchar(n)` → `max(n)` which is preserved).

---

## 3. Non-Goals

- **SQL-level CHECK constraints from validation metadata.** The `.min()`, `.max()`, `.regex()` methods are for application-level validation only. They do NOT generate SQL `CHECK` constraints. The existing `.check(sql)` method remains for SQL-level constraints. Rationale: regex patterns are not portable across SQL dialects, and application-level validation gives better error messages.

- **String transformations (`.trim()`, `.toLowerCase()`).** These are `@vertz/schema` runtime transforms, not declarative constraints. They don't belong on the DB schema definition. Users can apply them in custom schemas or middleware.

- **Cross-field validation.** Constraints like "endDate must be after startDate" require cross-field context. This is out of scope — use custom action validation for that.

- **Array element constraints.** `d.textArray().min(1)` (minimum array length) or element-level constraints are deferred. Current scope is scalar columns only.

- **Custom error messages on DB constraints.** The `@vertz/schema` methods support custom messages (`s.string().min(1, 'Required')`). DB-level constraints use framework default messages. Custom messages can be added via `.extend()` on generated schemas if needed. Tracked as a potential follow-up.

- **`d.decimal()` and `d.bigint()` constraints.** `decimal` has TS type `string` (can't map to NumberSchema), `bigint` has type mismatch with NumberSchema. Deferred to follow-up if needed.

---

## 4. Unknowns

1. **Regex serialization in codegen.** `RegExp` objects need to be serialized to source code strings for the codegen output. `regex.toString()` produces `/pattern/flags` which is valid JS. **Resolution:** Use `RegExp.prototype.toString()` directly in codegen output. Verified: `new RegExp(/^[A-Z]+$/i).toString()` → `"/^[A-Z]+$/i"`.

2. **Regex in migration snapshots.** Should `ColumnSnapshot` store regex patterns? **Resolution:** No. Validation constraints are application-level only — they don't affect the database schema or migrations. `ColumnSnapshot` is unchanged.

3. **Codegen constraint extraction.** The compiler uses ts-morph static analysis which cannot extract runtime `ColumnMetadata` values (like `_minLength: 1`). **Resolution:** Deferred to a follow-up issue. This PR delivers Phase 1 (server-side validation via `tableToSchemas()`) which is independently valuable. Phase 2 (codegen) requires either: (a) a runtime evaluation pass in the codegen pipeline, (b) encoding constraints at the type level, or (c) a separate metadata extraction step. This needs its own design doc.

---

## 5. Type Flow Map

```
d.text().min(1).max(5).regex(/^[A-Z]+$/)
  │
  ▼
StringColumnBuilder<string, DefaultMeta<'text'>>
  │  (constraint methods return StringColumnBuilder —
  │   constraints are stored in metadata, not in the type parameter)
  ▼
ColumnMetadata { sqlType: 'text', _minLength: 1, _maxLength: 5, _regex: /^[A-Z]+$/ }
  │
  └──▶ columnToSchema(meta)  →  s.string().min(1).max(5).regex(/^[A-Z]+$/)
        └──▶ tableToSchemas(table)  →  DerivedSchemas { createBody, updateBody, responseSchema }
              └──▶ Entity layer (API validation at runtime)


d.integer().min(0).max(100)
  │
  ▼
NumericColumnBuilder<number, DefaultMeta<'integer'>>
  │
  ▼
ColumnMetadata { sqlType: 'integer', _minValue: 0, _maxValue: 100 }
  │
  └──▶ columnToSchema(meta)  →  s.number().int().min(0).max(100)
        └──▶ tableToSchemas(table)  →  DerivedSchemas { ... }
```

### Dead generic check

- `ColumnBuilder<TType, TMeta>` — `TType` flows to `InferColumnType<C>` for table type inference. Unchanged.
- `TMeta` flows to `_meta` property for runtime metadata access. Constraint fields are added to `ColumnMetadata` interface. `TMeta` already carries concrete metadata — no new generics.
- No new generics introduced. Constraints are metadata values, not type parameters.

---

## 6. E2E Acceptance Test

```typescript
import { describe, it, expect } from 'bun:test';
import { d } from '@vertz/db';
import { tableToSchemas } from '@vertz/db/schema-derive';

describe('Feature: Column-level validation constraints', () => {
  describe('Given a table with string constraints (min, max, regex)', () => {
    const projects = d.table('projects', {
      id: d.uuid().primary(),
      key: d.text().min(1).max(5).regex(/^[A-Z0-9]+$/i),
      title: d.text().min(1),
      description: d.text().nullable(),
    });

    describe('When generating create schemas via tableToSchemas()', () => {
      const { createBody } = tableToSchemas(projects);

      it('Then rejects empty key (below min length)', () => {
        const result = createBody.safeParse({ key: '', title: 'Test' });
        expect(result.ok).toBe(false);
      });

      it('Then rejects key exceeding max length', () => {
        const result = createBody.safeParse({ key: 'ABCDEF', title: 'Test' });
        expect(result.ok).toBe(false);
      });

      it('Then rejects key not matching regex', () => {
        const result = createBody.safeParse({ key: 'AB!', title: 'Test' });
        expect(result.ok).toBe(false);
      });

      it('Then accepts valid key', () => {
        const result = createBody.safeParse({ key: 'ABC', title: 'Test' });
        expect(result.ok).toBe(true);
      });

      it('Then rejects empty title (below min length)', () => {
        const result = createBody.safeParse({ key: 'ABC', title: '' });
        expect(result.ok).toBe(false);
      });
    });
  });

  describe('Given a table with numeric constraints (min, max)', () => {
    const metrics = d.table('metrics', {
      id: d.uuid().primary(),
      score: d.integer().min(0).max(100),
      rating: d.real().min(0).max(5),
    });

    describe('When generating create schemas via tableToSchemas()', () => {
      const { createBody } = tableToSchemas(metrics);

      it('Then rejects score below min', () => {
        const result = createBody.safeParse({ score: -1, rating: 3.0 });
        expect(result.ok).toBe(false);
      });

      it('Then rejects score above max', () => {
        const result = createBody.safeParse({ score: 101, rating: 3.0 });
        expect(result.ok).toBe(false);
      });

      it('Then accepts score within range', () => {
        const result = createBody.safeParse({ score: 50, rating: 3.0 });
        expect(result.ok).toBe(true);
      });

      it('Then rejects rating below min', () => {
        const result = createBody.safeParse({ score: 50, rating: -0.1 });
        expect(result.ok).toBe(false);
      });

      it('Then rejects rating above max', () => {
        const result = createBody.safeParse({ score: 50, rating: 5.1 });
        expect(result.ok).toBe(false);
      });
    });
  });

  describe('Given constraint metadata on columns', () => {
    it('Then min/max/regex are stored in column metadata', () => {
      const col = d.text().min(1).max(5).regex(/^[A-Z]+$/);
      expect(col._meta._minLength).toBe(1);
      expect(col._meta._maxLength).toBe(5);
      expect(col._meta._regex).toEqual(/^[A-Z]+$/);
    });

    it('Then numeric min/max are stored in column metadata', () => {
      const col = d.integer().min(0).max(100);
      expect(col._meta._minValue).toBe(0);
      expect(col._meta._maxValue).toBe(100);
    });

    it('Then constraints survive chaining with other builders', () => {
      const col = d.text().min(1).max(10).unique().nullable();
      expect(col._meta._minLength).toBe(1);
      expect(col._meta._maxLength).toBe(10);
      expect(col._meta.unique).toBe(true);
      expect(col._meta.nullable).toBe(true);
    });
  });

  // Type-level tests
  describe('Given type-safety constraints', () => {
    it('Then d.text() accepts .min(), .max(), .regex()', () => {
      d.text().min(1);
      d.text().max(100);
      d.text().regex(/^[a-z]+$/);
      d.text().min(1).max(10).regex(/abc/);
    });

    it('Then d.email() accepts .min(), .max()', () => {
      d.email().min(5).max(255);
    });

    it('Then d.integer() accepts .min(), .max()', () => {
      d.integer().min(0);
      d.integer().max(100);
      d.integer().min(0).max(100);
    });

    it('Then d.boolean() does NOT accept .min() or .regex()', () => {
      // @ts-expect-error — boolean has no min
      d.boolean().min(1);
      // @ts-expect-error — boolean has no regex
      d.boolean().regex(/abc/);
    });

    it('Then d.integer() does NOT accept .regex()', () => {
      // @ts-expect-error — integer has no regex
      d.integer().regex(/abc/);
    });

    it('Then constraint methods survive chaining with base methods', () => {
      // Must compile — constraint methods available after .unique()
      d.text().min(1).unique().max(5);
      d.integer().min(0).unique().max(100);
    });
  });
});
```

---

## 7. Implementation Plan

### Phase 1: Column metadata + builder methods + type scoping + schema derivation

**Scope:** Add constraint fields to `ColumnMetadata`, constraint methods to column builders with type-safe scoping via `StringColumnBuilder`/`NumericColumnBuilder`, and wire `columnToSchema()` to apply them.

**Files changed:**
- `packages/db/src/schema/column.ts` — Add `_minLength`, `_maxLength`, `_regex`, `_minValue`, `_maxValue` to `ColumnMetadata`. Add `StringColumnBuilder` and `NumericColumnBuilder` interfaces. Add `min()`, `max()`, `regex()` to runtime `createColumnWithMeta`.
- `packages/db/src/d.ts` — Update factory function return types to use `StringColumnBuilder` / `NumericColumnBuilder`.
- `packages/db/src/schema-derive/column-mapper.ts` — Update `columnToSchema()` to apply constraints from metadata.

**Acceptance criteria:** See E2E Acceptance Test above.

### Phase 2: Codegen constraint flow (separate issue)

Deferred. Requires design for how to extract runtime `ColumnMetadata` constraint values in the codegen pipeline (which uses ts-morph static analysis). See Unknown #3.

### Phase 3: Linear clone migration (separate issue)

Deferred. Depends on Phase 2 for full end-to-end value.

---

## 8. Metadata Design

### New fields on `ColumnMetadata`

```ts
export interface ColumnMetadata {
  // ... existing fields ...

  // String constraints (text, varchar, email)
  readonly _minLength?: number;
  readonly _maxLength?: number;
  readonly _regex?: RegExp;

  // Numeric constraints (integer, real, doublePrecision, serial)
  readonly _minValue?: number;
  readonly _maxValue?: number;
}
```

Field names are prefixed with `_` to distinguish them from SQL-level metadata (`length`, `precision`, `scale`) and to indicate they are application-level validation constraints, not database constraints.

### Why separate from `length`?

`varchar(255)` has `length: 255` which controls SQL DDL generation. `_maxLength` controls validation schema generation. For varchar, if `_maxLength` is not set, `length` is used as the fallback (preserving current behavior). This keeps the two concerns cleanly separated while maintaining backward compatibility.

### Migration snapshots — no changes

Validation constraints are NOT stored in `ColumnSnapshot` or `SchemaSnapshot`. They don't affect database structure — only application-level validation. This means:
- No migration generation for constraint changes
- No snapshot version bump
- Adding/removing constraints doesn't trigger a migration diff

### Codegen staleness note

Changing constraints requires re-running codegen to update client-side validation schemas (once Phase 2/codegen is implemented). This is the same class of staleness issue as any codegen output — not unique to this feature.
