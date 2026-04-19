---
'@vertz/agents': patch
---

feat(agents): export `d1Store` from the main `@vertz/agents` entry

`d1Store` was previously only reachable via the internal `@vertz/agents/cloudflare`
subpath (or via a deep relative import into `stores/d1-store`). It now sits
alongside `memoryStore` and `sqliteStore` on the main entry:

```ts
import { d1Store, run } from '@vertz/agents';

const store = d1Store({ binding: env.DB });
```

Also exports the `D1Binding` and `D1StoreOptions` types for consumers who
want to abstract over the binding. The `@vertz/agents/cloudflare` subpath
is unchanged — existing imports still work.

Closes #2838.
