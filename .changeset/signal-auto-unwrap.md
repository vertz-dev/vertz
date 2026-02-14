---
"@vertz/ui-compiler": minor
---

feat(compiler): eliminate .value from public API — auto-unwrap signal properties

Developers never write `.value` for signal properties from `query()`, `form()`, and `createLoader()`. The compiler automatically inserts `.value` access during transformation.

**Breaking**: None (additive feature)

**Migration**: Update code to remove `.value` access on signal properties:
```ts
// Before
const tasks = query('/api/tasks');
isLoading = tasks.loading.value;

// After  
const tasks = query('/api/tasks');
isLoading = tasks.loading;  // compiler auto-inserts .value
```
