---
'@vertz/db': patch
---

feat(db): support column-level validation constraints (min, max, regex) in schema

Added `.min()`, `.max()`, and `.regex()` chainable methods to column builders so validation
constraints can be defined directly on the DB schema. These constraints flow through
`tableToSchemas()` to `@vertz/schema` validators for automatic API-level validation.

- `d.text().min(1).max(5).regex(/^[A-Z]+$/)` — string length and pattern constraints
- `d.integer().min(0).max(100)` — numeric range constraints
- Type-safe scoping: `.regex()` only available on string columns, `.min()`/`.max()` only on
  string and numeric columns via `StringColumnBuilder` and `NumericColumnBuilder` interfaces
- Constraints survive chaining with existing builders (`.unique()`, `.nullable()`, etc.)
- Constraints are application-level only — they do NOT affect migrations or SQL DDL
