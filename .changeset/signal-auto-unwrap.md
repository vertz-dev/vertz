---
'@vertz/ui-compiler': major
---

**BREAKING CHANGE:** Eliminate `.value` from public API — signal properties auto-unwrap at compile time

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

## ⚠️ Breaking Change

This is a **BREAKING CHANGE** because existing code that manually uses `.value` will need to be updated.

### Migration Guide

**Required action:** Remove `.value` from signal property accesses on `query()`, `form()`, and `createLoader()` results.

#### Before (old code):
```ts
const tasks = query('/api/tasks');
const isLoading = tasks.loading.value;  // ❌ Remove .value
const data = tasks.data.value;          // ❌ Remove .value
```

#### After (new code):
```ts
const tasks = query('/api/tasks');
const isLoading = tasks.loading;  // ✅ Compiler auto-inserts .value
const data = tasks.data;          // ✅ Compiler auto-inserts .value
```

**Why this is breaking:** If you don't remove the manual `.value`, the compiler will transform `tasks.data.value` into `tasks.data.value.value`, causing runtime errors.

**Automated migration:** The compiler includes guard logic to detect existing `.value` usage and skip double-transformation, providing a grace period during migration. However, you should still update your code to remove manual `.value` for long-term maintainability.

**Affected APIs:**
- `query()` → `.data`, `.loading`, `.error`
- `form()` → `.submitting`, `.errors`, `.values`
- `createLoader()` → `.data`, `.loading`, `.error`

**Non-breaking:** Plain properties like `.refetch`, `.reset`, `.submit`, `.handleSubmit` are NOT affected.
