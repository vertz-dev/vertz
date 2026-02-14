---
'@vertz/ui-compiler': minor
---

Eliminate `.value` from public API — signal properties auto-unwrap at compile time

The compiler now automatically inserts `.value` when accessing signal properties from `query()`, `form()`, and `createLoader()`, eliminating boilerplate from the public API.

**Before:**
```ts
const tasks = query('/api/tasks');
const isLoading = tasks.loading.value;  // Manual .value access
const data = tasks.data.value;
```

**After:**
```ts
const tasks = query('/api/tasks');
const isLoading = tasks.loading;  // Compiler inserts .value automatically
const data = tasks.data;
```

**Supported APIs:**
- `query()`: `.data`, `.loading`, `.error` (auto-unwrap) | `.refetch` (plain)
- `form()`: `.submitting`, `.errors`, `.values` (auto-unwrap) | `.reset`, `.submit`, `.handleSubmit` (plain)
- `createLoader()`: `.data`, `.loading`, `.error` (auto-unwrap) | `.refetch` (plain)

**Features:**
- Works with import aliases: `import { query as fetchData } from '@vertz/ui'`
- Plain properties (like `.refetch`) are NOT unwrapped
- Zero runtime overhead - pure compile-time transformation

**Migration:** Simply remove `.value` from signal property accesses on these three APIs. The compiler handles the rest.
