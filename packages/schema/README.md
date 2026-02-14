# @vertz/schema

> Type-safe schema definition and validation for JavaScript/TypeScript

A powerful validation library with end-to-end type inference, inspired by Zod. Define schemas with a fluent API and get full TypeScript types automatically.

## Installation

```bash
# npm
npm install @vertz/schema

# bun
bun add @vertz/schema
```

## Quick Start

```typescript
import { s } from '@vertz/schema';

// Define a schema
const userSchema = s.object({
  name: s.string().min(1),
  email: s.string().email(),
  age: s.number().int().min(18),
});

// Parse data (throws on invalid)
const user = userSchema.parse({
  name: 'Alice',
  email: 'alice@example.com',
  age: 25,
});

// Safe parse (returns success/error)
const result = userSchema.safeParse({
  name: 'Bob',
  email: 'not-an-email',
  age: 17,
});

if (result.success) {
  console.log('Valid user:', result.value);
} else {
  console.log('Validation errors:', result.error.issues);
}

// Type inference
type User = typeof userSchema._output;
// ✅ { name: string; email: string; age: number }
```

## Core Concepts

### Primitives

```typescript
import { s } from '@vertz/schema';

s.string()      // string
s.number()      // number
s.boolean()     // boolean
s.bigint()      // bigint
s.date()        // Date
s.symbol()      // symbol
s.int()         // number (integer)
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

### Composite Types

```typescript
// Objects
const personSchema = s.object({
  name: s.string(),
  age: s.number(),
});

// Arrays
const numbersSchema = s.array(s.number());

// Tuples
const pairSchema = s.tuple([s.string(), s.number()]);

// Enums
const roleSchema = s.enum(['admin', 'user', 'guest']);

// Literals
const yesSchema = s.literal('yes');

// Unions
const statusSchema = s.union([
  s.literal('pending'),
  s.literal('approved'),
  s.literal('rejected'),
]);

// Records (dynamic keys)
const configSchema = s.record(s.string());

// Maps
const mapSchema = s.map(s.string(), s.number());

// Sets
const setSchema = s.set(s.string());
```

### String Validations

```typescript
const schema = s.string()
  .min(3)                    // Min length
  .max(20)                   // Max length
  .length(10)                // Exact length
  .regex(/^[a-z]+$/)         // Pattern matching
  .startsWith('hello')       // Prefix check
  .endsWith('world')         // Suffix check
  .includes('mid')           // Substring check
  .uppercase()               // Must be all uppercase
  .lowercase()               // Must be all lowercase
  .nonempty()                // Alias for .min(1)
  .trim();                   // Trim whitespace (transforms)
```

### Number Validations

```typescript
const schema = s.number()
  .int()                     // Must be integer
  .positive()                // > 0
  .negative()                // < 0
  .nonpositive()             // <= 0
  .nonnegative()             // >= 0
  .min(0)                    // Minimum value
  .max(100)                  // Maximum value
  .multipleOf(5)             // Must be divisible by n
  .finite();                 // No Infinity or NaN
```

### Format Validators

Built-in validators for common formats:

```typescript
s.email()         // Email address
s.uuid()          // UUID (v1-v5)
s.url()           // HTTP(S) URL
s.hostname()      // Valid hostname
s.ipv4()          // IPv4 address
s.ipv6()          // IPv6 address
s.base64()        // Base64 string
s.hex()           // Hexadecimal string
s.jwt()           // JWT token (format only, not verified)
s.cuid()          // CUID
s.ulid()          // ULID
s.nanoid()        // Nano ID

// ISO formats
s.iso.date()      // ISO 8601 date (YYYY-MM-DD)
s.iso.time()      // ISO 8601 time (HH:MM:SS)
s.iso.datetime()  // ISO 8601 datetime
s.iso.duration()  // ISO 8601 duration (P1Y2M3D)
```

### Optional and Nullable

```typescript
const schema = s.string().optional();
// string | undefined

const schema2 = s.string().nullable();
// string | null

const schema3 = s.string().nullish();
// string | null | undefined
```

### Default Values

```typescript
const schema = s.string().default('hello');

schema.parse(undefined); // 'hello'
schema.parse('world');   // 'world'
```

### Transformations

```typescript
const schema = s.string().transform((val) => val.toUpperCase());

schema.parse('hello'); // 'HELLO'

// Chain transformations
const trimmed = s.string().trim().transform((s) => s.toUpperCase());
trimmed.parse('  hello  '); // 'HELLO'
```

### Refinements (Custom Validation)

```typescript
const schema = s.string().refine(
  (val) => val.includes('@'),
  { message: 'Must contain @' },
);

// Multiple refinements
const passwordSchema = s.string()
  .min(8)
  .refine((val) => /[A-Z]/.test(val), {
    message: 'Must contain uppercase letter',
  })
  .refine((val) => /[0-9]/.test(val), {
    message: 'Must contain number',
  });
```

### Super Refine (Access to Context)

```typescript
const schema = s.object({
  password: s.string(),
  confirmPassword: s.string(),
}).superRefine((data, ctx) => {
  if (data.password !== data.confirmPassword) {
    ctx.addIssue({
      code: 'custom',
      path: ['confirmPassword'],
      message: 'Passwords must match',
    });
  }
});
```

### Branded Types

Create nominal types that are structurally identical but semantically distinct:

```typescript
const userIdSchema = s.string().uuid().brand('UserId');
const postIdSchema = s.string().uuid().brand('PostId');

type UserId = typeof userIdSchema._output; // string & Brand<'UserId'>
type PostId = typeof postIdSchema._output; // string & Brand<'PostId'>

// Type error: UserId and PostId are not assignable to each other
function getUser(id: UserId) { /* ... */ }
function getPost(id: PostId) { /* ... */ }

const userId = userIdSchema.parse('...');
getUser(userId);  // ✅ OK
getPost(userId);  // ❌ Type error
```

### Readonly

Mark types as readonly in the type system:

```typescript
const schema = s.object({
  name: s.string(),
  tags: s.array(s.string()),
}).readonly();

type Result = typeof schema._output;
// Readonly<{ name: string; tags: readonly string[] }>
```

### Catch (Error Recovery)

Provide fallback values on parse errors:

```typescript
const schema = s.number().catch(0);

schema.parse(42);        // 42
schema.parse('invalid'); // 0 (caught and replaced)
```

## Parsing

### `.parse(data)`

Parses and returns the data. Throws `ParseError` on validation failure.

```typescript
const schema = s.string();

try {
  const value = schema.parse('hello'); // 'hello'
} catch (error) {
  if (error instanceof ParseError) {
    console.log(error.issues);
  }
}
```

### `.safeParse(data)`

Returns a result object with `success` boolean. Never throws.

```typescript
const schema = s.number();

const result = schema.safeParse('42');

if (result.success) {
  console.log(result.value); // number
} else {
  console.log(result.error.issues); // ValidationIssue[]
}
```

## Type Inference

### Output Types (Parsed Value)

```typescript
import type { Infer, Output } from '@vertz/schema';

const schema = s.object({
  name: s.string(),
  age: s.number().optional(),
});

// All equivalent:
type User1 = typeof schema._output;
type User2 = Infer<typeof schema>;
type User3 = Output<typeof schema>;

// Result: { name: string; age?: number }
```

### Input Types (Before Parsing)

Use `Input<T>` for the type before transformations:

```typescript
import type { Input } from '@vertz/schema';

const schema = s.string().transform((s) => s.length);

type In = Input<typeof schema>;   // string
type Out = Output<typeof schema>; // number
```

## Coercion

Convert values to the target type:

```typescript
import { s } from '@vertz/schema';

const schema = s.coerce.number();

schema.parse('42');   // 42 (string → number)
schema.parse(42);     // 42 (already number)

// Available coercions:
s.coerce.string()   // → string
s.coerce.number()   // → number
s.coerce.boolean()  // → boolean
s.coerce.bigint()   // → bigint
s.coerce.date()     // → Date
```

## JSON Schema Generation

Generate JSON Schema for interoperability:

```typescript
import { toJSONSchema } from '@vertz/schema';

const schema = s.object({
  name: s.string().min(1),
  age: s.number().int().min(0),
});

const jsonSchema = toJSONSchema(schema);
/*
{
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1 },
    age: { type: 'integer', minimum: 0 }
  },
  required: ['name', 'age']
}
*/
```

## Schema Registry

Register and reuse schemas by name:

```typescript
import { SchemaRegistry } from '@vertz/schema';

const registry = new SchemaRegistry();

registry.register('User', s.object({
  id: s.string().uuid(),
  name: s.string(),
}));

registry.register('Post', s.object({
  id: s.string().uuid(),
  authorId: registry.ref('User').shape.id, // Reference other schemas
  title: s.string(),
}));

const userSchema = registry.get('User');
```

## Advanced Patterns

### Discriminated Unions

```typescript
const messageSchema = s.discriminatedUnion('type', [
  s.object({
    type: s.literal('text'),
    content: s.string(),
  }),
  s.object({
    type: s.literal('image'),
    url: s.url(),
    alt: s.string().optional(),
  }),
]);

type Message = typeof messageSchema._output;
// { type: 'text'; content: string } | { type: 'image'; url: string; alt?: string }
```

### Recursive Types (with `lazy`)

```typescript
interface Category {
  name: string;
  subcategories: Category[];
}

const categorySchema: s.Schema<Category> = s.object({
  name: s.string(),
  subcategories: s.lazy(() => s.array(categorySchema)),
});
```

### Intersection

```typescript
const baseSchema = s.object({ id: s.string() });
const namedSchema = s.object({ name: s.string() });

const userSchema = s.intersection(baseSchema, namedSchema);
// { id: string; name: string }
```

### Custom Validators

```typescript
const evenSchema = s.custom<number>(
  (val) => typeof val === 'number' && val % 2 === 0,
  'Must be an even number',
);

evenSchema.parse(4);  // ✅ 4
evenSchema.parse(5);  // ❌ throws
```

### File Validation

```typescript
const imageSchema = s.file()
  .maxSize(5 * 1024 * 1024)  // 5MB
  .mimeType(['image/png', 'image/jpeg', 'image/webp']);

imageSchema.parse(file); // File object (browser or Node.js)
```

## Integration with @vertz/core

Use schemas for request validation in vertz apps:

```typescript
import { createModuleDef } from '@vertz/core';
import { s } from '@vertz/schema';

const moduleDef = createModuleDef({ name: 'users' });

const createUserSchema = s.object({
  name: s.string().min(1),
  email: s.string().email(),
  age: s.number().int().min(18),
});

const router = moduleDef.router({ prefix: '/users' });

router.post('/', {
  body: createUserSchema,
  handler: (ctx) => {
    // ctx.body is fully typed as { name: string; email: string; age: number }
    const { name, email, age } = ctx.body;
    return { created: true, user: { name, email, age } };
  },
});
```

If validation fails, a `ValidationException` is automatically thrown with details.

## Error Handling

```typescript
import { ParseError } from '@vertz/schema';

const result = schema.safeParse(data);

if (!result.success) {
  const { error } = result;
  
  console.log(error.issues);
  /*
  [
    {
      code: 'invalid_type',
      expected: 'string',
      received: 'number',
      path: ['name'],
      message: 'Expected string, received number'
    },
    ...
  ]
  */
}
```

## Comparison to Zod

`@vertz/schema` is heavily inspired by Zod with similar API design:

| Feature | @vertz/schema | Zod |
|---------|--------------|-----|
| Type inference | ✅ | ✅ |
| Primitives | ✅ | ✅ |
| Objects/Arrays | ✅ | ✅ |
| Transformations | ✅ | ✅ |
| Refinements | ✅ | ✅ |
| Branded types | ✅ | ✅ |
| JSON Schema export | ✅ | ✅ |
| Schema registry | ✅ | ❌ |
| Format validators | ✅ (built-in) | ❌ (plugin) |
| ISO format methods | ✅ (`s.iso.*`) | ❌ |

If you're familiar with Zod, you should feel right at home!

## API Reference

### Factory Functions

All schemas are created via the `s` object:

```typescript
import { s } from '@vertz/schema';
```

### Schema Methods

All schemas inherit these methods:

- `.parse(data)` — Parse and return (throws on error)
- `.safeParse(data)` — Parse and return `{ success, value?, error? }`
- `.optional()` — Make schema optional (`T | undefined`)
- `.nullable()` — Make schema nullable (`T | null`)
- `.nullish()` — Make schema nullish (`T | null | undefined`)
- `.default(value)` — Provide default value
- `.transform(fn)` — Transform the value after validation
- `.refine(fn, opts)` — Add custom validation
- `.superRefine(fn)` — Add custom validation with context
- `.brand<Brand>()` — Create branded type
- `.readonly()` — Mark as readonly
- `.catch(value)` — Provide fallback on error
- `.optional()` — Alias for `.or(s.undefined())`

## TypeScript Tips

### Extracting Types

```typescript
const schema = s.object({
  name: s.string(),
  age: s.number(),
});

// Extract output type
type User = typeof schema._output;

// Extract input type (before transforms)
type UserInput = typeof schema._input;
```

### Extending Schemas

```typescript
const baseUserSchema = s.object({
  id: s.string().uuid(),
  createdAt: s.date(),
});

const userWithEmailSchema = baseUserSchema.extend({
  email: s.string().email(),
});
```

## Performance

- Schema definitions are immutable and reusable
- No code generation — pure runtime validation
- Optimized for common cases (primitives, objects, arrays)
- JSON Schema generation is cached

## License

MIT
