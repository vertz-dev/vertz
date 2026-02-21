# @vertz/schema — Implementation Plan

## Overview

Complete implementation of `@vertz/schema` from scratch. TypeScript-first schema validation library with zero runtime dependencies. Follows the Zod v4 API surface, provides static type inference via `Infer<typeof schema>`, and treats OpenAPI v3.1 Schema Object output as a first-class citizen.

All code is written from scratch in `packages/schema/`. Every line follows strict TDD — one test at a time, write one failing test, implement just enough to pass, refactor, repeat.

See also: [Schema Design](./vertz-schema-design.md), [Core API Design](./vertz-core-api-design.md), [Core Implementation](./vertz-core-implementation.md).

---

## Architectural Decisions

| Decision | Choice |
|----------|--------|
| Base class | Abstract `Schema<O, I = O>` with dual type parameters for input/output divergence |
| Parse flow | Type check → Constraint validation → Refinements (pre-transform) → Transforms (post). Pipeline order is achieved via wrapper composition — each `.refine()`, `.transform()`, etc. returns a wrapper schema that delegates to the inner schema's `_runPipeline()` then applies its own logic |
| Error system | `ErrorCode` enum + `ValidationIssue[]` aggregation + `ParseError extends Error` |
| Named schemas | `.id(name)` stores metadata; JSON Schema uses `$defs`/`$ref`; compiler maps to `components/schemas` |
| String formats | Standalone factory methods (`s.email()`, `s.uuid()`) — no chained `.email()` on StringSchema |
| Coercion | Explicit via `s.coerce.*()` — `s.date()` is strict, `s.coerce.date()` auto-coerces |
| JSON Schema output | OpenAPI v3.1 Schema Object (superset of JSON Schema Draft 2020-12) |
| Build toolchain | bunup (Bun bundler + Oxc for `.d.ts`). Requires `isolatedDeclarations: true` in tsconfig |
| Test runner | vitest |
| Dependencies | Zero runtime dependencies |
| Module format | ESM only (`"type": "module"`) |
| Node version | 22+ minimum |
| Bun | First-class runtime |

---

## Package Structure

```
packages/schema/
├── package.json
├── tsconfig.json
├── bunup.config.ts
├── vitest.config.ts
├── src/
│   ├── index.ts                    # Public API: schema/s factory, type exports, standalone fns
│   ├── core/
│   │   ├── schema.ts               # Base Schema<O, I>, OptionalSchema, NullableSchema, DefaultSchema
│   │   ├── types.ts                # SchemaMetadata, SchemaType enum, ValidationRules
│   │   ├── errors.ts               # ErrorCode enum, ValidationIssue, ParseError
│   │   ├── parse-context.ts        # ParseContext for issue collection during validation
│   │   └── registry.ts             # Named schema registry for $ref resolution
│   ├── schemas/
│   │   ├── string.ts               # StringSchema
│   │   ├── number.ts               # NumberSchema
│   │   ├── boolean.ts              # BooleanSchema
│   │   ├── bigint.ts               # BigIntSchema
│   │   ├── symbol.ts               # SymbolSchema
│   │   ├── date.ts                 # DateSchema
│   │   ├── object.ts               # ObjectSchema
│   │   ├── array.ts                # ArraySchema
│   │   ├── tuple.ts                # TupleSchema
│   │   ├── enum.ts                 # EnumSchema
│   │   ├── union.ts                # UnionSchema
│   │   ├── discriminated-union.ts  # DiscriminatedUnionSchema
│   │   ├── intersection.ts         # IntersectionSchema
│   │   ├── record.ts              # RecordSchema
│   │   ├── map.ts                  # MapSchema
│   │   ├── set.ts                  # SetSchema
│   │   ├── literal.ts              # LiteralSchema
│   │   ├── special.ts              # AnySchema, UnknownSchema, NullSchema, UndefinedSchema, VoidSchema, NeverSchema
│   │   ├── nan.ts                  # NanSchema
│   │   ├── lazy.ts                 # LazySchema (recursive types)
│   │   ├── coerced.ts              # CoercedStringSchema, CoercedNumberSchema, etc.
│   │   ├── custom.ts               # CustomSchema<T>
│   │   ├── instanceof.ts           # InstanceOfSchema
│   │   ├── file.ts                 # FileSchema
│   │   └── formats/
│   │       ├── index.ts            # Re-exports all format schemas
│   │       ├── email.ts            # EmailSchema (extends StringSchema)
│   │       ├── uuid.ts             # UuidSchema
│   │       ├── url.ts              # UrlSchema
│   │       ├── hostname.ts         # HostnameSchema
│   │       ├── ipv4.ts             # Ipv4Schema
│   │       ├── ipv6.ts             # Ipv6Schema
│   │       ├── base64.ts           # Base64Schema
│   │       ├── hex.ts              # HexSchema
│   │       ├── jwt.ts              # JwtSchema
│   │       ├── cuid.ts             # CuidSchema
│   │       ├── ulid.ts             # UlidSchema
│   │       ├── nanoid.ts           # NanoidSchema
│   │       └── iso.ts              # IsoDateSchema, IsoTimeSchema, IsoDatetimeSchema, IsoDurationSchema
│   ├── transforms/
│   │   ├── transform.ts            # TransformSchema<O, I> wrapper
│   │   ├── pipe.ts                 # PipeSchema<A, B> chaining
│   │   └── preprocess.ts           # preprocess(fn, schema) standalone
│   ├── refinements/
│   │   ├── refine.ts               # RefinedSchema with predicate
│   │   ├── super-refine.ts         # SuperRefinedSchema with ctx.addIssue()
│   │   └── check.ts               # CheckSchema (alias pattern for superRefine)
│   ├── effects/
│   │   ├── brand.ts                # BrandedSchema<T, Brand>
│   │   ├── readonly.ts             # ReadonlySchema (Object.freeze output)
│   │   └── catch.ts                # CatchSchema (fallback on failure)
│   ├── utils/
│   │   └── type-inference.ts       # Infer<T>, Input<T>, Output<T> utility types
│   └── introspection/
│       └── json-schema.ts          # toJSONSchema() implementation + $ref/$defs resolution
```

---

## Key Implementation Details

### 1. Base Schema Class

The abstract base carries two type parameters — `O` (output) and `I` (input). `I` defaults to `O` and only diverges when `.transform()` is applied.

```typescript
// src/core/schema.ts

export abstract class Schema<O, I = O> {
  /** @internal */ readonly _output!: O;
  /** @internal */ readonly _input!: I;
  /** @internal */ _id: string | undefined;
  /** @internal */ _description: string | undefined;
  /** @internal */ _meta: Record<string, unknown> | undefined;
  /** @internal */ _examples: unknown[];

  constructor() {
    this._examples = [];
  }

  /**
   * Core validation logic — implemented by each schema subclass.
   * Returns validated value or throws issues via ParseContext.
   */
  abstract _parse(value: unknown, ctx: ParseContext): O;

  /**
   * Returns the schema type discriminator (e.g., 'string', 'number', 'object').
   */
  abstract _schemaType(): SchemaType;

  /**
   * Returns the JSON Schema representation for this schema.
   * Subclasses override to provide type-specific output.
   */
  abstract _toJSONSchema(tracker: RefTracker): JSONSchemaObject;

  // --- Parsing ---

  parse(value: unknown): O {
    const ctx = new ParseContext();
    const result = this._runPipeline(value, ctx);
    if (ctx.hasIssues()) {
      throw new ParseError(ctx.issues);
    }
    return result;
  }

  safeParse(value: unknown): SafeParseResult<O> {
    const ctx = new ParseContext();
    try {
      const data = this._runPipeline(value, ctx);
      if (ctx.hasIssues()) {
        return { success: false, error: new ParseError(ctx.issues) };
      }
      return { success: true, data };
    } catch (e) {
      if (e instanceof ParseError) {
        return { success: false, error: e };
      }
      throw e;
    }
  }

  /**
   * @internal Run the full validation pipeline for this schema.
   *
   * The base implementation just calls _parse() — type check + constraints.
   * Wrapper schemas (RefinedSchema, TransformSchema, BrandedSchema, etc.)
   * override _parse() to delegate to their inner schema's _runPipeline()
   * and then apply their own logic. This composition-based approach means
   * each wrapper handles exactly one concern, and the call chain naturally
   * produces the correct order: _parse → refinements → transforms → effects.
   */
  _runPipeline(value: unknown, ctx: ParseContext): O {
    return this._parse(value, ctx);
  }

  // --- Universal Methods ---

  id(name: string): this {
    const clone = this._clone();
    clone._id = name;
    SchemaRegistry.register(name, clone);
    return clone as this;
  }

  describe(description: string): this {
    const clone = this._clone();
    clone._description = description;
    return clone as this;
  }

  meta(data: Record<string, unknown>): this {
    const clone = this._clone();
    clone._meta = { ...(this._meta ?? {}), ...data };
    return clone as this;
  }

  example(value: I): this {
    const clone = this._clone();
    clone._examples = [...this._examples, value];
    return clone as this;
  }

  optional(): OptionalSchema<O, I> {
    return new OptionalSchema(this);
  }

  nullable(): NullableSchema<O, I> {
    return new NullableSchema(this);
  }

  default(defaultValue: I | (() => I)): DefaultSchema<O, I> {
    return new DefaultSchema(this, defaultValue);
  }

  refine(
    predicate: (val: O) => boolean,
    options?: string | { message?: string; path?: (string | number)[] }
  ): Schema<O, I> {
    return new RefinedSchema(this, predicate, options);
  }

  superRefine(
    refineFn: (val: O, ctx: RefinementContext) => void
  ): Schema<O, I> {
    return new SuperRefinedSchema(this, refineFn);
  }

  check(
    checkFn: (val: O, ctx: RefinementContext) => void
  ): Schema<O, I> {
    // Alias for superRefine
    return this.superRefine(checkFn);
  }

  transform<NewO>(fn: (val: O) => NewO): Schema<NewO, I> {
    return new TransformSchema(this, fn);
  }

  pipe<NewO>(schema: Schema<NewO>): Schema<NewO, I> {
    return new PipeSchema(this, schema);
  }

  catch(fallback: O | (() => O)): Schema<O, I> {
    return new CatchSchema(this, fallback);
  }

  brand<Brand extends string>(): Schema<O & { __brand: Brand }, I> {
    return new BrandedSchema(this) as unknown as Schema<O & { __brand: Brand }, I>;
  }

  readonly(): Schema<Readonly<O>, I> {
    return new ReadonlySchema(this);
  }

  // --- Introspection ---

  get metadata(): SchemaMetadata {
    return {
      type: this._schemaType(),
      id: this._id,
      description: this._description,
      meta: this._meta,
      examples: this._examples,
    };
  }

  toJSONSchema(): JSONSchemaObject {
    const tracker = new RefTracker();
    const schema = this._toJSONSchemaWithRefs(tracker);
    const defs = tracker.getDefs();
    if (Object.keys(defs).length > 0) {
      return { $defs: defs, ...schema };
    }
    return schema;
  }

  /** @internal */
  _toJSONSchemaWithRefs(tracker: RefTracker): JSONSchemaObject {
    // If this schema has an id and the tracker has seen it, return a $ref
    if (this._id && tracker.hasSeen(this._id)) {
      return { $ref: `#/$defs/${this._id}` };
    }
    if (this._id) {
      tracker.markSeen(this._id);
      const jsonSchema = this._toJSONSchema(tracker);
      tracker.addDef(this._id, jsonSchema);
      return { $ref: `#/$defs/${this._id}` };
    }
    return this._toJSONSchema(tracker);
  }

  /** @internal Clone the schema for immutable method chaining */
  abstract _clone(): Schema<O, I>;
}
```

### 2. Error System

```typescript
// src/core/errors.ts

export enum ErrorCode {
  InvalidType = 'invalid_type',
  TooSmall = 'too_small',
  TooBig = 'too_big',
  InvalidString = 'invalid_string',
  InvalidEnumValue = 'invalid_enum_value',
  InvalidLiteral = 'invalid_literal',
  InvalidUnion = 'invalid_union',
  InvalidDate = 'invalid_date',
  MissingProperty = 'missing_property',
  UnrecognizedKeys = 'unrecognized_keys',
  Custom = 'custom',
  InvalidIntersection = 'invalid_intersection',
  NotMultipleOf = 'not_multiple_of',
  NotFinite = 'not_finite',
}

export interface ValidationIssue {
  code: ErrorCode;
  message: string;
  path: (string | number)[];
  expected?: string;
  received?: string;
}

export class ParseError extends Error {
  public readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    const message = ParseError.formatMessage(issues);
    super(message);
    this.name = 'ParseError';
    this.issues = issues;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static formatMessage(issues: ValidationIssue[]): string {
    return issues
      .map((issue) => {
        const path = issue.path.length > 0 ? ` at "${issue.path.join('.')}"` : '';
        return `${issue.message}${path}`;
      })
      .join('; ');
  }
}
```

### 3. ParseContext

Collects validation issues during a parse pass. Nested schemas push/pop path segments.

```typescript
// src/core/parse-context.ts

export class ParseContext {
  readonly issues: ValidationIssue[] = [];
  private _path: (string | number)[] = [];

  addIssue(issue: Omit<ValidationIssue, 'path'> & { path?: (string | number)[] }): void {
    this.issues.push({
      ...issue,
      path: issue.path ?? [...this._path],
    });
  }

  hasIssues(): boolean {
    return this.issues.length > 0;
  }

  /** Push a path segment for nested validation (objects, arrays, tuples). */
  pushPath(segment: string | number): void {
    this._path.push(segment);
  }

  /** Pop a path segment after nested validation completes. */
  popPath(): void {
    this._path.pop();
  }

  /** Get the current path (read-only copy). */
  get path(): (string | number)[] {
    return [...this._path];
  }
}

/** Public-facing refinement context — subset of ParseContext exposed to .refine()/.superRefine()/.check() */
export interface RefinementContext {
  addIssue(issue: Omit<ValidationIssue, 'path'> & { path?: (string | number)[] }): void;
  readonly path: (string | number)[];
}
```

### 4. Schema Registry

Global registry for named schemas. The compiler uses this to collect all named schemas for OpenAPI `components/schemas`.

```typescript
// src/core/registry.ts

export class SchemaRegistry {
  private static _schemas = new Map<string, Schema<any, any>>();

  static register(name: string, schema: Schema<any, any>): void {
    this._schemas.set(name, schema);
  }

  static get(name: string): Schema<any, any> | undefined {
    return this._schemas.get(name);
  }

  static getAll(): ReadonlyMap<string, Schema<any, any>> {
    return this._schemas;
  }

  static has(name: string): boolean {
    return this._schemas.has(name);
  }

  /** Clear the registry — for testing purposes. */
  static clear(): void {
    this._schemas.clear();
  }
}
```

### 5. RefTracker (JSON Schema $ref Resolution)

Tracks which named schemas have been seen during a single `.toJSONSchema()` call to avoid infinite recursion and build `$defs`.

```typescript
// src/introspection/json-schema.ts

export interface JSONSchemaObject {
  [key: string]: unknown;
}

export class RefTracker {
  private _seen = new Set<string>();
  private _defs: Record<string, JSONSchemaObject> = {};

  hasSeen(id: string): boolean {
    return this._seen.has(id);
  }

  markSeen(id: string): void {
    this._seen.add(id);
  }

  addDef(id: string, schema: JSONSchemaObject): void {
    this._defs[id] = schema;
  }

  getDefs(): Record<string, JSONSchemaObject> {
    return { ...this._defs };
  }
}

/** Standalone function — delegates to the schema instance method. */
export function toJSONSchema(schema: Schema<any, any>): JSONSchemaObject {
  return schema.toJSONSchema();
}
```

### 6. SchemaMetadata and Types

```typescript
// src/core/types.ts

export enum SchemaType {
  String = 'string',
  Number = 'number',
  BigInt = 'bigint',
  Boolean = 'boolean',
  Date = 'date',
  Symbol = 'symbol',
  Undefined = 'undefined',
  Null = 'null',
  Void = 'void',
  Any = 'any',
  Unknown = 'unknown',
  Never = 'never',
  NaN = 'nan',
  Object = 'object',
  Array = 'array',
  Tuple = 'tuple',
  Enum = 'enum',
  Union = 'union',
  DiscriminatedUnion = 'discriminatedUnion',
  Intersection = 'intersection',
  Record = 'record',
  Map = 'map',
  Set = 'set',
  Literal = 'literal',
  Lazy = 'lazy',
  Custom = 'custom',
  InstanceOf = 'instanceof',
  File = 'file',
}

export interface SchemaMetadata {
  type: SchemaType;
  id: string | undefined;
  description: string | undefined;
  meta: Record<string, unknown> | undefined;
  examples: unknown[];
}

export type SafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: ParseError };
```

### 7. Type Inference Utilities

```typescript
// src/utils/type-inference.ts

import type { Schema } from '../core/schema';

/** Infer the output type of a schema. Alias for Output<T>. */
export type Infer<T extends Schema<any, any>> = T['_output'];

/** Infer the output type of a schema. */
export type Output<T extends Schema<any, any>> = T['_output'];

/** Infer the input type of a schema. Differs from Output when transforms exist. */
export type Input<T extends Schema<any, any>> = T['_input'];
```

### 8. Wrapper Schemas (Optional, Nullable, Default)

```typescript
// Inside src/core/schema.ts

export class OptionalSchema<O, I> extends Schema<O | undefined, I | undefined> {
  constructor(private readonly _inner: Schema<O, I>) {
    super();
  }

  _schemaType(): SchemaType {
    return this._inner._schemaType();
  }

  _parse(value: unknown, ctx: ParseContext): O | undefined {
    if (value === undefined) return undefined;
    // Delegate to _runPipeline so inner refinements/transforms/effects are applied
    return this._inner._runPipeline(value, ctx);
  }

  _toJSONSchema(tracker: RefTracker): JSONSchemaObject {
    // Optional does not change JSON Schema — optionality is expressed
    // at the parent level (object "required" array). Inner schema is unwrapped.
    return this._inner._toJSONSchemaWithRefs(tracker);
  }

  _clone(): OptionalSchema<O, I> {
    const clone = new OptionalSchema(this._inner);
    clone._id = this._id;
    clone._description = this._description;
    clone._meta = this._meta ? { ...this._meta } : undefined;
    clone._examples = [...this._examples];
    return clone;
  }

  /** Unwrap to get the inner schema. */
  unwrap(): Schema<O, I> {
    return this._inner;
  }
}

export class NullableSchema<O, I> extends Schema<O | null, I | null> {
  constructor(private readonly _inner: Schema<O, I>) {
    super();
  }

  _schemaType(): SchemaType {
    return this._inner._schemaType();
  }

  _parse(value: unknown, ctx: ParseContext): O | null {
    if (value === null) return null;
    // Delegate to _runPipeline so inner refinements/transforms/effects are applied
    return this._inner._runPipeline(value, ctx);
  }

  _toJSONSchema(tracker: RefTracker): JSONSchemaObject {
    const inner = this._inner._toJSONSchemaWithRefs(tracker);
    // OpenAPI v3.1: nullable via type array or anyOf
    if (typeof inner.type === 'string') {
      return { ...inner, type: [inner.type, 'null'] };
    }
    return { anyOf: [inner, { type: 'null' }] };
  }

  _clone(): NullableSchema<O, I> {
    const clone = new NullableSchema(this._inner);
    clone._id = this._id;
    clone._description = this._description;
    clone._meta = this._meta ? { ...this._meta } : undefined;
    clone._examples = [...this._examples];
    return clone;
  }

  unwrap(): Schema<O, I> {
    return this._inner;
  }
}

export class DefaultSchema<O, I> extends Schema<O, I | undefined> {
  constructor(
    private readonly _inner: Schema<O, I>,
    private readonly _default: I | (() => I),
  ) {
    super();
  }

  _schemaType(): SchemaType {
    return this._inner._schemaType();
  }

  _parse(value: unknown, ctx: ParseContext): O {
    if (value === undefined) {
      const defaultVal = typeof this._default === 'function'
        ? (this._default as () => I)()
        : this._default;
      // Delegate to _runPipeline so inner refinements/transforms/effects are applied
      return this._inner._runPipeline(defaultVal, ctx);
    }
    return this._inner._runPipeline(value, ctx);
  }

  _toJSONSchema(tracker: RefTracker): JSONSchemaObject {
    const inner = this._inner._toJSONSchemaWithRefs(tracker);
    const defaultVal = typeof this._default === 'function'
      ? (this._default as () => I)()
      : this._default;
    return { ...inner, default: defaultVal };
  }

  _clone(): DefaultSchema<O, I> {
    const clone = new DefaultSchema(this._inner, this._default);
    clone._id = this._id;
    clone._description = this._description;
    clone._meta = this._meta ? { ...this._meta } : undefined;
    clone._examples = [...this._examples];
    return clone;
  }

  unwrap(): Schema<O, I> {
    return this._inner;
  }
}
```

### 9. StringSchema (Representative Schema Implementation)

```typescript
// src/schemas/string.ts

interface StringRules {
  min?: { value: number; message?: string };
  max?: { value: number; message?: string };
  length?: { value: number; message?: string };
  regex?: { value: RegExp; message?: string };
  startsWith?: { value: string; message?: string };
  endsWith?: { value: string; message?: string };
  includes?: { value: string; message?: string };
  uppercase?: { message?: string };
  lowercase?: { message?: string };
  trim?: boolean;
  toLowerCase?: boolean;
  toUpperCase?: boolean;
  normalize?: boolean;
}

export class StringSchema extends Schema<string, string> {
  /** @internal */ _rules: StringRules = {};

  _schemaType(): SchemaType {
    return SchemaType.String;
  }

  _parse(value: unknown, ctx: ParseContext): string {
    if (typeof value !== 'string') {
      ctx.addIssue({
        code: ErrorCode.InvalidType,
        message: `Expected string, received ${typeof value}`,
        expected: 'string',
        received: typeof value,
      });
      return value as string;
    }

    let val = value;

    // Apply transforms first (trim, toLowerCase, toUpperCase, normalize)
    if (this._rules.trim) val = val.trim();
    if (this._rules.toLowerCase) val = val.toLowerCase();
    if (this._rules.toUpperCase) val = val.toUpperCase();
    if (this._rules.normalize) val = val.normalize();

    // Validate constraints
    if (this._rules.min !== undefined && val.length < this._rules.min.value) {
      ctx.addIssue({
        code: ErrorCode.TooSmall,
        message: this._rules.min.message ?? `String must be at least ${this._rules.min.value} characters`,
        expected: `>= ${this._rules.min.value}`,
        received: String(val.length),
      });
    }

    if (this._rules.max !== undefined && val.length > this._rules.max.value) {
      ctx.addIssue({
        code: ErrorCode.TooBig,
        message: this._rules.max.message ?? `String must be at most ${this._rules.max.value} characters`,
        expected: `<= ${this._rules.max.value}`,
        received: String(val.length),
      });
    }

    if (this._rules.length !== undefined && val.length !== this._rules.length.value) {
      ctx.addIssue({
        code: ErrorCode.InvalidString,
        message: this._rules.length.message ?? `String must be exactly ${this._rules.length.value} characters`,
      });
    }

    if (this._rules.regex !== undefined && !this._rules.regex.value.test(val)) {
      ctx.addIssue({
        code: ErrorCode.InvalidString,
        message: this._rules.regex.message ?? `String must match pattern ${this._rules.regex.value}`,
      });
    }

    if (this._rules.startsWith !== undefined && !val.startsWith(this._rules.startsWith.value)) {
      ctx.addIssue({
        code: ErrorCode.InvalidString,
        message: this._rules.startsWith.message ?? `String must start with "${this._rules.startsWith.value}"`,
      });
    }

    if (this._rules.endsWith !== undefined && !val.endsWith(this._rules.endsWith.value)) {
      ctx.addIssue({
        code: ErrorCode.InvalidString,
        message: this._rules.endsWith.message ?? `String must end with "${this._rules.endsWith.value}"`,
      });
    }

    if (this._rules.includes !== undefined && !val.includes(this._rules.includes.value)) {
      ctx.addIssue({
        code: ErrorCode.InvalidString,
        message: this._rules.includes.message ?? `String must include "${this._rules.includes.value}"`,
      });
    }

    if (this._rules.uppercase !== undefined && val !== val.toUpperCase()) {
      ctx.addIssue({
        code: ErrorCode.InvalidString,
        message: this._rules.uppercase.message ?? 'String must be uppercase',
      });
    }

    if (this._rules.lowercase !== undefined && val !== val.toLowerCase()) {
      ctx.addIssue({
        code: ErrorCode.InvalidString,
        message: this._rules.lowercase.message ?? 'String must be lowercase',
      });
    }

    return val;
  }

  // --- Validation methods ---

  min(n: number, message?: string): StringSchema {
    const clone = this._clone() as StringSchema;
    clone._rules.min = { value: n, message };
    return clone;
  }

  max(n: number, message?: string): StringSchema {
    const clone = this._clone() as StringSchema;
    clone._rules.max = { value: n, message };
    return clone;
  }

  length(n: number, message?: string): StringSchema {
    const clone = this._clone() as StringSchema;
    clone._rules.length = { value: n, message };
    return clone;
  }

  regex(pattern: RegExp, message?: string): StringSchema {
    const clone = this._clone() as StringSchema;
    clone._rules.regex = { value: pattern, message };
    return clone;
  }

  startsWith(prefix: string, message?: string): StringSchema {
    const clone = this._clone() as StringSchema;
    clone._rules.startsWith = { value: prefix, message };
    return clone;
  }

  endsWith(suffix: string, message?: string): StringSchema {
    const clone = this._clone() as StringSchema;
    clone._rules.endsWith = { value: suffix, message };
    return clone;
  }

  includes(substring: string, message?: string): StringSchema {
    const clone = this._clone() as StringSchema;
    clone._rules.includes = { value: substring, message };
    return clone;
  }

  uppercase(message?: string): StringSchema {
    const clone = this._clone() as StringSchema;
    clone._rules.uppercase = { message };
    return clone;
  }

  lowercase(message?: string): StringSchema {
    const clone = this._clone() as StringSchema;
    clone._rules.lowercase = { message };
    return clone;
  }

  // --- String Transforms ---

  trim(): StringSchema {
    const clone = this._clone() as StringSchema;
    clone._rules.trim = true;
    return clone;
  }

  toLowerCase(): StringSchema {
    const clone = this._clone() as StringSchema;
    clone._rules.toLowerCase = true;
    return clone;
  }

  toUpperCase(): StringSchema {
    const clone = this._clone() as StringSchema;
    clone._rules.toUpperCase = true;
    return clone;
  }

  normalize(): StringSchema {
    const clone = this._clone() as StringSchema;
    clone._rules.normalize = true;
    return clone;
  }

  // --- JSON Schema ---

  _toJSONSchema(tracker: RefTracker): JSONSchemaObject {
    const schema: JSONSchemaObject = { type: 'string' };
    if (this._rules.min !== undefined) schema.minLength = this._rules.min.value;
    if (this._rules.max !== undefined) schema.maxLength = this._rules.max.value;
    if (this._rules.length !== undefined) {
      schema.minLength = this._rules.length.value;
      schema.maxLength = this._rules.length.value;
    }
    if (this._rules.regex !== undefined) schema.pattern = this._rules.regex.value.source;
    if (this._description) schema.description = this._description;
    return schema;
  }

  _clone(): StringSchema {
    const clone = new StringSchema();
    clone._rules = { ...this._rules };
    clone._id = this._id;
    clone._description = this._description;
    clone._meta = this._meta ? { ...this._meta } : undefined;
    clone._examples = [...this._examples];
    return clone;
  }
}
```

### 10. NumberSchema

```typescript
// src/schemas/number.ts

interface NumberRules {
  gte?: { value: number; message?: string };       // .gte() / .min()
  gt?: { value: number; message?: string };        // .gt() — exclusive
  lte?: { value: number; message?: string };       // .lte() / .max()
  lt?: { value: number; message?: string };        // .lt() — exclusive
  int?: { message?: string };
  positive?: { message?: string };
  negative?: { message?: string };
  nonnegative?: { message?: string };
  nonpositive?: { message?: string };
  multipleOf?: { value: number; message?: string }; // .multipleOf() / .step()
  finite?: { message?: string };
}

export class NumberSchema extends Schema<number, number> {
  /** @internal */ _rules: NumberRules = {};

  _schemaType(): SchemaType {
    return SchemaType.Number;
  }

  _parse(value: unknown, ctx: ParseContext): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      ctx.addIssue({
        code: ErrorCode.InvalidType,
        message: `Expected number, received ${Number.isNaN(value) ? 'NaN' : typeof value}`,
        expected: 'number',
        received: Number.isNaN(value) ? 'NaN' : typeof value,
      });
      return value as number;
    }

    if (this._rules.gte !== undefined && value < this._rules.gte.value) {
      ctx.addIssue({
        code: ErrorCode.TooSmall,
        message: this._rules.gte.message ?? `Number must be greater than or equal to ${this._rules.gte.value}`,
      });
    }

    if (this._rules.gt !== undefined && value <= this._rules.gt.value) {
      ctx.addIssue({
        code: ErrorCode.TooSmall,
        message: this._rules.gt.message ?? `Number must be greater than ${this._rules.gt.value}`,
      });
    }

    if (this._rules.lte !== undefined && value > this._rules.lte.value) {
      ctx.addIssue({
        code: ErrorCode.TooBig,
        message: this._rules.lte.message ?? `Number must be less than or equal to ${this._rules.lte.value}`,
      });
    }

    if (this._rules.lt !== undefined && value >= this._rules.lt.value) {
      ctx.addIssue({
        code: ErrorCode.TooBig,
        message: this._rules.lt.message ?? `Number must be less than ${this._rules.lt.value}`,
      });
    }

    if (this._rules.int !== undefined && !Number.isInteger(value)) {
      ctx.addIssue({
        code: ErrorCode.InvalidType,
        message: this._rules.int.message ?? 'Expected integer, received float',
      });
    }

    if (this._rules.positive !== undefined && value <= 0) {
      ctx.addIssue({
        code: ErrorCode.TooSmall,
        message: this._rules.positive.message ?? 'Number must be positive',
      });
    }

    if (this._rules.negative !== undefined && value >= 0) {
      ctx.addIssue({
        code: ErrorCode.TooBig,
        message: this._rules.negative.message ?? 'Number must be negative',
      });
    }

    if (this._rules.nonnegative !== undefined && value < 0) {
      ctx.addIssue({
        code: ErrorCode.TooSmall,
        message: this._rules.nonnegative.message ?? 'Number must be non-negative',
      });
    }

    if (this._rules.nonpositive !== undefined && value > 0) {
      ctx.addIssue({
        code: ErrorCode.TooBig,
        message: this._rules.nonpositive.message ?? 'Number must be non-positive',
      });
    }

    if (this._rules.multipleOf !== undefined) {
      // Use epsilon-based comparison to handle IEEE 754 floating-point
      // precision issues (e.g., 0.3 % 0.1 !== 0 due to rounding).
      const step = this._rules.multipleOf.value;
      const remainder = Math.abs(value % step);
      const isMultiple = remainder < Number.EPSILON || Math.abs(remainder - Math.abs(step)) < Number.EPSILON;
      if (!isMultiple) {
        ctx.addIssue({
          code: ErrorCode.NotMultipleOf,
          message: this._rules.multipleOf.message ?? `Number must be a multiple of ${step}`,
        });
      }
    }

    if (this._rules.finite !== undefined && !Number.isFinite(value)) {
      ctx.addIssue({
        code: ErrorCode.NotFinite,
        message: this._rules.finite.message ?? 'Number must be finite',
      });
    }

    return value;
  }

  // Method chaining omitted for brevity — same pattern as StringSchema.
  // Aliases: .min() = .gte(), .max() = .lte(), .step() = .multipleOf()

  _toJSONSchema(tracker: RefTracker): JSONSchemaObject {
    const schema: JSONSchemaObject = { type: 'number' };
    if (this._rules.gte !== undefined) schema.minimum = this._rules.gte.value;
    if (this._rules.gt !== undefined) schema.exclusiveMinimum = this._rules.gt.value;
    if (this._rules.lte !== undefined) schema.maximum = this._rules.lte.value;
    if (this._rules.lt !== undefined) schema.exclusiveMaximum = this._rules.lt.value;
    if (this._rules.int !== undefined) schema.type = 'integer';
    if (this._rules.multipleOf !== undefined) schema.multipleOf = this._rules.multipleOf.value;
    if (this._description) schema.description = this._description;
    return schema;
  }

  // _clone() follows same pattern as StringSchema
}
```

### 11. ObjectSchema

```typescript
// src/schemas/object.ts

type ObjectShape = Record<string, Schema<any, any>>;

export class ObjectSchema<
  T extends ObjectShape,
  O = { [K in keyof T]: Infer<T[K]> },
  I = { [K in keyof T]: Input<T[K]> },
> extends Schema<O, I> {
  /** @internal */ readonly _shape: T;
  /** @internal */ _mode: 'strip' | 'strict' | 'passthrough' = 'strip';
  /** @internal */ _catchall: Schema<any, any> | undefined;

  constructor(shape: T) {
    super();
    this._shape = shape;
  }

  get shape(): T {
    return this._shape;
  }

  _schemaType(): SchemaType {
    return SchemaType.Object;
  }

  _parse(value: unknown, ctx: ParseContext): O {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      ctx.addIssue({
        code: ErrorCode.InvalidType,
        message: `Expected object, received ${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value}`,
        expected: 'object',
        received: value === null ? 'null' : typeof value,
      });
      return value as O;
    }

    const input = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    // Validate each property in the shape
    for (const [key, schema] of Object.entries(this._shape)) {
      ctx.pushPath(key);

      if (!(key in input) && !(schema instanceof OptionalSchema) && !(schema instanceof DefaultSchema)) {
        ctx.addIssue({
          code: ErrorCode.MissingProperty,
          message: `Required property "${key}" is missing`,
        });
      } else {
        result[key] = (schema as Schema<any, any>)._runPipeline(input[key], ctx);
      }

      ctx.popPath();
    }

    // Handle unknown keys based on mode
    const shapeKeys = new Set(Object.keys(this._shape));
    const inputKeys = Object.keys(input);
    const unknownKeys = inputKeys.filter(k => !shapeKeys.has(k));

    if (this._mode === 'strict' && unknownKeys.length > 0) {
      ctx.addIssue({
        code: ErrorCode.UnrecognizedKeys,
        message: `Unrecognized keys: ${unknownKeys.join(', ')}`,
      });
    } else if (this._mode === 'passthrough') {
      for (const key of unknownKeys) {
        result[key] = input[key];
      }
    } else if (this._catchall) {
      for (const key of unknownKeys) {
        ctx.pushPath(key);
        result[key] = this._catchall._runPipeline(input[key], ctx);
        ctx.popPath();
      }
    }
    // 'strip' mode (default): unknown keys are silently dropped

    return result as O;
  }

  // --- Object Methods ---

  keyof(): EnumSchema<Extract<keyof T, string>[]> {
    return new EnumSchema(Object.keys(this._shape) as Extract<keyof T, string>[]);
  }

  extend<U extends ObjectShape>(shape: U): ObjectSchema<T & U> {
    return new ObjectSchema({ ...this._shape, ...shape });
  }

  merge<U extends ObjectShape>(other: ObjectSchema<U>): ObjectSchema<T & U> {
    return new ObjectSchema({ ...this._shape, ...other._shape });
  }

  pick<K extends keyof T>(keys: K[]): ObjectSchema<Pick<T, K>> {
    const picked: any = {};
    for (const key of keys) {
      picked[key] = this._shape[key];
    }
    return new ObjectSchema(picked);
  }

  omit<K extends keyof T>(keys: K[]): ObjectSchema<Omit<T, K>> {
    const omitted: any = { ...this._shape };
    for (const key of keys) {
      delete omitted[key];
    }
    return new ObjectSchema(omitted);
  }

  partial(): ObjectSchema<{ [K in keyof T]: OptionalSchema<Infer<T[K]>, Input<T[K]>> }> {
    const partial: any = {};
    for (const [key, schema] of Object.entries(this._shape)) {
      partial[key] = (schema as Schema<any, any>).optional();
    }
    return new ObjectSchema(partial);
  }

  required(): ObjectSchema<{ [K in keyof T]: /* unwrap optional */ any }> {
    const required: any = {};
    for (const [key, schema] of Object.entries(this._shape)) {
      required[key] = schema instanceof OptionalSchema ? schema.unwrap() : schema;
    }
    return new ObjectSchema(required);
  }

  strict(): ObjectSchema<T, O, I> {
    const clone = this._clone() as ObjectSchema<T, O, I>;
    clone._mode = 'strict';
    return clone;
  }

  passthrough(): ObjectSchema<T, O, I> {
    const clone = this._clone() as ObjectSchema<T, O, I>;
    clone._mode = 'passthrough';
    return clone;
  }

  catchall(schema: Schema<any, any>): ObjectSchema<T, O, I> {
    const clone = this._clone() as ObjectSchema<T, O, I>;
    clone._catchall = schema;
    return clone;
  }

  _toJSONSchema(tracker: RefTracker): JSONSchemaObject {
    const properties: Record<string, JSONSchemaObject> = {};
    const required: string[] = [];

    for (const [key, schema] of Object.entries(this._shape)) {
      properties[key] = (schema as Schema<any, any>)._toJSONSchemaWithRefs(tracker);
      if (!(schema instanceof OptionalSchema) && !(schema instanceof DefaultSchema)) {
        required.push(key);
      }
    }

    const jsonSchema: JSONSchemaObject = {
      type: 'object',
      properties,
    };

    if (required.length > 0) jsonSchema.required = required;

    if (this._mode === 'strict') {
      jsonSchema.additionalProperties = false;
    } else if (this._catchall) {
      jsonSchema.additionalProperties = this._catchall._toJSONSchemaWithRefs(tracker);
    }

    if (this._description) jsonSchema.description = this._description;

    return jsonSchema;
  }

  // _clone() follows same pattern
}
```

### 12. DateSchema

```typescript
// src/schemas/date.ts

interface DateRules {
  min?: { value: Date; message?: string };
  max?: { value: Date; message?: string };
}

export class DateSchema extends Schema<Date, Date> {
  /** @internal */ _rules: DateRules = {};

  _schemaType(): SchemaType {
    return SchemaType.Date;
  }

  _parse(value: unknown, ctx: ParseContext): Date {
    // Strict: only accepts Date instances. Use s.coerce.date() for string/number coercion.
    if (!(value instanceof Date) || isNaN(value.getTime())) {
      ctx.addIssue({
        code: ErrorCode.InvalidDate,
        message: 'Expected valid Date instance',
        expected: 'Date',
        received: typeof value,
      });
      return value as Date;
    }

    if (this._rules.min !== undefined && value.getTime() < this._rules.min.value.getTime()) {
      ctx.addIssue({
        code: ErrorCode.TooSmall,
        message: this._rules.min.message ?? `Date must be after ${this._rules.min.value.toISOString()}`,
      });
    }

    if (this._rules.max !== undefined && value.getTime() > this._rules.max.value.getTime()) {
      ctx.addIssue({
        code: ErrorCode.TooBig,
        message: this._rules.max.message ?? `Date must be before ${this._rules.max.value.toISOString()}`,
      });
    }

    return value;
  }

  min(date: Date, message?: string): DateSchema {
    const clone = this._clone() as DateSchema;
    clone._rules.min = { value: date, message };
    return clone;
  }

  max(date: Date, message?: string): DateSchema {
    const clone = this._clone() as DateSchema;
    clone._rules.max = { value: date, message };
    return clone;
  }

  /** Transform: Date → ISO 8601 string. Output type becomes string. */
  toISOString(): Schema<string, Date> {
    return this.transform((date) => date.toISOString());
  }

  _toJSONSchema(_tracker: RefTracker): JSONSchemaObject {
    // JSON has no native Date type. Wire format is ISO string.
    return { type: 'string', format: 'date-time' };
  }

  // _clone() follows same pattern — copies _rules, _id, _description, _meta, _examples
}
```

### 13. CoercedSchemas

```typescript
// src/schemas/coerced.ts

export class CoercedStringSchema extends StringSchema {
  _parse(value: unknown, ctx: ParseContext): string {
    // Coerce to string before validation.
    // Design decision: null and undefined both coerce to '' (empty string).
    // This differs from Zod which uses String(value) for all inputs
    // (producing "null"/"undefined"). Empty string is more useful for
    // form handling where missing fields should be treated as blank.
    const coerced = value == null ? '' : String(value);
    return super._parse(coerced, ctx);
  }
}

export class CoercedNumberSchema extends NumberSchema {
  _parse(value: unknown, ctx: ParseContext): number {
    const coerced = Number(value);
    return super._parse(coerced, ctx);
  }
}

export class CoercedBooleanSchema extends BooleanSchema {
  _parse(value: unknown, ctx: ParseContext): boolean {
    const coerced = Boolean(value);
    return super._parse(coerced, ctx);
  }
}

export class CoercedBigIntSchema extends BigIntSchema {
  _parse(value: unknown, ctx: ParseContext): bigint {
    try {
      const coerced = BigInt(value as any);
      return super._parse(coerced, ctx);
    } catch {
      ctx.addIssue({
        code: ErrorCode.InvalidType,
        message: `Cannot coerce ${typeof value} to bigint`,
      });
      return value as bigint;
    }
  }
}

export class CoercedDateSchema extends DateSchema {
  _parse(value: unknown, ctx: ParseContext): Date {
    // Coerce from string or number to Date
    if (typeof value === 'string' || typeof value === 'number') {
      const coerced = new Date(value);
      return super._parse(coerced, ctx);
    }
    return super._parse(value, ctx);
  }
}
```

### 14. Format Schemas (Example: EmailSchema)

Each format is a standalone factory that extends StringSchema. The format validation regex is applied in `_parse`, and the JSON Schema output includes the `format` keyword.

```typescript
// src/schemas/formats/email.ts

// RFC 5322 simplified — rejects most invalid patterns while avoiding catastrophic backtracking.
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

export class EmailSchema extends StringSchema {
  _parse(value: unknown, ctx: ParseContext): string {
    const result = super._parse(value, ctx);
    if (ctx.hasIssues()) return result;

    if (!EMAIL_REGEX.test(result)) {
      ctx.addIssue({
        code: ErrorCode.InvalidString,
        message: 'Invalid email address',
      });
    }

    return result;
  }

  _toJSONSchema(tracker: RefTracker): JSONSchemaObject {
    return { ...super._toJSONSchema(tracker), format: 'email' };
  }

  _clone(): EmailSchema {
    const clone = new EmailSchema();
    clone._rules = { ...this._rules };
    // ... copy base properties
    return clone;
  }
}
```

### 15. LazySchema (Recursive Types)

```typescript
// src/schemas/lazy.ts

export class LazySchema<O, I = O> extends Schema<O, I> {
  private _getter: () => Schema<O, I>;
  private _cached: Schema<O, I> | undefined;

  constructor(getter: () => Schema<O, I>) {
    super();
    this._getter = getter;
  }

  private _resolve(): Schema<O, I> {
    if (!this._cached) {
      this._cached = this._getter();
    }
    return this._cached;
  }

  _schemaType(): SchemaType {
    return SchemaType.Lazy;
  }

  _parse(value: unknown, ctx: ParseContext): O {
    return this._resolve()._parse(value, ctx);
  }

  _toJSONSchema(tracker: RefTracker): JSONSchemaObject {
    const inner = this._resolve();
    // If the inner schema has an id, use $ref to avoid infinite recursion
    if (inner._id) {
      if (tracker.hasSeen(inner._id)) {
        return { $ref: `#/$defs/${inner._id}` };
      }
      tracker.markSeen(inner._id);
      const jsonSchema = inner._toJSONSchema(tracker);
      tracker.addDef(inner._id, jsonSchema);
      return { $ref: `#/$defs/${inner._id}` };
    }
    // Unnamed lazy schema — delegate but risk infinite recursion if truly recursive.
    // Require .id() for recursive schemas (documented constraint).
    return inner._toJSONSchema(tracker);
  }

  _clone(): LazySchema<O, I> {
    return new LazySchema(this._getter);
  }
}
```

### 16. DiscriminatedUnionSchema

```typescript
// src/schemas/discriminated-union.ts

export class DiscriminatedUnionSchema<
  D extends string,
  T extends Schema<any, any>[],
> extends Schema<Infer<T[number]>, Input<T[number]>> {
  /** @internal O(1) lookup map: discriminator value → schema */
  private readonly _schemaMap: Map<string | number | boolean, Schema<any, any>>;

  constructor(
    private readonly _discriminator: D,
    private readonly _options: T,
  ) {
    super();
    // Build lookup map at construction time for O(1) dispatch.
    // Each option must be an ObjectSchema whose shape contains the discriminator
    // key with a LiteralSchema value. The literal's value becomes the map key.
    this._schemaMap = new Map();
    for (const option of this._options) {
      const shape = (option as any)._shape;
      if (shape && shape[this._discriminator]) {
        const discriminatorSchema = shape[this._discriminator];
        // Extract the literal value from the discriminator field schema
        if (discriminatorSchema && '_value' in discriminatorSchema) {
          this._schemaMap.set(discriminatorSchema._value, option);
        }
      }
    }
  }

  _schemaType(): SchemaType {
    return SchemaType.DiscriminatedUnion;
  }

  _parse(value: unknown, ctx: ParseContext): Infer<T[number]> {
    if (typeof value !== 'object' || value === null) {
      ctx.addIssue({
        code: ErrorCode.InvalidType,
        message: 'Expected object',
        expected: 'object',
        received: typeof value,
      });
      return value as any;
    }

    const discriminatorValue = (value as any)[this._discriminator];
    if (discriminatorValue === undefined) {
      ctx.addIssue({
        code: ErrorCode.InvalidUnion,
        message: `Missing discriminator property "${this._discriminator}"`,
      });
      return value as any;
    }

    // O(1) lookup by discriminator value
    const matchedSchema = this._schemaMap.get(discriminatorValue);
    if (matchedSchema) {
      return matchedSchema._runPipeline(value, ctx);
    }

    ctx.addIssue({
      code: ErrorCode.InvalidUnion,
      message: `No matching schema for discriminator "${this._discriminator}" = ${JSON.stringify(discriminatorValue)}`,
    });
    return value as any;
  }

  _toJSONSchema(tracker: RefTracker): JSONSchemaObject {
    const schemas = this._options.map(opt => opt._toJSONSchemaWithRefs(tracker));
    return {
      oneOf: schemas,
      discriminator: {
        propertyName: this._discriminator,
      },
    };
  }

  _clone(): DiscriminatedUnionSchema<D, T> {
    return new DiscriminatedUnionSchema(this._discriminator, this._options);
  }
}
```

### 17. TransformSchema and PipeSchema

```typescript
// src/transforms/transform.ts

export class TransformSchema<O, I> extends Schema<O, I> {
  constructor(
    private readonly _inner: Schema<any, I>,
    private readonly _transformFn: (val: any) => O,
  ) {
    super();
  }

  _schemaType(): SchemaType {
    return this._inner._schemaType();
  }

  _parse(value: unknown, ctx: ParseContext): O {
    const parsed = this._inner._runPipeline(value, ctx);
    if (ctx.hasIssues()) return parsed as unknown as O;
    return this._transformFn(parsed);
  }

  _toJSONSchema(tracker: RefTracker): JSONSchemaObject {
    // Transforms don't affect JSON Schema — report the input schema shape
    return this._inner._toJSONSchemaWithRefs(tracker);
  }

  _clone(): TransformSchema<O, I> {
    return new TransformSchema(this._inner, this._transformFn);
  }
}

// src/transforms/pipe.ts

export class PipeSchema<O, I> extends Schema<O, I> {
  constructor(
    private readonly _first: Schema<any, I>,
    private readonly _second: Schema<O, any>,
  ) {
    super();
  }

  _schemaType(): SchemaType {
    return this._second._schemaType();
  }

  _parse(value: unknown, ctx: ParseContext): O {
    const intermediate = this._first._runPipeline(value, ctx);
    if (ctx.hasIssues()) return intermediate as unknown as O;
    return this._second._runPipeline(intermediate, ctx);
  }

  _toJSONSchema(tracker: RefTracker): JSONSchemaObject {
    // Pipe chains — the output schema determines the JSON Schema shape
    return this._second._toJSONSchemaWithRefs(tracker);
  }

  _clone(): PipeSchema<O, I> {
    return new PipeSchema(this._first, this._second);
  }
}

// src/transforms/preprocess.ts

export function preprocess<O, I>(
  fn: (value: unknown) => unknown,
  schema: Schema<O, I>,
): Schema<O, unknown> {
  return new PreprocessSchema(fn, schema);
}

class PreprocessSchema<O, I> extends Schema<O, unknown> {
  constructor(
    private readonly _preprocessFn: (value: unknown) => unknown,
    private readonly _inner: Schema<O, I>,
  ) {
    super();
  }

  _schemaType(): SchemaType {
    return this._inner._schemaType();
  }

  _parse(value: unknown, ctx: ParseContext): O {
    const preprocessed = this._preprocessFn(value);
    return this._inner._runPipeline(preprocessed, ctx);
  }

  _toJSONSchema(tracker: RefTracker): JSONSchemaObject {
    return this._inner._toJSONSchemaWithRefs(tracker);
  }

  _clone(): PreprocessSchema<O, I> {
    return new PreprocessSchema(this._preprocessFn, this._inner);
  }
}
```

### 18. The `schema` / `s` Factory Object

```typescript
// src/index.ts

import { StringSchema } from './schemas/string';
import { NumberSchema } from './schemas/number';
import { BooleanSchema } from './schemas/boolean';
import { BigIntSchema } from './schemas/bigint';
import { SymbolSchema } from './schemas/symbol';
import { DateSchema } from './schemas/date';
import { ObjectSchema } from './schemas/object';
import { ArraySchema } from './schemas/array';
import { TupleSchema } from './schemas/tuple';
import { EnumSchema } from './schemas/enum';
import { UnionSchema } from './schemas/union';
import { DiscriminatedUnionSchema } from './schemas/discriminated-union';
import { IntersectionSchema } from './schemas/intersection';
import { RecordSchema } from './schemas/record';
import { MapSchema } from './schemas/map';
import { SetSchema } from './schemas/set';
import { LiteralSchema } from './schemas/literal';
import { AnySchema, UnknownSchema, NullSchema, UndefinedSchema, VoidSchema, NeverSchema } from './schemas/special';
import { NanSchema } from './schemas/nan';
import { LazySchema } from './schemas/lazy';
import { CustomSchema } from './schemas/custom';
import { InstanceOfSchema } from './schemas/instanceof';
import { FileSchema } from './schemas/file';
import { CoercedStringSchema, CoercedNumberSchema, CoercedBooleanSchema, CoercedBigIntSchema, CoercedDateSchema } from './schemas/coerced';
import { EmailSchema } from './schemas/formats/email';
import { UuidSchema } from './schemas/formats/uuid';
import { UrlSchema } from './schemas/formats/url';
import { HostnameSchema } from './schemas/formats/hostname';
import { Ipv4Schema } from './schemas/formats/ipv4';
import { Ipv6Schema } from './schemas/formats/ipv6';
import { Base64Schema } from './schemas/formats/base64';
import { HexSchema } from './schemas/formats/hex';
import { JwtSchema } from './schemas/formats/jwt';
import { CuidSchema } from './schemas/formats/cuid';
import { UlidSchema } from './schemas/formats/ulid';
import { NanoidSchema } from './schemas/formats/nanoid';
import { IsoDateSchema, IsoTimeSchema, IsoDatetimeSchema, IsoDurationSchema } from './schemas/formats/iso';

export const schema = {
  // Primitives
  string:    (): StringSchema => new StringSchema(),
  number:    (): NumberSchema => new NumberSchema(),
  bigint:    (): BigIntSchema => new BigIntSchema(),
  boolean:   (): BooleanSchema => new BooleanSchema(),
  symbol:    (): SymbolSchema => new SymbolSchema(),
  date:      (): DateSchema => new DateSchema(),
  undefined: (): UndefinedSchema => new UndefinedSchema(),
  null:      (): NullSchema => new NullSchema(),
  nan:       (): NanSchema => new NanSchema(),
  any:       (): AnySchema => new AnySchema(),
  unknown:   (): UnknownSchema => new UnknownSchema(),
  never:     (): NeverSchema => new NeverSchema(),
  void:      (): VoidSchema => new VoidSchema(),

  // Convenience
  int:       (): NumberSchema => new NumberSchema().int(),

  // Composites
  object: <T extends Record<string, Schema<any, any>>>(shape: T): ObjectSchema<T> =>
    new ObjectSchema(shape),
  array: <T extends Schema<any, any>>(element: T): ArraySchema<T> =>
    new ArraySchema(element),
  tuple: <T extends [Schema<any, any>, ...Schema<any, any>[]]>(items: T): TupleSchema<T> =>
    new TupleSchema(items),
  union: <T extends [Schema<any, any>, ...Schema<any, any>[]]>(options: T): UnionSchema<T> =>
    new UnionSchema(options),
  discriminatedUnion: <D extends string, T extends Schema<any, any>[]>(
    discriminator: D, options: T
  ): DiscriminatedUnionSchema<D, T> =>
    new DiscriminatedUnionSchema(discriminator, options),
  intersection: <A extends Schema<any, any>, B extends Schema<any, any>>(
    left: A, right: B
  ): IntersectionSchema<A, B> =>
    new IntersectionSchema(left, right),
  record: <V extends Schema<any, any>, K extends Schema<any, any> = StringSchema>(
    ...args: [V] | [K, V]
  ): RecordSchema<any> => {
    if (args.length === 1) return new RecordSchema(new StringSchema(), args[0]);
    return new RecordSchema(args[0], args[1]);
  },
  map: <K extends Schema<any, any>, V extends Schema<any, any>>(
    keySchema: K, valueSchema: V
  ): MapSchema<K, V> =>
    new MapSchema(keySchema, valueSchema),
  set: <T extends Schema<any, any>>(element: T): SetSchema<T> =>
    new SetSchema(element),
  enum: <T extends [string, ...string[]]>(values: T): EnumSchema<T> =>
    new EnumSchema(values),
  literal: <T extends string | number | boolean | null | undefined>(value: T): LiteralSchema<T> =>
    new LiteralSchema(value),

  // Specialized
  file:       (): FileSchema => new FileSchema(),
  instanceof: <T extends abstract new (...args: any) => any>(cls: T): InstanceOfSchema<T> =>
    new InstanceOfSchema(cls),
  custom: <T>(predicate: (val: unknown) => val is T): CustomSchema<T> =>
    new CustomSchema(predicate),
  lazy: <T extends Schema<any, any>>(getter: () => T): LazySchema<Infer<T>, Input<T>> =>
    new LazySchema(getter as any),

  // String Formats (standalone factories)
  email:    (): EmailSchema => new EmailSchema(),
  uuid:     (): UuidSchema => new UuidSchema(),
  url:      (): UrlSchema => new UrlSchema(),
  hostname: (): HostnameSchema => new HostnameSchema(),
  ipv4:     (): Ipv4Schema => new Ipv4Schema(),
  ipv6:     (): Ipv6Schema => new Ipv6Schema(),
  base64:   (): Base64Schema => new Base64Schema(),
  hex:      (): HexSchema => new HexSchema(),
  jwt:      (): JwtSchema => new JwtSchema(),
  cuid:     (): CuidSchema => new CuidSchema(),
  ulid:     (): UlidSchema => new UlidSchema(),
  nanoid:   (): NanoidSchema => new NanoidSchema(),

  // ISO date/time formats (nested namespace)
  iso: {
    date:     (): IsoDateSchema => new IsoDateSchema(),
    time:     (): IsoTimeSchema => new IsoTimeSchema(),
    datetime: (): IsoDatetimeSchema => new IsoDatetimeSchema(),
    duration: (): IsoDurationSchema => new IsoDurationSchema(),
  },

  // Coercion namespace
  coerce: {
    string:  (): CoercedStringSchema => new CoercedStringSchema(),
    number:  (): CoercedNumberSchema => new CoercedNumberSchema(),
    boolean: (): CoercedBooleanSchema => new CoercedBooleanSchema(),
    bigint:  (): CoercedBigIntSchema => new CoercedBigIntSchema(),
    date:    (): CoercedDateSchema => new CoercedDateSchema(),
  },
};

// Alias
export const s = schema;

// Type exports
export type { Infer, Input, Output } from './utils/type-inference';
export { Schema } from './core/schema';
export { ParseError, ErrorCode } from './core/errors';
export type { ValidationIssue } from './core/errors';
export type { SchemaMetadata, SafeParseResult } from './core/types';
export { SchemaRegistry } from './core/registry';
export { preprocess } from './transforms/preprocess';
export { toJSONSchema } from './introspection/json-schema';
```

---

## Configuration Files

### package.json

```json
{
  "name": "@vertz/schema",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "bunup",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {},
  "devDependencies": {
    "bunup": "latest",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  },
  "engines": {
    "node": ">=22"
  }
}
```

### bunup.config.ts

```typescript
import { defineConfig } from 'bunup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
});
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "isolatedDeclarations": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": false,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

### vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
    },
  },
});
```

---

## Implementation Phases (TDD)

Each phase follows strict TDD — one test at a time. Write one failing test, implement just enough to pass, refactor, then write the next test. Tests are colocated with source files (e.g., `src/core/__tests__/schema.test.ts`).

### Phase 1: Core Infrastructure

**Goal:** Base `Schema<O, I>` class, error system, ParseContext, SchemaRegistry, type inference utilities.

**Files:**
- `src/core/errors.ts` — ErrorCode, ValidationIssue, ParseError
- `src/core/parse-context.ts` — ParseContext, RefinementContext
- `src/core/types.ts` — SchemaType, SchemaMetadata, SafeParseResult
- `src/core/schema.ts` — Abstract Schema base with parse/safeParse, universal methods (.describe, .meta, .example, .id)
- `src/core/registry.ts` — SchemaRegistry
- `src/utils/type-inference.ts` — Infer, Input, Output
- `src/introspection/json-schema.ts` — RefTracker, toJSONSchema standalone

**Tests:**
- `src/core/__tests__/errors.test.ts`
  - ErrorCode enum values
  - ParseError construction with single/multiple issues
  - ParseError.formatMessage with paths
  - ParseError extends Error, instanceof check
- `src/core/__tests__/parse-context.test.ts`
  - addIssue creates issue with current path
  - pushPath/popPath tracks nested paths
  - hasIssues returns false when empty, true after addIssue
  - Multiple issues accumulate
- `src/core/__tests__/registry.test.ts`
  - register/get/has/getAll
  - clear empties registry
  - Registering same name overwrites
  - **Note:** All test files using `.id()` must call `SchemaRegistry.clear()` in `beforeEach` to prevent cross-test pollution. Add to vitest setup file for global cleanup.
- `src/core/__tests__/schema.test.ts`
  - (Tested via concrete subclasses in Phase 2)
- `src/utils/__tests__/type-inference.test.ts`
  - Type-level tests: `expectTypeOf<Infer<typeof schema>>().toEqualTypeOf<string>()`

### Phase 2: Primitive Schemas — String and Number

**Goal:** StringSchema and NumberSchema with full constraint sets, custom error messages, and JSON Schema output.

**Files:**
- `src/schemas/string.ts`
- `src/schemas/number.ts`

**Tests:**
- `src/schemas/__tests__/string.test.ts`
  - Accepts valid string
  - Rejects non-string (number, boolean, null, undefined, object)
  - .min(n) — accepts at boundary, rejects below
  - .max(n) — accepts at boundary, rejects above
  - .length(n) — accepts exact, rejects different
  - .regex(pattern) — accepts matching, rejects non-matching
  - .startsWith(prefix) — accepts/rejects
  - .endsWith(suffix) — accepts/rejects
  - .includes(substring) — accepts/rejects
  - .uppercase() — validates all uppercase, rejects mixed
  - .lowercase() — validates all lowercase, rejects mixed
  - .trim() — trims whitespace before validation
  - .toLowerCase() / .toUpperCase() / .normalize() — transforms
  - Chaining: `.min(1).max(100).trim()`
  - Per-rule custom error messages: `.min(5, 'Too short')`
  - .optional() / .nullable() / .default() composition
  - .describe() / .meta() / .example() metadata
  - .toJSONSchema() — type, minLength, maxLength, pattern
  - safeParse returns success/error
  - parse throws ParseError on failure
  - Error path is empty (top-level)
- `src/schemas/__tests__/number.test.ts`
  - Accepts valid number
  - Rejects non-number (string, boolean, null, undefined, NaN)
  - .gte(n) / .min(n) — inclusive minimum
  - .gt(n) — exclusive minimum
  - .lte(n) / .max(n) — inclusive maximum
  - .lt(n) — exclusive maximum
  - .int() — rejects floats
  - .positive() / .negative() / .nonnegative() / .nonpositive()
  - .multipleOf(n) / .step(n) — accepts multiples, rejects others
  - .finite() — rejects Infinity
  - Per-rule custom error messages
  - .toJSONSchema() — type, minimum, exclusiveMinimum, maximum, exclusiveMaximum, multipleOf, integer

### Phase 3: Remaining Primitive Schemas

**Goal:** BooleanSchema, BigIntSchema, DateSchema, NanSchema, SymbolSchema, and special schemas (Any, Unknown, Null, Undefined, Void, Never).

**Files:**
- `src/schemas/boolean.ts`
- `src/schemas/bigint.ts`
- `src/schemas/date.ts`
- `src/schemas/nan.ts`
- `src/schemas/symbol.ts`
- `src/schemas/special.ts` (Any, Unknown, Null, Undefined, Void, Never)

**Tests:**
- `src/schemas/__tests__/boolean.test.ts`
  - Accepts true/false, rejects non-booleans
  - .toJSONSchema() → `{ type: "boolean" }`
- `src/schemas/__tests__/bigint.test.ts`
  - Accepts bigint values, rejects non-bigint
  - .toJSONSchema() → `{ type: "integer", format: "int64" }`
- `src/schemas/__tests__/date.test.ts`
  - Accepts valid Date instances
  - Rejects strings, numbers (strict — no auto-coercion)
  - Rejects invalid Date (NaN time)
  - .min(date) — rejects dates before minimum
  - .max(date) — rejects dates after maximum
  - .min(date).max(date) — range validation
  - Per-rule custom error messages for min/max
  - .toISOString() — transforms Date to ISO string, output type is string
  - .toJSONSchema() → `{ type: "string", format: "date-time" }`
- `src/schemas/__tests__/nan.test.ts`
  - Accepts NaN, rejects numbers and non-numbers
- `src/schemas/__tests__/symbol.test.ts`
  - Accepts symbols, rejects non-symbols
- `src/schemas/__tests__/special.test.ts`
  - AnySchema: accepts everything
  - UnknownSchema: accepts everything, output typed as unknown
  - NullSchema: accepts null, rejects everything else
  - UndefinedSchema: accepts undefined, rejects everything else
  - VoidSchema: accepts undefined, rejects everything else
  - NeverSchema: rejects everything

### Phase 4: Wrapper Schemas and Universal Methods

**Goal:** OptionalSchema, NullableSchema, DefaultSchema as wrapper types. Test all universal methods (.optional, .nullable, .default, .describe, .meta, .example, .id) with composition.

**Files:**
- `src/core/schema.ts` — OptionalSchema, NullableSchema, DefaultSchema (complete implementation)

**Tests:**
- `src/core/__tests__/wrappers.test.ts`
  - OptionalSchema: accepts undefined, passes through to inner for other values
  - OptionalSchema.unwrap() returns inner schema
  - NullableSchema: accepts null, passes through to inner for other values
  - NullableSchema.toJSONSchema() → `type: ["string", "null"]`
  - DefaultSchema: uses default when undefined, passes through for other values
  - DefaultSchema with function default (called each time)
  - DefaultSchema.toJSONSchema() includes `default` property
  - Chaining: `s.string().optional().nullable()` — stacking wrappers
  - `.id(name)` registers in SchemaRegistry
  - Named schemas propagate id through .optional()/.nullable()/.default()
  - Wrapper pipeline delegation: `s.string().refine(fn).optional()` — refinement on inner schema still executes
  - Wrapper _clone preserves metadata: `.describe('x').optional()._clone()` retains description

### Phase 5: Object Schema

**Goal:** ObjectSchema with full method set — shape, required, optional properties, strict/passthrough/catchall, extend/pick/omit/partial/required/keyof, and comprehensive JSON Schema output.

**Files:**
- `src/schemas/object.ts`

**Tests:**
- `src/schemas/__tests__/object.test.ts`
  - Accepts valid object matching shape
  - Rejects non-object (null, array, primitive)
  - Reports missing required properties (MissingProperty error code)
  - Allows optional properties to be absent
  - Default properties fill in when absent
  - Strips unknown keys (default mode)
  - .strict() — rejects unknown keys with UnrecognizedKeys error
  - .passthrough() — preserves unknown keys
  - .catchall(schema) — validates unknown keys against catchall schema
  - .shape — returns shape definition
  - .keyof() — returns EnumSchema of keys
  - .extend(shape) — adds new properties
  - .merge(otherObject) — combines two object schemas (later shape wins on conflict)
  - .pick(keys) — keeps only specified keys
  - .omit(keys) — removes specified keys
  - .partial() — makes all properties optional
  - .required() — unwraps OptionalSchema wrappers
  - Nested object validation — errors include full path
  - .toJSONSchema() — type, properties, required array
  - .strict().toJSONSchema() → `additionalProperties: false`
  - .catchall().toJSONSchema() → `additionalProperties: { ... }`
  - Named schemas in shape produce $ref in JSON Schema

### Phase 6: Array and Tuple Schemas

**Goal:** ArraySchema with min/max/length, TupleSchema with rest element support.

**Files:**
- `src/schemas/array.ts`
- `src/schemas/tuple.ts`

**Tests:**
- `src/schemas/__tests__/array.test.ts`
  - Accepts valid arrays
  - Rejects non-arrays
  - Validates each element against element schema
  - Reports errors with array index in path
  - .min(n) / .max(n) / .length(n)
  - .toJSONSchema() → `{ type: "array", items: {...}, minItems, maxItems }`
- `src/schemas/__tests__/tuple.test.ts`
  - Accepts tuple with correct types at each position
  - Rejects wrong type at any position
  - Rejects wrong length
  - .rest(schema) — validates additional elements
  - .toJSONSchema() → `{ type: "array", prefixItems: [...], items: false }` (or `items: {...}` for rest)
  - Error paths include tuple index

### Phase 7: Enum, Literal, Union Schemas

**Goal:** EnumSchema with exclude/extract, LiteralSchema, UnionSchema.

**Files:**
- `src/schemas/enum.ts`
- `src/schemas/literal.ts`
- `src/schemas/union.ts`

**Tests:**
- `src/schemas/__tests__/enum.test.ts`
  - Accepts valid enum values
  - Rejects invalid values (InvalidEnumValue error code)
  - .exclude(values) — creates new enum without specified values
  - .extract(values) — creates new enum with only specified values
  - .toJSONSchema() → `{ enum: [...] }`
- `src/schemas/__tests__/literal.test.ts`
  - Accepts exact literal value (string, number, boolean, null)
  - Rejects non-matching values (InvalidLiteral error code)
  - .toJSONSchema() → `{ const: value }`
- `src/schemas/__tests__/union.test.ts`
  - Accepts values matching any option
  - Rejects values matching no option (InvalidUnion error code)
  - .toJSONSchema() → `{ anyOf: [...] }`
  - Tries options in order, returns first match

### Phase 8: DiscriminatedUnion, Intersection, Record Schemas

**Goal:** Efficient discriminated union dispatch, intersection validation with allOf output, record with key/value schemas.

**Files:**
- `src/schemas/discriminated-union.ts`
- `src/schemas/intersection.ts`
- `src/schemas/record.ts`

**Tests:**
- `src/schemas/__tests__/discriminated-union.test.ts`
  - Dispatches to correct schema based on discriminator (O(1) via lookup map)
  - Rejects missing discriminator property
  - Rejects unknown discriminator value
  - Lookup map built at construction from LiteralSchema discriminator fields
  - .toJSONSchema() → `{ oneOf: [...], discriminator: { propertyName: "..." } }`
- `src/schemas/__tests__/intersection.test.ts`
  - Accepts values satisfying both schemas
  - Rejects values failing either schema (InvalidIntersection)
  - .toJSONSchema() → `{ allOf: [left, right] }`
- `src/schemas/__tests__/record.test.ts`
  - Single arg: `s.record(valueSchema)` — string keys, typed values
  - Two args: `s.record(keySchema, valueSchema)` — validates both keys and values
  - Rejects invalid values
  - Validates key schema (e.g., s.record(s.uuid(), s.number()))
  - .toJSONSchema() → `{ type: "object", additionalProperties: { ... } }`

### Phase 9: Refinements and Transforms

**Goal:** .refine(), .superRefine(), .check(), .transform(), .pipe(), preprocess(), .catch().

**Files:**
- `src/refinements/refine.ts`
- `src/refinements/super-refine.ts`
- `src/refinements/check.ts`
- `src/transforms/transform.ts`
- `src/transforms/pipe.ts`
- `src/transforms/preprocess.ts`
- `src/effects/catch.ts`

**Tests:**
- `src/refinements/__tests__/refine.test.ts`
  - .refine(predicate) — passes when predicate returns true
  - .refine(predicate) — fails with Custom error when predicate returns false
  - .refine(predicate, message) — uses custom error message
  - .refine(predicate, { message, path }) — uses custom path
  - Refinement receives the parsed (pre-transform) value
- `src/refinements/__tests__/super-refine.test.ts`
  - .superRefine((val, ctx) => { ... }) — can add multiple issues
  - .superRefine — ctx.addIssue with custom codes
  - .check() — same behavior as superRefine (alias test)
- `src/transforms/__tests__/transform.test.ts`
  - .transform(fn) — changes output value
  - .transform(fn) — changes output type (string → number)
  - Type inference: `Infer<typeof transformed>` is the new type
  - Type inference: `Input<typeof transformed>` is the original type
  - Chaining: `.refine().transform()` — refine sees pre-transform, transform sees post-parse
- `src/transforms/__tests__/pipe.test.ts`
  - .pipe(schema) — chains two schemas
  - First schema output feeds into second schema input
  - Validation errors from either schema propagate
- `src/transforms/__tests__/preprocess.test.ts`
  - preprocess(fn, schema) — transforms input before validation
  - Preprocessed value is what the schema validates
- `src/effects/__tests__/catch.test.ts`
  - .catch(fallback) — returns fallback on parse failure
  - .catch(fn) — calls function for fallback
  - Successful parse returns normal value (fallback ignored)

### Phase 10: Effects (Brand, Readonly)

**Goal:** Type-level brand, Object.freeze readonly.

**Files:**
- `src/effects/brand.ts`
- `src/effects/readonly.ts`

**Tests:**
- `src/effects/__tests__/brand.test.ts`
  - .brand<'USD'>() — runtime behavior unchanged (value passes through)
  - Type inference: branded type includes `__brand` (type-level test)
  - Branded values are not assignable to non-branded types (type-level test)
  - JSON Schema output ignores brand
- `src/effects/__tests__/readonly.test.ts`
  - .readonly() — output is frozen (Object.isFrozen)
  - .readonly() on object — properties are not writable
  - Type inference: `Infer` is `Readonly<T>`

### Phase 11: Coercion Schemas

**Goal:** s.coerce.string(), s.coerce.number(), s.coerce.boolean(), s.coerce.bigint(), s.coerce.date().

**Files:**
- `src/schemas/coerced.ts`

**Tests:**
- `src/schemas/__tests__/coerced.test.ts`
  - CoercedString: number → string, boolean → string, null → '', undefined → '' (explicit design choice)
  - CoercedNumber: string → number, boolean → number
  - CoercedBoolean: 0/1/''/'hello' → boolean
  - CoercedBigInt: string → bigint, number → bigint, fails on non-coercible
  - CoercedDate: string → Date, number (timestamp) → Date, rejects invalid
  - All coerced schemas inherit constraint methods from their parent (e.g., CoercedNumberSchema has .min(), .max())
  - JSON Schema output same as non-coerced counterpart

### Phase 12: String Format Schemas

**Goal:** All standalone format validators: email, uuid, url, hostname, ipv4, ipv6, base64, hex, jwt, cuid, ulid, nanoid, iso.date, iso.time, iso.datetime, iso.duration.

**Files:**
- `src/schemas/formats/email.ts`
- `src/schemas/formats/uuid.ts`
- `src/schemas/formats/url.ts`
- `src/schemas/formats/hostname.ts`
- `src/schemas/formats/ipv4.ts`
- `src/schemas/formats/ipv6.ts`
- `src/schemas/formats/base64.ts`
- `src/schemas/formats/hex.ts`
- `src/schemas/formats/jwt.ts`
- `src/schemas/formats/cuid.ts`
- `src/schemas/formats/ulid.ts`
- `src/schemas/formats/nanoid.ts`
- `src/schemas/formats/iso.ts`

**Tests (one file per format):**
- `src/schemas/formats/__tests__/email.test.ts`
  - Accepts valid emails (user@domain.com, user+tag@sub.domain.co)
  - Rejects invalid emails (no @, double @, trailing dot, etc.)
  - Inherits StringSchema methods (.min, .max, .trim, etc.)
  - .toJSONSchema() → `{ type: "string", format: "email" }`
- `src/schemas/formats/__tests__/uuid.test.ts`
  - Accepts v4 UUIDs
  - Rejects invalid format
  - .toJSONSchema() → `{ type: "string", format: "uuid" }`
- `src/schemas/formats/__tests__/url.test.ts`
  - Accepts valid URLs (http, https, with paths, query params)
  - Rejects invalid URLs
  - .toJSONSchema() → `{ type: "string", format: "uri" }`
- `src/schemas/formats/__tests__/hostname.test.ts`
  - Accepts valid hostnames
  - .toJSONSchema() → `{ type: "string", format: "hostname" }`
- `src/schemas/formats/__tests__/ipv4.test.ts`
  - Accepts valid IPv4 (0.0.0.0, 255.255.255.255)
  - Rejects out-of-range octets, wrong format
  - .toJSONSchema() → `{ type: "string", format: "ipv4" }`
- `src/schemas/formats/__tests__/ipv6.test.ts`
  - Accepts valid IPv6 (full, abbreviated, ::1)
  - .toJSONSchema() → `{ type: "string", format: "ipv6" }`
- `src/schemas/formats/__tests__/base64.test.ts`
  - Accepts valid base64 strings
  - .toJSONSchema() → `{ type: "string", contentEncoding: "base64" }`
- `src/schemas/formats/__tests__/hex.test.ts`
  - Accepts valid hex strings (0-9, a-f, A-F)
  - Rejects non-hex characters
- `src/schemas/formats/__tests__/jwt.test.ts`
  - Accepts valid JWT format (three dot-separated base64url segments)
  - Rejects invalid JWT
- `src/schemas/formats/__tests__/cuid.test.ts`
  - Accepts valid CUID format
- `src/schemas/formats/__tests__/ulid.test.ts`
  - Accepts valid ULID format (26 chars, Crockford base32)
- `src/schemas/formats/__tests__/nanoid.test.ts`
  - Accepts valid nanoid format (21 chars default)
- `src/schemas/formats/__tests__/iso.test.ts`
  - IsoDate: accepts "2024-01-15", rejects "2024-13-01"
  - IsoTime: accepts "14:30:00", rejects "25:00:00"
  - IsoDatetime: accepts "2024-01-15T14:30:00Z"
  - IsoDuration: accepts "P1Y2M3DT4H5M6S"
  - Each has correct format in .toJSONSchema()

### Phase 13: Map, Set, Symbol, File, Custom, InstanceOf Schemas

**Goal:** Remaining composite and specialized schema types.

**Files:**
- `src/schemas/map.ts`
- `src/schemas/set.ts`
- `src/schemas/file.ts`
- `src/schemas/custom.ts`
- `src/schemas/instanceof.ts`

**Tests:**
- `src/schemas/__tests__/map.test.ts`
  - Accepts Map instances with valid key/value types
  - Rejects non-Map values
  - Validates each key and value against schemas
  - .toJSONSchema() — (Map has no direct JSON Schema; output documents the shape)
- `src/schemas/__tests__/set.test.ts`
  - Accepts Set instances with valid element types
  - Rejects non-Set values
  - .min(n) / .max(n) / .size(n) — element count constraints
  - .toJSONSchema() → `{ type: "array", uniqueItems: true, items: {...} }`
- `src/schemas/__tests__/file.test.ts`
  - Accepts File/Blob instances
  - Rejects non-File values
- `src/schemas/__tests__/custom.test.ts`
  - Accepts when predicate returns true
  - Rejects when predicate returns false (Custom error code)
- `src/schemas/__tests__/instanceof.test.ts`
  - Accepts instances of the specified class
  - Rejects non-instances
  - Works with subclasses

### Phase 14: Lazy Schema (Recursive Types)

**Goal:** LazySchema for recursive type definitions.

**Files:**
- `src/schemas/lazy.ts`

**Tests:**
- `src/schemas/__tests__/lazy.test.ts`
  - Deferred resolution — getter called lazily, not at construction
  - Parses recursive structures (tree nodes)
  - Works with .id() for JSON Schema output
  - .toJSONSchema() uses $ref for named lazy schemas
  - Validates deeply nested recursive data

### Phase 15: JSON Schema Output Completions

**Goal:** Comprehensive JSON Schema output for all schema types, named schema $ref/$defs, full OpenAPI v3.1 compliance.

**Files:**
- `src/introspection/json-schema.ts` — RefTracker finalization
- All schema `_toJSONSchema()` methods reviewed and completed

**Tests:**
- `src/introspection/__tests__/json-schema.test.ts`
  - Named primitive → `$ref` + `$defs` entry
  - Named object → `$ref` + `$defs` entry
  - Nested named schemas → multiple `$defs` entries
  - Recursive schema → `$ref` without infinite recursion
  - `toJSONSchema()` standalone function works same as instance method
- `src/introspection/__tests__/openapi-output.test.ts`
  - Object with required/optional properties
  - Nullable → `type: ["string", "null"]`
  - Tuple → `prefixItems` + `items: false` or rest schema
  - Discriminated union → `oneOf` + `discriminator`
  - Intersection → `allOf`
  - Strict object → `additionalProperties: false`
  - Record → `additionalProperties: { ... }`
  - Date → `{ type: "string", format: "date-time" }`
  - Number with .gt() → `exclusiveMinimum`
  - Number with .int() → `type: "integer"`
  - All string formats have correct `format` keyword
  - Description and examples propagate
  - Default values propagate

### Phase 16: Factory Object and Public API

**Goal:** Wire everything into the `schema`/`s` factory object, finalize `index.ts` exports.

**Files:**
- `src/index.ts`

**Tests:**
- `src/__tests__/index.test.ts`
  - `s.string()` returns StringSchema
  - `s.number()` returns NumberSchema
  - All factory methods return correct schema types
  - `s.int()` returns NumberSchema with .int() applied
  - `s.coerce.string()` returns CoercedStringSchema
  - `s.email()` returns EmailSchema
  - `s.iso.date()` returns IsoDateSchema
  - `schema` and `s` are the same object
  - All type exports are accessible
  - ParseError, SchemaRegistry exported correctly

### Phase 17: Integration Tests

**Goal:** End-to-end usage patterns, complex compositions, real-world schema definitions.

**Tests:**
- `src/__tests__/integration/schema-usage.test.ts`
  - Full user schema: object with string, email, number, date, optional, default
  - Parse valid data → returns typed result
  - Parse invalid data → aggregates all issues with paths
  - Nested object validation with full error paths
  - Type inference: `Infer<typeof schema>` matches expected type
- `src/__tests__/integration/named-schemas.test.ts`
  - Named primitive (UserId = s.uuid().id('UserId'))
  - Named object with named nested schemas
  - JSON Schema output with $defs and $ref
  - SchemaRegistry contains all named schemas
- `src/__tests__/integration/recursive-schemas.test.ts`
  - Tree node: `s.lazy(() => treeNode)` with .id()
  - Parse deeply nested tree structure
  - JSON Schema output with $ref (no infinite recursion)
- `src/__tests__/integration/complex-compositions.test.ts`
  - Object → pick → extend → partial chain
  - Discriminated union with named schemas
  - Transform pipeline: string → parse → number → validate
  - Intersection of two objects
  - Array of discriminated union

---

## Format Validation Regex Reference

Each format schema uses a regex or validation function for its format check. All regexes are designed to avoid catastrophic backtracking.

| Format | Validation Strategy |
|--------|-------------------|
| email | RFC 5322 simplified regex — covers common patterns, rejects obvious invalids |
| uuid | `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` |
| url | `URL` constructor (native) — catches invalid URLs natively |
| hostname | RFC 1123 regex |
| ipv4 | Regex with octet range validation (0-255) |
| ipv6 | Regex covering full, abbreviated, and mixed notation |
| base64 | `/^[A-Za-z0-9+/]*={0,2}$/` with length divisible by 4 |
| hex | `/^[0-9a-fA-F]+$/` |
| jwt | Three dot-separated base64url segments regex |
| cuid | `/^c[a-z0-9]{24}$/` |
| ulid | `/^[0-9A-HJKMNP-TV-Z]{26}$/` (Crockford base32, 26 chars) |
| nanoid | `/^[A-Za-z0-9_-]{21}$/` (default 21 chars) |
| iso.date | `/^\d{4}-\d{2}-\d{2}$/` + range validation (month 1-12, day 1-31) |
| iso.time | `/^\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/` + range validation |
| iso.datetime | Combines date + 'T' + time patterns |
| iso.duration | `/^P(\d+Y)?(\d+M)?(\d+D)?(T(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?$/` |

---

## Verification

1. **Zero deps**: No entries in `dependencies` in `package.json`
2. **ESM only**: `"type": "module"`, all ESM imports, no `require()`
3. **Tests pass**: `vitest run` exits cleanly — all unit and integration tests green
4. **Types pass**: `tsc --noEmit` with strict mode + `isolatedDeclarations: true`
5. **Type inference**: `expectTypeOf` tests pass for Infer, Input, Output with transforms
6. **JSON Schema output**: Matches OpenAPI v3.1 spec for all schema types
7. **Named schemas**: `.id()` produces correct `$ref`/`$defs` in JSON Schema output
8. **SchemaRegistry**: Compiler can collect all named schemas via `SchemaRegistry.getAll()`
9. **Build output**: `bunup` produces clean ESM with `.d.ts` files
10. **Parse flow**: Type check → constraints → refinements → transforms → effects (verified by integration tests)
11. **Error aggregation**: Object/array schemas collect all issues, not fail-fast
12. **Custom error messages**: Per-rule messages work on all constraint methods
13. **No legacy code**: All code is written from scratch — no reference to the legacy implementation

---

## Open Items

- [ ] **`.brand()` and JSON Schema** — Brands are type-level only. JSON Schema should ignore them (no output). Confirm this is correct.
- [ ] **`.readonly()` and JSON Schema** — Should `.readonly()` emit `readOnly: true` in JSON Schema output? OpenAPI v3.1 supports `readOnly`. Leaning yes for OpenAPI fidelity.
- [ ] **`s.lazy()` circular `$ref`** — `.toJSONSchema()` uses the RefTracker visited-set to break cycles. Unnamed lazy schemas that are truly recursive will cause infinite recursion — document that `.id()` is required for recursive schemas.
- [ ] **Immutable method chaining** — Every constraint method clones the schema. This is correct (schemas are value objects) but has allocation cost. Profile if this becomes a hot path. For now, correctness over optimization.
- [ ] **Error message i18n** — All error messages are English strings. If internationalization is needed later, messages could be generated by a pluggable formatter keyed on ErrorCode. Deferred.
- [ ] **`s.file()` runtime support** — File/Blob APIs vary by runtime. Need to verify `File` and `Blob` are available in Node 22+ (they are via `node:buffer`), Bun (native), and edge runtimes.
- [ ] **`s.map()` JSON Schema** — Map has no direct JSON Schema representation. Current plan: output `{ type: "object" }` with a description noting it's a Map. Alternative: omit from JSON Schema entirely. Decide during implementation.
- [x] **Discriminated union optimization** — ~~Current implementation tries each option sequentially.~~ Resolved: constructor now builds a `Map<discriminatorValue, Schema>` for O(1) dispatch. Each option's discriminator field must be a `LiteralSchema`.
