# @vertz/schema — Package Design Plan

## Overview

TypeScript-first schema validation library for the Vertz framework. Follows the Zod v4 API surface with zero runtime dependencies. Provides static type inference via `Infer<typeof schema>` and treats OpenAPI v3.1 Schema Object output as a first-class citizen (which is a superset of JSON Schema Draft 2020-12, so JSON Schema output is covered for free).

Works standalone. Integrates natively with `@vertz/core` and `@vertz/compiler`.

All code is written from scratch in `packages/schema/`. Every line is generated fresh following strict TDD — one test at a time, write one failing test, implement just enough to pass, refactor, repeat.

See also: [Core API Design](./vertz-core-api-design.md) (consumer of this package), [Testing Design](./vertz-testing-design.md).

---

## Public API Surface

### Factory Object

The package exports a `schema` factory (aliased as `s`):

```typescript
import { s } from '@vertz/schema';
// or
import { schema } from '@vertz/schema';
```

### Primitives

```typescript
s.string()      s.number()      s.bigint()
s.boolean()     s.symbol()      s.date()
s.undefined()   s.null()        s.nan()
s.any()         s.unknown()     s.never()
s.void()
```

Convenience: `s.int()` → `s.number().int()`

### Composite Types

```typescript
s.object({ name: s.string(), age: s.number() })
s.array(s.string())
s.tuple([s.string(), s.number()])
s.union([s.string(), s.number()])
s.discriminatedUnion('type', [schemaA, schemaB])
s.intersection(schemaA, schemaB)
s.record(s.string())              // Record<string, string> — single arg = value schema, implicit string key
s.record(s.string(), s.number())  // Record<string, number> — two args = key schema + value schema
s.map(s.string(), s.number())
s.set(s.string())
s.enum(['a', 'b', 'c'])
s.literal('hello')
```

### Specialized

```typescript
s.file()                          // File/Blob validation
s.instanceof(MyClass)             // Class instance check
s.custom<T>((val): val is T => ...) // Arbitrary validation
s.lazy(() => schema)              // Recursive types
```

### String Formats (standalone — one way to do things)

```typescript
s.email()     s.uuid()      s.url()       s.hostname()
s.ipv4()      s.ipv6()      s.base64()    s.hex()
s.jwt()       s.cuid()      s.ulid()      s.nanoid()

s.iso.date()  s.iso.time()  s.iso.datetime()  s.iso.duration()
```

Each format is a **standalone factory method** — there is no `.email()`, `.uuid()`, `.url()`, etc. on `StringSchema`. One way to create an email schema: `s.email()`. This follows the framework's one-way principle: one obvious path per intent, no aliases that do the same thing from different entry points.

Format schemas extend `StringSchema` internally, so all string methods (`.min()`, `.max()`, `.regex()`, `.trim()`, etc.) are available on them.

### Coercion

```typescript
s.coerce.string()   s.coerce.number()
s.coerce.boolean()  s.coerce.bigint()
s.coerce.date()
```

`s.date()` validates Date objects strictly — no string-to-Date coercion. Use `s.coerce.date()` for auto-coercion from strings/numbers.

### String Methods

```typescript
// Validation
.min(n)  .max(n)  .length(n)  .regex(pattern)
.startsWith(prefix)  .endsWith(suffix)  .includes(substring)
.uppercase()  .lowercase()

// Transforms
.trim()  .toLowerCase()  .toUpperCase()  .normalize()
```

### Number Methods

```typescript
.gt(n)  .gte(n)  .lt(n)  .lte(n)    // aliases: .min() = .gte(), .max() = .lte()
.int()  .positive()  .negative()
.nonnegative()  .nonpositive()
.multipleOf(n)  .finite()           // alias: .step() = .multipleOf()
```

### Object Methods

```typescript
.shape           // access shape definition
.keyof()         // EnumSchema of keys
.extend(shape)   .pick(keys)   .omit(keys)
.partial()       .required()
.strict()        .passthrough()   .catchall(schema)
```

### Array / Set / Tuple Methods

```typescript
.min(n)  .max(n)  .length(n)  // .size() for sets
.rest(schema)                  // tuple rest element
```

### Enum Methods

```typescript
.exclude(values)  .extract(values)
```

### Named / Referenced Schemas

Any schema can be given a name via `.id()`. Named schemas become `$ref` entries in JSON Schema output (`$defs` at the root). This works on any schema — including primitives — enabling named types for type-augmentation and client SDK generation.

```typescript
// Name a primitive — produces a $ref in JSON Schema output
const UserId = s.uuid().id('UserId');

// Name a composite
const Address = s.object({
  street: s.string(),
  city: s.string(),
  zip: s.string(),
}).id('Address');

// Reuse inside another schema — becomes $ref automatically
const User = s.object({
  id: UserId,
  name: s.string(),
  address: Address,
}).id('User');

// JSON Schema output for User:
// {
//   "$defs": {
//     "UserId": { "type": "string", "format": "uuid" },
//     "Address": { "type": "object", "properties": { ... } },
//   },
//   "type": "object",
//   "properties": {
//     "id": { "$ref": "#/$defs/UserId" },
//     "address": { "$ref": "#/$defs/Address" },
//     ...
//   }
// }
```

`.id()` does not affect parsing or type inference — it is metadata only. The name propagates through `.optional()`, `.nullable()`, `.default()`, and other wrappers.

**JSON Schema vs OpenAPI output:**

- **`.toJSONSchema()`** (standalone, per-schema) — uses `$defs` / `$ref` at the schema root (JSON Schema standard)
- **OpenAPI document generation** (compiler-level, full API) — named schemas are placed in `components.schemas` and referenced via `$ref: '#/components/schemas/SchemaName'`

The schema package itself handles the JSON Schema layer (`$defs`/`$ref`). The compiler maps these to OpenAPI `components/schemas` when generating the full OpenAPI document. This means:

```typescript
// Schema package output (per-schema .toJSONSchema()):
{
  "$defs": {
    "UserId": { "type": "string", "format": "uuid" }
  },
  "type": "object",
  "properties": {
    "id": { "$ref": "#/$defs/UserId" }
  }
}

// Compiler output (full OpenAPI document):
{
  "openapi": "3.1.0",
  "components": {
    "schemas": {
      "UserId": { "type": "string", "format": "uuid" },
      "User": {
        "type": "object",
        "properties": {
          "id": { "$ref": "#/components/schemas/UserId" }
        }
      }
    }
  }
}
```

The schema package exposes the registry of all named schemas so the compiler can collect them into `components.schemas`.

### Universal Methods (on all schemas)

```typescript
// Wrappers
.optional()    .nullable()    .default(value)

// Identity
.id(name)                                     // name for $ref in JSON Schema

// Metadata
.describe(description)   .meta(data)   .example(value)

// Refinements
.refine(predicate, options?)
.superRefine((val, ctx) => { ctx.addIssue(...) })
.check((val, ctx) => { ctx.addIssue(...) })

// Transforms
.transform(fn)     // changes output type
.pipe(schema)      // chain schemas
.catch(value)      // fallback on parse failure

// Effects
.brand<'Name'>()   // nominal typing (type-level only)
.readonly()        // Object.freeze() output

// Parsing
.parse(value)           // throws ParseError on failure
.safeParse(value)       // returns { success, data } | { success, error }

// Introspection
.metadata              // SchemaMetadata getter
.toJSONSchema()        // OpenAPI v3.1 / JSON Schema output
```

### Standalone Functions

```typescript
import { preprocess, toJSONSchema } from '@vertz/schema';

preprocess(fn, schema)         // transform before validation
toJSONSchema(schema)           // standalone conversion function
```

### Type Inference

```typescript
import { Infer, Input, Output } from '@vertz/schema';

type User = Infer<typeof userSchema>;    // output type
type UserInput = Input<typeof userSchema>; // input type (differs when transforms exist)
```

### Per-Rule Custom Error Messages

Every constraint method accepts an optional error message:

```typescript
s.string().min(5, 'Must be at least 5 characters')
s.number().gt(0, { message: 'Must be positive' })
```

---

## Architecture

### Dual Type Parameters

The base `Schema` class carries two type parameters — `Output` and `Input`:

```typescript
abstract class Schema<O, I = O> { ... }
```

`I` defaults to `O` and only diverges when `.transform()` is applied. This keeps backward compatibility — existing `Schema<T>` references continue to work since `I` defaults to `T`.

### Parse Flow

1. Type check (is it the expected JS type?)
2. Constraint validation (min, max, regex, etc.)
3. Refinements (refine, superRefine, check) — receive the **pre-transform** value
4. Transforms (transform, pipe) — output may differ from input type

Refinements validate the base-typed value before transforms alter it. This means `.refine()` on `s.string().transform(Number)` receives a `string`, not a `number`. To validate the transformed output, use `.pipe()` to chain into a second schema with its own refinements.

### Error System

```typescript
enum ErrorCode {
  invalid_type, too_small, too_big, invalid_string,
  invalid_enum_value, invalid_literal, invalid_union,
  invalid_date, missing_property, unrecognized_keys,
  custom, invalid_intersection, not_multiple_of, not_finite
}

interface ValidationIssue {
  code: ErrorCode;
  message: string;
  path: (string | number)[];
  expected?: string;
  received?: string;
}

class ParseError extends Error {
  issues: ValidationIssue[];
}
```

Errors aggregate — object/array schemas collect all issues, not just fail-fast.

### Metadata & JSON Schema Output

Every schema has a `.metadata` getter returning `SchemaMetadata` — structured data the compiler can consume without executing the schema.

`.toJSONSchema()` outputs OpenAPI v3.1 Schema Object. Since v3.1 is a superset of JSON Schema Draft 2020-12, this covers both.

Key output mappings:
- Named schemas (`.id()`) → `$ref` + `$defs`
- `discriminatedUnion` → `oneOf` + `discriminator`
- `intersection` → `allOf`
- `tuple` → `prefixItems` + `items` (for rest)
- Strict object → `additionalProperties: false`
- Nullable → `type: ["string", "null"]` or `anyOf`
- `lazy` (recursive) → `$ref` + `$defs`

Named schemas and lazy schemas both use `$ref`/`$defs` in the per-schema JSON Schema output. At the OpenAPI document level (compiler), named schemas map to `components/schemas` with `$ref: '#/components/schemas/...'`. The schema package exposes a registry API so the compiler can collect all named schemas for the `components` section. This enables:
- Full OpenAPI `components/schemas` generation with proper `$ref` references
- Client SDK generators can produce named types (e.g., `type UserId = string`)
- Type-augmentation patterns (a named `UserId` string can be extended at the consumer level)

---

## Package Structure

```
packages/schema/
├── src/
│   ├── index.ts                    # Public API + factory object
│   ├── core/
│   │   ├── schema.ts               # Base Schema<O, I>, Optional, Nullable, Default
│   │   ├── types.ts                # SchemaMetadata, SchemaType, ValidationRules
│   │   ├── errors.ts               # ErrorCode, ValidationIssue, ParseError
│   │   ├── parse-context.ts        # ParseContext for issue collection
│   │   └── registry.ts             # Named schema registry for $ref resolution
│   ├── schemas/
│   │   ├── string.ts
│   │   ├── number.ts
│   │   ├── boolean.ts
│   │   ├── bigint.ts
│   │   ├── symbol.ts
│   │   ├── date.ts
│   │   ├── object.ts
│   │   ├── array.ts
│   │   ├── tuple.ts
│   │   ├── enum.ts
│   │   ├── union.ts
│   │   ├── discriminated-union.ts
│   │   ├── intersection.ts
│   │   ├── record.ts
│   │   ├── map.ts
│   │   ├── set.ts
│   │   ├── literal.ts
│   │   ├── any.ts                  # Any, Unknown, Null, Undefined, Void, Never
│   │   ├── lazy.ts
│   │   ├── coerced.ts
│   │   ├── custom.ts
│   │   ├── instanceof.ts
│   │   ├── file.ts
│   │   ├── nan.ts
│   │   └── formats/
│   │       ├── index.ts
│   │       ├── email.ts
│   │       ├── uuid.ts
│   │       ├── url.ts
│   │       ├── hostname.ts
│   │       ├── ipv4.ts
│   │       ├── ipv6.ts
│   │       ├── base64.ts
│   │       ├── hex.ts
│   │       ├── jwt.ts
│   │       ├── cuid.ts
│   │       ├── ulid.ts
│   │       ├── nanoid.ts
│   │       └── iso.ts
│   ├── transforms/
│   │   ├── transform.ts
│   │   ├── pipe.ts
│   │   └── preprocess.ts
│   ├── refinements/
│   │   ├── refine.ts
│   │   ├── super-refine.ts
│   │   └── check.ts
│   ├── effects/
│   │   ├── brand.ts
│   │   ├── readonly.ts
│   │   └── catch.ts
│   ├── validation/
│   │   ├── validators.ts
│   │   └── formats.ts
│   ├── utils/
│   │   └── type-inference.ts
│   └── introspection/
│       └── json-schema.ts
```

---

## Implementation Phases (TDD)

Each phase follows strict TDD — one test at a time. Write one failing test, implement just enough to pass, refactor, then write the next test.

### Phase 1: Core Infrastructure

Refactor base `Schema<O, I>`, overhaul error system, add ParseContext, add `.id()` for named schemas, add `.toJSONSchema()` instance method, update type inference utilities.

**Files:**
- `src/core/schema.ts` — dual type params, `.id()` method, method signatures for refine/transform/pipe/etc.
- `src/core/errors.ts` — ErrorCode enum, ValidationIssue, ParseError
- `src/core/parse-context.ts` — NEW
- `src/core/registry.ts` — NEW, named schema registry for `$ref` resolution in JSON Schema output
- `src/core/types.ts` — extend SchemaType union and SchemaMetadata (add `id` field)
- `src/utils/type-inference.ts` — Input vs Output for transforms
- `src/introspection/json-schema.ts` — instance method + `$ref`/`$defs` for named schemas

**Tests first:**
- `__tests__/unit/core/schema.test.ts`
- `__tests__/unit/core/errors.test.ts`
- `__tests__/unit/core/parse-context.test.ts`
- `__tests__/unit/core/registry.test.ts`

### Phase 2: Refinements & Transforms

`.refine()`, `.superRefine()`, `.check()`, `.transform()`, `.pipe()`, `preprocess()`, `.catch()`, `.brand()`, `.readonly()`

**Files:** `src/refinements/*`, `src/transforms/*`, `src/effects/*`

**Tests first:**
- `__tests__/unit/refinements/refine.test.ts`
- `__tests__/unit/refinements/super-refine.test.ts`
- `__tests__/unit/transforms/transform.test.ts`
- `__tests__/unit/transforms/pipe.test.ts`
- `__tests__/unit/effects/brand.test.ts`
- `__tests__/unit/effects/readonly.test.ts`
- `__tests__/unit/effects/catch.test.ts`

### Phase 3: Missing Schema Types

`DiscriminatedUnionSchema`, `IntersectionSchema`, `LazySchema`, `BigIntSchema`, `NeverSchema`, `NanSchema`, `CustomSchema`, `InstanceOfSchema`

**Tests first:** one test file per schema type.

### Phase 4: Existing Schema Enhancements

- NumberSchema: `.gt()`, `.lt()`, `.multipleOf()`, fix constraint storage
- ObjectSchema: `.catchall()`, `.keyof()`, fix `.required()`
- TupleSchema: `.rest()` support
- StringSchema: `.uppercase()`, `.lowercase()` validation
- Per-rule custom error messages on all existing constraints
- Fix email validation (too permissive)

**Tests first:** extend existing test files with new cases.

### Phase 5: String Format Schemas

All format validators: uuid, url, hostname, ipv4, ipv6, base64, hex, jwt, cuid, ulid, nanoid.

**Tests first:** one test file per format.

### Phase 6: Remaining Types

`MapSchema`, `SetSchema`, `SymbolSchema`, `FileSchema`

**Files:** `src/schemas/map.ts`, `src/schemas/set.ts`, `src/schemas/symbol.ts`, `src/schemas/file.ts`

**Tests first:**
- `__tests__/unit/schemas/map.test.ts`
- `__tests__/unit/schemas/set.test.ts`
- `__tests__/unit/schemas/symbol.test.ts`
- `__tests__/unit/schemas/file.test.ts`

### Phase 7: JSON Schema Output Completions

Fix/add JSON Schema output for all schema types:
- Named schemas → `$ref` + `$defs` via `.id()`
- Tuple → `prefixItems` + `items` (for `.rest()`)
- DiscriminatedUnion → `oneOf` + `discriminator`
- Intersection → `allOf`
- Strict object → `additionalProperties: false`
- Nullable → `type: ["string", "null"]` or `anyOf`
- Record → `additionalProperties` with value schema
- Lazy/recursive → `$ref` + `$defs`
- Number → `exclusiveMinimum`/`exclusiveMaximum` for `.gt()`/`.lt()`
- Date → `type: "string", format: "date-time"` (JSON has no Date type)

**Tests first:**
- `__tests__/integration/openapi-output.test.ts`
- `__tests__/integration/named-schemas.test.ts`
- `__tests__/integration/recursive-schemas.test.ts`

---

## Testing Strategy

### TDD Process (One Test at a Time)

1. Write **one** test describing a single expected behavior
2. Run the test — confirm it fails (red)
3. Write the **minimal** implementation to make that one test pass (green)
4. Refactor while keeping all tests green
5. Go back to step 1 with the next behavior

Never write multiple tests before implementing. The cycle is always: one red → one green → refactor → repeat.

### Test Structure Per Schema Type

```typescript
describe('XxxSchema', () => {
  describe('basic validation', () => {
    it('accepts valid values')
    it('rejects invalid types')
  })

  describe('.constraintName()', () => {
    it('accepts values meeting constraint')
    it('rejects values failing constraint')
    it('uses custom error message when provided')
    it('reports correct error code')
    it('reports correct error path')
  })

  describe('chaining', () => {
    it('composes with .optional()')
    it('composes with .nullable()')
    it('composes with .default()')
    it('composes with .refine()')
    it('composes with .transform()')
  })

  describe('metadata', () => {
    it('exposes correct metadata')
    it('includes description and examples')
  })

  describe('.toJSONSchema()', () => {
    it('produces correct JSON Schema')
    it('includes constraints')
    it('includes format')
  })

  describe('type inference', () => {
    it('infers correct output type')
    it('infers correct input type when different')
  })

  describe('edge cases', () => { ... })
})
```

### Integration Tests

- `__tests__/integration/schema-usage.test.ts` — end-to-end usage patterns
- `__tests__/integration/openapi-output.test.ts` — OpenAPI v3.1 output correctness
- `__tests__/integration/named-schemas.test.ts` — `.id()`, `$ref`/`$defs` output, nested named schemas, named primitives
- `__tests__/integration/recursive-schemas.test.ts` — lazy/recursive patterns
- `__tests__/integration/complex-compositions.test.ts` — multi-level pick/omit/extend/partial chains

### Type Inference Tests

Use vitest `expectTypeOf` for compile-time checks:

```typescript
it('has different Input and Output for transforms', () => {
  const sch = s.string().transform(val => parseInt(val, 10));
  expectTypeOf<Infer<typeof sch>>().toEqualTypeOf<number>();
  expectTypeOf<Input<typeof sch>>().toEqualTypeOf<string>();
});
```

---

## Gap Analysis: Existing Implementation (Reference Only)

The existing implementation in the reference codebase serves as reference for patterns and decisions. All code is written from scratch. Key findings from reviewing the existing code:

### Works Well (Keep the patterns)
- Base Schema with parse/safeParse, metadata introspection
- String/Number/Boolean/Date/Object/Array/Tuple/Record/Union/Enum/Literal schemas
- ISO date/time schemas, coercion, optional/nullable/default wrappers
- Zero dependencies

### Critical Gaps (Must Address)
- **No named schemas (`.id()`)** — cannot produce `$ref`/`$defs` in JSON Schema, no reusable component schemas
- **No refine/superRefine/check** — cannot add custom validation
- **No transform** — Input and Output types are identical
- **No pipe** — cannot chain schemas
- **No discriminatedUnion** — no efficient union dispatch, no OpenAPI discriminator
- **No lazy** — cannot model recursive types
- **No per-rule custom error messages**
- **Error system too simple** — no ErrorCode enum, no issue aggregation

### Important Gaps (Should Address)
- No intersection, catch, brand, readonly, preprocess
- No custom, instanceof, bigint, never, nan schemas
- Number missing `.gt()`, `.lt()`, `.multipleOf()`
- Object `.required()` is a no-op, missing `.catchall()`, `.keyof()`
- Tuple missing `.rest()`
- Many string format validators missing

### Needs Improvement
- Number constraints (positive/negative) stored in `_metadata` instead of `rules` — not reflected in JSON Schema
- Array constraints same issue
- JSON Schema: tuple uses `anyOf` instead of `prefixItems`
- JSON Schema: strict objects don't emit `additionalProperties: false`
- JSON Schema: nullable not handled
- Email validation too permissive
- DateSchema auto-coerces (should be opt-in via `s.coerce.date()`)

---

## Verification

After implementation:

1. `yarn test` — all unit and integration tests pass
2. `yarn build` — package builds with no TypeScript errors
3. Type inference tests pass (compile-time checks via `expectTypeOf`)
4. JSON Schema output matches OpenAPI v3.1 spec for all schema types
5. Named schemas (`.id()`) produce correct `$ref`/`$defs` in JSON Schema output
6. Zero runtime dependencies confirmed in `package.json`

---

## Open Items

- [ ] **Date serialization in responses** — Should `s.date()` output `type: "string", format: "date-time"` in JSON Schema (since JSON has no Date type)? Should the framework's response serialization layer auto-convert Date → ISO string, or should schema provide a `.toISOString()` convenience method on DateSchema?
- [ ] **`.brand()` and JSON Schema** — Brands are type-level only. JSON Schema should ignore them (no output). Confirm this is correct.
- [ ] **`.readonly()` and JSON Schema** — Should `.readonly()` emit `readOnly: true` in JSON Schema output? OpenAPI v3.1 supports `readOnly`.
- [ ] **`s.lazy()` circular `$ref`** — How does `.toJSONSchema()` handle circular references? Needs a visited-set or depth limit to avoid infinite recursion.
- [ ] **Core API plan alignment** — The [Core API Design](./vertz-core-api-design.md) has been updated to use standalone format factories (`s.email()`, `s.uuid()`, `s.url()`). Verify no remaining references to chained format methods across all plans.
