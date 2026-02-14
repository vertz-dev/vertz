# Schema Validation Examples

Comprehensive examples demonstrating `@vertz/schema` validation capabilities.

## Features Demonstrated

- ✅ Basic validation (primitives, objects, arrays)
- ✅ String transformations (trim, uppercase, etc.)
- ✅ Custom validation with refinements
- ✅ Nested object validation
- ✅ Discriminated unions
- ✅ Type coercion
- ✅ Default values

## Running the Example

```bash
# From workspace root
bun install

# Run the examples
cd packages/schema/examples/validation
bun run dev
```

## What You'll See

The example demonstrates:

1. **Basic Validation** — Validating user objects with email and age constraints
2. **Transformations** — Trimming and transforming strings
3. **Password Validation** — Multiple refinements for secure passwords
4. **Nested Objects** — Validating complex nested structures
5. **Discriminated Unions** — Type-safe message handling
6. **Coercion** — Converting strings to numbers, booleans, and dates
7. **Default Values** — Providing fallback values for missing fields

## Next Steps

Try modifying the schemas to:

- Add new validation rules
- Create recursive schemas with `s.lazy()`
- Generate JSON Schema with `toJSONSchema()`
- Use branded types for nominal typing
- Integrate with `@vertz/core` for API validation
