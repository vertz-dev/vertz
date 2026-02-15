# vertz

The unified meta-package for the [Vertz](https://github.com/vertz-dev/vertz) framework.

Instead of installing individual `@vertz/*` packages, install `vertz` and import what you need via subpath exports:

```ts
import { createServer } from 'vertz/server';
import { s } from 'vertz/schema';
import { createDb } from 'vertz/db';
import { createTestClient } from 'vertz/testing';
```

## Why subpath exports?

- **Tree-shakeable** — importing `vertz/server` only pulls in `@vertz/server`, nothing else.
- **One dependency** — `npm install vertz` gives you the whole framework.
- **No barrel file** — there's no default `import from 'vertz'`; every import is explicit.

## Available subpaths

| Subpath | Resolves to | Status |
|---|---|---|
| `vertz/server` | `@vertz/server` | ✅ |
| `vertz/schema` | `@vertz/schema` | ✅ |
| `vertz/db` | `@vertz/db` | ✅ |
| `vertz/testing` | `@vertz/testing` | ✅ |
| `vertz/ui` | `@vertz/ui` | ✅ |
| `vertz/ui-compiler` | `@vertz/ui-compiler` | ✅ |
| `vertz/router` | `@vertz/router` | 🚧 Planned |
| `vertz/signal` | `@vertz/signal` | 🚧 Planned |

## License

MIT
