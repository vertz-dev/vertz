---
'@vertz/ui': patch
'vertz': patch
---

feat(client): type `import.meta.main` in `vertz/client` and `@vertz/ui/client`

Closes [#2811](https://github.com/vertz-dev/vertz/issues/2811).

Follow-up to #2777. The vtz runtime (via deno_core) already sets `import.meta.main` on every module — `true` for the entry module, `false` for imported modules — so the standard "run if main" idiom works without any polyfill:

```ts
// src/api/server.ts
const app = createServer({ /* ... */ });
export default app;

if (import.meta.main) app.listen(env.PORT);
```

Previously the type was only available to projects that pulled in `bun-types`. The client augmentation (`packages/ui/client.d.ts`) now declares `readonly main: boolean` alongside `hot`, so any tsconfig that includes `"types": ["vertz/client"]` (or `"@vertz/ui/client"`) gets it automatically. Scaffolded apps already have this entry.

`bun-types` removed from `sites/dev-orchestrator` where it was only kept for this type.
