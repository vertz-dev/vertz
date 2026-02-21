# @vertz/schema

Type-safe validation with end-to-end type inference. Define schemas with a fluent API, get full TypeScript types automatically.

## Installation

```bash
bun add @vertz/schema
```

## Quick Start

```typescript
import { s, type Infer } from '@vertz/schema';

// Define a schema
const userSchema = s.object({
  name: s.string().min(1),
  email: s.email(),
  age: s.number().int().min(18),
});

// Infer the type
type User = Infer<typeof userSchema>;
// { name: string; email: string; age: number }

// Parse (throws on invalid)
const user = userSchema.parse({
  name: 'Alice',
  email: 'alice@example.com',
  age: 25,
});

// Safe parse (never throws)
const result = userSchema.safeParse(data);
if (result.success) {
  console.log(result.data);
} else {
  console.log(result.error.issues);
}
```

## Schema Types

### Primitives

```typescript
s.string()      // string
s.number()      // number
s.boolean()     // boolean
s.bigint()      // bigint
s.date()        // Date
s.symbol()      // symbol
s.int()         // number (integer-only)
s.nan()         // NaN
```

### Special Types

```typescript
s.any()         // any
s.unknown()     // unknown
s.null()        // null
s.undefined()   // undefined
s.void()        // void
s.never()       // never
```

### Composites

```typescript
// Objects
s.object({
  name: s.string(),
  age: s.number(),
})

// Arrays
s.array(s.number())

// Tuples
s.tuple([s.string(), s.number()])

// Enums
s.enum(['admin', 'user', 'guest'])

// Literals
s.literal('active')

// Unions
s.union([s.string(), s.number()])

// Discriminated unions
s.discriminatedUnion('type', [
  s.object({ type: s.literal('text'), content: s.string() }),
  s.object({ type: s.literal('image'), url: s.url() }),
])

// Intersections
s.intersection(
  s.object({ id: s.string() }),
  s.object({ name: s.string() }),
)

// Records (dynamic keys)
s.record(s.string())

// Maps
s.map(s.string(), s.number())

// Sets
s.set(s.string())

// Files
s.file()

// Custom validators
s.custom<number>(
  (val) => typeof val === 'number' && val % 2 === 0,
  'Must be an even number',
)

// Instance checks
s.instanceof(Date)

// Recursive types
s.lazy(() => categorySchema)
```

### Format Validators

Built-in validators for common formats:

```typescript
s.email()         // Email address
s.uuid()          // UUID
s.url()           // HTTP(S) URL
s.hostname()      // Valid hostname
s.ipv4()          // IPv4 address
s.ipv6()          // IPv6 address
s.base64()        // Base64 string
s.hex()           // Hexadecimal string
s.jwt()           // JWT token (format only)
s.cuid()          // CUID
s.ulid()          // ULID
s.nanoid()        // Nano ID

// ISO formats
s.iso.date()      // YYYY-MM-DD
s.iso.time()      // HH:MM:SS
s.iso.datetime()  // ISO 8601 datetime
s.iso.duration()  // ISO 8601 duration (P1Y2M3D)
```

### Database Enum Bridge

```typescript
// Convert a @vertz/db enum column to a schema
s.fromDbEnum(statusColumn)
```

## Modifiers

### Optional & Nullable

```typescript
s.string().optional()         // string | undefined
s.string().nullable()         // string | null
s.string().nullable().optional()  // string | null | undefined
```

### Default Values

```typescript
s.string().default('hello')
s.number().default(() => Math.random())

s.string().default('hello').parse(undefined)  // 'hello'
```

### Transformations

```typescript
s.string().transform((val) => val.toUpperCase())
s.string().trim().transform((s) => s.split(','))
```

### Refinements

```typescript
// Simple predicate
s.string().refine(
  (val) => val.includes('@'),
  { message: 'Must contain @' },
)

// Multiple refinements
s.string()
  .min(8)
  .refine((val) => /[A-Z]/.test(val), { message: 'Need uppercase' })
  .refine((val) => /[0-9]/.test(val), { message: 'Need digit' })
```

### Super Refine

Access the refinement context for cross-field validation:

```typescript
s.object({
  password: s.string(),
  confirm: s.string(),
}).superRefine((data, ctx) => {
  if (data.password !== data.confirm) {
    ctx.addIssue({
      code: 'custom',
      path: ['confirm'],
      message: 'Passwords must match',
    });
  }
})
```

### Branded Types

```typescript
const UserId = s.string().uuid().brand('UserId');
const PostId = s.string().uuid().brand('PostId');

type UserId = Infer<typeof UserId>;  // string & { __brand: 'UserId' }
type PostId = Infer<typeof PostId>;  // string & { __brand: 'PostId' }

function getUser(id: UserId) { /* ... */ }
getUser(UserId.parse('...'));  // OK
getUser(PostId.parse('...'));  // Type error
```

### Catch (Error Recovery)

```typescript
s.number().catch(0).parse('invalid')  // 0
```

### Readonly

```typescript
s.object({ tags: s.array(s.string()) }).readonly()
// Readonly<{ tags: readonly string[] }>
```

### Pipe

Chain schemas sequentially:

```typescript
s.string().pipe(s.coerce.number())
```

## String Validations

```typescript
s.string()
  .min(3)                  // min length
  .max(20)                 // max length
  .length(10)              // exact length
  .regex(/^[a-z]+$/)       // pattern
  .startsWith('hello')
  .endsWith('world')
  .includes('mid')
  .uppercase()             // must be uppercase
  .lowercase()             // must be lowercase
  .trim()                  // trims whitespace (transform)
  .toLowerCase()           // converts to lowercase (transform)
  .toUpperCase()           // converts to uppercase (transform)
```

## Number Validations

```typescript
s.number()
  .int()                   // integer only
  .positive()              // > 0
  .negative()              // < 0
  .nonnegative()           // >= 0
  .nonpositive()           // <= 0
  .min(0)                  // >= n
  .max(100)                // <= n
  .gt(0)                   // > n
  .lt(100)                 // < n
  .multipleOf(5)           // divisible by n
  .finite()                // no Infinity
```

## Array Validations

```typescript
s.array(s.string())
  .min(1)                  // at least 1 element
  .max(10)                 // at most 10 elements
  .length(5)               // exactly 5 elements
```

## Object Methods

```typescript
const base = s.object({ id: s.string(), name: s.string(), email: s.email() });

base.pick('id', 'name')           // { id: string; name: string }
base.omit('email')                // { id: string; name: string }
base.partial()                    // { id?: string; name?: string; email?: string }
base.required()                   // all fields required
base.extend({ age: s.number() }) // add fields
base.merge(otherSchema)          // merge two object schemas
base.strict()                    // reject unknown keys
base.passthrough()               // pass through unknown keys
base.catchall(s.string())        // validate unknown keys with schema
base.keyof()                     // ['id', 'name', 'email']
```

## Tuple Rest Elements

```typescript
s.tuple([s.string(), s.number()]).rest(s.boolean())
// [string, number, ...boolean[]]
```

## Parsing

### `.parse(data)`

Returns the parsed value. Throws `ParseError` on failure:

```typescript
try {
  const value = schema.parse(data);
} catch (error) {
  if (error instanceof ParseError) {
    console.log(error.issues);
  }
}
```

### `.safeParse(data)`

Returns a result object. Never throws:

```typescript
const result = schema.safeParse(data);

if (result.success) {
  result.data   // parsed value
} else {
  result.error  // ParseError
  result.error.issues  // ValidationIssue[]
}
```

## Type Inference

```typescript
import type { Infer, Input, Output } from '@vertz/schema';

const schema = s.string().transform((s) => s.length);

type In = Input<typeof schema>;   // string
type Out = Output<typeof schema>; // number
type Out2 = Infer<typeof schema>; // number (alias for Output)

// Also available as instance properties:
type In3 = typeof schema._input;
type Out3 = typeof schema._output;
```

## Coercion

Convert values to the target type before validation:

```typescript
s.coerce.string()   // String(value)
s.coerce.number()   // Number(value)
s.coerce.boolean()  // Boolean(value)
s.coerce.bigint()   // BigInt(value)
s.coerce.date()     // new Date(value)

s.coerce.number().parse('42')  // 42
s.coerce.date().parse('2024-01-01')  // Date object
```

## Error Handling

### ParseError

```typescript
import { ParseError } from '@vertz/schema';

const result = schema.safeParse(data);

if (!result.success) {
  for (const issue of result.error.issues) {
    console.log(issue.code);     // 'invalid_type', 'too_small', etc.
    console.log(issue.message);  // human-readable message
    console.log(issue.path);     // ['address', 'street']
  }
}
```

### Error Codes

```typescript
import { ErrorCode } from '@vertz/schema';

ErrorCode.InvalidType        // 'invalid_type'
ErrorCode.TooSmall           // 'too_small'
ErrorCode.TooBig             // 'too_big'
ErrorCode.InvalidString      // 'invalid_string'
ErrorCode.InvalidEnumValue   // 'invalid_enum_value'
ErrorCode.InvalidLiteral     // 'invalid_literal'
ErrorCode.InvalidUnion       // 'invalid_union'
ErrorCode.InvalidDate        // 'invalid_date'
ErrorCode.MissingProperty    // 'missing_property'
ErrorCode.UnrecognizedKeys   // 'unrecognized_keys'
ErrorCode.Custom             // 'custom'
ErrorCode.NotMultipleOf      // 'not_multiple_of'
ErrorCode.NotFinite          // 'not_finite'
```

## Result Type

Errors-as-values pattern for explicit error handling without try/catch:

```typescript
import { ok, err, unwrap, map, flatMap, match, matchErr } from '@vertz/schema';
import type { Result, Ok, Err } from '@vertz/schema';

// Create results
const success: Result<number, string> = ok(42);
const failure: Result<number, string> = err('not found');

// Check and extract
if (success.ok) {
  success.data  // 42
}
if (failure.ok === false) {
  failure.error  // 'not found'
}

// Unwrap (throws if Err)
const value = unwrap(success);  // 42

// Map success value
const doubled = map(success, (n) => n * 2);  // Ok(84)

// Chain Result-returning functions
const chained = flatMap(success, (n) =>
  n > 0 ? ok(n.toString()) : err('must be positive')
);

// Pattern matching
const message = match(result, {
  ok: (data) => `Got ${data}`,
  err: (error) => `Failed: ${error}`,
});

// Exhaustive error matching by code
const handled = matchErr(result, {
  ok: (data) => data,
  NOT_FOUND: (e) => fallback,
  CONFLICT: (e) => retry(),
});
```

The `Result` type is used throughout `@vertz/db` for all query methods.

## JSON Schema Generation

```typescript
import { toJSONSchema } from '@vertz/schema';

const schema = s.object({
  name: s.string().min(1),
  age: s.number().int().min(0),
});

const jsonSchema = toJSONSchema(schema);
// {
//   type: 'object',
//   properties: {
//     name: { type: 'string', minLength: 1 },
//     age: { type: 'integer', minimum: 0 }
//   },
//   required: ['name', 'age']
// }

// Also available as instance method:
schema.toJSONSchema()
```

## Schema Registry

Register and retrieve schemas by name:

```typescript
import { SchemaRegistry } from '@vertz/schema';

// Register via .id()
const userSchema = s.object({ name: s.string() }).id('User');

// Retrieve
const schema = SchemaRegistry.get('User');
SchemaRegistry.has('User');      // true
SchemaRegistry.getAll();         // Map<string, Schema>
```

## Schema Metadata

```typescript
const schema = s.string()
  .id('Username')
  .describe('The user display name')
  .meta({ deprecated: true })
  .example('alice');

schema.metadata.id           // 'Username'
schema.metadata.description  // 'The user display name'
schema.metadata.meta         // { deprecated: true }
schema.metadata.examples     // ['alice']
```

## Preprocessing

Transform raw input before schema validation:

```typescript
import { preprocess } from '@vertz/schema';

const schema = preprocess(
  (val) => typeof val === 'string' ? val.trim() : val,
  s.string().min(1),
);
```

## License

MIT
