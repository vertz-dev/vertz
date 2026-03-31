# CRUD Schema Validation

> **Bug fix**: Entity CRUD endpoints accept any JSON body without schema validation.
> Unknown fields are silently stripped, wrong types reach the DB, and LLMs get no
> feedback when they guess field names incorrectly.

## Problem

Today's CRUD pipeline flow for POST/PATCH:

```
ctx.body → stripReadOnlyFields() → before hook → db.create/update()
```

No schema validation happens. Four concrete failures:

1. **Unknown keys silently stripped** — `{ user_name: "Alice" }` becomes `{}`. No error.
   LLMs frequently guess snake_case and get no signal that the field was wrong.
2. **Wrong types reach the DB** — `{ email: 123 }` goes straight to Postgres.
   The DB may reject it, but the error message is a raw SQL error, not structured.
3. **Hidden fields accepted in input** — `{ passwordHash: "..." }` is not rejected
   in create or update bodies. The field is stripped from *responses* but accepted
   in *writes* — both in `createBody` and `updateBody` from `tableToSchemas`.
4. **ReadOnly/autoUpdate fields silently stripped** — `{ createdAt: "...", updatedAt: "..." }`
   is silently removed by `stripReadOnlyFields()`. No error tells the consumer these
   fields are immutable. (`autoUpdate` columns like `updatedAt` set `isReadOnly: true`
   internally, so they're covered by the same readOnly exclusion.)

### Why this matters for LLMs (Principle 3: AI agents are first-class users)

An LLM consuming a Vertz API will guess field names. When it sends `created_at`
instead of `createdAt`, the current behavior is silent success with missing data.
The LLM has no way to self-correct. Strict validation with helpful error messages
("Unrecognized key `created_at` — did you mean `createdAt`?") lets the LLM fix
its request on the next try.

## Breaking Changes

**This is a breaking behavior change.** Pre-v1, this is acceptable per our
[policies](../.claude/rules/policies.md) — but we must be explicit about it.

What breaks:
- Requests that send unknown/extra fields (previously silently stripped) → now 422
- Requests that send readOnly fields like `createdAt` (previously silently stripped) → now 422
- Requests that send hidden fields like `passwordHash` (previously accepted) → now 422

This is the correct behavior. Silent stripping masked real bugs and confused LLM
consumers. The changeset must include a `BREAKING:` note so `@vertz/server` consumers
know about the change.

## Existing Infrastructure

**Everything needed already exists. This is a wiring + strictness bug.**

| Component | Location | Status |
|-----------|----------|--------|
| `tableToSchemas()` | `packages/db/src/schema-derive/table-to-schemas.ts` | Exists, generates `createBody`/`updateBody` ObjectSchemas from table columns |
| `columnToSchema()` | `packages/db/src/schema-derive/column-mapper.ts` | Exists, maps SQL types → `@vertz/schema` validators (uuid, email, int, enum, etc.) |
| `ObjectSchema.strict()` | `packages/schema/src/schemas/object.ts:95` | Exists, rejects unknown keys with `UnrecognizedKeys` error |
| `EntityValidationError` | `@vertz/errors` | Exists, mapped to 422 with structured `details` in `entityErrorHandler()` |
| Action validation pattern | `packages/server/src/entity/action-pipeline.ts:49` | Working reference: `schema.parse() → BadRequestError` |

### What `tableToSchemas` gets wrong today

```typescript
// Current: excludes primary AND hasDefault — wrong for API input
if (!meta.primary && !meta.hasDefault) {
  createBodyShape[columnName] = baseSchema;
}

// Current: excludes only primary for update — missing readOnly, hidden
if (!meta.primary) {
  updateBodyShape[columnName] = baseSchema.optional();
}
```

Problems:
- `createBody` excludes columns with defaults (`role`) entirely — but they're valid optional fields
- Neither schema excludes `isReadOnly` or `hidden` columns from input
- Neither schema uses `.strict()` — unknown keys are silently stripped
- `sensitive` columns (`.is('sensitive')`) are writable — this is correct; they're
  write-only fields excluded from responses but accepted in input

### Correct column filter for API input schemas

```
Excluded from API input: meta.primary || meta.isReadOnly || meta._annotations.hidden
```

- `isReadOnly` subsumes `autoUpdate` (autoUpdate sets `isReadOnly: true`)
- `sensitive` columns are NOT excluded — they are writable, just hidden from responses
- Columns with `hasDefault` are included as **optional** (not excluded)
- Columns that are `nullable` without a default are included as **optional**

## API Surface

### Developer-facing: zero configuration required

Entity CRUD validation happens automatically. No code changes for entity authors.

```typescript
// This entity definition is UNCHANGED — validation is derived from the model
const taskEntity = entity('task', taskModel, {
  access: {
    create: rules.authenticated(),
    update: rules.entitlement('task:update'),
  },
});
```

### Error responses

**Unknown key (e.g., snake_case typo):**

```json
POST /api/tasks
{ "task_title": "Buy milk" }

→ 422
{
  "error": {
    "code": "ValidationError",
    "message": "Validation failed",
    "details": [
      {
        "path": [],
        "code": "unrecognized_keys",
        "message": "Unrecognized key(s) in object: \"task_title\". Did you mean \"title\"?"
      },
      {
        "path": ["title"],
        "code": "missing_property",
        "message": "Missing required property \"title\""
      }
    ]
  }
}
```

**Wrong type:**

```json
POST /api/tasks
{ "title": 123, "priority": "urgent" }

→ 422
{
  "error": {
    "code": "ValidationError",
    "message": "Validation failed",
    "details": [
      {
        "path": ["title"],
        "code": "invalid_type",
        "message": "Expected string, received number",
        "expected": "string",
        "received": "number"
      },
      {
        "path": ["priority"],
        "code": "invalid_enum_value",
        "message": "Expected 'low' | 'medium' | 'high', received 'urgent'"
      }
    ]
  }
}
```

Note: `expected` and `received` from `ParseError.issues` are passed through to the
response details. These extra diagnostic fields help LLMs understand the mismatch.

**Partial update with unknown key:**

```json
PATCH /api/tasks/123
{ "title": "Updated", "created_at": "2024-01-01" }

→ 422
{
  "error": {
    "code": "ValidationError",
    "message": "Validation failed",
    "details": [
      {
        "path": [],
        "code": "unrecognized_keys",
        "message": "Unrecognized key(s) in object: \"created_at\". Did you mean \"createdAt\"? Note: \"createdAt\" is read-only and cannot be set."
      }
    ]
  }
}
```

**Empty PATCH body:**

```json
PATCH /api/tasks/123
{}

→ 200 (unchanged entity returned)
```

Empty PATCH is valid — all fields are optional. The update schema makes every field
optional, so `{}` passes validation. `stripReadOnlyFields` returns `{}`, and `db.update()`
executes a no-op UPDATE. The response returns the unchanged entity.

**Tenant column in request body:**

```json
POST /api/tasks
{ "title": "Buy milk", "tenantId": "t-123" }

→ 422
{
  "error": {
    "code": "ValidationError",
    "message": "Validation failed",
    "details": [
      {
        "path": [],
        "code": "unrecognized_keys",
        "message": "Unrecognized key \"tenantId\". This field is auto-populated from your authentication token and must not be included in the request body."
      }
    ]
  }
}
```

### Opt-out for advanced use cases

Entities with `before.create` hooks that need custom input fields (not in the table
schema) can extend the input schema:

```typescript
const userEntity = entity('user', userModel, {
  // Extend the auto-derived create schema with a 'password' field
  // that isn't a DB column — the before hook hashes it into passwordHash
  createSchema: (derived) => derived.extend({ password: s.string().min(8) }),
  before: {
    create: async (data, ctx) => {
      const { password, ...rest } = data;
      return { ...rest, passwordHash: await hash(password) };
    },
  },
});
```

**Important:** The pipeline always applies `.strict()` AFTER the override callback.
This means `derived.extend(...)` does not need to call `.strict()` — it's enforced
automatically. The override cannot accidentally disable strict mode.

**Callback signature:**
```typescript
createSchema?: (derived: ObjectSchema<DerivedCreateShape>) => ObjectSchema<any>;
updateSchema?: (derived: ObjectSchema<DerivedUpdateShape>) => ObjectSchema<any>;
```

The callback executes once during `createCrudPipeline()` setup (server startup),
not per-request.

If `createSchema` or `updateSchema` is not provided, the auto-derived strict schema
is used. This makes the common case zero-config while supporting escape hatches.

## Manifesto Alignment

| Principle | How this aligns |
|-----------|----------------|
| **If it builds, it works** | Schema validation catches runtime errors that the type system can't — malformed API payloads |
| **AI agents are first-class users** | "Did you mean?" suggestions let LLMs self-correct on next request |
| **One way to do things** | Validation is automatic, not opt-in. No decision to make. |
| **Explicit over implicit** | Error messages name the exact field and suggest the fix |
| **Production-ready by default** | No configuration needed for secure, validated CRUD |

## Non-Goals

- **Custom validation logic in schemas** — use `before` hooks or custom actions for business rules
- **Coercion (string → number)** — strict type matching for now. If the client sends
  `"123"` for a number field, it's an error. Targeted coercion for LLM-friendly inputs
  (e.g., string-to-number for integer columns) may be revisited as a separate follow-up
  enhancement, since LLM tool-calling frameworks often serialize everything as strings.
- **Dev-only vs production mode** — validation runs in all environments. The error messages are helpful but never leak sensitive info.
- **Validating query parameters** — list/get query param validation is separate work.
- **Fixing action validation status code** — custom actions currently return 400 (BadRequestError)
  for schema failures while CRUD will return 422 (EntityValidationError). 422 is
  semantically correct for validation failures. A follow-up issue should migrate custom
  actions to 422 for consistency, but that's out of scope here.

## Unknowns

1. **`createSchema` type flow to `before` hooks** — The `before.create` hook currently
   receives `TModel['table']['$create_input']`. If `createSchema` adds fields, the
   hook's `data` parameter type should include those fields. This requires a type-level
   change to `EntityConfig` (conditional type on the `before` hooks). The generic
   plumbing is non-trivial but doable. Resolved during Phase 3 implementation.

## Resolved

1. **Tenant column handling** — Exclude from schema. The pipeline enhances
   `unrecognized_keys` errors for known system columns (tenantId, PK) with contextual
   messages, post-validation. See Phase 3.

2. **Default columns in create** — Include as optional fields. Defaults are overridable,
   not forbidden.

3. **`sensitive` columns** — Accepted in input, excluded from responses only. They are
   write-only fields (e.g., API keys stored for later use). Correct behavior.

4. **`extend()` losing `.strict()` mode** — Pipeline applies `.strict()` AFTER the
   override callback, not before. The user never needs to think about strict mode.

5. **Empty PATCH body** — Valid. All update fields are optional, so `{}` passes. Results
   in a no-op UPDATE returning the unchanged entity.

## Type Flow Map

```
TableDef._columns
  → columnToSchema(meta)        // maps each column to @vertz/schema validator
  → apiCreateSchema()           // ObjectSchema<{...}>.strict()
  → crud-pipeline.create()      // schema.safeParse(data) → Result<T, ParseError>
  → EntityValidationError       // issues → { path, code, message, expected?, received? }[]
  → entityErrorHandler()        // 422 + structured details
  → JSON response               // { error: { code, message, details } }
```

No dead generics. The table type flows through `tableToSchemas` into concrete
ObjectSchema instances used at runtime.

## E2E Acceptance Test

```typescript
describe('Feature: CRUD schema validation', () => {
  describe('Given an entity with typed columns (string title, enum priority)', () => {
    describe('When POST with unknown key "task_title"', () => {
      it('Then returns 422 with unrecognized_keys error listing "task_title"', () => {});
      it('Then suggests "title" as the closest match', () => {});
    });

    describe('When POST with wrong type (title: 123)', () => {
      it('Then returns 422 with invalid_type error at path ["title"]', () => {});
    });

    describe('When POST with missing required field', () => {
      it('Then returns 422 with missing_property error', () => {});
    });

    describe('When POST with valid camelCase payload', () => {
      it('Then returns 201 with the created entity', () => {});
    });

    describe('When PATCH with unknown key "created_at"', () => {
      it('Then returns 422 with unrecognized_keys error', () => {});
    });

    describe('When PATCH with valid partial payload', () => {
      it('Then returns 200 with the updated entity', () => {});
    });

    describe('When PATCH with empty body {}', () => {
      it('Then returns 200 with the unchanged entity', () => {});
    });

    describe('When POST with readOnly field "createdAt"', () => {
      it('Then returns 422 — readOnly fields are not in the input schema', () => {});
    });

    describe('When POST with hidden field "passwordHash"', () => {
      it('Then returns 422 — hidden fields are not in the input schema', () => {});
    });
  });

  describe('Given a tenant-scoped entity', () => {
    describe('When POST with tenantId in body', () => {
      it('Then returns 422 with message explaining tenantId is auto-populated', () => {});
    });
  });

  describe('Given an entity with createSchema override', () => {
    describe('When POST with the extended field "password"', () => {
      it('Then accepts the field and passes it to the before hook', () => {});
    });

    describe('When POST with unknown field on extended schema', () => {
      it('Then returns 422 — strict mode is enforced after override', () => {});
    });
  });

  // Type-level tests
  describe('Type safety', () => {
    it('// @ts-expect-error — createSchema override must return ObjectSchema', () => {});
    it('// @ts-expect-error — cannot extend with conflicting column name types', () => {});
  });
});
```

---

## Implementation Plan

### Phase 1: API input schemas + wire validation into CRUD pipeline

**Goal:** Generate correct create/update schemas from table definitions and validate
request bodies before any CRUD processing. This is the minimum viable fix — a correct
schema without wiring delivers zero value, and wiring without a correct schema is untestable.

**Changes:**
- `packages/db/src/schema-derive/table-to-schemas.ts` — add `apiCreateBody` and
  `apiUpdateBody` schemas with correct exclusions and `.strict()`
  - Column filter: `meta.primary || meta.isReadOnly || meta._annotations.hidden`
  - `isReadOnly` subsumes `autoUpdate` (no separate check needed)
  - Columns with `hasDefault` or `nullable` included as optional in create
  - All columns optional in update
  - Keep existing `createBody`/`updateBody` unchanged for backward compat
- `packages/server/src/entity/crud-pipeline.ts` — call `schema.safeParse(data)` at
  the top of `create()` and `update()`, before `stripReadOnlyFields()`
  - Generate schemas once in `createCrudPipeline()` setup (one-time server startup cost)
  - Use `EntityValidationError` (not `BadRequestError`) for structured 422 responses
  - Pass full `ParseError.issues` including `expected`/`received` fields to error details
  - Keep `stripReadOnlyFields()` as defense-in-depth

**New flow:**
```
data → apiCreateBody.safeParse(data) → [422 if invalid]
     → stripReadOnlyFields() (defense-in-depth)
     → before.create hook → db.create()
```

**Acceptance Criteria:**
```typescript
describe('Given a table with readOnly, hidden, and default columns', () => {
  describe('When generating apiCreateBody', () => {
    it('Then excludes primary key columns', () => {});
    it('Then excludes readOnly columns (createdAt)', () => {});
    it('Then excludes autoUpdate columns (updatedAt) via isReadOnly', () => {});
    it('Then excludes hidden columns (passwordHash)', () => {});
    it('Then includes columns with defaults as optional (role)', () => {});
    it('Then includes required columns without defaults (name, email)', () => {});
    it('Then accepts sensitive columns (they are writable)', () => {});
    it('Then rejects unknown keys in strict mode', () => {});
  });

  describe('When generating apiUpdateBody', () => {
    it('Then excludes primary key columns', () => {});
    it('Then excludes readOnly columns', () => {});
    it('Then excludes hidden columns', () => {});
    it('Then makes all remaining columns optional', () => {});
    it('Then rejects unknown keys in strict mode', () => {});
    it('Then accepts empty object {}', () => {});
  });
});

describe('Given a CRUD endpoint with auto-derived validation', () => {
  describe('When POST with { task_title: "Buy milk" }', () => {
    it('Then returns 422 with unrecognized_keys details', () => {});
  });

  describe('When POST with { title: 123 }', () => {
    it('Then returns 422 with invalid_type at ["title"]', () => {});
  });

  describe('When POST with valid { title: "Buy milk" }', () => {
    it('Then returns 201 with the created task', () => {});
  });

  describe('When PATCH with { unknown_field: true }', () => {
    it('Then returns 422 with unrecognized_keys details', () => {});
  });

  describe('When PATCH with valid { title: "Updated" }', () => {
    it('Then returns 200', () => {});
  });

  describe('When PATCH with empty {}', () => {
    it('Then returns 200 with unchanged entity', () => {});
  });
});
```

### Phase 2: "Did you mean?" suggestions for unknown keys

**Goal:** When strict mode rejects unknown keys, suggest the closest valid field name.

**Changes:**
- `packages/schema/src/utils/levenshtein.ts` — add Levenshtein distance utility
- `packages/schema/src/schemas/object.ts` — enhance `UnrecognizedKeys` error message
  with suggestions when a close match exists (distance ≤ 3)

The Levenshtein logic belongs in `@vertz/schema` (not server-side) because it's
intrinsic to `ObjectSchema.strict()` error formatting. Any consumer of strict schemas
gets suggestions, not just CRUD.

**Acceptance Criteria:**
```typescript
describe('Given a strict ObjectSchema with keys ["title", "createdAt", "priority"]', () => {
  describe('When parsing { task_title: "x" }', () => {
    it('Then error message includes \'Did you mean "title"?\'', () => {});
  });

  describe('When parsing { created_at: "x" }', () => {
    it('Then error message includes \'Did you mean "createdAt"?\'', () => {});
  });

  describe('When parsing { xyzzy: "x" }', () => {
    it('Then error message does NOT include suggestions (no close match)', () => {});
  });

  describe('When parsing { prioirty: "low" }', () => {
    it('Then error message includes \'Did you mean "priority"?\'', () => {});
  });
});
```

### Phase 3: Schema overrides + tenant column exclusion

**Goal:** Allow entities to extend the auto-derived schema for custom input fields,
and reject tenant columns with contextual error messages.

**Changes (overrides):**
- `packages/server/src/entity/types.ts` — add optional `createSchema` and
  `updateSchema` to `EntityConfig`
  - Signature: `(derived: ObjectSchema<DerivedShape>) => ObjectSchema<any>`
  - Executes once at entity construction time, not per-request
- `packages/server/src/entity/entity.ts` — apply override during entity construction
- `packages/server/src/entity/crud-pipeline.ts` — apply `.strict()` AFTER the override
  callback: `const finalSchema = (override ? override(derived) : derived).strict()`

**Changes (tenant column):**
- CRUD pipeline schema generation excludes the entity's `tenantColumn` from input schemas
  (same `omit()` mechanism as primary keys)
- Post-validation step: scan `unrecognized_keys` errors for known system columns
  (`tenantId`, primary key) and enhance messages with contextual hints:
  - `tenantId`: "This field is auto-populated from your authentication token and must
    not be included in the request body."
  - Primary key: "Primary keys are auto-generated and cannot be set."

**Acceptance Criteria:**
```typescript
describe('Given an entity with createSchema override adding "password" field', () => {
  describe('When POST with { name: "Alice", email: "a@b.com", password: "secret123" }', () => {
    it('Then accepts the extended field', () => {});
    it('Then passes the field through to before.create hook', () => {});
  });

  describe('When POST without the extended field', () => {
    it('Then returns 422 if the extended field is required', () => {});
  });

  describe('When POST with unknown field on extended schema', () => {
    it('Then returns 422 — strict mode enforced after override', () => {});
  });
});

describe('Given a tenant-scoped entity', () => {
  describe('When POST with { title: "Task", tenantId: "t-123" }', () => {
    it('Then returns 422 with contextual message about tenantId being auto-populated', () => {});
  });

  describe('When POST with { title: "Task" } (no tenantId)', () => {
    it('Then succeeds — tenantId auto-set from auth context', () => {});
  });
});
```

## Follow-up Issues (out of scope)

- **Migrate custom action validation to 422** — Actions currently return 400 (BadRequestError)
  for schema failures. Should use EntityValidationError (422) for consistency.
- **Targeted coercion for LLM inputs** — String-to-number for integer/float columns.
  Many LLM tool-calling frameworks serialize everything as strings.
- **`createSchema` type flow to `before` hooks** — Wire the extended schema type into
  the before hook's `data` parameter via conditional types on `EntityConfig`.
